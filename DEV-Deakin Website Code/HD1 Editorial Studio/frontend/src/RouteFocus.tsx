import { useLayoutEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

/** Runs inside Suspense so focus moves only after the destination page is ready. */
export function RouteFocus() {
  const { pathname, hash } = useLocation();
  const previous = useRef({ pathname, hash });
  useLayoutEffect(() => {
    const pathChanged = previous.current.pathname !== pathname;
    const hashChanged = previous.current.hash !== hash;
    previous.current = { pathname, hash };
    // Initial load and query-only updates must not steal typing focus or reset the view.
    if (!pathChanged && !hashChanged) return;
    if (hash) {
      let anchor: HTMLElement | null = null;
      try {
        anchor = document.getElementById(decodeURIComponent(hash.slice(1)));
      } catch {
        return;
      }
      anchor?.scrollIntoView({ block: "start", behavior: "auto" });
      if (pathChanged && anchor) {
        anchor.setAttribute("tabindex", "-1");
        anchor.focus({ preventScroll: true });
      }
      return;
    }
    if (!pathChanged) return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    const destination = document.querySelector<HTMLElement>(
      "#app-content main h1, #app-content main",
    );
    // Prefer the heading over its parent main when both are present.
    const target = destination?.querySelector<HTMLElement>("h1") || destination;
    if (target) {
      target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    }
  }, [pathname, hash]);
  return null;
}
