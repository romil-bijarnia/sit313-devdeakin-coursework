import { Firestore } from "@google-cloud/firestore";
import bcrypt from "bcryptjs";
import { FirestoreStore } from "../server/repository.ts";
import { signupSchema } from "../shared/validation.ts";
// A trusted operator provisions this account; public signup rejects reserved moderator addresses.
const email = (process.env.MODERATOR_EMAIL || "").trim().toLowerCase();
const allowlist = (process.env.MODERATOR_EMAILS || "")
  .split(",")
  .map((v) => v.trim().toLowerCase());
if (!email || !allowlist.includes(email))
  throw Error(
    "MODERATOR_EMAIL must be in the trusted MODERATOR_EMAILS allowlist.",
  );
const data = signupSchema.parse({
  firstName: "Editorial",
  lastName: "Reviewer",
  email,
  password: process.env.MODERATOR_PASSWORD,
  confirmPassword: process.env.MODERATOR_PASSWORD,
});
const db = new Firestore({ projectId: process.env.FIRESTORE_PROJECT_ID });
try {
  await new FirestoreStore(db).createUser({
    firstName: data.firstName,
    lastName: data.lastName,
    email,
    passwordHash: await bcrypt.hash(data.password, 12),
    plan: "free",
    tokenVersion: 0,
    createdAt: Date.now(),
  });
  console.log(
    "Assigned moderator account created. No credential values are shown.",
  );
} catch {
  console.error(
    "Moderator provisioning failed. Check configuration or whether the account already exists.",
  );
  process.exitCode = 1;
} finally {
  await db.terminate();
}
