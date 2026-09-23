import { Firestore } from "@google-cloud/firestore";
import { FirestoreStore } from "../server/repository.ts";
const db = new Firestore({ projectId: process.env.FIRESTORE_PROJECT_ID });
try {
  await new FirestoreStore(db).ping();
  console.log(
    JSON.stringify({
      ok: true,
      database: "Firestore",
      collections: ["sit313_hd1_users", "sit313_hd1_posts"],
    }),
  );
} catch {
  console.error(
    "Firestore verification failed. Check project, credentials and database access.",
  );
  process.exitCode = 1;
} finally {
  await db.terminate();
}
