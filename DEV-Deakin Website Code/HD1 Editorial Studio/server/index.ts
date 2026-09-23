import express from "express";
import { Firestore } from "@google-cloud/firestore";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createApp } from "./app.ts";
import { FirestoreStore } from "./repository.ts";
import { firestoreOptions } from "./firestore-config.ts";
import { createNewsletter } from "./newsletter.ts";
const port = Number(process.env.PORT || 5178),
  projectId = process.env.FIRESTORE_PROJECT_ID;
if (!projectId) throw Error("FIRESTORE_PROJECT_ID is required.");
const db = new Firestore(firestoreOptions());
const app = createApp({
  store: new FirestoreStore(db),
  jwtSecret: process.env.JWT_SECRET || "",
  origin: process.env.SITE_ORIGIN || `http://127.0.0.1:${port}`,
  moderatorEmails: (process.env.MODERATOR_EMAILS || "").split(","),
  newsletter: createNewsletter(),
  production: process.env.NODE_ENV === "production",
});
const dist = fileURLToPath(new URL("../frontend/dist/", import.meta.url));
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get("/{*path}", (_req, res) => res.sendFile(resolve(dist, "index.html")));
}
const server = app.listen(port, process.env.HOST || "127.0.0.1", () =>
  console.log(
    `HD1 server listening on port ${port}. Use /api/health to verify Firestore.`,
  ),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.once(signal, () =>
    server.close(() => {
      void db.terminate().finally(() => process.exit(0));
    }),
  );
