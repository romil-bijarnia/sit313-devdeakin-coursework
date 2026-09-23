import { randomUUID } from "node:crypto";

type Provider = "gmail" | "sendgrid";
type Outcome = "not_sent" | "invalid" | "rejected" | "unknown";
type Environment = Record<string, string | undefined>;
interface ProviderResponse {
  status: number;
  json(): Promise<unknown>;
}
interface LogEvent {
  service: "newsletter";
  provider: "Gmail" | "Gmail OAuth" | "SendGrid";
  status: number | null;
  outcome:
    "accepted" | "rejected" | "unknown" | "unavailable" | "invalid_response";
}
export interface NewsletterOptions {
  provider?: string | null;
  apiKey?: string | null;
  sender?: string | null;
  gmailClientId?: string | null;
  gmailClientSecret?: string | null;
  gmailRefreshToken?: string | null;
  gmailSender?: string | null;
  fetchImpl?: (url: string, init: RequestInit) => Promise<ProviderResponse>;
  log?: (event: LogEvent) => unknown;
  now?: () => number;
  timeoutMs?: number;
}
export interface Newsletter {
  readonly configured: boolean;
  readonly provider: Provider | null;
  subscribe(email: string): Promise<{ accepted: true }>;
  send(email: string): Promise<number>;
}

const NOT_SENT =
  "The newsletter service is unavailable. No welcome email has been queued.";
const UNKNOWN =
  "The newsletter service could not confirm whether the welcome email was accepted. Check your inbox before trying again.";
const WELCOME =
  "Welcome to DEV@Deakin.\n\nThanks for joining our newsletter. You’re invited to explore frontend development, share a question, or write an article on the platform.";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

export class NewsletterUnavailableError extends Error {
  readonly status: number;
  constructor(
    message = NOT_SENT,
    public outcome: Outcome = "not_sent",
  ) {
    super(message);
    this.name = "NewsletterUnavailableError";
    this.status =
      outcome === "invalid" ? 400 : outcome === "rejected" ? 502 : 503;
  }
}

export function newsletterSender(environment: Environment) {
  return (
    environment.NEWSLETTER_FROM_EMAIL?.trim() ||
    environment.SENDGRID_FROM_EMAIL?.trim()
  );
}

// Accept one ASCII mailbox in MIME headers: no display-name syntax or header controls.
function mailbox(value: unknown): string | null {
  if (typeof value !== "string" || /[\r\n\0]/.test(value)) return null;
  const email = value.trim();
  const parts = email.split("@");
  if (parts.length !== 2 || email.length > 254 || parts[0].length > 64)
    return null;
  const [local, domain] = parts;
  if (
    !/^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/.test(
      local,
    )
  )
    return null;
  const labels = domain.split(".");
  if (
    labels.length < 2 ||
    labels.some(
      (label) => !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label),
    )
  )
    return null;
  return email;
}
const credential = (value: unknown): value is string =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.length <= 16384 &&
  !/[\r\n\0]/.test(value);
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

function mimeMessage(sender: string, recipient: string, timestamp: number) {
  // Encode the UTF-8 body separately, then encode the whole MIME message as Gmail's raw field.
  const body = Buffer.from(WELCOME, "utf8")
    .toString("base64")
    .match(/.{1,76}/g)!
    .join("\r\n");
  return Buffer.from(
    [
      `From: DEV@Deakin <${sender}>`,
      `To: <${recipient}>`,
      "Subject: Welcome to DEV@Deakin",
      `Date: ${new Date(timestamp).toUTCString()}`,
      `Message-ID: <${randomUUID()}@${sender.split("@")[1]}>`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      body,
      "",
    ].join("\r\n"),
    "utf8",
  ).toString("base64url");
}

export function createNewsletter({
  provider = process.env.NEWSLETTER_PROVIDER || "gmail",
  apiKey = process.env.SENDGRID_API_KEY,
  sender = newsletterSender(process.env),
  gmailClientId = process.env.GMAIL_CLIENT_ID,
  gmailClientSecret = process.env.GMAIL_CLIENT_SECRET,
  gmailRefreshToken = process.env.GMAIL_REFRESH_TOKEN,
  gmailSender = process.env.GMAIL_SENDER,
  fetchImpl = fetch,
  log = (event) => console.info(JSON.stringify(event)),
  now = Date.now,
  timeoutMs = 8000,
}: NewsletterOptions = {}): Newsletter {
  const selected =
    provider === "gmail" || provider === "sendgrid" ? provider : null;
  const from = mailbox(selected === "gmail" ? gmailSender : sender);
  const configured =
    !!from &&
    (selected === "gmail"
      ? credential(gmailClientId) &&
        credential(gmailClientSecret) &&
        credential(gmailRefreshToken)
      : selected === "sendgrid" && credential(apiKey));
  const timeout = Number.isFinite(timeoutMs)
    ? Math.min(15000, Math.max(50, timeoutMs))
    : 8000;
  let accessToken = "";
  let usableUntil = 0;
  let refreshInFlight: Promise<string> | null = null;

  function evidence(
    providerName: LogEvent["provider"],
    status: number | null,
    outcome: LogEvent["outcome"],
  ) {
    const observed =
      Number.isInteger(status) && status! >= 100 && status! <= 599
        ? status
        : null;
    // A failed log sink must never turn accepted mail into a retry. No identities or secrets are logged.
    try {
      void Promise.resolve(
        log({
          service: "newsletter",
          provider: providerName,
          status: observed,
          outcome,
        }),
      ).catch(() => {});
    } catch {
      /* Provider acceptance remains authoritative. */
    }
  }

  async function refreshAccessToken() {
    const started = now();
    let response: ProviderResponse;
    try {
      response = await fetchImpl(TOKEN_URL, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(timeout),
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: gmailClientId!,
          client_secret: gmailClientSecret!,
          refresh_token: gmailRefreshToken!,
        }).toString(),
      });
    } catch {
      evidence("Gmail OAuth", null, "unavailable");
      throw new NewsletterUnavailableError();
    }
    if (response.status !== 200) {
      evidence("Gmail OAuth", response.status, "rejected");
      throw new NewsletterUnavailableError();
    }
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    if (
      !object(data) ||
      typeof data.access_token !== "string" ||
      !/^[\x21-\x7e]{1,8192}$/.test(data.access_token) ||
      typeof data.token_type !== "string" ||
      data.token_type.toLowerCase() !== "bearer" ||
      typeof data.expires_in !== "number" ||
      !Number.isFinite(data.expires_in) ||
      data.expires_in <= 0 ||
      data.expires_in > 86400
    ) {
      evidence("Gmail OAuth", response.status, "invalid_response");
      throw new NewsletterUnavailableError();
    }
    accessToken = data.access_token;
    const lifetime = data.expires_in * 1000;
    usableUntil = started + lifetime - Math.min(60000, lifetime / 10);
    return accessToken;
  }

  async function token() {
    if (accessToken && now() < usableUntil) return accessToken;
    // Concurrent subscriptions share one refresh, but each requested message is sent once.
    refreshInFlight ??= refreshAccessToken();
    const pending = refreshInFlight;
    try {
      return await pending;
    } finally {
      if (refreshInFlight === pending) refreshInFlight = null;
    }
  }

  async function gmailSend(recipient: string) {
    const bearer = await token();
    let response: ProviderResponse;
    try {
      response = await fetchImpl(SEND_URL, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(timeout),
        headers: {
          Authorization: `Bearer ${bearer}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ raw: mimeMessage(from!, recipient, now()) }),
      });
    } catch {
      evidence("Gmail", null, "unknown");
      throw new NewsletterUnavailableError(UNKNOWN, "unknown");
    }
    if (response.status !== 200) {
      if (response.status === 401 && accessToken === bearer) {
        accessToken = "";
        usableUntil = 0;
      }
      const rejected = response.status >= 400 && response.status < 500;
      evidence("Gmail", response.status, rejected ? "rejected" : "unknown");
      // Never retry a send automatically, including after 401. A later explicit request can refresh.
      throw new NewsletterUnavailableError(
        rejected
          ? "The email provider did not accept the welcome email."
          : UNKNOWN,
        rejected ? "rejected" : "unknown",
      );
    }
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    if (
      !object(data) ||
      typeof data.id !== "string" ||
      !/^[A-Za-z0-9_-]{1,256}$/.test(data.id)
    ) {
      evidence("Gmail", response.status, "unknown");
      throw new NewsletterUnavailableError(UNKNOWN, "unknown");
    }
    evidence("Gmail", response.status, "accepted");
    return response.status;
  }

  async function sendgridSend(recipient: string) {
    let response: ProviderResponse;
    try {
      response = await fetchImpl("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(timeout),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: recipient }] }],
          from: { email: from, name: "DEV@Deakin" },
          subject: "Welcome to DEV@Deakin",
          content: [{ type: "text/plain", value: WELCOME }],
        }),
      });
    } catch {
      evidence("SendGrid", null, "unknown");
      throw new NewsletterUnavailableError(UNKNOWN, "unknown");
    }
    const accepted = response.status === 202;
    const rejected = response.status >= 400 && response.status < 500;
    evidence(
      "SendGrid",
      response.status,
      accepted ? "accepted" : rejected ? "rejected" : "unknown",
    );
    if (!accepted)
      throw new NewsletterUnavailableError(
        rejected
          ? "The email provider did not accept the welcome email."
          : UNKNOWN,
        rejected ? "rejected" : "unknown",
      );
    return response.status;
  }

  async function send(email: string) {
    if (!configured) throw new NewsletterUnavailableError();
    const recipient = mailbox(email);
    if (!recipient)
      throw new NewsletterUnavailableError(
        "Enter a valid email address.",
        "invalid",
      );
    return selected === "gmail"
      ? gmailSend(recipient)
      : sendgridSend(recipient);
  }
  return {
    configured,
    provider: selected,
    send,
    async subscribe(email) {
      await send(email);
      return { accepted: true };
    },
  };
}

// Explicit compatibility entry for older HD1 callers; new runtime setup selects Gmail.
export function sendgridNewsletter(
  key: string | undefined,
  from: string | undefined,
): Newsletter {
  return createNewsletter({
    provider: "sendgrid",
    apiKey: key || "",
    sender: from || "",
  });
}
