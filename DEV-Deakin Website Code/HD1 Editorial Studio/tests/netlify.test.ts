import { beforeEach, describe, it, expect, vi } from "vitest";
import type { Context } from "@netlify/functions";
import { createApp } from "../server/app.ts";
import { createNetlifyHandler } from "../server/netlify-adapter.ts";
import { firestoreOptions } from "../server/firestore-config.ts";
import { TestStore } from "./store.ts";
import { sendgridNewsletter } from "../server/newsletter.ts";
import { readFile } from "node:fs/promises";
const origin = "https://dev-deakin-sit313-romil.netlify.app";
const context = {
  ip: "192.0.2.10",
  requestId: "test-netlify-request",
} as Context;
const signup = {
  firstName: "Demo",
  lastName: "Reader",
  email: "reader@example.test",
  password: "Adapter-test24!",
  confirmPassword: "Adapter-test24!",
};
function fixture() {
  const store = new TestStore(),
    factory = vi.fn(() =>
      createApp({
        store,
        jwtSecret: "serverless-test-only-long-secret-value",
        origin,
        newsletter: sendgridNewsletter(undefined, undefined),
        rounds: 4,
        production: true,
        rateLimitMax: 1000,
      }),
    );
  return { store, factory, handler: createNetlifyHandler(factory) };
}
const req = (path: string, body?: unknown, token?: string) =>
  new Request(origin + path, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
describe("Netlify Express bridge", () => {
  it("preserves /api paths and reuses a warm app without listening on a socket", async () => {
    const { handler, factory } = fixture();
    const a = await handler(req("/api/health"), context),
      b = await handler(req("/api/auth/session"), context);
    expect(a.status).toBe(200);
    expect(await a.json()).toMatchObject({ ok: true, newsletterProvider: "sendgrid", newsletterConfigured: false });
    expect(await b.json()).toEqual({ user: null });
    expect(factory).toHaveBeenCalledOnce();
  });
  it("normalises the direct Netlify function path to the same API routing", async () => {
    const { handler } = fixture();
    const r = await handler(
      req("/.netlify/functions/api/auth/session"),
      context,
    );
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ user: null });
  });
  it("handles signup/login JSON, authorization headers and private response headers", async () => {
    const { handler, store } = fixture();
    expect(
      (await handler(req("/api/auth/signup", signup), context)).status,
    ).toBe(201);
    const login = await handler(
      req("/api/auth/login", {
        email: signup.email,
        password: signup.password,
      }),
      context,
    );
    const data = await login.json();
    expect(data.token).toBeTypeOf("string");
    const session = await handler(
      req("/api/auth/session", undefined, data.token),
      context,
    );
    expect((await session.json()).user.email).toBe(signup.email);
    expect(session.headers.get("cache-control")).toBe("no-store");
    expect(session.headers.get("x-content-type-options")).toBe("nosniff");
    expect(store.users.size).toBe(1);
  });
  it("preserves encoded query strings rather than dropping browse filters", async () => {
    const { handler } = fixture();
    const r = await handler(
      req("/api/posts?scope=public&q=React%20state&type=article"),
      context,
    );
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ posts: [], nextCursor: null });
  });
  it("returns API JSON for unknown API paths, not the SPA index", async () => {
    const { handler } = fixture();
    const r = await handler(req("/api/not-a-route"), context);
    expect(r.status).toBe(404);
    expect(r.headers.get("content-type")).toContain("application/json");
    expect(await r.json()).toEqual({ message: "API route not found." });
  });
  it("rejects a different Origin and malformed JSON through the adapter", async () => {
    const { handler } = fixture();
    const other = new Request(origin + "/api/auth/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://other.example",
      },
      body: JSON.stringify(signup),
    });
    expect((await handler(other, context)).status).toBe(403);
    const malformed = new Request(origin + "/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    expect((await handler(malformed, context)).status).toBe(400);
  });
  it("uses platform Context IP rather than client-supplied proxy headers", async () => {
    const factory = () => {
      const app = createApp({
        store: new TestStore(),
        jwtSecret: "serverless-test-only-long-secret-value",
        origin,
        newsletter: sendgridNewsletter(undefined, undefined),
        rounds: 4,
        production: true,
        rateLimitMax: 1,
      });
      return app;
    };
    const handler = createNetlifyHandler(factory);
    const send = (ip: string) =>
      handler(
        new Request(origin + "/api/auth/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Forwarded-For": ip,
          },
          body: JSON.stringify({
            email: signup.email,
            password: signup.password,
          }),
        }),
        context,
      );
    expect((await send("203.0.113.1")).status).toBe(401);
    expect((await send("203.0.113.2")).status).toBe(429);
  });
  it("does not disclose environment contents if function initialization fails", async () => {
    const handler = createNetlifyHandler(() => {
      throw Error("private-test-marker-must-not-escape");
    });
    const r = await handler(req("/api/health"), context);
    expect(r.status).toBe(503);
    const body = await r.text();
    expect(body).not.toContain("private-test-marker");
    expect(body).toContain("could not confirm");
  });
});
describe("Server-only credential configuration", () => {
  it("preserves local ADC behavior when no JSON secret is configured", () => {
    expect(firestoreOptions({ FIRESTORE_PROJECT_ID: "demo-sit313" })).toEqual({
      projectId: "demo-sit313",
    });
  });
  it("accepts a runtime JSON credential and picks only the supported SDK fields", () => {
    const c = {
      type: "service_account",
      project_id: "demo-sit313",
      client_email: "demo@demo-sit313.iam.gserviceaccount.com",
      private_key: "test-only-not-a-real-key",
      token_uri: "https://do-not-use.example",
    };
    const options = firestoreOptions({
      FIRESTORE_PROJECT_ID: "demo-sit313",
      FIRESTORE_SERVICE_ACCOUNT_JSON: JSON.stringify(c),
    });
    expect(options).toEqual({
      projectId: "demo-sit313",
      credentials: { client_email: c.client_email, private_key: c.private_key },
      preferRest: true,
    });
    expect(JSON.stringify(options)).not.toContain("do-not-use.example");
  });
  it("rejects invalid JSON and mismatched project credentials without echoing values", () => {
    for (const json of [
      "private-test-secret-not-json",
      JSON.stringify({
        type: "service_account",
        project_id: "wrong",
        client_email: "demo@wrong.iam.gserviceaccount.com",
        private_key: "private-test-secret",
      }),
    ]) {
      expect(() =>
        firestoreOptions({
          FIRESTORE_PROJECT_ID: "demo-sit313",
          FIRESTORE_SERVICE_ACCOUNT_JSON: json,
        }),
      ).toThrow(
        "The server Firestore credential is invalid or belongs to a different project.",
      );
    }
  });
  it("defines API rewrites before the SPA fallback and excludes local sources/secrets", async () => {
    const toml = await readFile(
      new URL("../netlify.toml", import.meta.url),
      "utf8",
    );
    expect(toml.indexOf('from = "/api/*"')).toBeLessThan(
      toml.indexOf('from = "/*"'),
    );
    expect(toml).toContain('publish = "frontend/dist"');
    expect(toml).toContain('NODE_VERSION = "22"');
    for (const exclusion of [
      "!.env",
      "!tests/**",
      "!scripts/**",
      "!frontend/**",
    ])
      expect(toml).toContain(exclusion);
    expect(toml).not.toMatch(/JWT_SECRET\s*=/);
    const entry = await readFile(
      new URL("../netlify/functions/api.ts", import.meta.url),
      "utf8",
    );
    expect(entry).not.toContain(".listen(");
    expect(entry).not.toContain("server/index");
  });
});
