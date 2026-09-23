import type {
  Post,
  PublicUser,
  User,
  Role,
  ReviewEvent,
} from "../shared/types.ts";
import type { PostInput } from "../shared/validation.ts";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function roleFor(user: User, moderators: Set<string>): Role {
  return moderators.has(user.email) ? "moderator" : "author";
}
export function publicUser(user: User, moderators: Set<string>): PublicUser {
  const { passwordHash, tokenVersion, ...safe } = user;
  return { ...safe, role: roleFor(user, moderators) };
}
export function canRead(
  post: Post,
  user: User | null,
  moderators: Set<string>,
) {
  return (
    user?.id === post.authorId ||
    (!!user && roleFor(user, moderators) === "moderator") ||
    (post.status === "published" &&
      (post.plan === "free" || user?.plan === "paid"))
  );
}
// This check is also used before serialising a listing: private/paid data never reaches a free client.
export function visibleInBrowse(post: Post, user: User | null) {
  return (
    post.status === "published" &&
    (post.plan === "free" || user?.plan === "paid")
  );
}
export function changePost(
  post: Post,
  actor: User,
  role: Role,
  revision: number,
  action: "submit" | "approve" | "reject" | "edit",
  data?: PostInput,
  feedback = "",
): Post {
  // Reject stale revisions before changing either the post or its audit history.
  if (post.revision !== revision)
    throw new HttpError(409, "This post changed. Refresh before trying again.");
  if (post.history.length >= 100)
    throw new HttpError(
      409,
      "This post reached its revision limit. Create a new draft.",
    );
  if (action === "edit" || action === "submit") {
    // Authors can revise drafts/rejections, never silently rewrite pending or published work.
    if (post.authorId !== actor.id)
      throw new HttpError(403, "Only the author can change this draft.");
    if (!["draft", "rejected"].includes(post.status))
      throw new HttpError(
        409,
        "Only drafts and rejected posts can be edited or submitted.",
      );
  } else {
    // Publication needs a different, trusted moderator and a pending submission.
    if (role !== "moderator")
      throw new HttpError(403, "A moderator must review this post.");
    if (actor.id === post.authorId)
      throw new HttpError(403, "Authors cannot review their own posts.");
    if (post.status !== "pending")
      throw new HttpError(409, "Only pending posts can be reviewed.");
  }
  const now = Date.now();
  const next: Post = {
    ...post,
    ...(action === "edit" ? data : {}),
    updatedAt: now,
    revision: post.revision + 1,
    status:
      action === "submit"
        ? "pending"
        : action === "approve"
          ? "published"
          : action === "reject"
            ? "rejected"
            : "draft",
  };
  const event: ReviewEvent = {
    action:
      action === "edit"
        ? "edited"
        : action === "submit"
          ? "submitted"
          : action === "approve"
            ? "approved"
            : "rejected",
    actorId: actor.id,
    at: now,
    feedback,
  };
  return { ...next, history: [...post.history, event] };
}
