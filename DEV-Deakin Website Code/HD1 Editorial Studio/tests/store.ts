import type { Store } from "../server/repository.ts";
import type { User, Post } from "../shared/types.ts";
import { emailId } from "../server/repository.ts";
import { HttpError } from "../server/domain.ts";
// Dependency-injected unit-test double. The actual server always constructs FirestoreStore.
export class TestStore implements Store {
  users = new Map<string, User>();
  posts = new Map<string, Post>();
  async ping() {}
  async createUser(data: Omit<User, "id">) {
    const id = emailId(data.email);
    if (this.users.has(id)) throw new HttpError(409, "Duplicate email.");
    const u = { ...data, id };
    this.users.set(id, u);
    return u;
  }
  async user(id: string) {
    return this.users.get(id) || null;
  }
  userByEmail(email: string) {
    return this.user(emailId(email));
  }
  async updateUser(id: string, mutate: (u: User) => User) {
    const u = this.users.get(id);
    if (!u) throw new HttpError(401, "No user.");
    const next = mutate(u);
    this.users.set(id, next);
    return next;
  }
  async createPost(post: Post) {
    this.posts.set(post.id, post);
    return post;
  }
  async post(id: string) {
    return this.posts.get(id) || null;
  }
  async updatePost(id: string, mutate: (p: Post) => Post) {
    const p = this.posts.get(id);
    if (!p) throw new HttpError(404, "Missing post.");
    const next = mutate(p);
    this.posts.set(id, next);
    return next;
  }
  async page(cursor: string | null, limit: number) {
    const sorted = [...this.posts.values()].sort(
      (a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id),
    );
    let start = 0;
    if (cursor) {
      let id;
      try {
        id = JSON.parse(Buffer.from(cursor, "base64url").toString())[1];
      } catch {
        throw new HttpError(400, "Invalid page cursor.");
      }
      start = sorted.findIndex((p) => p.id === id) + 1;
    }
    const posts = sorted.slice(start, start + limit),
      last = posts.at(-1);
    return {
      posts,
      nextCursor:
        start + limit < sorted.length && last
          ? Buffer.from(JSON.stringify([last.createdAt, last.id])).toString(
              "base64url",
            )
          : null,
    };
  }
}
