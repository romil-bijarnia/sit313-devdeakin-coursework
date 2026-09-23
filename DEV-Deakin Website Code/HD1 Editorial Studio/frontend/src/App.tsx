import { lazy, Suspense } from "react";
import { Route, Routes, Link, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth.tsx";
import { Header, Footer, Notice } from "./components.tsx";
import Home, { CataloguePage } from "./Home.tsx";
import HelpPage from "./HelpPage.tsx";
import AuthPage from "./AuthPage.tsx";
import { RouteFocus } from "./RouteFocus.tsx";
const PostEditor = lazy(() => import("./PostEditor.tsx"));
const Pricing = lazy(() => import("./Pricing.tsx"));
const Browse = lazy(() => import("./Browse.tsx"));
function Shell() {
  const { user, error, refresh } = useAuth(),
    location = useLocation();
  const identity = `${user?.id || "visitor"}-${user?.plan || "free"}-${user?.role || "author"}`;
  return (
    <>
      <a className="skip-link" href="#app-content">
        Skip to content
      </a>
      <Header />
      {error && (
        <div className="session-error">
          <Notice error>{error}</Notice>
          <button className="text-button" onClick={() => void refresh()}>
            Retry account connection
          </button>
        </div>
      )}
      <div id="app-content">
        <Suspense fallback={<main className="page">Opening page…</main>}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route
              path="/articles"
              element={<CataloguePage kind="articles" />}
            />
            <Route
              path="/tutorials"
              element={<CataloguePage kind="tutorials" />}
            />
            <Route path="/help" element={<HelpPage />} />
            <Route path="/login" element={<AuthPage key="login" />} />
            <Route path="/signup" element={<AuthPage key="signup" signup />} />
            <Route
              path="/post"
              element={<PostEditor key={identity + location.search} />}
            />
            <Route path="/pricing" element={<Pricing key={identity} />} />
            <Route
              path="/browse"
              element={<Browse key={identity + location.search} />}
            />
            <Route
              path="/studio"
              element={<Browse scope="mine" key={identity + "mine"} />}
            />
            <Route
              path="/review"
              element={<Browse scope="review" key={identity + "review"} />}
            />
            <Route
              path="*"
              element={
                <main className="page">
                  <h1>Page not found</h1>
                  <Link to="/">Return home</Link>
                </main>
              }
            />
          </Routes>
          <RouteFocus />
        </Suspense>
      </div>
      <Footer />
    </>
  );
}
export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
