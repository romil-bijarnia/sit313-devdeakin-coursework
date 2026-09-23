import { Firestore } from "@google-cloud/firestore";
import { createApp } from "../../server/app.ts";
import { FirestoreStore } from "../../server/repository.ts";
import { firestoreOptions } from "../../server/firestore-config.ts";
import { createNewsletter } from "../../server/newsletter.ts";
import { createNetlifyHandler } from "../../server/netlify-adapter.ts";

declare const Netlify: { env: { get(name: string): string | undefined } };

export default createNetlifyHandler(() => {
  // Secrets come from the function's runtime environment, never from the Vite bundle or a copied key file.
  const credential = Netlify.env.get("FIRESTORE_SERVICE_ACCOUNT_JSON");
  if (!credential)
    throw Error("Configure the server-only Firestore JSON credential.");
  const origin = Netlify.env.get("SITE_ORIGIN");
  if (
    !origin ||
    new URL(origin).origin !== origin ||
    !origin.startsWith("https://")
  )
    throw Error("Set an exact HTTPS SITE_ORIGIN for this deployment.");
  const db = new Firestore(
    firestoreOptions({
      FIRESTORE_PROJECT_ID: Netlify.env.get("FIRESTORE_PROJECT_ID"),
      FIRESTORE_SERVICE_ACCOUNT_JSON: credential,
    }),
  );
  return createApp({
    store: new FirestoreStore(db),
    jwtSecret: Netlify.env.get("JWT_SECRET") || "",
    origin,
    moderatorEmails: (Netlify.env.get("MODERATOR_EMAILS") || "").split(","),
    newsletter: createNewsletter({
      provider: Netlify.env.get("NEWSLETTER_PROVIDER") || "gmail",
      gmailClientId: Netlify.env.get("GMAIL_CLIENT_ID") || null,
      gmailClientSecret: Netlify.env.get("GMAIL_CLIENT_SECRET") || null,
      gmailRefreshToken: Netlify.env.get("GMAIL_REFRESH_TOKEN") || null,
      gmailSender: Netlify.env.get("GMAIL_SENDER") || null,
      apiKey: Netlify.env.get("SENDGRID_API_KEY") || null,
      sender:
        Netlify.env.get("NEWSLETTER_FROM_EMAIL") ||
        Netlify.env.get("SENDGRID_FROM_EMAIL") ||
        null,
    }),
    production: true,
  });
});
