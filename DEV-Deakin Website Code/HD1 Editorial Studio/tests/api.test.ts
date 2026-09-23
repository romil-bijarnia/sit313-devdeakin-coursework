import { describe, it, expect } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { createApp } from "../server/app.ts";
import { TestStore } from "./store.ts";
import { createNewsletter, sendgridNewsletter } from "../server/newsletter.ts";
import type { Post } from "../shared/types.ts";
const secret = "test-only-long-secret-value-not-a-real-credential";
const signup = {
  firstName: "Romil",
  lastName: "Test",
  email: "author@example.test",
  password: "Test-password24!",
  confirmPassword: "Test-password24!",
};
const draft = {
  type: "article",
  title: "How server authorisation protects paid posts",
  abstract:
    "An explanation of server-side access checks for published articles.",
  body: "Paid article body: this text must never leak into a free visitor response.",
  tags: ["react", "security"],
  imageUrl: "",
  plan: "paid",
};
const testStores = new WeakMap<ReturnType<typeof createApp>, TestStore>();
function fixture() {
  const store = new TestStore();
  const app = createApp({
    store,
    jwtSecret: secret,
    origin: "http://127.0.0.1:5178",
    moderatorEmails: ["moderator@example.test"],
    newsletter: sendgridNewsletter(undefined, undefined),
    rounds: 4,
    rateLimitMax: 1000,
  });
  testStores.set(app, store);
  return { store, app };
}
async function account(
  app: ReturnType<typeof createApp>,
  email = signup.email,
) {
  if (email === "moderator@example.test") {
    // Trusted account provisioning is deliberately separate from public signup.
    await testStores.get(app)!.createUser({
      firstName: "Test",
      lastName: "Moderator",
      email,
      passwordHash: await bcrypt.hash(signup.password, 4),
      plan: "free",
      tokenVersion: 0,
      createdAt: Date.now(),
    });
  } else {
    await request(app)
      .post("/api/auth/signup")
      .send({ ...signup, email })
      .expect(201);
  }
  const r = await request(app)
    .post("/api/auth/login")
    .send({ email, password: signup.password })
    .expect(200);
  return { token: r.body.token as string, user: r.body.user };
}
const auth = (token: string) => `Bearer ${token}`;
async function pendingPost(app: ReturnType<typeof createApp>, token: string) {
  const a = await request(app)
    .post("/api/posts")
    .set("Authorization", auth(token))
    .send(draft)
    .expect(201);
  const b = await request(app)
    .post(`/api/posts/${a.body.post.id}/submit`)
    .set("Authorization", auth(token))
    .send({ revision: 1 })
    .expect(200);
  return b.body.post as Post;
}
describe("HD1 API contract", () => {
  it("stores password hashes and denies role/plan injection", async () => {
    const { app, store } = fixture();
    await request(app)
      .post("/api/auth/signup")
      .send({ ...signup, role: "moderator" })
      .expect(400);
    await request(app)
      .post("/api/auth/signup")
      .send({ ...signup, plan: "paid" })
      .expect(400);
    await account(app);
    const u = [...store.users.values()][0];
    expect(u.plan).toBe("free");
    expect(u.passwordHash).not.toBe(signup.password);
    expect(await bcrypt.compare(signup.password, u.passwordHash)).toBe(true);
  });
  it("validates signup and normalises duplicate emails", async () => {
    const { app } = fixture();
    await request(app)
      .post("/api/auth/signup")
      .send({ ...signup, confirmPassword: "mismatch" })
      .expect(400);
    await account(app);
    await request(app)
      .post("/api/auth/signup")
      .send({ ...signup, email: " AUTHOR@example.test " })
      .expect(409);
  });
  it("creates JWT sessions and never returns hashes", async () => {
    const { app } = fixture();
    const { token } = await account(app);
    const r = await request(app)
      .get("/api/auth/session")
      .set("Authorization", auth(token))
      .expect(200);
    expect(r.body.user.role).toBe("author");
    expect(r.body.user).not.toHaveProperty("passwordHash");
    expect(token.split(".")).toHaveLength(3);
  });
  it("rejects wrong passwords, forged JWTs and revoked sessions", async () => {
    const { app } = fixture();
    const { token } = await account(app);
    await request(app)
      .post("/api/auth/login")
      .send({ email: signup.email, password: "wrong" })
      .expect(401);
    await request(app)
      .get("/api/auth/session")
      .set("Authorization", "Bearer abc.def.ghi")
      .expect(401);
    await request(app)
      .post("/api/auth/logout")
      .set("Authorization", auth(token))
      .send({})
      .expect(200);
    await request(app)
      .get("/api/auth/session")
      .set("Authorization", auth(token))
      .expect(401);
  });
  it("requires login, validates posts and persists ownership/date server-side", async () => {
    const { app } = fixture();
    await request(app).post("/api/posts").send(draft).expect(401);
    const { token, user } = await account(app);
    await request(app)
      .post("/api/posts")
      .set("Authorization", auth(token))
      .send({ ...draft, body: "short" })
      .expect(400);
    await request(app)
      .post("/api/posts")
      .set("Authorization", auth(token))
      .send({ ...draft, authorId: "someone" })
      .expect(400);
    const r = await request(app)
      .post("/api/posts")
      .set("Authorization", auth(token))
      .send(draft)
      .expect(201);
    expect(r.body.post.authorId).toBe(user.id);
    expect(r.body.post.createdAt).toBeGreaterThan(0);
    expect(r.body.post.status).toBe("draft");
  });
  it("allows only trusted moderator allowlist roles", async () => {
    const { app } = fixture();
    await request(app)
      .post("/api/auth/signup")
      .send({ ...signup, email: "moderator@example.test" })
      .expect(403);
    const a = await account(app),
      m = await account(app, "moderator@example.test");
    expect(m.user.role).toBe("moderator");
    await request(app)
      .get("/api/posts?scope=review")
      .set("Authorization", auth(a.token))
      .expect(403);
    await request(app)
      .get("/api/posts?scope=review")
      .set("Authorization", auth(m.token))
      .expect(200);
  });
  it("enforces author ownership and pending-state transitions", async () => {
    const { app } = fixture();
    const a = await account(app),
      b = await account(app, "second@example.test");
    const p = await pendingPost(app, a.token);
    await request(app)
      .post(`/api/posts/${p.id}/submit`)
      .set("Authorization", auth(b.token))
      .send({ revision: p.revision })
      .expect(403);
    await request(app)
      .patch(`/api/posts/${p.id}`)
      .set("Authorization", auth(a.token))
      .send({ revision: p.revision, post: draft })
      .expect(409);
    await request(app)
      .post(`/api/posts/${p.id}/review`)
      .set("Authorization", auth(a.token))
      .send({
        revision: p.revision,
        decision: "approve",
        feedback: "Looks good to publish.",
      })
      .expect(403);
  });
  it("rejects self-approval even for moderators", async () => {
    const { app } = fixture();
    const m = await account(app, "moderator@example.test"),
      p = await pendingPost(app, m.token);
    await request(app)
      .post(`/api/posts/${p.id}/review`)
      .set("Authorization", auth(m.token))
      .send({
        revision: p.revision,
        decision: "approve",
        feedback: "Reviewing my own post.",
      })
      .expect(403);
  });
  it("persists rejection feedback, revision history and resubmission", async () => {
    const { app, store } = fixture();
    const a = await account(app),
      m = await account(app, "moderator@example.test"),
      p = await pendingPost(app, a.token);
    await request(app)
      .post(`/api/posts/${p.id}/review`)
      .set("Authorization", auth(m.token))
      .send({
        revision: p.revision,
        decision: "reject",
        feedback: "Add a worked example before publication.",
      })
      .expect(200);
    const updated = await request(app)
      .patch(`/api/posts/${p.id}`)
      .set("Authorization", auth(a.token))
      .send({
        revision: 3,
        post: {
          ...draft,
          body: draft.body + " A worked example follows here.",
        },
      })
      .expect(200);
    expect(updated.body.post.status).toBe("draft");
    await request(app)
      .post(`/api/posts/${p.id}/submit`)
      .set("Authorization", auth(a.token))
      .send({ revision: 4 })
      .expect(200);
    expect(store.posts.get(p.id)?.history.map((h) => h.action)).toEqual([
      "created",
      "submitted",
      "rejected",
      "edited",
      "submitted",
    ]);
  });
  it("rejects stale review revisions, repeat decisions and missing feedback", async () => {
    const { app } = fixture();
    const a = await account(app),
      m = await account(app, "moderator@example.test"),
      p = await pendingPost(app, a.token);
    const route = `/api/posts/${p.id}/review`;
    await request(app)
      .post(route)
      .set("Authorization", auth(m.token))
      .send({ revision: 1, decision: "approve", feedback: "Good explanation." })
      .expect(409);
    await request(app)
      .post(route)
      .set("Authorization", auth(m.token))
      .send({ revision: 2, decision: "approve", feedback: "" })
      .expect(400);
    await request(app)
      .post(route)
      .set("Authorization", auth(m.token))
      .send({ revision: 2, decision: "approve", feedback: "Good explanation." })
      .expect(200);
    await request(app)
      .post(route)
      .set("Authorization", auth(m.token))
      .send({
        revision: 3,
        decision: "reject",
        feedback: "Too late to reject.",
      })
      .expect(409);
  });
  it("suppresses paid and unpublished data server-side for free/anonymous clients", async () => {
    const { app } = fixture();
    const a = await account(app),
      m = await account(app, "moderator@example.test"),
      free = await account(app, "reader@example.test");
    const p = await pendingPost(app, a.token);
    expect(
      (await request(app).get("/api/posts").expect(200)).body.posts,
    ).toEqual([]);
    await request(app)
      .post(`/api/posts/${p.id}/review`)
      .set("Authorization", auth(m.token))
      .send({
        revision: 2,
        decision: "approve",
        feedback: "Ready to publish now.",
      })
      .expect(200);
    const anon = await request(app).get("/api/posts").expect(200),
      r = await request(app)
        .get("/api/posts?plan=paid")
        .set("Authorization", auth(free.token))
        .expect(200);
    expect(JSON.stringify(anon.body)).not.toContain(draft.body);
    expect(r.body.posts).toEqual([]);
    await request(app)
      .get(`/api/posts/${p.id}`)
      .set("Authorization", auth(free.token))
      .expect(404);
  });
  it("validates simulated upgrade, stores no card data, reads current plan from database", async () => {
    const { app, store } = fixture();
    const { token, user } = await account(app);
    const good = {
      name: "Test Reader",
      cardNumber: "4242424242424242",
      expiry: "12/35",
      cvc: "123",
      confirmSimulation: true,
    };
    await request(app).post("/api/subscription/upgrade").send(good).expect(401);
    await request(app)
      .post("/api/subscription/upgrade")
      .set("Authorization", auth(token))
      .send({ ...good, cardNumber: "4111111111111111" })
      .expect(400);
    await request(app)
      .post("/api/subscription/upgrade")
      .set("Authorization", auth(token))
      .send({ ...good, expiry: "01/20" })
      .expect(400);
    await request(app)
      .post("/api/subscription/upgrade")
      .set("Authorization", auth(token))
      .send(good)
      .expect(200);
    expect(store.users.get(user.id)?.plan).toBe("paid");
    expect(JSON.stringify(store.users.get(user.id))).not.toContain(
      good.cardNumber,
    );
    expect(
      (
        await request(app)
          .get("/api/auth/session")
          .set("Authorization", auth(token))
          .expect(200)
      ).body.user.plan,
    ).toBe("paid");
    await request(app)
      .post("/api/subscription/upgrade")
      .set("Authorization", auth(token))
      .send(good)
      .expect(409);
  });
  it("paid readers receive approved content but not review history", async () => {
    const { app } = fixture();
    const a = await account(app),
      m = await account(app, "moderator@example.test"),
      paid = await account(app, "paid@example.test"),
      p = await pendingPost(app, a.token);
    await request(app)
      .post(`/api/posts/${p.id}/review`)
      .set("Authorization", auth(m.token))
      .send({
        revision: 2,
        decision: "approve",
        feedback: "Private editorial feedback.",
      })
      .expect(200);
    await request(app)
      .post("/api/subscription/upgrade")
      .set("Authorization", auth(paid.token))
      .send({
        name: "Paid Reader",
        cardNumber: "4242424242424242",
        expiry: "12/35",
        cvc: "123",
        confirmSimulation: true,
      })
      .expect(200);
    const r = await request(app)
      .get("/api/posts")
      .set("Authorization", auth(paid.token))
      .expect(200);
    expect(r.body.posts[0].body).toBe(draft.body);
    expect(r.body.posts[0]).not.toHaveProperty("history");
  });
  it("filters and cursor pages without duplicates or deleting hidden records", async () => {
    const { app, store } = fixture();
    const { token } = await account(app);
    const p = await pendingPost(app, token);
    for (let i = 0; i < 30; i++) {
      const id = `post-${i}`;
      store.posts.set(id, {
        ...p,
        id,
        status: "published",
        plan: "free",
        createdAt: 100 + i,
        title:
          i % 2 ? "React forms explained" : "Database transactions explained",
        tags: i % 2 ? ["react"] : ["database"],
      });
    }
    const one = await request(app)
      .get("/api/posts?type=article&tag=react")
      .expect(200);
    expect(one.body.posts.every((p: Post) => p.tags.includes("react"))).toBe(
      true,
    );
    expect(one.body.nextCursor).toBeTruthy();
    const two = await request(app)
      .get(`/api/posts?type=article&tag=react&cursor=${one.body.nextCursor}`)
      .expect(200);
    const ids = [...one.body.posts, ...two.body.posts].map((p: Post) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(15);
    expect(store.posts.size).toBe(31);
  });
  it("returns real newsletter configuration failure rather than fake acceptance", async () => {
    const { app } = fixture();
    await request(app)
      .post("/api/newsletter")
      .send({ email: "bad" })
      .expect(400);
    const r = await request(app)
      .post("/api/newsletter")
      .send({ email: "subscriber@example.test" })
      .expect(503);
    expect(r.body.message).toContain("No welcome email has been queued");
  });
  it("handles malformed, oversized and cross-origin requests", async () => {
    const { app } = fixture();
    await request(app)
      .post("/api/auth/signup")
      .set("Origin", "https://evil.example")
      .send(signup)
      .expect(403);
    await request(app)
      .post("/api/auth/signup")
      .set("Content-Type", "application/json")
      .send("{")
      .expect(400);
    await request(app)
      .post("/api/auth/signup")
      .send({ ...signup, password: "a".repeat(300000) })
      .expect(413);
    await request(app).get("/api/missing").expect(404);
  });
  it("reports database outage without leaking driver messages", async () => {
    const { app, store } = fixture();
    store.ping = async () => {
      throw Error("secret-driver-credential");
    };
    const r = await request(app).get("/api/health").expect(503);
    expect(JSON.stringify(r.body)).not.toContain("secret-driver");
  });
});

it("rejects bcrypt-truncated login tails at the 72-byte boundary", async () => {
  const { app } = fixture();
  const exact = "a".repeat(72);
  await request(app)
    .post("/api/auth/signup")
    .send({ ...signup, password: exact, confirmPassword: exact })
    .expect(201);
  await request(app)
    .post("/api/auth/login")
    .send({ email: signup.email, password: exact })
    .expect(200);
  await request(app)
    .post("/api/auth/login")
    .send({ email: signup.email, password: exact + "wrong-tail" })
    .expect(400);
  const unicode = "字".repeat(24);
  await request(app)
    .post("/api/auth/signup")
    .send({
      ...signup,
      email: "unicode@example.test",
      password: unicode,
      confirmPassword: unicode,
    })
    .expect(201);
  await request(app)
    .post("/api/auth/login")
    .send({ email: "unicode@example.test", password: unicode })
    .expect(200);
  await request(app)
    .post("/api/auth/login")
    .send({ email: "unicode@example.test", password: unicode + "a" })
    .expect(400);
});

it("accepts maximum valid multilingual post data including escaped JSON overhead", async () => {
  const { app } = fixture(),
    { token } = await account(app);
  const maximum = {
    ...draft,
    title: "字".repeat(140),
    abstract: "字".repeat(300),
    body: "字".repeat(20000),
    imageUrl: "https://example.test/" + "字".repeat(1900),
  };
  const raw = JSON.stringify(maximum),
    escaped = raw.replace(
      /[^\x00-\x7f]/g,
      (char) => "\\u" + char.charCodeAt(0).toString(16).padStart(4, "0"),
    );
  expect(Buffer.byteLength(raw)).toBeGreaterThan(60000);
  expect(Buffer.byteLength(escaped)).toBeGreaterThan(128 * 1024);
  for (const payload of [raw, escaped]) {
    const result = await request(app)
      .post("/api/posts")
      .set("Authorization", auth(token))
      .set("Content-Type", "application/json")
      .send(payload)
      .expect(201);
    expect(result.body.post.body).toBe(maximum.body);
  }
});

it("reports an ambiguous database error without falsely promising there was no write", async () => {
  const { app, store } = fixture(),
    { token } = await account(app);
  const original = store.createPost.bind(store);
  store.createPost = async (post) => {
    await original(post);
    throw Error("response lost after commit");
  };
  const result = await request(app)
    .post("/api/posts")
    .set("Authorization", auth(token))
    .send(draft)
    .expect(503);
  expect(store.posts.size).toBe(1);
  expect(result.body.message).toContain("could not confirm");
  expect(result.body.message).not.toMatch(/not.*saved|no success/i);
});

it("preserves an uncertain Gmail-send outcome at the HTTP boundary without falsely reporting unsent mail", async () => {
  let calls = 0;
  const newsletter = createNewsletter({
    provider: "gmail", gmailClientId: "synthetic-client", gmailClientSecret: "synthetic-secret",
    gmailRefreshToken: "synthetic-refresh", gmailSender: "sender@example.test", log: () => {},
    fetchImpl: async url => {
      calls++;
      if (url === "https://oauth2.googleapis.com/token") return { status: 200, json: async () => ({ access_token: "synthetic-access", token_type: "Bearer", expires_in: 3600 }) };
      throw new Error("private upstream detail");
    },
  });
  const app = createApp({ store: new TestStore(), jwtSecret: secret, origin: "http://127.0.0.1:5178", newsletter, rounds: 4 });
  const health = await request(app).get("/api/health").expect(200);
  expect(health.body).toMatchObject({ newsletterProvider: "gmail", newsletterConfigured: true });
  const result = await request(app).post("/api/newsletter").send({ email: "reader@example.test" }).expect(503);
  expect(result.body.message).toContain("Check your inbox before trying again");
  expect(result.body.message).not.toMatch(/No.*(?:sent|queued)|private upstream/);
  expect(calls).toBe(2);
});
