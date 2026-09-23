import {
  useEffect,
  useMemo,
  useOptimistic,
  useReducer,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import type { Page, Post, PublicPost } from "../../shared/types.ts";
import { request, json } from "./api.ts";
import { useAuth } from "./auth.tsx";
import { Notice } from "./components.tsx";
type Scope = "public" | "mine" | "review";
interface Filters {
  q: string;
  type: string;
  plan: string;
  tag: string;
  after: string;
  before: string;
  hidden: string[];
}
export const initialFilters: Filters = {
  q: "",
  type: "",
  plan: "",
  tag: "",
  after: "",
  before: "",
  hidden: [],
};
type FilterAction =
  | { type: "field"; name: Exclude<keyof Filters, "hidden">; value: string }
  | { type: "hide"; id: string }
  | { type: "reset" };
export function filterReducer(state: Filters, action: FilterAction): Filters {
  if (action.type === "reset") return { ...initialFilters };
  if (action.type === "hide")
    return { ...state, hidden: [...new Set([...state.hidden, action.id])] };
  return { ...state, [action.name]: action.value, hidden: [] };
}
export function ReviewCard({
  post,
  scope,
  onUpdate,
}: {
  post: Post | PublicPost;
  scope: Scope;
  onUpdate: (p: Post) => void;
}) {
  const [expanded, setExpanded] = useState(false),
    [feedback, setFeedback] = useState(""),
    [error, setError] = useState(""),
    [pending, startTransition] = useTransition();
  const mounted = useRef(true);
  const latestRevision = useRef(post.revision);
  latestRevision.current = post.revision;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [optimistic, setOptimistic] = useOptimistic(
    post,
    (current: Post | PublicPost, status: Post["status"]) => ({
      ...current,
      status,
    }),
  );
  function act(action: "submit" | "approve" | "reject") {
    setError("");
    startTransition(async () => {
      // This preview is temporary: only the confirmed server record updates the parent list.
      setOptimistic(
        action === "submit"
          ? "pending"
          : action === "approve"
            ? "published"
            : "rejected",
      );
      try {
        const data = await request<{ post: Post }>(
          `/posts/${post.id}/${action === "submit" ? "submit" : "review"}`,
          json(
            action === "submit"
              ? { revision: post.revision }
              : { revision: post.revision, decision: action, feedback },
          ),
        );
        if (mounted.current && data.post.revision >= latestRevision.current)
          startTransition(() => onUpdate(data.post));
      } catch (e) {
        if (!mounted.current) return;
        // Ending the Action rolls back the displayed preview, not a possibly completed server write.
        setError(
          `${(e as Error).message} The displayed status has been restored.`,
        );
      }
    });
  }
  return (
    <article className={`post-card ${pending ? "is-pending" : ""}`}>
      <div className="post-meta">
        <span className="badge">{post.type}</span>
        <span>{post.plan}</span>
        <time dateTime={new Date(post.createdAt).toISOString()}>
          {new Date(post.createdAt).toLocaleDateString()}
        </time>
        {scope !== "public" && (
          <span className="status-pill" role="status">
            {optimistic.status}
            {pending ? " · saving…" : ""}
          </span>
        )}
      </div>
      <h2>{post.title}</h2>
      {post.abstract && <p>{post.abstract}</p>}
      <p className="post-body">
        {expanded
          ? post.body
          : `${post.body.slice(0, 190)}${post.body.length > 190 ? "…" : ""}`}
      </p>
      {expanded && post.imageUrl && (
        <img
          className="post-image"
          src={post.imageUrl}
          alt={`Illustration for ${post.title}`}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      )}
      <div className="tags">
        {post.tags.map((t) => (
          <span key={t}>#{t}</span>
        ))}
      </div>
      <button className="text-button" onClick={() => setExpanded((x) => !x)}>
        {expanded ? "Collapse" : "Read full post"}
      </button>
      {scope === "mine" && ["draft", "rejected"].includes(post.status) && (
        <div className="actions">
          <Link className="button secondary" to={`/post?edit=${post.id}`}>
            Edit draft
          </Link>
          <button disabled={pending} onClick={() => act("submit")}>
            Submit for review
          </button>
        </div>
      )}
      {scope === "review" && post.status === "pending" && (
        <div className="review-controls">
          <label className="field">
            <span>Review feedback</span>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              maxLength={1000}
            />
          </label>
          <div className="actions">
            <button
              disabled={pending || feedback.trim().length < 8}
              onClick={() => act("approve")}
            >
              Approve & publish
            </button>
            <button
              className="secondary"
              disabled={pending || feedback.trim().length < 8}
              onClick={() => act("reject")}
            >
              Request changes
            </button>
          </div>
        </div>
      )}
      {"history" in post && (
        <details className="history">
          <summary>Revision history ({post.history.length})</summary>
          <ol>
            {post.history.map((h, i) => (
              <li key={`${h.at}-${i}`}>
                <strong>{h.action}</strong> · {new Date(h.at).toLocaleString()}
                {h.feedback && <p>{h.feedback}</p>}
              </li>
            ))}
          </ol>
        </details>
      )}
      {error && <Notice error>{error}</Notice>}
    </article>
  );
}
export default function Browse({ scope = "public" }: { scope?: Scope }) {
  const { user, loading: authLoading } = useAuth(),
    [params] = useSearchParams(),
    location = useLocation(),
    navigate = useNavigate();
  const [savedPost, setSavedPost] = useState<string | null>(null);
  useEffect(() => {
    if (scope !== "mine" || typeof location.state?.saved !== "string") return;
    setSavedPost(location.state.saved);
    // Consume the successful editor handoff so refresh/back navigation cannot replay an old success.
    const { saved: _saved, ...remaining } = location.state;
    navigate(location.pathname + location.search + location.hash, {
      replace: true,
      state: Object.keys(remaining).length ? remaining : null,
    });
  }, [location, navigate, scope]);
  const [filters, dispatch] = useReducer(filterReducer, {
      ...initialFilters,
      q: params.get("q") || "",
      type: params.get("type") || "",
    }),
    [posts, setPosts] = useState<(Post | PublicPost)[]>([]),
    [nextCursor, setNextCursor] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [reload, setReload] = useState(0);
  const query = useMemo(() => {
    const q = new URLSearchParams({ scope });
    for (const [name, value] of Object.entries(filters))
      if (name !== "hidden" && value) q.set(name, String(value));
    return q.toString();
  }, [
    scope,
    filters.q,
    filters.type,
    filters.plan,
    filters.tag,
    filters.after,
    filters.before,
  ]);
  const requestGeneration = useRef(0);
  useEffect(() => {
    // A fresh filter/reload invalidates pending pagination as well as aborting the initial page.
    requestGeneration.current += 1;
    const controller = new AbortController();
    setPosts([]);
    setNextCursor(null);
    setLoading(true);
    setError("");
    request<Page>(`/posts?${query}`, { signal: controller.signal })
      .then((d) => {
        if (!controller.signal.aborted) {
          setPosts(d.posts);
          setNextCursor(d.nextCursor);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query, reload]);
  const visible = useMemo(
    () => posts.filter((p) => !filters.hidden.includes(p.id)),
    [posts, filters.hidden],
  );
  async function more() {
    if (!nextCursor || loading) return;
    const generation = requestGeneration.current;
    setLoading(true);
    setError("");
    try {
      const d = await request<Page>(
        `/posts?${query}&cursor=${encodeURIComponent(nextCursor)}`,
      );
      // Do not append an old filter's next page to a newly loaded result set.
      if (generation !== requestGeneration.current) return;
      setPosts((old) => [
        ...old,
        ...d.posts.filter((p) => !old.some((o) => o.id === p.id)),
      ]);
      setNextCursor(d.nextCursor);
    } catch (e) {
      if (generation === requestGeneration.current)
        setError((e as Error).message);
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  }
  if (authLoading) return <main className="page">Checking session…</main>;
  if (scope !== "public" && !user)
    return (
      <main className="page">
        <h1>Your workspace</h1>
        <Link to="/login">Log in to continue</Link>
      </main>
    );
  if (scope === "review" && user?.role !== "moderator")
    return (
      <main className="page">
        <h1>Review queue</h1>
        <p>This area is available to assigned moderators.</p>
      </main>
    );
  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            {scope === "public"
              ? "Community library"
              : scope === "mine"
                ? "Your writing, in progress"
                : "A second pair of eyes"}
          </p>
          <h1>
            {scope === "public"
              ? "Browse posts"
              : scope === "mine"
                ? "My studio"
                : "Review queue"}
          </h1>
        </div>
        <Link className="button" to="/post">
          New post
        </Link>
      </div>
      <p>
        {scope === "public"
          ? `Showing published ${user?.plan === "paid" ? "Free and Paid" : "Free"} posts. Access is checked by the server.`
          : scope === "mine"
            ? "Save, revise and submit your drafts. Review feedback stays attached to every revision."
            : "Read each submission and explain your decision. You cannot review your own work."}
      </p>
      {scope === "mine" && savedPost && (
        <div className="save-confirmation">
          <Notice>Draft saved. Submit it for review when you are ready.</Notice>
          <button className="text-button" onClick={() => setSavedPost(null)}>
            Dismiss save confirmation
          </button>
        </div>
      )}
      <form className="filters" onSubmit={(e) => e.preventDefault()}>
        <label>
          Search
          <input
            value={filters.q}
            onChange={(e) =>
              dispatch({ type: "field", name: "q", value: e.target.value })
            }
          />
        </label>
        <label>
          Type
          <select
            value={filters.type}
            onChange={(e) =>
              dispatch({ type: "field", name: "type", value: e.target.value })
            }
          >
            <option value="">All types</option>
            <option value="question">Questions</option>
            <option value="article">Articles</option>
          </select>
        </label>
        <label>
          Plan
          <select
            value={filters.plan}
            onChange={(e) =>
              dispatch({ type: "field", name: "plan", value: e.target.value })
            }
          >
            <option value="">All available</option>
            <option value="free">Free</option>
            <option value="paid">Paid</option>
          </select>
        </label>
        <label>
          Tag
          <input
            value={filters.tag}
            onChange={(e) =>
              dispatch({ type: "field", name: "tag", value: e.target.value })
            }
          />
        </label>
        <label>
          From
          <input
            type="date"
            value={filters.after}
            onChange={(e) =>
              dispatch({ type: "field", name: "after", value: e.target.value })
            }
          />
        </label>
        <label>
          To
          <input
            type="date"
            value={filters.before}
            onChange={(e) =>
              dispatch({ type: "field", name: "before", value: e.target.value })
            }
          />
        </label>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            dispatch({ type: "reset" });
            setReload((v) => v + 1);
          }}
        >
          Reset
        </button>
      </form>
      <div className="results-meta">
        <span>
          {visible.length} loaded · {filters.hidden.length} hidden
        </span>
        <button
          className="text-button"
          onClick={() => setReload((v) => v + 1)}
          disabled={loading}
        >
          Refresh
        </button>
      </div>
      {error && <Notice error>{error}</Notice>}
      <div className="posts">
        {visible.map((post) => (
          <div key={post.id}>
            <ReviewCard
              post={post}
              scope={scope}
              onUpdate={(p) =>
                setPosts((old) =>
                  old.map((o) =>
                    o.id === p.id && p.revision >= o.revision ? p : o,
                  ),
                )
              }
            />
            <button
              className="hide-button"
              onClick={() => dispatch({ type: "hide", id: post.id })}
            >
              Hide this post
            </button>
          </div>
        ))}
      </div>
      {loading && <Notice>Loading posts…</Notice>}
      {!loading && !error && visible.length === 0 && (
        <div className="empty">
          <h2>No posts in this view yet</h2>
          <p>
            {nextCursor
              ? "There are more records to check. Load the next page or change the filters."
              : "Change your filters, reset hidden posts or start a new draft."}
          </p>
        </div>
      )}
      {nextCursor && (
        <button disabled={loading} onClick={() => void more()}>
          {loading ? "Loading…" : "Load more posts"}
        </button>
      )}
    </main>
  );
}
