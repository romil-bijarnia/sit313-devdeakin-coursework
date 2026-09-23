import { describe, it, expect, vi, afterEach } from "vitest";
import type { Firestore } from "@google-cloud/firestore";
import { FirestoreStore, emailId } from "../server/repository.ts";
import { sendgridNewsletter } from "../server/newsletter.ts";
import type { Post } from "../shared/types.ts";
function dbDouble() {
  const records = new Map<string, Record<string, unknown>>(),
    writes: string[] = [];
  const snapshot = (key: string) => ({
    exists: records.has(key),
    data: () => records.get(key),
  });
  const ref = (key: string) => ({
    key,
    get: async () => snapshot(key),
    create: async (value: Record<string, unknown>) => {
      records.set(key, value);
      writes.push(key);
    },
  });
  const query = {
    orderBy: vi.fn().mockReturnThis(),
    startAfter: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue({ docs: [] }),
    doc: (id: string) => ref("sit313_hd1_posts/" + id),
  };
  const db = {
    collection: vi.fn((name: string) =>
      name === "sit313_hd1_posts"
        ? query
        : {
            doc: (id: string) => ref(name + "/" + id),
            limit: () => ({ get: async () => ({ docs: [] }) }),
          },
    ),
    runTransaction: async (fn: Function) =>
      fn({
        get: async (r: { key: string }) => snapshot(r.key),
        create: (r: { key: string }, v: Record<string, unknown>) => {
          records.set(r.key, v);
          writes.push(r.key);
        },
        set: (r: { key: string }, v: Record<string, unknown>) => {
          records.set(r.key, v);
          writes.push(r.key);
        },
      }),
  };
  return {
    store: new FirestoreStore(db as unknown as Firestore),
    records,
    writes,
    query,
    db,
  };
}
describe("Firestore adapter contract", () => {
  it("uses isolated prefixed collections and atomic uniqueness checks", async () => {
    const { store, db } = dbDouble();
    const user = {
      firstName: "Demo",
      lastName: "Author",
      email: "author@example.test",
      passwordHash: "hash-only",
      plan: "free" as const,
      tokenVersion: 0,
      createdAt: 10,
    };
    await store.createUser(user);
    expect(db.collection).toHaveBeenCalledWith("sit313_hd1_users");
    await expect(store.createUser(user)).rejects.toMatchObject({ status: 409 });
    expect((await store.userByEmail(user.email))?.id).toBe(emailId(user.email));
  });
  it("does not write anything when transaction policy rejects a mutation", async () => {
    const { store, records, writes } = dbDouble();
    records.set("sit313_hd1_posts/p1", { id: "p1", revision: 2 });
    await expect(
      store.updatePost("p1", () => {
        throw Error("conflict");
      }),
    ).rejects.toThrow("conflict");
    expect(writes).toEqual([]);
    expect(records.get("sit313_hd1_posts/p1")?.revision).toBe(2);
  });
  it("stores revision history in the same transaction as post state", async () => {
    const { store, records, writes } = dbDouble();
    records.set("sit313_hd1_posts/p1", {
      id: "p1",
      revision: 2,
      status: "pending",
      history: [],
    });
    await store.updatePost(
      "p1",
      (p) =>
        ({
          ...p,
          revision: 3,
          status: "published",
          history: [
            {
              action: "approved",
              actorId: "mod",
              at: 22,
              feedback: "Ready for publication.",
            },
          ],
        }) as Post,
    );
    expect(writes).toEqual(["sit313_hd1_posts/p1"]);
    const saved = records.get("sit313_hd1_posts/p1");
    expect(saved?.status).toBe("published");
    expect(saved?.history).toHaveLength(1);
  });
  it("uses a stable timestamp/document-ID cursor with an extra lookahead record", async () => {
    const { store, query } = dbDouble();
    query.get.mockResolvedValue({
      docs: [
        { id: "a", data: () => ({ id: "a", createdAt: 30 }) },
        { id: "b", data: () => ({ id: "b", createdAt: 20 }) },
        { id: "c", data: () => ({ id: "c", createdAt: 10 }) },
      ],
    });
    const page = await store.page(null, 2);
    expect(page.posts).toHaveLength(2);
    expect(
      JSON.parse(Buffer.from(page.nextCursor!, "base64url").toString()),
    ).toEqual([20, "b"]);
    expect(query.limit).toHaveBeenCalledWith(3);
    await store.page(page.nextCursor, 2);
    expect(query.startAfter).toHaveBeenCalledWith(20, "b");
  });
  it("rejects malformed cursors rather than constructing arbitrary queries", async () => {
    const { store } = dbDouble();
    for (const cursor of [
      "not-json",
      Buffer.from(JSON.stringify(["bad", "doc"])).toString("base64url"),
      Buffer.from(JSON.stringify([20, "a/b"])).toString("base64url"),
    ])
      await expect(store.page(cursor, 24)).rejects.toMatchObject({
        status: 400,
      });
  });
});
afterEach(() => vi.unstubAllGlobals());
describe("SendGrid delivery adapter", () => {
  it("returns only actual accepted status and does not invent inbox delivery", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("", { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(
      await sendgridNewsletter("test-only-key", "sender@example.test").send(
        "reader@example.test",
      ),
    ).toBe(202);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.sendgrid.com/v3/mail/send",
      expect.objectContaining({ method: "POST" }),
    );
  });
  it("rejects provider failure without returning a false success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("rejected", { status: 403 })),
    );
    await expect(
      sendgridNewsletter("test-only-key", "sender@example.test").send(
        "reader@example.test",
      ),
    ).rejects.toMatchObject({ status: 502 });
  });
  it("does not contact a provider when configuration is missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      sendgridNewsletter(undefined, undefined).send("reader@example.test"),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
