// @vitest-environment jsdom
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { render, act, cleanup, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "../frontend/src/auth.tsx";
import { request, TOKEN_KEY } from "../frontend/src/api.ts";
import type { PublicUser } from "../shared/types.ts";
vi.mock("../frontend/src/api.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../frontend/src/api.ts")>()),
  request: vi.fn(),
}));
const oldUser: PublicUser = {
  id: "a".repeat(64),
  firstName: "Old",
  lastName: "Account",
  email: "old@example.test",
  plan: "free",
  role: "author",
  createdAt: 1,
};
const newUser: PublicUser = {
  ...oldUser,
  id: "b".repeat(64),
  firstName: "New",
  email: "new@example.test",
};
let session: ReturnType<typeof useAuth>;
function Probe() {
  session = useAuth();
  return <div>{session.user?.email || "visitor"}</div>;
}
function deferred<T>() {
  let resolve: (v: T) => void = () => {};
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});
afterEach(cleanup);
it("ignores a stale initial session response after a newer login", async () => {
  const stale = deferred<{ user: PublicUser }>();
  vi.mocked(request).mockImplementation((path) =>
    path === "/auth/session"
      ? stale.promise
      : Promise.resolve({ user: newUser, token: "new-token" }),
  );
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await act(async () => session.login(newUser.email, "test"));
  await act(async () => stale.resolve({ user: oldUser }));
  expect(session.user?.id).toBe(newUser.id);
  expect(localStorage.getItem(TOKEN_KEY)).toBe("new-token");
});
it("an old upgrade response cannot restore an account after logout or account switch", async () => {
  vi.mocked(request).mockImplementation((path) =>
    Promise.resolve(
      path === "/auth/session"
        ? { user: oldUser }
        : path === "/auth/login"
          ? { user: newUser, token: "new-token" }
          : {},
    ),
  );
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await waitFor(() => expect(session.user?.id).toBe(oldUser.id));
  const oldUpgradeSetter = session.setUser;
  await act(async () => session.logout());
  await act(async () => oldUpgradeSetter({ ...oldUser, plan: "paid" }));
  expect(session.user).toBeNull();
  await act(async () => session.login(newUser.email, "test"));
  await act(async () => oldUpgradeSetter({ ...oldUser, plan: "paid" }));
  expect(session.user?.id).toBe(newUser.id);
  expect(session.user?.plan).toBe("free");
});
it("a slow logout completion cannot clear a newer account login", async () => {
  const logout = deferred<unknown>();
  vi.mocked(request).mockImplementation((path) =>
    path === "/auth/logout"
      ? logout.promise
      : Promise.resolve(
          path === "/auth/session"
            ? { user: oldUser }
            : { user: newUser, token: "new-token" },
        ),
  );
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await waitFor(() => expect(session.user?.id).toBe(oldUser.id));
  let pending: Promise<void>;
  await act(async () => {
    pending = session.logout();
  });
  expect(session.user).toBeNull();
  await act(async () => session.login(newUser.email, "test"));
  await act(async () => {
    logout.resolve({});
    await pending!;
  });
  expect(session.user?.id).toBe(newUser.id);
  expect(localStorage.getItem(TOKEN_KEY)).toBe("new-token");
});
it("an older login response cannot replace a newer login", async () => {
  const old = deferred<unknown>();
  vi.mocked(request).mockImplementation((path, init) =>
    path === "/auth/session"
      ? Promise.resolve({ user: null })
      : String(init?.body).includes(oldUser.email)
        ? old.promise
        : Promise.resolve({ user: newUser, token: "new-token" }),
  );
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await waitFor(() => expect(session.loading).toBe(false));
  let pending: Promise<void>;
  await act(async () => {
    pending = session.login(oldUser.email, "test").catch(() => {});
  });
  await act(async () => session.login(newUser.email, "test"));
  await act(async () => {
    old.resolve({ user: oldUser, token: "old-token" });
    await pending;
  });
  expect(session.user?.id).toBe(newUser.id);
  expect(localStorage.getItem(TOKEN_KEY)).toBe("new-token");
});
