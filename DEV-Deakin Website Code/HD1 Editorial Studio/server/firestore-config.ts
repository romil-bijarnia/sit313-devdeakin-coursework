import type { Settings } from "@google-cloud/firestore";

/** Server-only configuration. Never import this module from frontend code. */
export function firestoreOptions(
  env: NodeJS.ProcessEnv = process.env,
): Settings {
  const projectId = env.FIRESTORE_PROJECT_ID?.trim();
  if (!projectId) throw Error("FIRESTORE_PROJECT_ID is required.");
  const json = env.FIRESTORE_SERVICE_ACCOUNT_JSON;
  if (!json) return { projectId }; // Local development retains Application Default Credentials.
  try {
    const credential: unknown = JSON.parse(json);
    if (!credential || typeof credential !== "object") throw Error();
    const c = credential as Record<string, unknown>;
    if (
      c.type !== "service_account" ||
      c.project_id !== projectId ||
      typeof c.client_email !== "string" ||
      !c.client_email.endsWith(".gserviceaccount.com") ||
      typeof c.private_key !== "string" ||
      !c.private_key.trim()
    )
      throw Error();
    // Pick only the two credential fields used by the SDK; never accept custom token endpoints.
    return {
      projectId,
      credentials: { client_email: c.client_email, private_key: c.private_key },
      preferRest: true,
    };
  } catch {
    throw Error(
      "The server Firestore credential is invalid or belongs to a different project.",
    );
  }
}
