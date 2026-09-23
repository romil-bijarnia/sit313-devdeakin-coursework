// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  waitFor,
  act,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { Post, PublicUser } from "../shared/types.ts";
import AuthPage from "../frontend/src/AuthPage.tsx";
import PostEditor from "../frontend/src/PostEditor.tsx";
import Browse, {
  ReviewCard,
  filterReducer,
  initialFilters,
} from "../frontend/src/Browse.tsx";
import Pricing from "../frontend/src/Pricing.tsx";
import Home, { CataloguePage } from "../frontend/src/Home.tsx";
import HelpPage from "../frontend/src/HelpPage.tsx";
import { Footer } from "../frontend/src/components.tsx";
import { request } from "../frontend/src/api.ts";
const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  setUser: vi.fn(),
  user: null as PublicUser | null,
}));
vi.mock("../frontend/src/auth.tsx", () => ({
  useAuth: () => ({
    user: mocks.user,
    loading: false,
    login: mocks.login,
    setUser: mocks.setUser,
  }),
}));
vi.mock("../frontend/src/api.ts", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../frontend/src/api.ts")>();
  return { ...actual, request: vi.fn() };
});
const author: PublicUser = {
  id: "a".repeat(64),
  firstName: "Demo",
  lastName: "Writer",
  email: "writer@example.test",
  plan: "free",
  role: "author",
  createdAt: 100,
};
const post: Post = {
  id: "post-1",
  authorId: author.id,
  type: "article",
  title: "A clear explanation of server requests",
  abstract: "This abstract explains requests in a useful amount of detail.",
  body: "The full article explains why server validation and access checks matter. ".repeat(
    5,
  ),
  tags: ["react"],
  imageUrl: "",
  plan: "free",
  status: "pending",
  createdAt: 100,
  updatedAt: 100,
  revision: 2,
  history: [{ action: "submitted", actorId: author.id, at: 100, feedback: "" }],
};
function mount(component: React.ReactNode) {
  return render(<MemoryRouter>{component}</MemoryRouter>);
}
beforeEach(() => {
  mocks.user = author;
  vi.clearAllMocks();
  vi.mocked(request).mockResolvedValue({ posts: [], nextCursor: null });
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(cleanup);
describe("React interaction tests", () => {
  it("retains three article and tutorial cards with explicitly illustrative author/rating metadata", () => {
    mount(<Home />);
    for (const section of ["Featured articles", "Featured tutorials"]) {
      const region = within(screen.getByRole("region", { name: section }));
      const cards = region.getAllByRole("article");
      expect(cards).toHaveLength(3);
      for (const card of cards) {
        expect(within(card).getByText(/^Example author: Demo/)).toBeTruthy();
        expect(
          within(card).getByLabelText(/^Example rating: [\d.]+ out of 5$/),
        ).toBeTruthy();
      }
    }
    expect(request).not.toHaveBeenCalled();
  });
  it("retains the grouped footer with working route, help and project-policy destinations", () => {
    mount(
      <>
        <Home />
        <Footer />
      </>,
    );
    const explore = within(screen.getByRole("navigation", { name: "Explore" }));
    expect(
      explore.getByRole("link", { name: "Questions" }).getAttribute("href"),
    ).toBe("/browse?type=question");
    expect(
      explore.getByRole("link", { name: "Tutorials" }).getAttribute("href"),
    ).toBe("/tutorials");
    const support = within(screen.getByRole("navigation", { name: "Support" }));
    expect(
      support.getByRole("link", { name: "Contact Us" }).getAttribute("href"),
    ).toBe("/help#contact");
    expect(
      support.getByRole("link", { name: "FAQs" }).getAttribute("href"),
    ).toBe("/help#faqs");
    expect(
      support.getByRole("link", { name: "Help" }).getAttribute("href"),
    ).toBe("/help#getting-started");
    expect(document.getElementById("contact")).toBeTruthy();
    const connected = within(
      screen.getByRole("navigation", { name: "Stay connected" }),
    );
    expect(connected.getAllByRole("link")).toHaveLength(3);
    expect(connected.getByText("Deakin University channels")).toBeTruthy();
    const policies = within(
      screen.getByRole("navigation", { name: "Project information" }),
    );
    expect(
      policies
        .getByRole("link", { name: "Privacy Policy" })
        .getAttribute("href"),
    ).toBe("/help#privacy");
    expect(
      policies.getByRole("link", { name: "Terms" }).getAttribute("href"),
    ).toBe("/help#terms");
    expect(
      policies
        .getByRole("link", { name: "Code of Conduct" })
        .getAttribute("href"),
    ).toBe("/help#conduct");
  });
  it.each(["articles", "tutorials"] as const)(
    "provides a real %s catalogue destination rather than a dead See all link",
    (kind) => {
      mount(<CataloguePage kind={kind} />);
      expect(screen.getAllByRole("article")).toHaveLength(3);
      expect(
        screen.getByText(/preview topics, authors and ratings are sample data/),
      ).toBeTruthy();
      expect(
        screen
          .getByRole("link", { name: "Browse published community posts" })
          .getAttribute("href"),
      ).toBe("/browse");
    },
  );
  it("provides actual help and policy anchors scoped to the student prototype", () => {
    mount(<HelpPage />);
    for (const id of [
      "getting-started",
      "faqs",
      "contact",
      "privacy",
      "terms",
      "conduct",
    ])
      expect(document.getElementById(id)).toBeTruthy();
    expect(
      screen.getByText(/not Deakin University’s privacy policy/),
    ).toBeTruthy();
    expect(screen.getByText(/not an official university service/)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "My studio" }).getAttribute("href"),
    ).toBe("/studio");
    expect(
      screen
        .getByRole("link", { name: "s222528574@deakin.edu.au" })
        .getAttribute("href"),
    ).toBe("mailto:s222528574@deakin.edu.au");
  });
  it("validates signup before sending any request", async () => {
    const user = userEvent.setup();
    mount(<AuthPage signup />);
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(request).not.toHaveBeenCalled();
    expect(
      screen.getAllByText(/Too small|Invalid email|Use at least/i).length,
    ).toBeGreaterThan(0);
  });
  it("conditionally reveals Article abstract and image fields", async () => {
    const user = userEvent.setup();
    mount(<PostEditor />);
    expect(screen.queryByText("Abstract")).toBeNull();
    await user.click(screen.getByRole("radio", { name: "Article" }));
    expect(screen.getByText("Abstract")).toBeTruthy();
    expect(screen.getByLabelText("Image URL (optional, HTTPS)")).toBeTruthy();
    await user.click(screen.getByRole("radio", { name: "Question" }));
    expect(screen.queryByText("Abstract")).toBeNull();
  });
  it("retains invalid draft input and stops the API request", async () => {
    const user = userEvent.setup();
    mount(<PostEditor />);
    await user.type(screen.getByLabelText("Title"), "Short");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe(
      "Short",
    );
    expect(request).not.toHaveBeenCalled();
  });
  it("explains login requirement rather than showing editable draft to visitors", () => {
    mocks.user = null;
    mount(<PostEditor />);
    expect(screen.getByRole("link", { name: "Log in" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save draft" })).toBeNull();
  });
  it("hides a card without modifying the database and restores it on reset", async () => {
    const user = userEvent.setup();
    vi.mocked(request).mockResolvedValue({ posts: [post], nextCursor: null });
    mount(<Browse />);
    await screen.findByRole("heading", { name: post.title });
    await user.click(screen.getByRole("button", { name: "Hide this post" }));
    expect(screen.queryByRole("heading", { name: post.title })).toBeNull();
    expect(
      vi.mocked(request).mock.calls.every(([, init]) => !init?.method),
    ).toBe(true);
    await user.click(screen.getByRole("button", { name: "Reset" }));
    await screen.findByRole("heading", { name: post.title });
  });
  it("expands and collapses full post content", async () => {
    const user = userEvent.setup();
    mount(<ReviewCard post={post} scope="public" onUpdate={() => {}} />);
    expect(screen.queryByText(post.body.trim())).toBeNull();
    await user.click(screen.getByRole("button", { name: "Read full post" }));
    expect(screen.getByText(post.body.trim())).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Collapse" }));
    expect(screen.queryByText(post.body.trim())).toBeNull();
  });
  it("optimistically approves then rolls back when saving fails", async () => {
    const user = userEvent.setup();
    let reject: (e: Error) => void = () => {};
    vi.mocked(request).mockImplementation(
      () =>
        new Promise((_resolve, r) => {
          reject = r;
        }),
    );
    const onUpdate = vi.fn();
    mount(<ReviewCard post={post} scope="review" onUpdate={onUpdate} />);
    await user.type(
      screen.getByLabelText("Review feedback"),
      "Clear example and accurate explanation.",
    );
    await user.click(screen.getByRole("button", { name: "Approve & publish" }));
    expect(screen.getByRole("status").textContent).toContain("published");
    await act(async () => reject(Error("Database unavailable.")));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe("pending"),
    );
    expect(screen.getByRole("alert").textContent).toContain("restored");
    expect(onUpdate).not.toHaveBeenCalled();
  });
  it("commits successful review responses through the parent state callback", async () => {
    const user = userEvent.setup(),
      onUpdate = vi.fn(),
      published = { ...post, status: "published", revision: 3 };
    vi.mocked(request).mockResolvedValue({ post: published });
    mount(<ReviewCard post={post} scope="review" onUpdate={onUpdate} />);
    await user.type(
      screen.getByLabelText("Review feedback"),
      "Ready for the community to read.",
    );
    await user.click(screen.getByRole("button", { name: "Approve & publish" }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith(published));
    expect(request).toHaveBeenCalledWith(
      "/posts/post-1/review",
      expect.objectContaining({ method: "POST" }),
    );
  });
  it("prevents empty moderator feedback and unauthorised queue UI", () => {
    mount(<ReviewCard post={post} scope="review" onUpdate={() => {}} />);
    expect(
      (
        screen.getByRole("button", {
          name: "Approve & publish",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    cleanup();
    mount(<Browse scope="review" />);
    expect(
      screen.getByText("This area is available to assigned moderators."),
    ).toBeTruthy();
  });
  it("enables simulated upgrade only for Free logged-in accounts", () => {
    mocks.user = null;
    mount(<Pricing />);
    expect(
      (
        screen.getByRole("button", {
          name: "Upgrade plan",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    cleanup();
    mocks.user = { ...author, plan: "paid" };
    mount(<Pricing />);
    expect(
      (
        screen.getByRole("button", {
          name: "Paid plan active",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
  it("does not send real card data or invalid simulated payment", async () => {
    const user = userEvent.setup();
    mount(<Pricing />);
    await user.click(screen.getByRole("button", { name: "Upgrade plan" }));
    await user.type(screen.getByLabelText("Name on test card"), "Demo Reader");
    await user.type(
      screen.getByLabelText("Test card number"),
      "4111111111111111",
    );
    await user.type(screen.getByLabelText("Expiry (MM/YY)"), "12/35");
    await user.type(screen.getByLabelText("Test CVC"), "123");
    await user.click(screen.getByRole("checkbox"));
    await user.click(
      screen.getByRole("button", { name: "Confirm simulated upgrade" }),
    );
    expect(request).not.toHaveBeenCalled();
    expect(
      screen.getByText("Use only the displayed simulation card."),
    ).toBeTruthy();
  });
  it("reducer resets every filter and deduplicates hidden IDs", () => {
    let state = filterReducer(initialFilters, {
      type: "field",
      name: "type",
      value: "article",
    });
    state = filterReducer(state, { type: "hide", id: "one" });
    state = filterReducer(state, { type: "hide", id: "one" });
    expect(state.hidden).toEqual(["one"]);
    expect(filterReducer(state, { type: "reset" })).toEqual(initialFilters);
  });
});

it("does not apply an old review after its account view is unmounted", async () => {
  const user = userEvent.setup();
  let resolve: (value: unknown) => void = () => {};
  vi.mocked(request).mockImplementation(
    () => new Promise((r) => (resolve = r)),
  );
  const onUpdate = vi.fn();
  const view = mount(
    <ReviewCard post={post} scope="review" onUpdate={onUpdate} />,
  );
  await user.type(
    screen.getByLabelText("Review feedback"),
    "A complete and clear explanation.",
  );
  await user.click(screen.getByRole("button", { name: "Approve & publish" }));
  view.unmount();
  await act(async () =>
    resolve({ post: { ...post, status: "published", revision: 3 } }),
  );
  expect(onUpdate).not.toHaveBeenCalled();
});

function CurrentLocation() {
  return (
    <>
      <output data-testid="current-location">{useLocation().pathname}</output>
      <output data-testid="location-state">
        {JSON.stringify(useLocation().state)}
      </output>
    </>
  );
}
async function fillQuestion(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByLabelText("Title"),
    "A valid question about React state",
  );
  await user.type(
    screen.getByLabelText("Describe your problem"),
    "How should a form prevent a stale server response from changing the current page?",
  );
  await user.type(
    screen.getByLabelText("Tags (one to three, separated by commas)"),
    "react",
  );
}
it("shows a saved-draft confirmation in Studio only after a successful write and consumes the navigation state", async () => {
  const user = userEvent.setup();
  let finishSave: (value: unknown) => void = () => {};
  const saved = { ...post, status: "draft", revision: 1 };
  vi.mocked(request).mockImplementation((path) =>
    path === "/posts"
      ? new Promise((resolve) => {
          finishSave = resolve;
        })
      : Promise.resolve({ posts: [saved], nextCursor: null }),
  );
  render(
    <MemoryRouter initialEntries={["/post"]}>
      <Routes>
        <Route path="/post" element={<PostEditor />} />
        <Route path="/studio" element={<Browse scope="mine" />} />
      </Routes>
      <CurrentLocation />
    </MemoryRouter>,
  );
  await fillQuestion(user);
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  expect(screen.queryByText(/Draft saved\./)).toBeNull();
  expect(screen.getByTestId("current-location").textContent).toBe("/post");
  await act(async () => finishSave({ post: saved }));
  await screen.findByRole("heading", { name: "My studio" });
  expect(
    screen.getByText("Draft saved. Submit it for review when you are ready."),
  ).toBeTruthy();
  await waitFor(() =>
    expect(screen.getByTestId("location-state").textContent).toBe("null"),
  );
  await user.click(
    screen.getByRole("button", { name: "Dismiss save confirmation" }),
  );
  expect(screen.queryByText(/Draft saved\./)).toBeNull();
});
it("retains the draft and does not announce success or navigate when its save fails", async () => {
  const user = userEvent.setup();
  vi.mocked(request).mockRejectedValue(
    Error("The save could not be confirmed."),
  );
  render(
    <MemoryRouter initialEntries={["/post"]}>
      <PostEditor />
      <CurrentLocation />
    </MemoryRouter>,
  );
  await fillQuestion(user);
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "could not be confirmed",
  );
  expect(screen.getByTestId("current-location").textContent).toBe("/post");
  expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe(
    "A valid question about React state",
  );
  expect(screen.queryByText(/Draft saved\./)).toBeNull();
});
it("aborts and ignores a saved-draft response after navigation unmounts its editor", async () => {
  const user = userEvent.setup();
  let resolve: (v: unknown) => void = () => {};
  vi.mocked(request).mockImplementation(
    () => new Promise((r) => (resolve = r)),
  );
  const view = render(
    <MemoryRouter initialEntries={["/post"]}>
      <PostEditor />
      <CurrentLocation />
    </MemoryRouter>,
  );
  await fillQuestion(user);
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  const signal = vi.mocked(request).mock.calls[0][1]!.signal!;
  view.rerender(
    <MemoryRouter initialEntries={["/post"]}>
      <p>Replacement view</p>
      <CurrentLocation />
    </MemoryRouter>,
  );
  expect(signal.aborted).toBe(true);
  await act(async () => resolve({ post }));
  expect(screen.getByTestId("current-location").textContent).toBe("/post");
  expect(screen.getByText("Replacement view")).toBeTruthy();
});
it("ignores a saved-draft response after logout changes the editor identity", async () => {
  const user = userEvent.setup();
  let resolve: (v: unknown) => void = () => {};
  vi.mocked(request).mockImplementation(
    () => new Promise((r) => (resolve = r)),
  );
  const tree = () => (
    <MemoryRouter initialEntries={["/post"]}>
      <PostEditor />
      <CurrentLocation />
    </MemoryRouter>
  );
  const view = render(tree());
  await fillQuestion(user);
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  mocks.user = null;
  view.rerender(tree());
  await act(async () => resolve({ post }));
  expect(screen.getByTestId("current-location").textContent).toBe("/post");
  expect(screen.getByRole("link", { name: "Log in" })).toBeTruthy();
});
