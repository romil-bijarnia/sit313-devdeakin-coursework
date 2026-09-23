# DEV@Deakin Architecture and Advanced React Concepts

## Trust boundaries

The browser is an untrusted client. It validates inputs for usability, but Firebase rules and the API service repeat every decision that protects stored data. Passwords go directly to Firebase Authentication and never enter Firestore, local storage, logs, reports, or the Express API. Transactional email keys remain server-side.

Post images use a two-resource transaction pattern. The authenticated client uploads an allow-listed image to the user's Storage path, obtains its download URL, and then creates the Firestore document. If the document write fails, it deletes the orphaned upload. Firestore validates the document schema and owner ID; Storage independently validates the owner path, media type, and five-megabyte limit.

Subscriptions use a capability model. Creation returns a random management token once, while the backend stores only its SHA-256 hash. The client retains the token locally and must present it to list or cancel that record. Public subscriber-list endpoints do not exist.

## Shared API service

`server/api-service.js` contains HTTP-independent validation and business rules. `server/server.js` adapts it to Express for local development, while `netlify/functions/api.js` adapts the same service to Netlify's Lambda interface. Local JSON and Netlify Blobs implement the same repository contract, so tests exercise the same decision layer used in production.

The newsletter flow reserves an idempotent subscriber record before contacting the provider. Resend and SendGrid responses record provider acceptance without claiming final inbox delivery. Demo mode is explicit and never claims that an email was sent.

## Advanced React concepts

### Asynchronous source-of-truth refresh

Browse Posts does not treat a successful button click as proof of persistence. Its callback reloads the data adapter, represents loading and error states, and only then renders the refreshed collection. URL search parameters connect the global search form to the page filters.

### Authentication observer and derived UI

A Firebase `onAuthStateChanged` observer restores the session and reloads the matching UID profile. Header actions, post permissions, collaboration access, email-verification controls, ratings, and comments derive from the safe profile state. Stale asynchronous observations cannot overwrite a newer sign-out.

### Compensating transactions

Registration deletes a newly created Firebase Authentication account if its Firestore profile write fails. Post creation deletes a newly uploaded Storage object if its Firestore document cannot be created. These compensating actions prevent partial application state.

### Integrity-checked collaboration

Each message includes a random nonce, client timestamp, sender identity, and SHA-256 digest produced through Web Crypto. Firestore makes messages immutable and binds creation to the authenticated UID. On every read, the client recalculates the digest and displays a verified or failed integrity state. The local fallback is labelled as a demonstration and does not claim cross-device authentication or transport protection.

### Persistent tutorial engagement

Tutorial detail is selected through URL state. Opening a tutorial records one view per browser session, ratings are stored per authenticated UID, comments are immutable author-bound documents, and the interface reloads aggregate activity rather than incrementing visual counters optimistically.

### Accessible interaction state

The application includes a skip link, semantic navigation, descriptive labels, keyboard-contained status dialogs, `aria-live` feedback, disabled loading actions, explicit empty/error states, and responsive layouts without document-level horizontal overflow.

## Deliberate limits

The local fallback exists for interface testing only. It is never presented as Firebase or email-provider evidence. Netlify Blobs provides a suitable teaching-scale subscription store; a production billing system would use a transactional database, authenticated account ownership, rate limiting, verified pricing, and a payment provider.
