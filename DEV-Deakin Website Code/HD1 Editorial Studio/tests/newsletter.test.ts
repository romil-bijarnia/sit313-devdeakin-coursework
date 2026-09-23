import { afterEach, expect, it, vi } from "vitest";
import { newsletterSender, sendgridNewsletter } from "../server/newsletter.ts";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("prefers the shared newsletter sender setting over the legacy HD1 name", () => {
  expect(
    newsletterSender({
      NEWSLETTER_FROM_EMAIL: " current@example.test ",
      SENDGRID_FROM_EMAIL: "legacy@example.test",
    }),
  ).toBe("current@example.test");
});
it("supports the legacy sender when the preferred setting is absent or blank", () => {
  expect(
    newsletterSender({ SENDGRID_FROM_EMAIL: " legacy@example.test " }),
  ).toBe("legacy@example.test");
  expect(
    newsletterSender({
      NEWSLETTER_FROM_EMAIL: " ",
      SENDGRID_FROM_EMAIL: "legacy@example.test",
    }),
  ).toBe("legacy@example.test");
});
it("does not invent a default sender when no sender is configured", () => {
  expect(newsletterSender({})).toBeUndefined();
});
it("uses the selected sender in the provider request and reports acceptance, not delivery", async () => {
  const provider = vi.fn().mockResolvedValue({ status: 202 });
  vi.stubGlobal("fetch", provider);
  vi.spyOn(console, "info").mockImplementation(() => {});
  const newsletter = sendgridNewsletter(
    "synthetic-test-key",
    newsletterSender({ NEWSLETTER_FROM_EMAIL: "sender@example.test" }),
  );
  await expect(newsletter.send("reader@example.test")).resolves.toBe(202);
  const body = JSON.parse(provider.mock.calls[0][1].body);
  expect(body.from).toEqual({
    email: "sender@example.test",
    name: "DEV@Deakin",
  });
  expect(body.personalizations).toEqual([
    { to: [{ email: "reader@example.test" }] },
  ]);
  expect(console.info).toHaveBeenCalledWith(
    JSON.stringify({
      service: "newsletter",
      provider: "SendGrid",
      status: 202,
      outcome: "accepted",
    }),
  );
});
