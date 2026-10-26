import { useCallback, useMemo, useState } from "react";
import { ManagementClient } from "../api/client";
import { useMotion, type MotionState } from "../lib/motion";
import { clearStoredKey, loadStoredKey, storeKey } from "../lib/session";
import { RecordsProvider } from "../state/records";
import { RelayProvider } from "../state/relay";
import { ArtScene } from "../components/ArtScene";
import { ToastProvider } from "../components/Toast";
import { SetupPage } from "../pages/SetupPage";
import { UsagePage } from "../pages/UsagePage";
import { CompactSignOut, CompactTopBar, Dock, RunningChip, TabBar } from "./Chrome";
import { Login } from "./Login";
import { useRoute, type Route } from "./route";

export function App() {
  const [key, setKey] = useState<string | null>(() => loadStoredKey());
  const motion = useMotion();
  const client = useMemo(() => (key ? new ManagementClient(key) : null), [key]);

  const signOut = useCallback(() => {
    clearStoredKey();
    setKey(null);
  }, []);

  if (!client) {
    return (
      <>
        <ArtScene art="panorama" animating={motion.animating} className="art-fixed" />
        <Login
          onSignedIn={(value, remember) => {
            storeKey(value, remember);
            setKey(value);
          }}
        />
      </>
    );
  }

  return (
    <RelayProvider client={client} onUnauthorized={signOut} onSignOut={signOut}>
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
