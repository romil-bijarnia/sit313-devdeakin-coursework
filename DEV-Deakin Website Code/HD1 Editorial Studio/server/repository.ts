import { createHash, randomUUID } from "node:crypto";
import { Firestore, FieldPath } from "@google-cloud/firestore";
import type { Post, User } from "../shared/types.ts";
import { HttpError } from "./domain.ts";
export interface Store {
  createUser(data: Omit<User, "id">): Promise<User>;
  user(id: string): Promise<User | null>;
  userByEmail(email: string): Promise<User | null>;
  updateUser(id: string, mutate: (u: User) => User): Promise<User>;
  createPost(post: Post): Promise<Post>;
  post(id: string): Promise<Post | null>;
  updatePost(id: string, mutate: (post: Post) => Post): Promise<Post>;
  page(
    cursor: string | null,
    limit: number,
  ): Promise<{ posts: Post[]; nextCursor: string | null }>;
  ping(): Promise<void>;
}
export const emailId = (email: string) =>
  createHash("sha256").update(email.toLowerCase()).digest("hex");
export const newId = () => randomUUID();
export class FirestoreStore implements Store {
  constructor(private db: Firestore) {}
  private users() {
    return this.db.collection("sit313_hd1_users");
  }
  private posts() {
    return this.db.collection("sit313_hd1_posts");
  }
  async ping() {
    await this.users().limit(1).get();
  }
  async createUser(data: Omit<User, "id">) {
    const id = emailId(data.email),
      u = { ...data, id },
      ref = this.users().doc(id);
    // The email-derived ID and transaction prevent concurrent signups from creating duplicates.
    await this.db.runTransaction(async (tx) => {
      if ((await tx.get(ref)).exists)
        throw new HttpError(409, "An account already uses this email.");
      tx.create(ref, u);
    });
    return u;
  }
  async user(id: string) {
    const d = await this.users().doc(id).get();
    return d.exists ? (d.data() as User) : null;
  }
  userByEmail(email: string) {
    return this.user(emailId(email));
  }
  async updateUser(id: string, mutate: (u: User) => User) {
    const ref = this.users().doc(id);
    return this.db.runTransaction(async (tx) => {
      const d = await tx.get(ref);
      if (!d.exists) throw new HttpError(401, "Sign in again.");
      const next = mutate(d.data() as User);
      tx.set(ref, next);
      return next;
    });
  }
  async createPost(post: Post) {
    await this.posts().doc(post.id).create(post);
    return post;
  }
  async post(id: string) {
    const d = await this.posts().doc(id).get();
    return d.exists ? (d.data() as Post) : null;
  }
  async updatePost(id: string, mutate: (p: Post) => Post) {
    const ref = this.posts().doc(id);
    // Firestore may retry this callback. Recheck ownership, state and revision against each fresh read.
    // The new content, revision and history are written together or not at all.
    return this.db.runTransaction(async (tx) => {
      const d = await tx.get(ref);
      if (!d.exists) throw new HttpError(404, "Post not found.");
      const next = mutate(d.data() as Post);
      tx.set(ref, next);
      return next;
    });
  }
  async page(cursor: string | null, limit: number) {
    // Document ID breaks timestamp ties so pagination has a stable boundary.
    let q = this.posts()
      .orderBy("createdAt", "desc")
      .orderBy(FieldPath.documentId(), "desc");
    if (cursor) {
      try {
        const [t, id] = JSON.parse(Buffer.from(cursor, "base64url").toString());
        if (
          !Number.isSafeInteger(t) ||
          typeof id !== "string" ||
          !/^[-\w]{1,100}$/.test(id)
        )
          throw Error();
        q = q.startAfter(t, id);
      } catch {
        throw new HttpError(400, "Invalid page cursor.");
      }
    }
    const docs = (await q.limit(limit + 1).get()).docs;
    const more = docs.length > limit;
    const picked = docs.slice(0, limit);
    const last = picked.at(-1);
    return {
      posts: picked.map((d) => d.data() as Post),
      nextCursor:
        more && last
          ? Buffer.from(
              JSON.stringify([last.data().createdAt, last.id]),
            ).toString("base64url")
          : null,
    };
  }
}
