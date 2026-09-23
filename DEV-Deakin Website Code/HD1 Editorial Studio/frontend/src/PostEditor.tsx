import { useEffect, useState, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  postSchema,
  fieldErrors,
  type PostInput,
} from "../../shared/validation.ts";
import type { Post } from "../../shared/types.ts";
import { useAuth } from "./auth.tsx";
import { request, json, ApiError } from "./api.ts";
import { Field, Notice } from "./components.tsx";
const empty: PostInput = {
  type: "question",
  title: "",
  abstract: "",
  body: "",
  tags: [],
  imageUrl: "",
  plan: "free",
};
export default function PostEditor() {
  const { user, loading } = useAuth(),
    [params] = useSearchParams(),
    id = params.get("edit"),
    navigate = useNavigate();
  const [value, setValue] = useState<PostInput>(empty),
    [tags, setTags] = useState(""),
    [revision, setRevision] = useState(0),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [loadError, setLoadError] = useState("");
  const mounted = useRef(true);
  const saveRequest = useRef<AbortController | null>(null);
  const currentEditor = useRef("");
  // A response belongs to one account and draft; navigation or logout must not reuse it.
  currentEditor.current = `${user?.id || "visitor"}:${id || "new"}`;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      saveRequest.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setBusy(true);
    request<{ post: Post }>(`/posts/${encodeURIComponent(id)}`, {
      signal: controller.signal,
    })
      .then(({ post }) => {
        if (controller.signal.aborted) return;
        const { type, title, abstract, body, tags, imageUrl, plan } = post;
        setValue({ type, title, abstract, body, tags, imageUrl, plan });
        setTags(tags.join(", "));
        setRevision(post.revision);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setLoadError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [id]);
  if (loading) return <main className="page">Checking session…</main>;
  if (!user)
    return (
      <main className="page">
        <h1>Write a post</h1>
        <p>
          <Link to="/login">Log in</Link> before creating a question or article.
        </p>
      </main>
    );
  return (
    <main className="page narrow">
      <p className="eyebrow">Your editorial workspace</p>
      <h1>{id ? "Edit draft" : "New post"}</h1>
      <p>
        Save a draft, then submit it to a second reader. Only approved posts
        appear in Browse posts.
      </p>
      {loadError && <Notice error>{loadError}</Notice>}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || loadError) return;
          const parsed = postSchema.safeParse({
            ...value,
            tags: tags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean),
          });
          if (!parsed.success) {
            setErrors(fieldErrors(parsed.error));
            return;
          }
          setErrors({});
          setBusy(true);
          const editor = currentEditor.current;
          const controller = new AbortController();
          saveRequest.current = controller;
          // Cancellation prevents a late response from redirecting a different editor/session.
          const active = () =>
            mounted.current &&
            !controller.signal.aborted &&
            currentEditor.current === editor;
          try {
            const data = await request<{ post: Post }>(
              id ? `/posts/${encodeURIComponent(id)}` : "/posts",
              {
                ...(id
                  ? {
                      method: "PATCH",
                      // The server checks this revision inside the same transaction as the edit.
                      body: JSON.stringify({ revision, post: parsed.data }),
                    }
                  : json(parsed.data)),
                signal: controller.signal,
              },
            );
            // Studio shows save feedback only after this write has been acknowledged by the API.
            if (active())
              navigate("/studio", { state: { saved: data.post.id } });
          } catch (e) {
            if (!active()) return;
            setErrors(
              e instanceof ApiError
                ? { ...e.errors, form: e.message }
                : { form: (e as Error).message },
            );
          } finally {
            if (active()) setBusy(false);
            if (saveRequest.current === controller) saveRequest.current = null;
          }
        }}
      >
        <fieldset>
          <legend>Select post type</legend>
          {(["question", "article"] as const).map((type) => (
            <label className="radio" key={type}>
              <input
                type="radio"
                name="type"
                checked={value.type === type}
                onChange={() => setValue((v) => ({ ...v, type }))}
              />
              {type === "question" ? "Question" : "Article"}
            </label>
          ))}
        </fieldset>
        <h2 className="form-heading">What do you want to ask or share?</h2>
        <Field
          label="Title"
          name="title"
          value={value.title}
          error={errors.title}
          maxLength={140}
          onChange={(e) => setValue((v) => ({ ...v, title: e.target.value }))}
        />
        {value.type === "article" && (
          <>
            <Field
              label="Image URL (optional, HTTPS)"
              name="imageUrl"
              type="url"
              value={value.imageUrl}
              error={errors.imageUrl}
              onChange={(e) =>
                setValue((v) => ({ ...v, imageUrl: e.target.value }))
              }
            />
            <label className="field">
              <span>Abstract</span>
              <textarea
                name="abstract"
                value={value.abstract}
                maxLength={300}
                aria-invalid={!!errors.abstract}
                onChange={(e) =>
                  setValue((v) => ({ ...v, abstract: e.target.value }))
                }
              />
              {errors.abstract && (
                <small className="error">{errors.abstract}</small>
              )}
            </label>
          </>
        )}
        <label className="field">
          <span>
            {value.type === "question"
              ? "Describe your problem"
              : "Article text"}
          </span>
          <textarea
            className="body-input"
            name="body"
            value={value.body}
            maxLength={20000}
            aria-invalid={!!errors.body}
            onChange={(e) => setValue((v) => ({ ...v, body: e.target.value }))}
          />
          {errors.body && <small className="error">{errors.body}</small>}
        </label>
        <Field
          label="Tags (one to three, separated by commas)"
          name="tags"
          value={tags}
          error={errors.tags}
          onChange={(e) => setTags(e.target.value)}
        />
        <fieldset>
          <legend>Who can read the published post?</legend>
          {(["free", "paid"] as const).map((plan) => (
            <label className="radio" key={plan}>
              <input
                type="radio"
                name="plan"
                checked={value.plan === plan}
                onChange={() => setValue((v) => ({ ...v, plan }))}
              />
              {plan === "free" ? "Everyone (Free)" : "Paid members"}
            </label>
          ))}
        </fieldset>
        {errors.form && <Notice error>{errors.form}</Notice>}
        <div className="actions">
          <button disabled={busy || !!loadError}>
            {busy ? "Saving…" : "Save draft"}
          </button>
          <Link to="/studio">Back to studio</Link>
        </div>
      </form>
    </main>
  );
}
