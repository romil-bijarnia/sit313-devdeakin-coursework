import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import {
  signupSchema,
  loginSchema,
  postSchema,
  reviewSchema,
  revisionSchema,
  upgradeSchema,
  emailSchema,
  fieldErrors,
} from "../shared/validation.ts";
import type { User, Post } from "../shared/types.ts";
import type { Store } from "./repository.ts";
import { newId } from "./repository.ts";
import {
  HttpError,
  publicUser,
  roleFor,
  canRead,
  visibleInBrowse,
  changePost,
} from "./domain.ts";
import { NewsletterUnavailableError, type Newsletter } from "./newsletter.ts";
interface AuthRequest extends Request {
  account?: User | null;
}
interface Config {
  store: Store;
  jwtSecret: string;
  origin: string;
  moderatorEmails?: string[];
  newsletter: Newsletter;
  rounds?: number;
  production?: boolean;
  rateLimitMax?: number;
}
const publicShape = (p: Post) => {
  const { history, ...safe } = p;
  return safe;
};
export function createApp({
  store,
  jwtSecret,
  origin,
  moderatorEmails = [],
  newsletter,
  rounds = 12,
  production = false,
  rateLimitMax = 30,
}: Config) {
  if (jwtSecret.length < 32)
    throw Error("JWT_SECRET must be at least 32 characters.");
  const key = new TextEncoder().encode(jwtSecret),
    moderators = new Set(
      moderatorEmails.map((e) => e.trim().toLowerCase()).filter(Boolean),
    );
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet({ contentSecurityPolicy: production ? undefined : false }));
  app.use(express.json({ limit: "256kb" }));
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.get("origin") &&
      req.get("origin") !== origin
    )
      return res
        .status(403)
        .json({ message: "This request came from another site." });
    if (["POST", "PATCH"].includes(req.method) && !req.is("application/json"))
      return res.status(415).json({ message: "Send JSON data." });
    next();
  });
  const limiter = rateLimit({
    windowMs: 900000,
    limit: rateLimitMax,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { message: "Too many attempts. Try again later." },
  });
  const parse = <T>(schema: z.ZodType<T>, body: unknown): T => {
    const result = schema.safeParse(body);
    if (!result.success) throw result.error;
    return result.data;
  };
  const tokenFor = (u: User) =>
    new SignJWT({ version: u.tokenVersion })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(u.id)
      .setIssuedAt()
      .setIssuer("sit313-hd1")
      .setAudience("dev-deakin")
      .setExpirationTime("1h")
      .sign(key);
  const authenticate = async (
    req: AuthRequest,
    _res: Response,
    next: NextFunction,
  ) => {
    try {
      req.account = null;
      const header = req.get("authorization");
      if (header) {
        if (!header.startsWith("Bearer "))
          throw new HttpError(401, "Sign in again.");
        let payload;
        try {
          ({ payload } = await jwtVerify(header.slice(7), key, {
            algorithms: ["HS256"],
            issuer: "sit313-hd1",
            audience: "dev-deakin",
          }));
        } catch {
          throw new HttpError(401, "Your session expired. Sign in again.");
        }
        if (!payload.sub || !/^[a-f0-9]{64}$/.test(payload.sub))
          throw new HttpError(401, "Sign in again.");
        const u = await store.user(payload.sub);
        if (!u || u.tokenVersion !== payload.version)
          throw new HttpError(401, "Sign in again.");
        req.account = u;
      }
      next();
    } catch (e) {
      next(e);
    }
  };
  const required = (req: AuthRequest) => {
    if (!req.account) throw new HttpError(401, "Log in to continue.");
    return req.account;
  };
  const dummy = bcrypt.hashSync("Timing-only password value", rounds);
  app.get("/api/health", async (_req, res, next) => {
    try {
      await store.ping();
      res.json({ ok: true, database: "Firestore", service: "SIT313 HD1", newsletterConfigured: newsletter.configured, newsletterProvider: newsletter.provider });
    } catch (e) {
      next(e);
    }
  });
  app.post("/api/auth/signup", limiter, async (req, res, next) => {
    try {
      const d = parse(signupSchema, req.body);
      if (moderators.has(d.email))
        throw new HttpError(
          403,
          "This address is reserved for an assigned moderator.",
        );
      await store.createUser({
        firstName: d.firstName,
        lastName: d.lastName,
        email: d.email,
        passwordHash: await bcrypt.hash(d.password, rounds),
        plan: "free",
        tokenVersion: 0,
        createdAt: Date.now(),
      });
      res.status(201).json({ message: "Account created. Log in to continue." });
    } catch (e) {
      next(e);
    }
  });
  app.post("/api/auth/login", limiter, async (req, res, next) => {
    try {
      const d = parse(loginSchema, req.body),
        u = await store.userByEmail(d.email);
      const good = await bcrypt.compare(d.password, u?.passwordHash || dummy);
      if (!u || !good)
        throw new HttpError(401, "The email or password is incorrect.");
      res.json({ token: await tokenFor(u), user: publicUser(u, moderators) });
    } catch (e) {
      next(e);
    }
  });
  app.use("/api", authenticate);
  app.get("/api/auth/session", (req: AuthRequest, res) =>
    res.json({
      user: req.account ? publicUser(req.account, moderators) : null,
    }),
  );
  app.post("/api/auth/logout", async (req: AuthRequest, res, next) => {
    try {
      const u = required(req);
      await store.updateUser(u.id, (x) => ({
        ...x,
        tokenVersion: x.tokenVersion + 1,
      }));
      res.json({ message: "Signed out on all devices." });
    } catch (e) {
      next(e);
    }
  });
  app.post(
    "/api/subscription/upgrade",
    limiter,
    async (req: AuthRequest, res, next) => {
      try {
        const u = required(req);
        parse(upgradeSchema, req.body);
        const updated = await store.updateUser(u.id, (x) => {
          if (x.plan === "paid")
            throw new HttpError(409, "This account is already on Paid.");
          return { ...x, plan: "paid" };
        });
        res.json({
          message:
            "Simulation complete. Paid access is active; no charge was made.",
          user: publicUser(updated, moderators),
        });
      } catch (e) {
        next(e);
      }
    },
  );
  app.post("/api/posts", async (req: AuthRequest, res, next) => {
    try {
      const u = required(req),
        d = parse(postSchema, req.body),
        now = Date.now();
      const p: Post = {
        ...d,
        id: newId(),
        authorId: u.id,
        status: "draft",
        createdAt: now,
        updatedAt: now,
        revision: 1,
        history: [{ action: "created", actorId: u.id, at: now, feedback: "" }],
      };
      res.status(201).json({
        post: await store.createPost(p),
        message: "Draft saved. Submit it when ready for review.",
      });
    } catch (e) {
      next(e);
    }
  });
  app.get("/api/posts", async (req: AuthRequest, res, next) => {
    try {
      const filters = z
        .object({
          scope: z.enum(["public", "mine", "review"]).default("public"),
          type: z.enum(["question", "article"]).optional(),
          plan: z.enum(["free", "paid"]).optional(),
          q: z.string().max(100).optional(),
          tag: z.string().max(24).optional(),
          after: z.iso.date().optional(),
          before: z.iso.date().optional(),
          cursor: z.string().max(300).optional(),
        })
        .strict()
        .parse(req.query);
      const u = req.account || null;
      if (filters.scope !== "public") required(req);
      if (filters.scope === "review" && roleFor(u!, moderators) !== "moderator")
        throw new HttpError(403, "Moderator access is required.");
      // Scan bounded cursor windows, then authorise before serialising. A sparse page can be empty and still have a next cursor.
      const page = await store.page(filters.cursor || null, 24);
      const posts = page.posts
        .filter((p) =>
          filters.scope === "mine"
            ? p.authorId === u!.id
            : filters.scope === "review"
              ? p.status === "pending" && p.authorId !== u!.id
              : visibleInBrowse(p, u),
        )
        .filter(
          (p) =>
            (!filters.type || p.type === filters.type) &&
            (!filters.plan || p.plan === filters.plan) &&
            (!filters.q ||
              `${p.title} ${p.abstract} ${p.body}`
                .toLowerCase()
                .includes(filters.q.toLowerCase())) &&
            (!filters.tag || p.tags.includes(filters.tag.toLowerCase())) &&
            (!filters.after || p.createdAt >= Date.parse(filters.after)) &&
            (!filters.before ||
              p.createdAt < Date.parse(filters.before) + 86400000),
        );
      res.json({
        posts: filters.scope === "public" ? posts.map(publicShape) : posts,
        nextCursor: page.nextCursor,
      });
    } catch (e) {
      next(e);
    }
  });
  app.get("/api/posts/:id", async (req: AuthRequest, res, next) => {
    try {
      const p = await store.post(String(req.params.id));
      if (!p || !canRead(p, req.account || null, moderators))
        throw new HttpError(404, "Post not found.");
      res.json({
        post:
          req.account &&
          (req.account.id === p.authorId ||
            roleFor(req.account, moderators) === "moderator")
            ? p
            : publicShape(p),
      });
    } catch (e) {
      next(e);
    }
  });
  app.patch("/api/posts/:id", async (req: AuthRequest, res, next) => {
    try {
      const u = required(req),
        d = parse(
          z
            .object({ revision: z.number().int().positive(), post: postSchema })
            .strict(),
          req.body,
        );
      const p = await store.updatePost(String(req.params.id), (p) =>
        changePost(p, u, roleFor(u, moderators), d.revision, "edit", d.post),
      );
      res.json({ post: p, message: "Draft updated." });
    } catch (e) {
      next(e);
    }
  });
  app.post("/api/posts/:id/submit", async (req: AuthRequest, res, next) => {
    try {
      const u = required(req),
        d = parse(revisionSchema, req.body);
      const p = await store.updatePost(String(req.params.id), (p) =>
        changePost(p, u, roleFor(u, moderators), d.revision, "submit"),
      );
      res.json({ post: p, message: "Submitted for review." });
    } catch (e) {
      next(e);
    }
  });
  app.post("/api/posts/:id/review", async (req: AuthRequest, res, next) => {
    try {
      const u = required(req),
        d = parse(reviewSchema, req.body);
      const p = await store.updatePost(String(req.params.id), (p) =>
        changePost(
          p,
          u,
          roleFor(u, moderators),
          d.revision,
          d.decision,
          undefined,
          d.feedback,
        ),
      );
      res.json({
        post: p,
        message:
          d.decision === "approve" ? "Post published." : "Changes requested.",
      });
    } catch (e) {
      next(e);
    }
  });
  app.post("/api/newsletter", limiter, async (req, res, next) => {
    try {
      const d = parse(z.object({ email: emailSchema }).strict(), req.body);
      const status = await newsletter.send(d.email);
      res.status(202).json({
        message: "The email provider accepted your welcome email.",
        providerStatus: status,
      });
    } catch (e) {
      next(e);
    }
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ message: "API route not found." }),
  );
  app.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (error instanceof z.ZodError)
        return res.status(400).json({
          message: "Please correct the form.",
          errors: fieldErrors(error),
        });
      if (error instanceof HttpError)
        return res.status(error.status).json({ message: error.message });
      // A timeout after sending is not proof that no mail was accepted; do not invite a blind resend.
      if (error instanceof NewsletterUnavailableError)
        return res.status(error.status).json({ message: error.message });
      if ((error as { type?: string })?.type === "entity.parse.failed")
        return res.status(400).json({ message: "Invalid JSON." });
      if ((error as { type?: string })?.type === "entity.too.large")
        return res.status(413).json({ message: "Request too large." });
      res.status(503).json({
        message:
          "The service could not confirm the result. Check the current state before retrying.",
      });
    },
  );
  return app;
}
