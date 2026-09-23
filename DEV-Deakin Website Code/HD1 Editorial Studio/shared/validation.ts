import { z } from "zod";
const text = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine(
      (v) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v),
      "Remove control characters.",
    );
export const emailSchema = z.string().trim().toLowerCase().email().max(254);
const password = z
  .string()
  .refine((v) => Array.from(v).length >= 8, "Use at least eight characters.")
  .refine(
    (v) => new TextEncoder().encode(v).length <= 72,
    "Password is too long.",
  );
export const signupSchema = z
  .object({
    firstName: text(1, 60),
    lastName: text(1, 60),
    email: emailSchema,
    password,
    confirmPassword: z.string(),
  })
  .strict()
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords must match.",
  });
export const loginSchema = z
  .object({
    email: emailSchema,
    password: z
      .string()
      .min(1)
      .refine(
        (v) => new TextEncoder().encode(v).length <= 72,
        "Password is too long.",
      ),
  })
  .strict();
export const postSchema = z
  .object({
    type: z.enum(["question", "article"]),
    title: text(8, 140),
    abstract: z.string().trim().max(300),
    body: text(30, 20000),
    tags: z
      .array(
        text(1, 24).regex(
          /^[a-zA-Z0-9+#.-]+$/,
          "Use a short tag without spaces.",
        ),
      )
      .min(1)
      .max(3)
      .transform((v) => [...new Set(v.map((x) => x.toLowerCase()))]),
    imageUrl: z.union([
      z.literal(""),
      z.url().startsWith("https://").max(2000),
    ]),
    plan: z.enum(["free", "paid"]),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.type === "article" && v.abstract.length < 20)
      ctx.addIssue({
        code: "custom",
        path: ["abstract"],
        message: "Write an abstract of at least 20 characters.",
      });
  });
export const revisionSchema = z
  .object({ revision: z.number().int().positive() })
  .strict();
export const reviewSchema = z
  .object({
    revision: z.number().int().positive(),
    decision: z.enum(["approve", "reject"]),
    feedback: text(8, 1000),
  })
  .strict();
export const upgradeSchema = z
  .object({
    name: text(2, 100),
    cardNumber: z.literal(
      "4242424242424242",
      "Use only the displayed simulation card.",
    ),
    expiry: z.string().regex(/^(0[1-9]|1[0-2])\/\d{2}$/),
    cvc: z.string().regex(/^\d{3}$/),
    confirmSimulation: z.literal(true),
  })
  .strict()
  .refine(
    (v) => {
      const [m, y] = v.expiry.split("/").map(Number);
      return Date.UTC(2000 + y, m, 1) > Date.now();
    },
    { path: ["expiry"], message: "Use a future expiry date." },
  );
export type PostInput = z.infer<typeof postSchema>;
export function fieldErrors(error: z.ZodError) {
  return Object.fromEntries(
    error.issues.map((i) => [i.path[0] || "form", i.message]),
  );
}
