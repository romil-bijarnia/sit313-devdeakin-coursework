# DEV@Deakin

DEV@Deakin is the cumulative SIT313 React application for Romil Bijarnia. It combines the home portfolio, Firebase authentication, Firestore posts, Firebase Storage image uploads, advanced post browsing, an Express/Netlify Functions API, newsletter delivery, subscription management, and the HD collaboration and tutorial features in one deployable project.

## Live application

- Application: https://dev-deakin-sit313-romil.netlify.app
- Health endpoint: https://dev-deakin-sit313-romil.netlify.app/api/health

Netlify serves the Vite single-page application and the same-origin `/api` routes. Direct navigation to every React route is rewritten to `frontend/dist/index.html`.

## Project structure

- `frontend/` - React, React Router, Firebase client integration, and responsive styles.
- `server/` - framework-neutral API service, local Express adapter, email providers, and persistence adapters.
- `netlify/functions/` - Netlify Lambda adapter for the same API service.
- `firestore.rules` - user, post, collaboration, tutorial, rating, and comment access rules.
- `storage.rules` - authenticated, owner-scoped post-image uploads with type and size checks.
- `reports/` and `docs/` - assessment evidence and technical documentation.

The frontend does not contain provider secrets. Firebase web configuration is supplied at build time, while Resend or SendGrid credentials are available only to the server/function runtime.

## Local setup

```bash
npm ci
cp .env.example .env
cp .env.example frontend/.env
npm run dev
```

The React application runs at `http://127.0.0.1:5173` and Express at `http://127.0.0.1:5050`.

Without Firebase values, the interface enters an explicitly labelled local demonstration mode. It never presents browser-local records as Firestore evidence. Without a transactional email provider, the API records a demo newsletter subscription but explicitly reports that no welcome email was delivered.

## Firebase configuration

Create a Firebase web application, enable Email/Password Authentication, create Firestore and Storage, and place the web configuration in `frontend/.env`:

```dotenv
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

Deploy the committed access rules with the Firebase CLI:

```bash
firebase deploy --only firestore:rules,storage
```

Firebase Authentication owns passwords and password hashing. Firestore stores only non-secret user profiles and feature data. Post images are stored separately in Firebase Storage.

## Email configuration

Resend is preferred for the P5 newsletter demonstration:

```dotenv
RESEND_API_KEY=...
RESEND_FROM=DEV@Deakin <onboarding@resend.dev>
```

SendGrid is also supported through `SENDGRID_API_KEY` and `SENDGRID_FROM`. The API reports provider acceptance separately from final inbox delivery.

## Verification

```bash
npm run build
npm run smoke
npm audit --audit-level=low
```

The smoke suite checks validation, idempotent newsletter requests, subscription plan and cycle allow-lists, private management-token lookup, wrong-token rejection, server-confirmed cancellation, and the production same-origin API bundle. Headless browser QA separately exercises search, post creation, filtering, hiding, reset, password-recovery state, newsletter feedback, subscriptions, integrity-checked collaboration, tutorial engagement, the not-found route, and mobile overflow.

## Deployment

The linked Netlify project is `dev-deakin-sit313-romil`. A production deployment is reproducible with:

```bash
netlify deploy --prod --build
```

`netlify.toml` pins Node 20, bundles the API function, publishes `frontend/dist`, routes `/api/*` to the function, and applies the SPA fallback after the API rule.
