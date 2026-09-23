// @vitest-environment jsdom
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import { render, screen, cleanup, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  MemoryRouter,
  Route,
  Routes,
  Link,
  useNavigate,
} from "react-router-dom";
import { Suspense, lazy } from "react";
import { RouteFocus } from "../frontend/src/RouteFocus.tsx";
let navigate: ReturnType<typeof useNavigate>;
function Nav() {
  navigate = useNavigate();
  return (
    <nav>
      <Link to="/">Home</Link>
      <Link to="/login">Login</Link>
      <Link to="/#work">Work</Link>
      <Link to="/slow">Slow page</Link>
    </nav>
  );
}
function TestApp({
  initial = "/login",
  slow,
}: {
  initial?: string;
  slow?: React.ReactNode;
}) {
  return (
    <MemoryRouter initialEntries={[initial]}>
      <Nav />
      <div id="app-content">
        <Suspense fallback={<main>Opening page…</main>}>
          <Routes>
            <Route
              path="/login"
              element={
                <main>
                  <h1>Login page</h1>
                  <input aria-label="Email" autoFocus />
                </main>
              }
            />
            <Route
              path="/"
              element={
                <main>
                  <h1>Home page</h1>
                  <section id="work">
                    <h2>Portfolio</h2>
                  </section>
                  <input aria-label="Search" />
                </main>
              }
            />
            <Route
              path="/slow"
              element={
                slow || (
                  <main>
                    <h1>Slow page</h1>
                  </main>
                )
              }
            />
          </Routes>
          <RouteFocus />
        </Suspense>
      </div>
    </MemoryRouter>
  );
}
beforeEach(() => {
  vi.stubGlobal("scrollTo", vi.fn());
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("does not scroll or override form focus on initial load", () => {
  render(<TestApp />);
  expect(window.scrollTo).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(
    screen.getByRole("textbox", { name: "Email" }),
  );
  expect(
    screen
      .getByRole("heading", { name: "Login page" })
      .getAttribute("tabindex"),
  ).toBeNull();
});
it("resets scroll and focuses the new heading when the pathname changes", async () => {
  const user = userEvent.setup();
  render(<TestApp />);
  await user.click(screen.getByRole("link", { name: "Home" }));
  expect(window.scrollTo).toHaveBeenCalledWith({
    top: 0,
    left: 0,
    behavior: "auto",
  });
  const heading = screen.getByRole("heading", { name: "Home page" });
  expect(document.activeElement).toBe(heading);
  expect(heading.getAttribute("tabindex")).toBe("-1");
});
it("preserves input focus and scroll for query-only filtering", async () => {
  render(<TestApp initial="/" />);
  const input = screen.getByRole("textbox", { name: "Search" });
  input.focus();
  await act(async () => navigate("/?q=react"));
  expect(window.scrollTo).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(input);
});
it("preserves same-page hash anchors without a top reset or focus theft", async () => {
  render(<TestApp initial="/" />);
  const input = screen.getByRole("textbox", { name: "Search" });
  input.focus();
  await act(async () => navigate("/#work"));
  expect(window.scrollTo).not.toHaveBeenCalled();
  expect(document.getElementById("work")!.scrollIntoView).toHaveBeenCalledWith({
    block: "start",
    behavior: "auto",
  });
  expect(document.activeElement).toBe(input);
});
it("targets a cross-page hash anchor rather than scrolling to the top", async () => {
  const user = userEvent.setup();
  render(<TestApp />);
  await user.click(screen.getByRole("link", { name: "Work" }));
  expect(window.scrollTo).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(document.getElementById("work"));
});
it("waits for a lazy destination before focusing its heading", async () => {
  let finish: (module: { default: () => React.ReactNode }) => void = () => {};
  const Slow = lazy(
    () => new Promise<{ default: () => React.ReactNode }>((r) => (finish = r)),
  );
  const user = userEvent.setup();
  render(<TestApp slow={<Slow />} />);
  await user.click(screen.getByRole("link", { name: "Slow page" }));
  expect(window.scrollTo).not.toHaveBeenCalled();
  await act(async () =>
    finish({
      default: () => (
        <main>
          <h1>Loaded destination</h1>
        </main>
      ),
    }),
  );
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "Loaded destination" }),
    ),
  );
  expect(window.scrollTo).toHaveBeenCalledTimes(1);
});
