# DEV@Deakin — editorial studio

A proposed HD1 continuation of the DEV@Deakin platform. It combines accounts, posts, subscriptions and browsing with an author-to-moderator editorial workflow.

## Status

The editorial workflow is a proposed HD1 scope, pending confirmation through actual seminar or HelpHub discussions. These may take place on-campus or online; an email or chat exchange is not the discussion itself. Assessment preparation includes the tutor's confirmation email, genuine GitLab history spanning weeks, a report with personal reflections and a 10–15 minute live demonstration in Weeks 11–12.

## Run

Use Node 22 or later. Install dependencies with `npm ci`, create a private `.env` based on `.env.example`, then run:

```sh
npm run build
npm start
```

The built frontend and Express API share `http://127.0.0.1:5178`. `/api/health` actually reads Firestore; it is not a static availability claim. For Vite development, set `PORT=5058`, `SITE_ORIGIN=http://127.0.0.1:5178`, then `npm run dev`. Neither command uses a file watcher for the backend.

A server credential must remain outside the repository. The Firestore server client uses `GOOGLE_APPLICATION_CREDENTIALS`; the frontend never receives it. A long, random `JWT_SECRET` signs one-hour sessions. The host defaults to loopback; use `HOST=0.0.0.0` only on the intended deployment environment.

## Trusted moderator setup

`MODERATOR_EMAILS` is a server-only allowlist. The role is resolved from this configuration on each request; a client cannot send its own role. Public signup refuses reserved moderator addresses because an unverified email must not grant privileged access.

To create a reviewer, a trusted operator sets `MODERATOR_EMAIL` and `MODERATOR_PASSWORD` in the process environment, with the email already included in `MODERATOR_EMAILS`, then runs:

```sh
node --env-file-if-exists=.env --import tsx scripts/provision-moderator.ts
```

The script uses the real Firestore adapter and prints no passwords or keys. It refuses to replace an existing account. The allowlist can also deliberately assign a role to an existing account whose owner the operator has already verified. Reviewer accounts cannot approve their own posts.

## Routes

| Route               | Purpose                                                                          |
| ------------------- | -------------------------------------------------------------------------------- |
| `/`                 | Profile, portfolio, article/tutorial previews, responsive gallery and newsletter |
| `/articles`, `/tutorials` | Complete example catalogues with labelled sample author/rating metadata |
| `/help` | Getting started, FAQs and project-specific privacy, terms and conduct guidance |
| `/signup`, `/login` | Validated account creation and JWT login                                         |
| `/pricing`          | Free/Paid comparison and simulated upgrade                                       |
| `/post`             | Conditional Question/Article form; draft creation                                |
| `/post?edit=ID`     | Author-only revision of a draft or rejected post                                 |
| `/studio`           | Author drafts, submission actions and persisted review history                   |
| `/review`           | Moderator queue with mandatory approval/rejection feedback                       |
| `/browse`           | Published posts with server-side plan filtering, search, filters and pagination  |

The API lives under `/api`, using JSON requests and explicit 400/401/403/404/409/413/415/429/502/503 outcomes. Form data is validated again at the server boundary. Signup and login both enforce the bcrypt 72-byte UTF-8 limit. The request parser is capped at 256 KiB so maximum-length multilingual posts, including fully Unicode-escaped JSON, remain valid without accepting unbounded bodies. Bcrypt password hashes, not passwords, are stored. The JWT resides in localStorage as required by D1. Logout increments the server token version, invalidating existing tokens across devices, and clears the browser copy.

## Editorial workflow

1. An authenticated author saves a Question or Article as a draft.
2. The author submits the draft. Its status becomes pending.
3. A different, trusted moderator approves publication or requests changes with feedback.
4. A rejected post can be edited and resubmitted by its author.
5. Published posts cannot be silently edited through the draft route.

Every mutation includes an expected revision. Firestore transactions check the revision, role, owner and state before writing the new post and history together. Stale decisions return 409 instead of overwriting a newer review. Histories are bounded at 100 entries per post to keep documents within predictable size limits.

## React concepts

- `useContext` keeps a shared authenticated account state. Identity/plan changes remount post views so cached paid content is discarded.
- `useReducer` expresses filter, hide and reset transitions without mutating Firestore.
- `useOptimistic` and `useTransition` show an immediate review status during a save, then commit the returned server record or restore the previous state with an error message.
- `useMemo` derives query strings and visible cards. Lazy route imports split the larger editor, pricing and browse interfaces.
- Abort signals and request generations prevent older filter results or session responses replacing newer state. Draft-save completion is ignored after navigation or an account change, and an unmounted editor aborts the request. Ambiguous network failures ask the user to check the current state before retrying rather than promising a write did not occur.

## Data and access

Only `sit313_hd1_users` and `sit313_hd1_posts` are used. They are isolated from P4/C1/D1 collections. Firestore rules deny browser-client access; the server uses its IAM credential.

Public browsing only serialises published posts a visitor is entitled to read. Free/anonymous responses never contain paid bodies, and direct inaccessible post URLs return 404. Review history is restricted to the author and assigned moderators. A paid plan is read from the current database record, not trusted from a browser claim or stale token.

Pagination uses a stable `(createdAt, document ID)` cursor and bounded windows of 24 records. Filters and access checks run before serialisation. A sparse window may contain no matches but still offer Load more; this avoids unbounded full-collection scans. Hide changes only local view state, and Reset restores hidden cards and clears all filters.

## Payment simulation

No Stripe account or payment gateway is involved. Only the displayed test number `4242 4242 4242 4242` is accepted, with a future expiry, three-digit test CVC and explicit simulation acknowledgment. Other card numbers are rejected before frontend transmission and also at the server. The server updates only the plan; it stores no card, CVC, expiry or payment record. No charge or subscription billing occurs.

## Newsletter

Set `NEWSLETTER_PROVIDER=gmail` and the private `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` and `GMAIL_SENDER` settings. Enable the Gmail API for the OAuth project and authorize the intended sender with offline access and `https://www.googleapis.com/auth/gmail.send`. The sender must match the authorized mailbox. None of these settings belongs in source control, public assets or `VITE_` variables.

The adapter refreshes at Google's OAuth endpoint, privately caches an access token until shortly before expiry and coalesces concurrent refresh requests. It sends an injection-checked, UTF-8 MIME message as base64url `raw` to `users/me/messages/send`. Requests have an eight-second deadline. Only HTTP 200 with a valid message ID is accepted. The application reports provider acceptance, not inbox delivery.

No send is retried automatically. If its result is uncertain, the user is asked to check their inbox before retrying; the service does not falsely say no email was sent. Safe logs contain only operational provider/status/outcome fields. Missing configuration or a failed refresh cannot produce an accepted-message event, and log failures do not change an accepted result.

Optional compatibility mode requires `NEWSLETTER_PROVIDER=sendgrid`, `SENDGRID_API_KEY` and `NEWSLETTER_FROM_EMAIL` (or legacy `SENDGRID_FROM_EMAIL`). That adapter accepts only HTTP 202. A missing Gmail configuration never silently selects SendGrid. Health responses show the selected provider and whether its settings are present; this is not a provider authorization or delivery check.

## Verification

```sh
npm run typecheck
npm test
npm run build
npm run verify:firestore
```

Tests use explicitly dependency-injected doubles. They cover input rejection, atomic uniqueness, JWT validity/revocation, ownership, role spoofing, reserved moderator signup, self-review, stale revisions, rejection/edit/resubmission, paid-response suppression, upgrade validation, pagination, newsletter failure, filter reset, conditional form fields and optimistic rollback. They are not presented as live Firestore, email or browser evidence.

Existing illustrative images were retained from the earlier DEV@Deakin workspace. Home-page editorial cards explicitly label their example authors and ratings; community submissions are separate. The footer preserves Explore, Support and Stay connected groups, with actual catalogue/help destinations, project-specific policy notes and clearly identified university social channels.

## Two-account demonstration setup

The operator should use two clearly synthetic identities, not somebody else's real address. No accounts are created by the build or test suite.

1. Pick a synthetic author email and a different synthetic reviewer email. Keep the author email out of `MODERATOR_EMAILS`.
2. Configure the external Firestore credential and JWT signing secret. Put only the chosen reviewer email into the server's `MODERATOR_EMAILS` setting.
3. Start the app. Use `/signup` to create the author account, then `/login` to sign in. The account starts on Free and has the author role.
4. In a separate trusted terminal process, set `MODERATOR_EMAIL` to the chosen reviewer email and provide `MODERATOR_PASSWORD` privately. Run `scripts/provision-moderator.ts` as documented above. Do not put the password in screenshots, commits or report text.
5. As the author, create one Free and one Paid Article or Question and submit both from My studio. Log out.
6. Log in as the reviewer. The Review queue appears. Request changes on one post, approve the other, then log out.
7. Log in as the author, inspect the feedback/history, edit the rejected draft and resubmit. Log back in as the reviewer to approve the revised version.
8. Visit Browse posts while logged out to verify only Free content is returned. Log in as the author, complete the clearly labelled test-card upgrade, and verify Paid content becomes available. A separate ordinary reader can be created if the demonstration needs a non-author Paid viewer.

The reviewer path must stay separate from public registration. The live verification should capture actual Firestore records and visible outcomes; automated fixture records are not evidence of a live account or provider transaction.

## Technical references

- [React useOptimistic](https://react.dev/reference/react/useOptimistic) — temporary state inside Actions and rollback after a failed save.
- [React useReducer](https://react.dev/reference/react/useReducer) — explicit immutable state transitions.
- [Firestore query cursors](https://firebase.google.com/docs/firestore/query-data/query-cursors) — paginated database reads.
- [Gmail sending](https://developers.google.com/workspace/gmail/api/guides/sending) — MIME construction and base64url raw messages.
- [Gmail send method](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send) — the authenticated send endpoint and message response.
- [Google OAuth refresh](https://developers.google.com/identity/protocols/oauth2/web-server#offline) — server-side offline authorization.

## Netlify deployment preparation (not deployed)

This HD1 build has **not been deployed**. The existing target site is `dev-deakin-sit313-romil.netlify.app`, site ID `f32e1409-6142-4f74-99f2-63f0f34a5d24`. The following are operator instructions for a separately authorised deployment, not a record of completed external actions.

The thin adapter in `netlify/functions/api.ts` uses the same Express application as the local server, with `serverless-http` wrapped by Netlify's official `@netlify/aws-lambda-compat`. That wrapper exposes a modern Netlify Function rather than the deprecated Lambda-mode export. It never starts a listening socket. The local `npm start` entry and port 5178 remain unchanged.

`netlify.toml` publishes only `frontend/dist`. `/api/*` and `/api` are rewritten to the function before the React SPA fallback. Both `/api/auth/session` and direct `/.netlify/functions/api/auth/session` resolve to the same Express route. Unknown API routes return JSON 404 responses, not the HTML page. The adapter uses the trusted Netlify Context IP for its per-instance rate limiter, not client-supplied proxy headers. The in-memory limiter is per warm function instance; it is not a distributed quota system.

### Runtime configuration

Set these through the target project's Netlify environment-variable settings. Include the Functions scope where scoped variables are supported. They are **not** values to place in `netlify.toml` or any `VITE_` variable.

| Variable                         | Required runtime value                                                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `FIRESTORE_PROJECT_ID`           | The intended Firestore project's ID                                                                                              |
| `FIRESTORE_SERVICE_ACCOUNT_JSON` | Secret service-account JSON for that same project; read directly in the function at runtime                                      |
| `JWT_SECRET`                     | A long random server-side signing secret, at least 32 characters                                                                 |
| `SITE_ORIGIN`                    | Exact HTTPS origin of the deployment, with no trailing slash; production target is `https://dev-deakin-sit313-romil.netlify.app` |
| `MODERATOR_EMAILS`               | Trusted comma-separated reviewer addresses, or empty for no moderators                                                           |
| `NEWSLETTER_PROVIDER`            | `gmail` for Gmail API; `sendgrid` for explicitly selected legacy support |
| `GMAIL_CLIENT_ID`                | OAuth client ID authorized for the newsletter sender |
| `GMAIL_CLIENT_SECRET`            | Private OAuth client secret |
| `GMAIL_REFRESH_TOKEN`            | Private offline token granting `gmail.send` |
| `GMAIL_SENDER`                   | Mailbox authorized by that token |
| `SENDGRID_API_KEY`               | Optional legacy provider key, used only with `sendgrid` |
| `NEWSLETTER_FROM_EMAIL`          | Legacy provider sender; `SENDGRID_FROM_EMAIL` remains a fallback |
| `AWS_LAMBDA_JS_RUNTIME`          | Optional explicit `nodejs22.x` runtime override through the Netlify UI/CLI, not TOML                                             |

Do not configure `FIRESTORE_EMULATOR_HOST` on the hosted production site; emulator results are not live cloud evidence.

The credential parser validates the project and credential type, then supplies only `client_email` and `private_key` to the Firestore SDK. It does not write the JSON to disk or accept custom token endpoints. `GOOGLE_APPLICATION_CREDENTIALS` remains supported for the existing local server through ADC; the deployed function requires runtime JSON and must not depend on a developer's filesystem path. No real secret values or account credentials were generated for this adapter.

The build uses Node 22 via `.nvmrc` and `NODE_VERSION`; the application requires Node 22 or newer. Netlify runtime defaults follow the supported build version. Environment-variable changes require a new deploy to take effect. A preview deployment must receive its own exact `SITE_ORIGIN` in the appropriate deploy context before state-changing browser requests are expected to succeed; do not assume the production origin also authorises an arbitrary preview host.

### Operator commands after deployment is authorised

From the HD1 app directory:

```sh
npm ci
npm test
npm run build
npm run check:publish
npm run check:function
netlify link --id f32e1409-6142-4f74-99f2-63f0f34a5d24
netlify deploy --build --site f32e1409-6142-4f74-99f2-63f0f34a5d24
```

The final command prepares a draft deployment. Only after its actual frontend/API behaviour and configured services are verified, and production replacement is authorised, use:

```sh
netlify deploy --build --prod --site f32e1409-6142-4f74-99f2-63f0f34a5d24
```

No `netlify link`, account, environment-variable, draft-deploy or production-deploy command was executed as part of preparing this adapter.

### Packaging and verification

- Only built frontend assets are public. `check:publish` rejects unexpected file types and server credential markers in that output.
- The function entry statically imports only server/shared modules. TOML exclusions remove `.env*`, credential JSON filenames, private/QA directories, tests, operator scripts, frontend sources and report files from the function bundle.
- `check:function` compiles the adapter for Node 22 and checks that the local listening entry, frontend, tests and credential files are absent from its source graph.
- Adapter tests invoke modern `Request`/`Response` handling with an injected repository/provider. They cover rewrites, JSON bodies, JWT headers, query strings, error status preservation, origin validation, trusted IP handling and non-disclosure of configuration errors. These are local tests, not proof of a deployed service.
- After an authorised deployment, independently verify page refreshes at `/login`, `/post` and `/browse`; `/api/health`; authentic signup/login; role/plan restrictions; and actual email-provider acceptance. Use real screenshots of the resulting state for C2 evidence.

Netlify references: [Express guide](https://docs.netlify.com/build/frameworks/framework-setup-guides/express/), [modern wrapper migration](https://docs.netlify.com/build/functions/lambda-compatibility/), [runtime environment variables](https://docs.netlify.com/build/functions/environment-variables/), [function runtime and bundling](https://docs.netlify.com/build/functions/configuration/).

### Route navigation accessibility

Pathname changes reset scroll to the top and focus the destination heading only after its Suspense content is ready. Initial page load does not override typing focus. Query-only filtering preserves the current view, and hash navigation keeps its anchor target. This prevents the login form's scroll position carrying over to the middle of Home after a successful sign-in.
