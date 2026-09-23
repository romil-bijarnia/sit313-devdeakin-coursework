// @vitest-environment jsdom
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { request, TOKEN_KEY, SESSION_ENDED } from "../frontend/src/api.ts";
beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());
it("sends the local JWT to the server and applies a bounded request timeout", async () => {
  localStorage.setItem(TOKEN_KEY, "test-token");
  const f = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ user: null }), { status: 200 }),
    );
  vi.stubGlobal("fetch", f);
  await request("/auth/session");
  expect(f).toHaveBeenCalledWith(
    "/api/auth/session",
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
      signal: expect.any(AbortSignal),
    }),
  );
});
it("clears a rejected session token and announces the identity change", async () => {
  localStorage.setItem(TOKEN_KEY, "expired-token");
  const listener = vi.fn();
  window.addEventListener(SESSION_ENDED, listener);
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ message: "Expired" }), { status: 401 }),
      ),
  );
  await expect(request("/posts")).rejects.toMatchObject({ status: 401 });
  expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  expect(listener).toHaveBeenCalledOnce();
  window.removeEventListener(SESSION_ENDED, listener);
});
it("does not discard an existing session after a failed account-switch login", async () => {
  localStorage.setItem(TOKEN_KEY, "valid-token");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "Wrong password" }), {
        status: 401,
      }),
    ),
  );
  await expect(request("/auth/login")).rejects.toMatchObject({ status: 401 });
  expect(localStorage.getItem(TOKEN_KEY)).toBe("valid-token");
});
it("reports ambiguous network failure without claiming a write did not occur", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(Error("offline")));
  await expect(request("/posts", { method: "POST" })).rejects.toMatchObject({
    status: 0,
    message:
      "Could not confirm the result. Check the current state before retrying.",
  });
});
it("an old 401 response cannot clear a newly issued token", async () => {
  localStorage.setItem(TOKEN_KEY, "old-token");
  let resolve: (r: Response) => void = () => {};
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    ),
  );
  const pending = request("/posts");
  localStorage.setItem(TOKEN_KEY, "new-token");
  const listener = vi.fn();
  window.addEventListener(SESSION_ENDED, listener);
  resolve(
    new Response(JSON.stringify({ message: "Old token expired" }), {
      status: 401,
    }),
  );
  await expect(pending).rejects.toMatchObject({ status: 401 });
  expect(localStorage.getItem(TOKEN_KEY)).toBe("new-token");
  expect(listener).not.toHaveBeenCalled();
  window.removeEventListener(SESSION_ENDED, listener);
});
