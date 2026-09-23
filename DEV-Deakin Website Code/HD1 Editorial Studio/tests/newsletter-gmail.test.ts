import { it as test } from "vitest";
import assert from "node:assert/strict";
import {
  createNewsletter,
  NewsletterUnavailableError,
  type NewsletterOptions,
} from "../server/newsletter.ts";

const TOKEN = "https://oauth2.googleapis.com/token";
const SEND = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const options: NewsletterOptions = {
  provider: "gmail",
  gmailClientId: "synthetic-client",
  gmailClientSecret: "synthetic-client-secret",
  gmailRefreshToken: "synthetic-refresh-token",
  gmailSender: "sender@example.test",
  log: () => {},
};
const response = (status: number, data: unknown = {}) => ({
  status,
  json: async () => data,
});
const tokenResponse = () =>
  response(200, {
    access_token: "synthetic-access-token",
    token_type: "Bearer",
    expires_in: 3600,
  });

test("Gmail configuration requires its own complete credentials and never falls back to SendGrid", async () => {
  for (const missing of [
    "gmailClientId",
    "gmailClientSecret",
    "gmailRefreshToken",
    "gmailSender",
  ] as const) {
    let calls = 0;
    const provider = createNewsletter({
      ...options,
      [missing]: "",
      apiKey: "sendgrid-test",
      sender: "other@example.test",
      fetchImpl: async () => {
        calls++;
        return tokenResponse();
      },
    });
    assert.equal(provider.provider, "gmail");
    assert.equal(provider.configured, false);
    await assert.rejects(
      provider.subscribe("reader@example.test"),
      NewsletterUnavailableError,
    );
    assert.equal(calls, 0);
  }
  assert.equal(
    createNewsletter({ ...options, provider: "unknown" }).configured,
    false,
  );
  assert.equal(
    createNewsletter({
      ...options,
      provider: "sendgrid",
      apiKey: "legacy-key",
      sender: "legacy@example.test",
    }).provider,
    "sendgrid",
  );
});

test("Gmail refreshes server-side and sends injection-safe base64url UTF-8 MIME exactly once", async () => {
  const calls: [string, RequestInit][] = [],
    events: unknown[] = [];
  const provider = createNewsletter({
    ...options,
    log: (event) => events.push(event),
    fetchImpl: async (url, init) => {
      calls.push([url, init]);
      return url === TOKEN
        ? tokenResponse()
        : response(200, { id: "18abcde012345678" });
    },
  });
  assert.equal(provider.configured, true);
  assert.deepEqual(await provider.subscribe("reader+welcome@example.test"), {
    accepted: true,
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0][0], TOKEN);
  assert.equal(calls[1][0], SEND);
  const form = new URLSearchParams(calls[0][1].body as string);
  assert.equal(form.get("grant_type"), "refresh_token");
  assert.equal(form.get("client_id"), "synthetic-client");
  assert.equal(form.get("client_secret"), "synthetic-client-secret");
  assert.equal(form.get("refresh_token"), "synthetic-refresh-token");
  assert.equal(
    (calls[1][1].headers as Record<string, string>).Authorization,
    "Bearer synthetic-access-token",
  );
  for (const [, init] of calls) {
    assert.equal(init.redirect, "error");
    assert.ok(init.signal instanceof AbortSignal);
  }
  const { raw } = JSON.parse(calls[1][1].body as string);
  assert.match(raw, /^[A-Za-z0-9_-]+$/);
  const mime = Buffer.from(raw, "base64url").toString("utf8");
  const [headers, body] = mime.split("\r\n\r\n");
  assert.match(headers, /^From: DEV@Deakin <sender@example.test>/);
  assert.match(
    headers,
    /\r\nTo: <reader\+welcome@example.test>\r\nSubject: Welcome to DEV@Deakin/,
  );
  assert.match(headers, /Content-Type: text\/plain; charset=UTF-8/);
  assert.match(headers, /Message-ID: <[a-f0-9-]+@example.test>/);
  assert.match(
    Buffer.from(body.replace(/\r\n/g, ""), "base64").toString("utf8"),
    /You’re invited/,
  );
  assert.deepEqual(events, [
    {
      service: "newsletter",
      provider: "Gmail",
      status: 200,
      outcome: "accepted",
    },
  ]);
  assert.doesNotMatch(
    JSON.stringify(events),
    /sender@|reader\+|synthetic-|18abcde/,
  );
});

test("Gmail rejects invalid and injected sender/recipient headers without making requests", async () => {
  const invalid = [
    "reader@example.test\r\nBcc: other@example.test",
    "reader@example.test\n",
    "a@example.test, b@example.test",
    "Reader <reader@example.test>",
    "a..b@example.test",
    "a@-example.test",
    "a@localhost",
  ];
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return tokenResponse();
  };
  for (const value of invalid) {
    const provider = createNewsletter({ ...options, fetchImpl });
    await assert.rejects(
      provider.subscribe(value),
      (error: unknown) =>
        error instanceof NewsletterUnavailableError && error.status === 400,
    );
    assert.equal(
      createNewsletter({ ...options, gmailSender: value, fetchImpl })
        .configured,
      false,
    );
  }
  assert.equal(calls, 0);
});

test("Gmail cache avoids repeat refreshes and renews before token expiry", async () => {
  let clock = 0,
    refreshes = 0,
    sends = 0;
  const provider = createNewsletter({
    ...options,
    now: () => clock,
    fetchImpl: async (url) => {
      if (url === TOKEN) {
        refreshes++;
        return tokenResponse();
      }
      sends++;
      return response(200, { id: `message-${sends}` });
    },
  });
  await provider.send("one@example.test");
  clock = 1000;
  await provider.send("two@example.test");
  assert.equal(refreshes, 1);
  clock = 3540000;
  await provider.send("three@example.test");
  assert.equal(refreshes, 2);
  assert.equal(sends, 3);
});

test("concurrent Gmail subscriptions coalesce one in-flight token refresh", async () => {
  let refreshes = 0,
    sends = 0;
  let release: (value: ReturnType<typeof tokenResponse>) => void = () => {};
  const provider = createNewsletter({
    ...options,
    fetchImpl: async (url) => {
      if (url === TOKEN) {
        refreshes++;
        return new Promise((resolve) => {
          release = resolve;
        });
      }
      sends++;
      return response(200, { id: `message-${sends}` });
    },
  });
  const jobs = ["one", "two", "three"].map((name) =>
    provider.subscribe(`${name}@example.test`),
  );
  assert.equal(refreshes, 1);
  assert.equal(sends, 0);
  release(tokenResponse());
  await Promise.all(jobs);
  assert.equal(refreshes, 1);
  assert.equal(sends, 3);
});

test("a rejected refresh cannot send mail or leak Google's response body", async () => {
  const calls: string[] = [],
    events: unknown[] = [];
  const provider = createNewsletter({
    ...options,
    log: (event) => events.push(event),
    fetchImpl: async (url) => {
      calls.push(url);
      return response(400, {
        error: "private-refresh-error-and-email@example.test",
      });
    },
  });
  await assert.rejects(
    provider.subscribe("reader@example.test"),
    (error: unknown) =>
      error instanceof NewsletterUnavailableError &&
      error.outcome === "not_sent" &&
      !error.message.includes("private-refresh"),
  );
  assert.deepEqual(calls, [TOKEN]);
  assert.deepEqual(events, [
    {
      service: "newsletter",
      provider: "Gmail OAuth",
      status: 400,
      outcome: "rejected",
    },
  ]);
});

test("a failed shared refresh is cleared so a later explicit request can recover", async () => {
  let refreshes = 0,
    sends = 0;
  const provider = createNewsletter({
    ...options,
    fetchImpl: async (url) => {
      if (url === TOKEN) {
        refreshes++;
        if (refreshes === 1) throw new Error("private transport message");
        return tokenResponse();
      }
      sends++;
      return response(200, { id: "recovered-message" });
    },
  });
  const first = await Promise.allSettled([
    provider.send("one@example.test"),
    provider.send("two@example.test"),
  ]);
  assert.ok(first.every((result) => result.status === "rejected"));
  assert.equal(refreshes, 1);
  assert.equal(sends, 0);
  assert.equal(await provider.send("one@example.test"), 200);
  assert.equal(refreshes, 2);
  assert.equal(sends, 1);
});

test("malformed OAuth responses cannot be used as bearer credentials", async () => {
  for (const value of [
    null,
    {},
    { access_token: "bad\r\nheader", token_type: "Bearer", expires_in: 3600 },
    { access_token: "token", token_type: "Basic", expires_in: 3600 },
    { access_token: "token", token_type: "Bearer", expires_in: 0 },
    { access_token: "token", token_type: "Bearer", expires_in: "3600" },
  ]) {
    let calls = 0;
    const provider = createNewsletter({
      ...options,
      fetchImpl: async () => {
        calls++;
        return response(200, value);
      },
    });
    await assert.rejects(
      provider.send("reader@example.test"),
      NewsletterUnavailableError,
    );
    assert.equal(calls, 1);
  }
  const provider = createNewsletter({
    ...options,
    fetchImpl: async () => ({
      status: 200,
      json: async () => {
        throw new Error("private malformed token body");
      },
    }),
  });
  await assert.rejects(
    provider.send("reader@example.test"),
    NewsletterUnavailableError,
  );
});

test("Gmail send rejection is safe and never automatically retried", async () => {
  const calls: string[] = [],
    events: unknown[] = [];
  const provider = createNewsletter({
    ...options,
    log: (event) => events.push(event),
    fetchImpl: async (url) => {
      calls.push(url);
      return url === TOKEN
        ? tokenResponse()
        : response(403, { error: "private recipient identity" });
    },
  });
  await assert.rejects(
    provider.send("reader@example.test"),
    (error: unknown) =>
      error instanceof NewsletterUnavailableError &&
      error.outcome === "rejected" &&
      !error.message.includes("private"),
  );
  assert.deepEqual(calls, [TOKEN, SEND]);
  assert.deepEqual(events, [
    {
      service: "newsletter",
      provider: "Gmail",
      status: 403,
      outcome: "rejected",
    },
  ]);
});

test("Gmail invalidates a rejected access token for the next request, without retrying the send", async () => {
  let refreshes = 0,
    sends = 0;
  const provider = createNewsletter({
    ...options,
    fetchImpl: async (url) => {
      if (url === TOKEN) {
        refreshes++;
        return tokenResponse();
      }
      sends++;
      return sends === 1
        ? response(401)
        : response(200, { id: "explicit-second-send" });
    },
  });
  await assert.rejects(
    provider.send("reader@example.test"),
    NewsletterUnavailableError,
  );
  assert.equal(refreshes, 1);
  assert.equal(sends, 1);
  await provider.send("reader@example.test");
  assert.equal(refreshes, 2);
  assert.equal(sends, 2);
});

test("an interrupted Gmail send is unknown, not falsely reported unsent, and is never replayed", async () => {
  const calls: string[] = [],
    events: unknown[] = [];
  const provider = createNewsletter({
    ...options,
    log: (event) => events.push(event),
    fetchImpl: async (url) => {
      calls.push(url);
      if (url === TOKEN) return tokenResponse();
      throw new Error("private-access-token sender@example.test");
    },
  });
  await assert.rejects(
    provider.subscribe("reader@example.test"),
    (error: unknown) =>
      error instanceof NewsletterUnavailableError &&
      error.outcome === "unknown" &&
      /Check your inbox/.test(error.message) &&
      !/No.*(?:sent|queued)|private/.test(error.message),
  );
  assert.deepEqual(calls, [TOKEN, SEND]);
  assert.deepEqual(events, [
    {
      service: "newsletter",
      provider: "Gmail",
      status: null,
      outcome: "unknown",
    },
  ]);
});

test("Gmail requires HTTP 200 and a valid message ID; malformed success remains unconfirmed", async () => {
  for (const [status, data] of [
    [200, {}],
    [200, { id: "" }],
    [200, { id: "bad\nid" }],
    [202, { id: "not-http-200" }],
    [503, {}],
  ] as [number, unknown][]) {
    let sends = 0;
    const events: unknown[] = [];
    const provider = createNewsletter({
      ...options,
      log: (event) => events.push(event),
      fetchImpl: async (url) => {
        if (url === TOKEN) return tokenResponse();
        sends++;
        return response(status, data);
      },
    });
    await assert.rejects(
      provider.send("reader@example.test"),
      (error: unknown) =>
        error instanceof NewsletterUnavailableError &&
        error.outcome === "unknown",
    );
    assert.equal(sends, 1);
    assert.deepEqual(events, [
      { service: "newsletter", provider: "Gmail", status, outcome: "unknown" },
    ]);
  }
  const provider = createNewsletter({
    ...options,
    fetchImpl: async (url) =>
      url === TOKEN
        ? tokenResponse()
        : {
            status: 200,
            json: async () => {
              throw new Error("private bad message body");
            },
          },
  });
  await assert.rejects(
    provider.send("reader@example.test"),
    (error: unknown) =>
      error instanceof NewsletterUnavailableError &&
      error.outcome === "unknown",
  );
});

test("a Gmail log sink failure cannot turn provider acceptance into another send", async () => {
  for (const log of [
    () => {
      throw new Error("broken logger");
    },
    () => Promise.reject(new Error("async broken logger")),
  ]) {
    let sends = 0;
    const provider = createNewsletter({
      ...options,
      log,
      fetchImpl: async (url) => {
        if (url === TOKEN) return tokenResponse();
        sends++;
        return response(200, { id: "accepted-message" });
      },
    });
    assert.deepEqual(await provider.subscribe("reader@example.test"), {
      accepted: true,
    });
    await Promise.resolve();
    assert.equal(sends, 1);
  }
});

test("OAuth requests have an abort deadline and a timeout cannot reach the send endpoint", async () => {
  const calls: string[] = [];
  const provider = createNewsletter({
    ...options,
    timeoutMs: 50,
    fetchImpl: async (url, init) => {
      calls.push(url);
      return new Promise((_resolve, reject) =>
        init.signal!.addEventListener(
          "abort",
          () => reject(new Error("timeout")),
          { once: true },
        ),
      );
    },
  });
  const keepAlive = setTimeout(() => {}, 200);
  try {
    await assert.rejects(
      provider.send("reader@example.test"),
      NewsletterUnavailableError,
    );
  } finally {
    clearTimeout(keepAlive);
  }
  assert.deepEqual(calls, [TOKEN]);
});
