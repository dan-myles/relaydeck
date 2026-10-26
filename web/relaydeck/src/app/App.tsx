import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, ManagementClient } from "../api/client";
import { useMotion, type MotionState } from "../lib/motion";
import { clearStoredKey, loadStoredKey, storeKey } from "../lib/session";
import { RecordsProvider } from "../state/records";
import { RelayProvider } from "../state/relay";
import { ArtScene } from "../components/ArtScene";
import { ToastProvider } from "../components/Toast";
import { SetupPage } from "../pages/SetupPage";
import { UsagePage } from "../pages/UsagePage";
import { CompactSignOut, CompactTopBar, Dock, RunningChip, TabBar } from "./Chrome";
import { Login, loginErrorMessage } from "./Login";
import { useRoute, type Route } from "./route";

interface Session {
  key: string;
  verified: boolean;
}

export function App() {
  const [session, setSession] = useState<Session | null>(() => {
    const stored = loadStoredKey();
    return stored ? { key: stored, verified: false } : null;
  });
  const [notice, setNotice] = useState<string | null>(null);
  const motion = useMotion();
  const client = useMemo(() => (session?.verified ? new ManagementClient(session.key) : null), [session]);

  const signOut = useCallback(() => {
    clearStoredKey();
    setNotice(null);
    setSession(null);
  }, []);

  const rejected = useCallback((error: unknown) => {
    clearStoredKey();
    setNotice(loginErrorMessage(error));
    setSession(null);
  }, []);

  // A remembered key is checked with a single request before anything else
  // runs, so a rotated key costs one failed attempt instead of a burst that
  // trips the relay's lockout for wrong keys.
  useEffect(() => {
    if (!session || session.verified) return;
    let cancelled = false;
    new ManagementClient(session.key).request("/credentials?page=1&page_size=1").then(
      () => {
        if (!cancelled) setSession({ key: session.key, verified: true });
      },
      (error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && (error.kind === "network" || error.kind === "server")) {
          // The relay is down or failing; the shell shows that and retries.
          setSession({ key: session.key, verified: true });
          return;
        }
        rejected(error);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [session, rejected]);

  if (!client) {
    return (
      <>
        <ArtScene art="panorama" animating={motion.animating} className="art-fixed" />
        {session ? (
          <main className="login">
            <div className="login-card glass" aria-busy="true" role="status">
              Connecting to your relay…
            </div>
          </main>
        ) : (
          <Login
            initialError={notice}
            onSignedIn={(value, remember) => {
              storeKey(value, remember);
              setNotice(null);
              setSession({ key: value, verified: true });
            }}
          />
        )}
      </>
    );
  }

  return (
    <RelayProvider client={client} onUnauthorized={rejected} onSignOut={signOut}>
      <RecordsProvider client={client}>
        <ToastProvider>
          <Shell motion={motion} />
        </ToastProvider>
      </RecordsProvider>
    </RelayProvider>
  );
}

function Shell({ motion }: { motion: MotionState }) {
  const route = useRoute();
  return (
    <>
      <ArtScene art="panorama" animating={motion.animating} className="art-fixed only-wide" />
      <div className="compact-header only-compact">
        <ArtScene art="vertical" animating={motion.animating} className="art-header art-header-narrow" />
        <ArtScene art="panorama" animating={motion.animating} className="art-header art-header-tablet" />
        <CompactTopBar motion={motion} />
        <RunningChip />
      </div>
      <div className="layout">
        <div className="dock-slot only-wide">
          <Dock route={route} motion={motion} />
        </div>
        <main className="sheet" id="main">
          <Page route={route} />
          <div className="only-compact">
            <CompactSignOut />
          </div>
        </main>
      </div>
      <div className="only-compact">
        <TabBar route={route} />
      </div>
    </>
  );
}

function Page({ route }: { route: Route }) {
  if (route.page === "usage") return <UsagePage accountIndex={route.account} />;
  return <SetupPage />;
}
