export type Plan = "free" | "paid";
export type Role = "author" | "moderator";
export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
  plan: Plan;
  tokenVersion: number;
  createdAt: number;
}
export type PublicUser = Omit<User, "passwordHash" | "tokenVersion"> & {
  role: Role;
};
export type PostStatus = "draft" | "pending" | "published" | "rejected";
export interface ReviewEvent {
  action: "created" | "edited" | "submitted" | "approved" | "rejected";
  actorId: string;
  at: number;
  feedback: string;
}
export interface Post {
  id: string;
  authorId: string;
  type: "question" | "article";
  title: string;
  abstract: string;
  body: string;
  tags: string[];
  imageUrl: string;
  plan: Plan;
  status: PostStatus;
  createdAt: number;
  updatedAt: number;
  revision: number;
  history: ReviewEvent[];
}
export type PublicPost = Omit<Post, "history">;
export interface Page {
  posts: (Post | PublicPost)[];
  nextCursor: string | null;
}
