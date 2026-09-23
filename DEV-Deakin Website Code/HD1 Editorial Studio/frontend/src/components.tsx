import type { InputHTMLAttributes, ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "./auth.tsx";
import { request, json } from "./api.ts";
export function Field({
  label,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  const id = props.id || props.name;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        {...props}
        id={id}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error && (
        <small className="error" id={`${id}-error`}>
          {error}
        </small>
      )}
    </div>
  );
}
export function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <p
      className={`notice ${error ? "error" : ""}`}
      role={error ? "alert" : "status"}
    >
      {children}
    </p>
  );
}
export function Header() {
  const { user, logout } = useAuth(),
    navigate = useNavigate();
  return (
    <header className="site-header">
      <Link className="brand" to="/">
        DEV<span>@</span>Deakin
      </Link>
      <form
        className="header-search"
        onSubmit={(e) => {
          e.preventDefault();
          const q = new FormData(e.currentTarget).get("search");
          navigate(`/browse?q=${encodeURIComponent(String(q))}`);
        }}
      >
        <input
          name="search"
          aria-label="Search posts"
          placeholder="Search the community"
        />
      </form>
      <nav aria-label="Main">
        <Link to="/post">Post</Link>
        <Link to="/browse">Browse posts</Link>
        <Link to="/pricing">Pricing</Link>
        {user ? (
          <>
            <Link to="/studio">My studio</Link>
            {user.role === "moderator" && (
              <Link to="/review">Review queue</Link>
            )}
            <span className="plan">{user.plan}</span>
            <button className="text-button" onClick={() => void logout()}>
              Logout
            </button>
          </>
        ) : (
          <Link to="/login">Login</Link>
        )}
      </nav>
    </header>
  );
}
export function Newsletter() {
  const [email, setEmail] = useState(""),
    [notice, setNotice] = useState(""),
    [failed, setFailed] = useState(false),
    [busy, setBusy] = useState(false);
  return (
    <section className="newsletter">
      <div>
        <h2>Keep in the loop</h2>
        <p>Subscribe to the DEV@Deakin newsletter.</p>
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setNotice("");
          try {
            const d = await request<{ message: string }>(
              "/newsletter",
              json({ email }),
            );
            setNotice(d.message);
            setEmail("");
            setFailed(false);
          } catch (e) {
            setNotice((e as Error).message);
            setFailed(true);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field
          label="Email for newsletter"
          name="newsletterEmail"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button disabled={busy}>{busy ? "Sending…" : "Subscribe"}</button>
        {notice && <Notice error={failed}>{notice}</Notice>}
      </form>
    </section>
  );
}
export function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-columns">
        <div>
          <Link className="brand" to="/">
            DEV@Deakin
          </Link>
          <p>A place to ask, write and learn.</p>
        </div>
        <nav className="footer-column" aria-labelledby="footer-explore">
          <h2 id="footer-explore">Explore</h2>
          <Link to="/">Home</Link>
          <Link to="/browse?type=question">Questions</Link>
          <Link to="/articles">Articles</Link>
          <Link to="/tutorials">Tutorials</Link>
        </nav>
        <nav className="footer-column" aria-labelledby="footer-support">
          <h2 id="footer-support">Support</h2>
          <Link to="/help#faqs">FAQs</Link>
          <Link to="/help#getting-started">Help</Link>
          <Link to="/help#contact">Contact Us</Link>
          <Link to="/pricing">Membership plans</Link>
        </nav>
        <nav className="footer-column" aria-labelledby="footer-connected">
          <h2 id="footer-connected">Stay connected</h2>
          <p>Deakin University channels</p>
          <a
            href="https://www.instagram.com/deakinuniversity/"
            target="_blank"
            rel="noreferrer"
          >
            Instagram
          </a>
          <a
            href="https://www.linkedin.com/school/deakin-university/"
            target="_blank"
            rel="noreferrer"
          >
            LinkedIn
          </a>
          <a
            href="https://www.youtube.com/user/deakinuniversity"
            target="_blank"
            rel="noreferrer"
          >
            YouTube
          </a>
        </nav>
      </div>
      <div className="footer-legal">
        <p>DEV@Deakin · SIT313 Secure Frontend Applications</p>
        <nav aria-label="Project information">
          <Link to="/help#privacy">Privacy Policy</Link>
          <Link to="/help#terms">Terms</Link>
          <Link to="/help#conduct">Code of Conduct</Link>
        </nav>
      </div>
    </footer>
  );
}
