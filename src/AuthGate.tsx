import { lazy, Suspense, useEffect, useState } from "react";
import { API_BASE } from "./config";
import { App } from "./App";
import { readGuest, setGuest as storeGuest } from "./utils/guest";

// The login screen (its own 3D scene) loads only for signed-out visitors
const LoginScreen = lazy(() => import("./components/login/LoginScreen").then((m) => ({ default: m.LoginScreen })));

interface AuthState {
  signedIn: boolean;
  /** Git OAuth is configured, so the Sign in button can work */
  oauth: boolean;
  /** The server lets signed-out visitors browse (GUEST_BROWSING=true) */
  guestBrowsing: boolean;
}

/**
 * Login is a must: the realm (and every request for its data) starts only once a ruler is signed in. With
 * GUEST_BROWSING=true on the server the login screen also offers "Look around without signing in". The server
 * enforces the same rule on every route, so hiding the realm here is not the only protection.
 */
export function AuthGate() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [failed, setFailed] = useState(false);
  const [guest, setGuest] = useState(readGuest);
  // Git sends the visitor back with ?signin_error=… when sign-in fails
  const [signinError] = useState(() => {
    const err = new URLSearchParams(window.location.search).get("signin_error");
    if (err) window.history.replaceState(null, "", window.location.pathname);
    return err;
  });

  useEffect(() => {
    fetch(`${API_BASE}/auth/me`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { user: unknown; enabled?: boolean; guestBrowsing?: boolean }) =>
        setAuth({ signedIn: Boolean(d.user), oauth: Boolean(d.enabled), guestBrowsing: Boolean(d.guestBrowsing) })
      )
      .catch(() => setFailed(true));
  }, []);

  if (!auth && !failed) return <div className="w-screen h-screen bg-black" />;
  if (auth && (auth.signedIn || (auth.guestBrowsing && guest))) return <App />;

  const signIn = () => {
    window.location.href = `${API_BASE}/auth/login?returnTo=${encodeURIComponent(window.location.pathname)}`;
  };
  const notice = failed
    ? "The realm can't be reached right now. Try again in a moment."
    : !auth?.oauth
      ? "Sign in with Git isn't set up on this server yet."
      : signinError
        ? `Sign in failed: ${signinError}`
        : null;

  return (
    <Suspense fallback={<div className="w-screen h-screen bg-black" />}>
      <LoginScreen
        onSignIn={auth?.oauth ? signIn : undefined}
        notice={notice}
        onGuest={
          auth?.guestBrowsing
            ? () => {
                storeGuest(true);
                setGuest(true);
              }
            : undefined
        }
      />
    </Suspense>
  );
}
