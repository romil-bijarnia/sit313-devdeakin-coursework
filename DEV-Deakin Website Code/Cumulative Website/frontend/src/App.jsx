import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Link,
  NavLink,
  Route,
  Routes,
  useNavigate,
  useSearchParams
} from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Cloud,
  CreditCard,
  Database,
  Eye,
  Image as ImageIcon,
  Instagram,
  Linkedin,
  Lock,
  LogOut,
  MailCheck,
  MessageCircle,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  Star,
  Upload,
  User,
  Youtube
} from 'lucide-react';
import { articles, subscriptionPlans, tutorials } from './content';
import {
  cancelSubscription,
  createUser,
  getActiveUser,
  getHiddenPostIds,
  getPosts,
  getRuntimeMode,
  getSubscriptions,
  hidePost,
  loadCollaborationMessages,
  loadTutorialEngagement,
  loginUser,
  logoutUser,
  readImageFile,
  recordTutorialView,
  refreshVerificationStatus,
  replaceSubscriptions,
  requestPasswordReset,
  resetHiddenPosts,
  savePost,
  saveSubscription,
  saveSecureMessage,
  saveTutorialComment,
  saveTutorialRating,
  sendVerificationLink,
  subscribeToAuthState
} from './store';
import * as api from './api';

const MAX_POST_IMAGE_SIZE = 5 * 1024 * 1024;
const SAFE_POST_IMAGE_TYPES = new Set([
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp'
]);

function formatDate(value, includeTime = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Pending server timestamp';
  return includeTime ? date.toLocaleString() : date.toLocaleDateString();
}

// Shared navigation derives account actions from the single auth state owned by
// App, so every route presents the same session and sign-out behaviour.
function Header({ user, onLogout }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  function submitSearch(event) {
    event.preventDefault();
    const next = query.trim();
    navigate(next ? `/browse?q=${encodeURIComponent(next)}` : '/browse');
  }

  return (
    <header className="app-header">
      <div className="header-inner">
        <Link className="logo" to="/" aria-label="DEV at Deakin home">
          DEV@Deakin
        </Link>
        <form className="search-box" role="search" onSubmit={submitSearch}>
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search posts by title, topic, or tag"
            aria-label="Search DEV@Deakin posts"
          />
          <button type="submit">Search</button>
        </form>
        <nav className="nav-links" aria-label="Main navigation">
          <NavLink to="/">Home</NavLink>
          <NavLink to="/post">Post</NavLink>
          <NavLink to="/browse">Browse</NavLink>
          <NavLink to="/subscription">Subscription</NavLink>
          <NavLink to="/hd">HD</NavLink>
          {user ? (
            <button className="text-button" type="button" onClick={onLogout}>
              <LogOut size={16} aria-hidden="true" />
              Sign out
            </button>
          ) : (
            <NavLink to="/login">Login</NavLink>
          )}
        </nav>
      </div>
    </header>
  );
}

// Provider availability is rendered as evidence, not hidden behind a fallback:
// local-demo data is always labelled before the user can create a record.
function DataModeNotice({ mode, children }) {
  const firebase = mode === 'firebase';
  return (
    <div className={`mode-notice ${firebase ? 'mode-firebase' : 'mode-demo'}`} role="status">
      {firebase ? <Cloud size={18} aria-hidden="true" /> : <Database size={18} aria-hidden="true" />}
      <div>
        <strong>{firebase ? 'Firebase persistence active' : 'Local demo mode'}</strong>
        <span>
          {children ||
            (firebase
              ? 'Changes are read from and written to the configured Firebase project.'
              : 'Firebase is not configured, so this browser stores clearly labelled demonstration data only.')}
        </span>
      </div>
    </div>
  );
}

function CardGrid({ items, kind }) {
  return (
    <div className="media-grid">
      {items.map((item) => {
        const destination =
          kind === 'tutorial'
            ? `/hd?tutorial=${encodeURIComponent(item.id)}#tutorial-library`
            : `/browse?q=${encodeURIComponent(item.searchTerm || item.title)}`;
        return (
          <article className="media-card" key={item.id}>
            <img src={item.image} alt="" />
            <div className="media-card-body">
              <h3>{item.title}</h3>
              <p>{item.description}</p>
              <div className="card-meta">
                <span>
                  <Star size={15} aria-hidden="true" />
                  {item.rating}
                </span>
                <span>{item.author}</span>
              </div>
              <Link className="card-link" to={destination}>
                {kind === 'tutorial' ? 'Open tutorial' : 'Find related posts'}
              </Link>
            </div>
          </article>
        );
      })}
    </div>
  );
}

// The newsletter preserves the backend's actual HTTP status and message. A 2xx
// response is never rewritten into a delivery claim by the React layer.
function Newsletter() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setStatus(null);
    try {
      const result = await api.subscribeToNewsletter(email);
      setStatus(result);
      if (result.ok) setEmail('');
    } catch {
      setStatus({ ok: false, status: 0, body: { message: 'The newsletter request failed.' } });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="newsletter-panel" aria-labelledby="newsletter-title">
      <div>
        <h2 id="newsletter-title">Sign up for our daily insider</h2>
        <p>Subscribe through the Express API and receive a clear response from the server.</p>
      </div>
      <form onSubmit={handleSubmit} className="newsletter-form">
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          placeholder="Enter your email"
          aria-label="Newsletter email address"
          autoComplete="email"
          required
        />
        <button type="submit" disabled={loading}>
          <Send size={16} aria-hidden="true" />
          {loading ? 'Sending…' : 'Subscribe'}
        </button>
      </form>
      <div aria-live="polite">
        {status && (
          <p className={status.ok ? 'success-text' : 'error-text'}>
            {status.status ? `Status ${status.status}: ` : ''}
            {status.body?.message || 'The request could not be completed.'}
          </p>
        )}
      </div>
    </section>
  );
}

function HomePage() {
  return (
    <>
      <section className="hero-section">
        <div className="hero-copy">
          <p className="label">SIT313 Secure Frontend Applications</p>
          <h1>DEV@Deakin, built as one connected learning platform.</h1>
          <p>
            Create and browse posts, authenticate with Firebase, use a backend newsletter and
            subscription workflow, and explore authenticated collaboration and detailed tutorials.
          </p>
          <div className="hero-actions">
            <Link className="primary-action" to="/post">
              Create a post
            </Link>
            <Link className="secondary-action" to="/browse">
              Browse posts
            </Link>
            <Link className="secondary-action" to="/subscription">
              Manage subscriptions
            </Link>
          </div>
        </div>
        <div className="hero-image-wrap">
          <img src="/assets/banner.jpg" alt="Modern Deakin campus building" />
          <div className="hero-hover">Built by Romil</div>
        </div>
      </section>

      <section className="profile-band">
        <div className="profile-avatar" aria-hidden="true">RB</div>
        <div>
          <h2>One cumulative React application</h2>
          <p>
            Shared routes and components connect validated forms, asynchronous data, authentication,
            API communication, responsive layouts, and accessible loading and error feedback.
          </p>
        </div>
      </section>

      <section className="content-section">
        <div className="section-title">
          <p className="label">Featured Articles</p>
          <h2>Explore practical frontend topics</h2>
        </div>
        <CardGrid items={articles} kind="article" />
      </section>

      <section className="content-section">
        <div className="section-title">
          <p className="label">Featured Tutorials</p>
          <h2>Open complete, persistent learning activities</h2>
        </div>
        <CardGrid items={tutorials} kind="tutorial" />
      </section>

      <Newsletter />

      <section className="gallery-section">
        <div className="section-title centered">
          <p className="label">Responsive Gallery</p>
          <h2>Project environment</h2>
        </div>
        <div className="photo-grid">
          <img src="/assets/gallery-campus.jpg" alt="Campus architecture" />
          <img src="/assets/gallery-study.jpg" alt="Students studying together" />
          <img src="/assets/gallery-code.jpg" alt="Development workspace with computers" />
          <img src="/assets/gallery-team.jpg" alt="Students collaborating as a team" />
        </div>
      </section>
    </>
  );
}

// One controlled form serves login and registration while keeping their
// validation, routing and Firebase outcomes explicit and testable.
function AuthPage({ mode, onLogin }) {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const runtimeMode = getRuntimeMode();

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      if (mode === 'signup') {
        await createUser(form);
        setSuccess('Account created. You can now sign in.');
        window.setTimeout(() => navigate('/login'), 650);
      } else {
        const user = await loginUser(form.email, form.password);
        onLogin(user);
        navigate('/');
      }
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="auth-shell">
      <div className="auth-card">
        <div className="auth-heading">
          <User size={22} aria-hidden="true" />
          <h1>{mode === 'signup' ? 'Create a DEV@Deakin account' : 'Login to DEV@Deakin'}</h1>
        </div>
        {runtimeMode === 'local-demo' && (
          <DataModeNotice mode={runtimeMode}>
            Authentication requires Firebase configuration; passwords are never stored in local demo data.
          </DataModeNotice>
        )}
        <form onSubmit={handleSubmit} className="stacked-form" aria-busy={loading}>
          {mode === 'signup' && (
            <div className="two-column">
              <label>
                First name
                <input
                  value={form.firstName}
                  onChange={(event) => updateField('firstName', event.target.value)}
                  autoComplete="given-name"
                  maxLength={100}
                  required
                />
              </label>
              <label>
                Last name
                <input
                  value={form.lastName}
                  onChange={(event) => updateField('lastName', event.target.value)}
                  autoComplete="family-name"
                  maxLength={100}
                  required
                />
              </label>
            </div>
          )}
          <label>
            Email
            <input
              type="email"
              value={form.email}
              onChange={(event) => updateField('email', event.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={form.password}
              onChange={(event) => updateField('password', event.target.value)}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              minLength={mode === 'signup' ? 8 : undefined}
              required
            />
          </label>
          {mode === 'signup' && (
            <label>
              Confirm password
              <input
                type="password"
                value={form.confirmPassword}
                onChange={(event) => updateField('confirmPassword', event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>
          )}
          <div aria-live="polite">
            {error && <p className="error-text">{error}</p>}
            {success && <p className="success-text">{success}</p>}
          </div>
          <button
            className="primary-action full-width"
            type="submit"
            disabled={loading || runtimeMode === 'local-demo'}
          >
            {loading ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Login'}
          </button>
        </form>
        <p className="form-switch">
          {mode === 'signup' ? (
            <>Already have an account? <Link to="/login">Login</Link></>
          ) : (
            <>Need an account? <Link to="/signup">Create one</Link></>
          )}
        </p>
        {mode === 'login' && (
          <p className="form-switch"><Link to="/forgot-password">Forgot your password?</Link></p>
        )}
      </div>
    </section>
  );
}

// Password recovery delegates the signed link to Firebase and exposes only
// request state; the application never displays or stores a reset secret.
function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const mode = getRuntimeMode();

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus(null);
    setLoading(true);
    try {
      await requestPasswordReset(email);
      setStatus({
        ok: true,
        message: 'If that address has an account, Firebase has sent a password-reset email.'
      });
    } catch (error) {
      setStatus({ ok: false, message: error.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="auth-shell">
      <div className="auth-card">
        <div className="auth-heading">
          <MailCheck size={22} aria-hidden="true" />
          <h1>Reset your password</h1>
        </div>
        <p>Enter your account email and Firebase will deliver the secure reset link.</p>
        {mode === 'local-demo' && (
          <DataModeNotice mode={mode}>Password recovery is disabled until Firebase is configured.</DataModeNotice>
        )}
        <form className="stacked-form" onSubmit={handleSubmit}>
          <label>
            Account email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <button className="primary-action" type="submit" disabled={loading || mode === 'local-demo'}>
            {loading ? 'Sending…' : 'Send reset email'}
          </button>
        </form>
        <div aria-live="polite">
          {status && <p className={status.ok ? 'success-text' : 'error-text'}>{status.message}</p>}
        </div>
        <p className="form-switch"><Link to="/login">Back to login</Link></p>
      </div>
    </section>
  );
}

// PostPage coordinates conditional form state, image preview ownership and an
// accessible result dialog before the storage adapter receives validated data.
function PostPage({ user }) {
  const [type, setType] = useState('question');
  const [plan, setPlan] = useState('Free');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const closeButtonRef = useRef(null);
  const imageInputRef = useRef(null);
  const mode = getRuntimeMode();
  const [form, setForm] = useState({
    title: '',
    topic: '',
    problem: '',
    abstract: '',
    body: '',
    tags: '',
    imageUrl: ''
  });

  useEffect(() => {
    if (!status) return undefined;
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    function handleDialogKeyDown(event) {
      if (event.key === 'Escape') setStatus(null);
      if (event.key === 'Tab') {
        event.preventDefault();
        closeButtonRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handleDialogKeyDown);
    return () => {
      document.removeEventListener('keydown', handleDialogKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [status]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleImage(event) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) {
      setImageFile(null);
      updateField('imageUrl', '');
      return;
    }
    if (!SAFE_POST_IMAGE_TYPES.has(file.type)) {
      input.value = '';
      setImageFile(null);
      setStatus({ ok: false, title: 'Image could not be added', message: 'Choose a valid image file.' });
      return;
    }
    if (file.size > MAX_POST_IMAGE_SIZE) {
      input.value = '';
      setImageFile(null);
      setStatus({ ok: false, title: 'Image could not be added', message: 'Choose an image that is 5 MB or smaller.' });
      return;
    }
    try {
      const imageUrl = await readImageFile(file);
      setImageFile(file);
      updateField('imageUrl', imageUrl);
    } catch (error) {
      input.value = '';
      setImageFile(null);
      updateField('imageUrl', '');
      setStatus({ ok: false, title: 'Image could not be added', message: error.message });
    }
  }

  function getTags() {
    return [...new Set(form.tags.split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
  }

  function validate() {
    if (!form.title.trim()) return 'Enter a title.';
    if (form.title.trim().length > 140) return 'Keep the title to 140 characters or fewer.';
    if (type === 'question' && !form.problem.trim()) return 'Describe your question or problem.';
    if (type === 'article' && (!form.abstract.trim() || !form.body.trim())) {
      return 'Enter both an abstract and article text.';
    }
    const tags = getTags();
    if (tags.length === 0) return 'Add at least one tag.';
    if (tags.length > 3) return 'Add no more than 3 tags.';
    if (tags.some((tag) => tag.length > 30)) return 'Keep every tag to 30 characters or fewer.';
    if (mode === 'firebase' && !user) return 'Sign in before saving a Firebase post.';
    return '';
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const validationError = validate();
    if (validationError) {
      setStatus({ ok: false, title: 'Post not sent', message: validationError });
      return;
    }

    setLoading(true);
    try {
      const result = await savePost(
        {
          type,
          plan,
          title: form.title.trim(),
          topic: form.topic.trim(),
          problem: form.problem.trim(),
          abstract: form.abstract.trim(),
          body: form.body.trim(),
          tags: getTags(),
          imageUrl: form.imageUrl
        },
        { imageFile }
      );
      setStatus({
        ok: true,
        title: result.mode === 'firebase' ? 'Post saved to Firebase' : 'Local demo post saved',
        message:
          result.mode === 'firebase'
            ? 'Firestore saved the post and Firebase Storage handled its selected image. Refresh Browse Posts to see the source data.'
            : 'This post exists only in this browser’s labelled local demo storage.'
      });
      setForm({ title: '', topic: '', problem: '', abstract: '', body: '', tags: '', imageUrl: '' });
      setImageFile(null);
      if (imageInputRef.current) imageInputRef.current.value = '';
    } catch (error) {
      setStatus({ ok: false, title: 'Post not sent', message: error.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="form-page">
      <div className="section-title">
        <p className="label">New Post</p>
        <h1>Create a Question or Article</h1>
        <p>Validated conditional fields are persisted through Firebase or an honest local demo adapter.</p>
      </div>
      <DataModeNotice mode={mode} />
      {mode === 'firebase' && !user && (
        <div className="inline-alert" role="alert">
          <Lock size={18} aria-hidden="true" />
          <span><Link to="/login">Sign in</Link> to create a Firestore post and upload an image.</span>
        </div>
      )}

      <form className="post-form" onSubmit={handleSubmit} noValidate aria-busy={loading}>
        <fieldset className="control-group">
          <legend>Select post type</legend>
          <label><input type="radio" name="post-type" checked={type === 'question'} onChange={() => setType('question')} />Question</label>
          <label><input type="radio" name="post-type" checked={type === 'article'} onChange={() => setType('article')} />Article</label>
        </fieldset>
        <fieldset className="control-group">
          <legend>Select post plan</legend>
          <label><input type="radio" name="post-plan" checked={plan === 'Free'} onChange={() => setPlan('Free')} />Free</label>
          <label><input type="radio" name="post-plan" checked={plan === 'Paid'} onChange={() => setPlan('Paid')} />Paid</label>
        </fieldset>

        <div className="post-prompt-band">
          <h2>What do you want to ask or share?</h2>
          <p>{type === 'question' ? 'Describe what happened, what you tried, and what you expected.' : 'Lead with an abstract, then explain the complete idea.'}</p>
        </div>

        <label>
          Title
          <input value={form.title} onChange={(event) => updateField('title', event.target.value)} maxLength={140} required />
        </label>
        {type === 'question' ? (
          <>
            <label>Topic<input value={form.topic} onChange={(event) => updateField('topic', event.target.value)} maxLength={80} placeholder="React, Firebase, security, deployment" /></label>
            <label>Describe your problem<textarea value={form.problem} onChange={(event) => updateField('problem', event.target.value)} maxLength={4000} required /></label>
          </>
        ) : (
          <>
            <label>Abstract<textarea value={form.abstract} onChange={(event) => updateField('abstract', event.target.value)} maxLength={700} required /></label>
            <label>Article text<textarea value={form.body} onChange={(event) => updateField('body', event.target.value)} maxLength={12000} required /></label>
          </>
        )}
        <label>
          Tags
          <input value={form.tags} onChange={(event) => updateField('tags', event.target.value)} placeholder="Up to 3 comma-separated tags" required />
          <span className="form-hint">Up to three tags; each tag can contain 30 characters.</span>
        </label>
        <label className="upload-box">
          <Upload size={18} aria-hidden="true" />
          Upload an image
          <span className="form-hint" id="post-image-help">PNG, JPEG, WebP, GIF, or AVIF; maximum 5 MB.</span>
          <input ref={imageInputRef} type="file" accept=".avif,.gif,.jpg,.jpeg,.png,.webp" aria-describedby="post-image-help" onChange={handleImage} />
        </label>
        {form.imageUrl && <img className="image-preview" src={form.imageUrl} alt="Selected post image preview" />}
        <button className="primary-action" type="submit" disabled={loading || (mode === 'firebase' && !user)}>
          {loading ? 'Saving post…' : 'Save post'}
        </button>
      </form>

      {status && (
        <div className="status-dialog-backdrop">
          <div className={`status-dialog ${status.ok ? 'status-dialog-success' : 'status-dialog-error'}`} role="alertdialog" aria-modal="true" aria-labelledby="post-status-title" aria-describedby="post-status-message">
            <span className="status-dialog-symbol" aria-hidden="true">{status.ok ? '✓' : '!'}</span>
            <h2 id="post-status-title">{status.title}</h2>
            <p id="post-status-message">{status.message}</p>
            {status.ok && <Link className="card-link" to="/browse">Open Browse Posts</Link>}
            <button ref={closeButtonRef} className="status-dialog-close" type="button" onClick={() => setStatus(null)}>Close</button>
          </div>
        </div>
      )}
    </section>
  );
}

// Browse state is deliberately split into source records, per-device hidden IDs
// and URL-derived filters so hiding never mutates the persisted post itself.
function BrowsePage() {
  const [searchParams] = useSearchParams();
  const [posts, setPosts] = useState([]);
  const [mode, setMode] = useState(getRuntimeMode());
  const [hiddenIds, setHiddenIds] = useState(getHiddenPostIds());
  const [expandedId, setExpandedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({
    query: searchParams.get('q') || '',
    type: 'all',
    plan: 'all',
    date: ''
  });

  useEffect(() => {
    setFilters((current) => ({ ...current, query: searchParams.get('q') || '' }));
  }, [searchParams]);

  const refreshPosts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await getPosts();
      setPosts(result.items);
      setMode(result.mode);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshPosts();
  }, [refreshPosts]);

  const visiblePosts = useMemo(() => {
    const queryValue = filters.query.trim().toLowerCase();
    return posts.filter((post) => {
      if (hiddenIds.includes(post.id)) return false;
      if (filters.type !== 'all' && post.type !== filters.type) return false;
      if (filters.plan !== 'all' && post.plan !== filters.plan) return false;
      if (filters.date && !String(post.createdAt || '').startsWith(filters.date)) return false;
      const haystack = [
        post.title,
        post.topic,
        post.authorName,
        ...(post.tags || []),
        post.abstract,
        post.problem,
        post.body
      ].join(' ').toLowerCase();
      return !queryValue || haystack.includes(queryValue);
    });
  }, [posts, hiddenIds, filters]);

  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  function handleHide(id) {
    hidePost(id);
    setHiddenIds(getHiddenPostIds());
  }

  async function handleReset() {
    resetHiddenPosts();
    setHiddenIds([]);
    setFilters({ query: '', type: 'all', plan: 'all', date: '' });
    await refreshPosts();
  }

  return (
    <section className="browse-page">
      <div className="section-title">
        <p className="label">D2 Browse Posts</p>
        <h1>Search and filter saved posts</h1>
        <p>Refresh loads the source again, rather than treating stale component state as persisted evidence.</p>
      </div>
      <DataModeNotice mode={mode} />

      <div className="filter-panel" aria-label="Post filters">
        <label>
          <Search size={16} aria-hidden="true" />
          <input value={filters.query} onChange={(event) => updateFilter('query', event.target.value)} placeholder="Title, topic, author, or tag" aria-label="Filter posts by text" />
        </label>
        <label className="select-label"><span className="sr-only">Post type</span><select value={filters.type} onChange={(event) => updateFilter('type', event.target.value)}><option value="all">All types</option><option value="question">Questions</option><option value="article">Articles</option></select></label>
        <label className="select-label"><span className="sr-only">Post plan</span><select value={filters.plan} onChange={(event) => updateFilter('plan', event.target.value)}><option value="all">All plans</option><option value="Free">Free</option><option value="Paid">Paid</option></select></label>
        <input type="date" value={filters.date} onChange={(event) => updateFilter('date', event.target.value)} aria-label="Filter by created date" />
        <button type="button" onClick={refreshPosts} disabled={loading}><RefreshCw size={16} aria-hidden="true" />{loading ? 'Refreshing…' : 'Refresh'}</button>
        <button type="button" onClick={handleReset}><RotateCcw size={16} aria-hidden="true" />Reset</button>
      </div>

      <div className="async-status" aria-live="polite">
        {loading && <p><RefreshCw className="spin" size={18} aria-hidden="true" /> Loading posts…</p>}
        {error && <p className="error-text"><AlertCircle size={18} aria-hidden="true" /> {error} <button type="button" onClick={refreshPosts}>Try again</button></p>}
        {!loading && !error && <p>{visiblePosts.length} of {posts.length} posts shown.</p>}
      </div>

      {!loading && !error && visiblePosts.length === 0 ? (
        <div className="empty-state"><Search size={28} aria-hidden="true" /><h2>No posts match</h2><p>Change a filter or create a new post, then refresh this page.</p><Link className="primary-action" to="/post">Create a post</Link></div>
      ) : (
        <div className="post-list" aria-busy={loading}>
          {visiblePosts.map((post) => {
            const expanded = expandedId === post.id;
            return (
              <article className="post-card" key={post.id}>
                {post.imageUrl ? <img src={post.imageUrl} alt="" /> : <div className="image-placeholder"><ImageIcon size={24} aria-hidden="true" /><span>No image</span></div>}
                <div>
                  <div className="post-meta"><span>{post.type}</span><span>{post.plan}</span><span>{formatDate(post.createdAt)}</span></div>
                  <h3>{post.title}</h3>
                  <p>{post.abstract || post.problem}</p>
                  {expanded && <div className="expanded-copy"><p>{post.body || post.problem}</p>{post.topic && <p><strong>Topic:</strong> {post.topic}</p>}<p><strong>Author:</strong> {post.authorName || 'Unknown'}</p></div>}
                  <div className="tag-row">{(post.tags || []).map((tag) => <span key={tag}>{tag}</span>)}</div>
                  <div className="post-actions">
                    <button type="button" aria-expanded={expanded} onClick={() => setExpandedId(expanded ? '' : post.id)}><Eye size={16} aria-hidden="true" />{expanded ? 'Collapse' : 'Read full post'}</button>
                    <button type="button" onClick={() => handleHide(post.id)}>Hide on this device</button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {!loading && !error && posts.length > 0 && (
        <section className="evidence-panel" aria-labelledby="saved-posts-title">
          <div className="section-title"><p className="label">Data Evidence</p><h2 id="saved-posts-title">Loaded post records</h2></div>
          <div className="data-table" role="table" aria-label="Loaded post records">
            <div className="data-row data-head" role="row"><span>Document ID</span><span>Type</span><span>Plan</span><span>Created</span></div>
            {posts.slice(0, 8).map((post) => <div className="data-row" role="row" key={post.id}><span>{post.id}</span><span>{post.type}</span><span>{post.plan}</span><span>{formatDate(post.createdAt, true)}</span></div>)}
          </div>
        </section>
      )}
    </section>
  );
}

// Server records remain authoritative. The browser keeps only the one-time
// management capability required to refresh or cancel its own subscriptions.
function SubscriptionPage({ user }) {
  const [selectedPlan, setSelectedPlan] = useState(subscriptionPlans[1].id);
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [subscriptions, setSubscriptions] = useState(getSubscriptions());
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [form, setForm] = useState({ name: user ? `${user.firstName} ${user.lastName}` : 'Romil Bijarnia', email: user?.email || '', promoCode: '' });

  const plan = subscriptionPlans.find((item) => item.id === selectedPlan) || subscriptionPlans[0];
  const activeSubscriptions = subscriptions.filter(
    (subscription) => subscription.status === 'active' && subscription.source !== 'local-demo'
  );

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function loadRemoteRecords() {
    if (typeof api.listSubscriptions !== 'function') {
      setStatus({ ok: false, message: 'The subscription list endpoint is not available.' });
      return;
    }
    setLoadingRecords(true);
    setStatus(null);
    try {
      const manageableRecords = subscriptions.filter(
        (item) => item.id && item.managementToken && item.source !== 'local-demo'
      );
      if (manageableRecords.length === 0) {
        setStatus({
          ok: false,
          message: 'Create a backend subscription on this device before refreshing its protected record.'
        });
        return;
      }
      const result = await api.listSubscriptions(manageableRecords);
      if (!result.ok) {
        setStatus({ ok: false, message: result.body?.message || 'The backend could not load subscriptions.' });
        return;
      }
      const remote = Array.isArray(result.body?.subscriptions) ? result.body.subscriptions : [];
      const managementTokens = new Map(
        manageableRecords.map((item) => [item.id, item.managementToken])
      );
      const marked = remote.map((item) => ({
        ...item,
        managementToken: managementTokens.get(item.id),
        source: 'backend'
      }));
      replaceSubscriptions(marked);
      setSubscriptions(marked);
      setStatus({ ok: true, message: `Loaded ${marked.length} token-authorized subscription record${marked.length === 1 ? '' : 's'} from the backend.` });
    } catch {
      setStatus({ ok: false, message: 'The subscription backend did not respond.' });
    } finally {
      setLoadingRecords(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus(null);
    if (!form.name.trim() || !form.email.trim()) {
      setStatus({ ok: false, message: 'Enter the subscriber name and email.' });
      return;
    }
    setLoading(true);
    try {
      const result = await api.createSubscription({ name: form.name, email: form.email, planId: plan.id, planName: plan.name, billingCycle, promoCode: form.promoCode });
      if (!result.ok) {
        if (result.status === 0) {
          const local = saveSubscription({
            id: `local-demo-${Date.now()}`,
            receiptId: `local-demo-${Date.now()}`,
            planId: plan.id,
            planName: plan.name,
            name: form.name.trim(),
            email: form.email.trim().toLowerCase(),
            billingCycle,
            status: 'demo',
            source: 'local-demo'
          });
          setSubscriptions((current) => [local, ...current.filter((item) => item.id !== local.id)]);
          setStatus({ ok: true, demo: true, message: 'The backend was unavailable, so this is a local demo record only. No real subscription was created.' });
        } else {
          setStatus({ ok: false, message: result.body?.message || 'The subscription was rejected.' });
        }
        return;
      }
      const saved = saveSubscription({ ...result.body.subscription, source: 'backend' });
      setSubscriptions((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setStatus({ ok: true, message: `Backend subscription created. Receipt ${saved.receiptId || saved.id}.` });
      setForm((current) => ({ ...current, promoCode: '' }));
    } catch {
      setStatus({ ok: false, message: 'The subscription request failed.' });
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel(subscription) {
    setStatus(null);
    if (subscription.source === 'local-demo' || subscription.status === 'demo' || String(subscription.id).startsWith('sub-seed')) {
      const next = cancelSubscription(subscription.id);
      setSubscriptions(next);
      setStatus({ ok: true, demo: true, message: 'The local demo record was cancelled on this device only.' });
      return;
    }
    if (typeof api.cancelSubscriptionOnServer !== 'function') {
      setStatus({ ok: false, message: 'The backend cancellation endpoint is not available.' });
      return;
    }
    setLoading(true);
    try {
      const result = await api.cancelSubscriptionOnServer(
        subscription.id,
        subscription.managementToken
      );
      if (!result.ok) {
        setStatus({ ok: false, message: result.body?.message || 'The backend did not cancel the subscription.' });
        return;
      }
      const next = cancelSubscription(subscription.id);
      setSubscriptions(next);
      setStatus({ ok: true, message: 'The backend confirmed the subscription cancellation.' });
    } catch {
      setStatus({ ok: false, message: 'Cancellation could not reach the backend; the record was not changed.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="subscription-page">
      <div className="section-title"><p className="label">D1 Subscription</p><h1>Create, review, and cancel subscriptions</h1><p>The Express API owns real records. Clearly marked local demo records are used only when the API is offline.</p></div>

      <div className="subscription-summary" aria-label="Subscription summary"><div><span>{subscriptionPlans.length}</span>Plans</div><div><span>{activeSubscriptions.length}</span>Active backend records</div><div><span>{subscriptions.length}</span>Loaded records</div></div>
      <div className="plan-grid">
        {subscriptionPlans.map((item) => <button className={`plan-card ${selectedPlan === item.id ? 'selected' : ''}`} type="button" key={item.id} onClick={() => setSelectedPlan(item.id)} aria-pressed={selectedPlan === item.id}><span className="plan-icon"><CreditCard size={20} aria-hidden="true" /></span><strong>{item.name}</strong><span className="plan-price">{item.price} <small>/{item.cadence}</small></span><span>{item.summary}</span><span className="feature-list">{item.features.map((feature) => <span key={feature}><CheckCircle2 size={15} aria-hidden="true" />{feature}</span>)}</span></button>)}
      </div>

      <div className="subscription-workbench">
        <form className="subscription-form" onSubmit={handleSubmit} aria-busy={loading}>
          <div className="panel-heading"><CreditCard size={20} aria-hidden="true" /><h2>Create subscription</h2></div>
          <label>Subscriber name<input value={form.name} onChange={(event) => updateField('name', event.target.value)} maxLength={100} required /></label>
          <label>Subscriber email<input type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} autoComplete="email" required /></label>
          <fieldset className="control-group"><legend>Billing cycle</legend><label><input type="radio" name="billing-cycle" checked={billingCycle === 'monthly'} onChange={() => setBillingCycle('monthly')} />Monthly</label><label><input type="radio" name="billing-cycle" checked={billingCycle === 'annual'} onChange={() => setBillingCycle('annual')} />Annual</label></fieldset>
          <label>Promo code<input value={form.promoCode} onChange={(event) => updateField('promoCode', event.target.value)} maxLength={40} placeholder="Optional" /></label>
          <button className="primary-action" type="submit" disabled={loading}>{loading ? 'Working…' : `Create ${plan.name} subscription`}</button>
          <button className="secondary-action" type="button" onClick={loadRemoteRecords} disabled={loadingRecords}>{loadingRecords ? 'Loading records…' : 'Refresh protected backend records'}</button>
          <div aria-live="polite">{status && <p className={status.ok ? (status.demo ? 'warning-text' : 'success-text') : 'error-text'}>{status.message}</p>}</div>
        </form>

        <section className="evidence-panel subscription-evidence" aria-labelledby="subscriptions-title">
          <div className="section-title"><p className="label">Data Evidence</p><h2 id="subscriptions-title">Subscription records</h2></div>
          {subscriptions.length === 0 ? <div className="empty-state compact-empty"><p>No records loaded for this email.</p></div> : (
            <div className="data-table" role="table" aria-label="Subscription records"><div className="data-row subscription-row data-head" role="row"><span>Receipt ID</span><span>Plan</span><span>Status</span><span>Source</span><span>Action</span></div>{subscriptions.slice(0, 10).map((subscription) => <div className="data-row subscription-row" role="row" key={subscription.id}><span>{subscription.receiptId || subscription.id}</span><span>{subscription.planName}</span><span>{subscription.status}</span><span>{subscription.source || 'backend'}</span><span>{['active', 'demo'].includes(subscription.status) ? <button type="button" onClick={() => handleCancel(subscription)} disabled={loading}>Cancel</button> : 'No action'}</span></div>)}</div>
          )}
        </section>
      </div>
    </section>
  );
}

function IntegrityBadge({ state }) {
  const verified = state === 'verified';
  return <span className={`integrity-badge ${verified ? 'integrity-ok' : 'integrity-failed'}`}>{verified ? <ShieldCheck size={14} aria-hidden="true" /> : <AlertCircle size={14} aria-hidden="true" />}{verified ? 'Integrity verified' : state === 'failed' ? 'Integrity check failed' : 'Legacy integrity unavailable'}</span>;
}

// HdPage demonstrates coordinated advanced React state: URL-driven tutorial
// selection, stable async refresh callbacks and independent loading/error lanes.
function HdPage({ user, onUserChange }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const mode = getRuntimeMode();
  const initialTutorial = tutorials.find((item) => item.id === searchParams.get('tutorial')) || null;
  const [selectedTutorial, setSelectedTutorial] = useState(initialTutorial);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [roomLoading, setRoomLoading] = useState(false);
  const [roomError, setRoomError] = useState('');
  const [messageSending, setMessageSending] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState(null);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [engagement, setEngagement] = useState({});
  const [tutorialLoading, setTutorialLoading] = useState(false);
  const [tutorialError, setTutorialError] = useState('');
  const [comment, setComment] = useState('');
  // A ref de-duplicates the view side effect without causing an extra render.
  const viewedInSession = useRef(new Set());

  const canUseFirebaseFeatures = mode === 'local-demo' || Boolean(user);

  // useCallback gives the effect below a stable dependency while still
  // invalidating the request whenever runtime mode or authenticated user changes.
  const refreshRoom = useCallback(async () => {
    if (mode === 'firebase' && !user) {
      setMessages([]);
      return;
    }
    setRoomLoading(true);
    setRoomError('');
    try {
      const result = await loadCollaborationMessages();
      setMessages(result.items);
    } catch (error) {
      setRoomError(error.message);
    } finally {
      setRoomLoading(false);
    }
  }, [mode, user]);

  // Engagement is reloaded from the adapter after every write so React renders
  // the source of truth instead of incrementing cosmetic counters optimistically.
  const refreshTutorial = useCallback(async (tutorialId) => {
    if (mode === 'firebase' && !user) return;
    setTutorialLoading(true);
    setTutorialError('');
    try {
      const next = await loadTutorialEngagement(tutorialId);
      setEngagement((current) => ({ ...current, [tutorialId]: next }));
    } catch (error) {
      setTutorialError(error.message);
    } finally {
      setTutorialLoading(false);
    }
  }, [mode, user]);

  // Room refresh is identity-sensitive: changing runtime mode or user identity
  // invalidates the callback and reruns this effect with the new access context.
  useEffect(() => {
    refreshRoom();
  }, [refreshRoom]);

  // Load independent tutorial metrics concurrently, then commit one coherent
  // object to state so cards do not flicker through partially refreshed totals.
  useEffect(() => {
    if (!canUseFirebaseFeatures) return;
    Promise.all(tutorials.map((tutorial) => loadTutorialEngagement(tutorial.id)))
      .then((items) => setEngagement(Object.fromEntries(tutorials.map((tutorial, index) => [tutorial.id, items[index]]))))
      .catch((error) => setTutorialError(error.message));
  }, [canUseFirebaseFeatures, user]);

  // The URL is the restorable tutorial selection. The Set ensures React's effect
  // lifecycle records at most one view for that tutorial in the current session.
  useEffect(() => {
    const requested = tutorials.find((item) => item.id === searchParams.get('tutorial'));
    if (!requested || !canUseFirebaseFeatures) return;
    setSelectedTutorial(requested);
    if (viewedInSession.current.has(requested.id)) return;
    viewedInSession.current.add(requested.id);
    recordTutorialView(requested.id)
      .then((next) => setEngagement((current) => ({ ...current, [requested.id]: next })))
      .catch((error) => setTutorialError(error.message));
  }, [searchParams, canUseFirebaseFeatures]);

  // Message state is updated only with the adapter's integrity-checked envelope.
  async function handleSecureMessage(event) {
    event.preventDefault();
    if (!messageText.trim()) return;
    setMessageSending(true);
    setRoomError('');
    try {
      const result = await saveSecureMessage(messageText);
      setMessages((current) => [result.item, ...current]);
      setMessageText('');
    } catch (error) {
      setRoomError(error.message);
    } finally {
      setMessageSending(false);
    }
  }

  // Verification remains an out-of-band Firebase workflow; only safe status
  // text is retained in component state.
  async function requestVerification() {
    setVerificationLoading(true);
    setVerificationStatus(null);
    try {
      const result = await sendVerificationLink();
      setVerificationStatus({ ok: true, message: result.alreadyVerified ? 'This email is already verified.' : 'Firebase sent a signed verification link to your account email.' });
    } catch (error) {
      setVerificationStatus({ ok: false, message: error.message });
    } finally {
      setVerificationLoading(false);
    }
  }

  async function checkVerification() {
    setVerificationLoading(true);
    setVerificationStatus(null);
    try {
      const refreshed = await refreshVerificationStatus();
      onUserChange(refreshed);
      setVerificationStatus({ ok: refreshed.emailVerified, message: refreshed.emailVerified ? 'Email verification confirmed.' : 'Not verified yet. Open the Firebase email link, then check again.' });
    } catch (error) {
      setVerificationStatus({ ok: false, message: error.message });
    } finally {
      setVerificationLoading(false);
    }
  }

  function openTutorial(tutorial) {
    setSelectedTutorial(tutorial);
    setSearchParams({ tutorial: tutorial.id });
  }

  function closeTutorial() {
    setSelectedTutorial(null);
    setSearchParams({});
    setComment('');
  }

  // Ratings and comments both reload the aggregate returned by the adapter,
  // keeping per-user writes and displayed totals synchronized.
  async function rateTutorial(tutorialId, rating) {
    setTutorialLoading(true);
    setTutorialError('');
    try {
      const next = await saveTutorialRating(tutorialId, rating);
      setEngagement((current) => ({ ...current, [tutorialId]: next }));
    } catch (error) {
      setTutorialError(error.message);
    } finally {
      setTutorialLoading(false);
    }
  }

  async function submitComment(event) {
    event.preventDefault();
    if (!selectedTutorial) return;
    setTutorialLoading(true);
    setTutorialError('');
    try {
      const next = await saveTutorialComment(selectedTutorial.id, comment);
      setEngagement((current) => ({ ...current, [selectedTutorial.id]: next }));
      setComment('');
    } catch (error) {
      setTutorialError(error.message);
    } finally {
      setTutorialLoading(false);
    }
  }

  return (
    <section className="hd-page">
      <div className="section-title"><p className="label">HD1 DEV@Deakin Web App</p><h1>Authenticated collaboration and persistent learning</h1><p>These features use real Firebase workflows when configured and clearly labelled local demonstrations otherwise.</p></div>
      <DataModeNotice mode={mode} />
      {mode === 'firebase' && !user && <div className="inline-alert" role="alert"><Lock size={18} aria-hidden="true" /><span><Link to="/login">Sign in</Link> to access the authenticated room, email verification, ratings, and comments.</span></div>}

      <div className="hd-grid">
        <article className="hd-panel">
          <div className="panel-heading"><MessageCircle size={20} aria-hidden="true" /><h2>{mode === 'firebase' ? 'Authenticated Firestore room' : 'Local integrity demo room'}</h2></div>
          <p className="panel-copy">Messages are identity-bound by Firestore rules when Firebase is active. A Web Crypto SHA-256 digest is recalculated on every read to expose altered content.</p>
          <form onSubmit={handleSecureMessage} className="inline-form">
            <label className="sr-only" htmlFor="secure-message">Collaboration message</label>
            <input id="secure-message" value={messageText} onChange={(event) => setMessageText(event.target.value)} maxLength={1000} placeholder="Write a project update" disabled={!canUseFirebaseFeatures || messageSending} />
            <button type="submit" disabled={!canUseFirebaseFeatures || messageSending}><Send size={16} aria-hidden="true" />{messageSending ? 'Sending…' : 'Send'}</button>
          </form>
          <div className="panel-toolbar"><button className="secondary-action compact" type="button" onClick={refreshRoom} disabled={!canUseFirebaseFeatures || roomLoading}><RefreshCw size={15} aria-hidden="true" />{roomLoading ? 'Refreshing…' : 'Refresh room'}</button></div>
          <div aria-live="polite">{roomError && <p className="error-text">{roomError}</p>}</div>
          {!roomLoading && !roomError && messages.length === 0 && <div className="empty-state compact-empty"><p>No messages yet.</p></div>}
          <div className="message-list">
            {messages.map((message) => <div className="message-item" key={message.id}><p>{message.text}</p><div className="message-meta"><span>{message.senderName} · {formatDate(message.createdAt, true)}</span><IntegrityBadge state={message.integrityState} /></div><code title={message.integrityHash}>SHA-256 {message.integrityHash?.slice(0, 16)}…</code></div>)}
          </div>
          {mode === 'local-demo' && <p className="demo-disclaimer">Demo only: local messages do not provide cross-device authentication or transport encryption.</p>}
        </article>

        <article className="hd-panel">
          <div className="panel-heading"><ShieldCheck size={20} aria-hidden="true" /><h2>Email verification workflow</h2></div>
          <p className="panel-copy">Firebase delivers a signed link out of band. This interface never displays, logs, or compares a verification code.</p>
          <div className="verification-card"><MailCheck size={22} aria-hidden="true" /><div><strong>{user?.email || 'No signed-in account'}</strong><span>{user?.emailVerified ? 'Verified email' : 'Verification not confirmed'}</span></div></div>
          <div className="verification-actions"><button className="primary-action" type="button" onClick={requestVerification} disabled={mode === 'local-demo' || !user || verificationLoading || user?.emailVerified}>{verificationLoading ? 'Working…' : 'Send verification link'}</button><button className="secondary-action" type="button" onClick={checkVerification} disabled={mode === 'local-demo' || !user || verificationLoading}>Check status</button></div>
          <div aria-live="polite">{verificationStatus && <p className={verificationStatus.ok ? 'success-text' : 'error-text'}>{verificationStatus.message}</p>}</div>
          {mode === 'local-demo' && <p className="demo-disclaimer">Demo only: no fake code is generated. Configure Firebase and sign in to exercise the real workflow.</p>}
        </article>
      </div>

      <section className="tutorial-library" id="tutorial-library">
        <div className="section-title"><p className="label">Tutorial Library</p><h2>Detailed tutorials with persistent views, ratings, and comments</h2><p>A view is recorded when a tutorial opens, not when its card merely renders.</p></div>
        <div aria-live="polite">{tutorialError && <p className="error-text">{tutorialError}</p>}</div>
        <div className="media-grid">
          {tutorials.map((tutorial) => {
            const metric = engagement[tutorial.id] || { views: 0, averageRating: 0, ratingCount: 0 };
            return <article className="media-card" key={tutorial.id}><img src={tutorial.image} alt="" /><div className="media-card-body"><div className="tutorial-kicker"><span><Clock size={14} aria-hidden="true" />{tutorial.duration}</span><span>{tutorial.level}</span></div><h3>{tutorial.title}</h3><p>{tutorial.description}</p><div className="card-meta"><span><Eye size={15} aria-hidden="true" />{metric.views} views</span><span><Star size={15} aria-hidden="true" />{metric.ratingCount ? `${metric.averageRating.toFixed(1)} (${metric.ratingCount})` : 'Not rated'}</span></div><button className="card-link button-link" type="button" onClick={() => openTutorial(tutorial)} disabled={!canUseFirebaseFeatures}>Open and record view</button></div></article>;
          })}
        </div>

        {selectedTutorial && canUseFirebaseFeatures && (
          <article className="tutorial-detail" aria-labelledby="tutorial-detail-title">
            <div className="tutorial-detail-header"><div><p className="label">Active tutorial</p><h2 id="tutorial-detail-title">{selectedTutorial.title}</h2><p>{selectedTutorial.duration} · {selectedTutorial.level} · by {selectedTutorial.author}</p></div><button className="secondary-action" type="button" onClick={closeTutorial}>Close tutorial</button></div>
            <div className="tutorial-detail-grid">
              <div className="lesson-content"><section><h3>Learning outcomes</h3><ul>{selectedTutorial.outcomes.map((outcome) => <li key={outcome}>{outcome}</li>)}</ul></section>{selectedTutorial.sections.map((section) => <section key={section.title}><h3>{section.title}</h3><p>{section.body}</p></section>)}</div>
              <aside className="engagement-panel" aria-label="Tutorial activity">
                <h3>Rate this tutorial</h3>
                <div className="rating-buttons" role="group" aria-label="Choose a rating from 1 to 5">{[1, 2, 3, 4, 5].map((rating) => <button key={rating} type="button" aria-pressed={engagement[selectedTutorial.id]?.userRating === rating} onClick={() => rateTutorial(selectedTutorial.id, rating)} disabled={tutorialLoading}>{rating}<Star size={14} aria-hidden="true" /></button>)}</div>
                <form className="comment-form" onSubmit={submitComment}><label htmlFor="tutorial-comment">Add a comment</label><textarea id="tutorial-comment" value={comment} onChange={(event) => setComment(event.target.value)} maxLength={500} required /><span className="form-hint">{comment.length}/500 characters</span><button className="primary-action" type="submit" disabled={tutorialLoading}>{tutorialLoading ? 'Saving…' : 'Post comment'}</button></form>
                <div className="comment-list"><h3>Comments</h3>{(engagement[selectedTutorial.id]?.comments || []).length === 0 ? <p>No comments yet.</p> : (engagement[selectedTutorial.id]?.comments || []).map((item) => <article key={item.id}><p>{item.text}</p><span>{item.authorName} · {formatDate(item.createdAt, true)}</span></article>)}</div>
                <button className="secondary-action compact" type="button" onClick={() => refreshTutorial(selectedTutorial.id)} disabled={tutorialLoading}><RefreshCw size={15} aria-hidden="true" />Refresh activity</button>
              </aside>
            </div>
            {mode === 'local-demo' && <p className="demo-disclaimer">Demo only: tutorial activity persists in this browser, not in a shared account.</p>}
          </article>
        )}
      </section>
    </section>
  );
}

function NotFoundPage() {
  return <section className="empty-state not-found"><h1>Page not found</h1><p>The requested DEV@Deakin page does not exist.</p><Link className="primary-action" to="/">Return home</Link></section>;
}

// Footer navigation mirrors the route map so direct links remain discoverable
// and keyboard-accessible on every page.
function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-brand"><Link className="footer-logo" to="/">DEV@Deakin</Link><p>A learning community for developers to ask, share, and grow together.</p></div>
        <nav className="footer-column" aria-labelledby="footer-explore-title"><h2 id="footer-explore-title">Explore</h2><Link to="/">Home</Link><Link to="/post">Create a post</Link><Link to="/browse">Browse posts</Link><Link to="/hd#tutorial-library">Tutorials</Link></nav>
        <nav className="footer-column" aria-labelledby="footer-account-title"><h2 id="footer-account-title">Account</h2><Link to="/login">Login</Link><Link to="/signup">Create account</Link><Link to="/forgot-password">Reset password</Link><Link to="/subscription">Subscriptions</Link></nav>
        <div className="footer-column"><h2>Stay connected</h2><nav className="footer-social-links" aria-label="Deakin University social media"><a href="https://www.instagram.com/deakinuniversity/" target="_blank" rel="noreferrer" aria-label="Deakin University on Instagram"><Instagram aria-hidden="true" /></a><a href="https://www.linkedin.com/school/deakin-university/" target="_blank" rel="noreferrer" aria-label="Deakin University on LinkedIn"><Linkedin aria-hidden="true" /></a><a href="https://www.youtube.com/user/deakinuniversity" target="_blank" rel="noreferrer" aria-label="Deakin University on YouTube"><Youtube aria-hidden="true" /></a></nav></div>
      </div>
      <div className="footer-legal"><p>© 2026 DEV@Deakin. Created for SIT313 Secure Frontend Applications.</p><nav className="footer-legal-links" aria-label="Legal"><a href="https://www.deakin.edu.au/footer/privacy" target="_blank" rel="noreferrer">Privacy Policy</a><a href="https://www.deakin.edu.au/footer/disclaimer" target="_blank" rel="noreferrer">Terms</a></nav></div>
    </footer>
  );
}

// App owns the authenticated user and subscribes once to the external Firebase
// session. Child routes receive only the minimum state/actions they require.
export default function App() {
  const [user, setUser] = useState(getActiveUser());
  const [authError, setAuthError] = useState('');

  useEffect(() => subscribeToAuthState((nextUser, error) => {
    setUser(nextUser);
    setAuthError(error?.message || '');
  }), []);

  async function handleLogout() {
    setAuthError('');
    try {
      await logoutUser();
      setUser(null);
    } catch (error) {
      setAuthError(error.message);
    }
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <Header user={user} onLogout={handleLogout} />
      {authError && <div className="global-alert" role="alert">{authError}</div>}
      <main className="page-shell" id="main-content" tabIndex="-1">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<AuthPage mode="login" onLogin={setUser} />} />
          <Route path="/signup" element={<AuthPage mode="signup" onLogin={setUser} />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/post" element={<PostPage user={user} />} />
          <Route path="/browse" element={<BrowsePage />} />
          <Route path="/subscription" element={<SubscriptionPage user={user} />} />
          <Route path="/hd" element={<HdPage user={user} onUserChange={setUser} />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}
