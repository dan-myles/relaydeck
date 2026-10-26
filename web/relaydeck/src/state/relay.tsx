import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiError, ManagementClient } from "../api/client";
import { readProviderKeys, readRoutingStrategy, setProviderKeyPaused } from "../api/config";
import { listCredentials, readKeyUsage, setCredentialPaused } from "../api/relay";
import { keyAccounts, toAccount, type Account } from "../lib/accounts";

const POLL_MS = 10_000;

export interface RelayState {
  client: ManagementClient;
  accounts: Account[];
  loaded: boolean;
  error: unknown;
  // Provider keys are read from the config; this is set when that read fails.
  keysError: unknown;
  updatedAt: Date | null;
  strategy: string;
  refresh: () => Promise<void>;
  signOut: () => void;
}

const RelayContext = createContext<RelayState | null>(null);

export function RelayProvider({
  client,
  onUnauthorized,
  onSignOut,
  children,
}: {
  client: ManagementClient;
  onUnauthorized: () => void;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [keysError, setKeysError] = useState<unknown>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [strategy, setStrategy] = useState("round-robin");
  const inFlight = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async () => {
    if (inFlight.current) return inFlight.current;
    const run = (async () => {
      try {
        const [list, keys] = await Promise.all([
          listCredentials(client),
          Promise.all([readProviderKeys(client), readKeyUsage(client)]).catch((err: unknown) => err),
        ]);
        const now = new Date();
        const subscriptions = list.files.map((credential) => toAccount(credential, now));
        if (Array.isArray(keys)) {
          setAccounts([...subscriptions, ...keyAccounts(keys[0], keys[1])]);
          setKeysError(null);
        } else {
          if (keys instanceof ApiError && keys.kind === "unauthorized") throw keys;
          // Keep the last known keys rather than dropping them from view.
          setAccounts((current) => [...subscriptions, ...current.filter((account) => account.source === "config-key")]);
          setKeysError(keys);
        }
        setUpdatedAt(now);
        setError(null);
      } catch (err) {
        if (err instanceof ApiError && err.kind === "unauthorized") {
          onUnauthorized();
          return;
        }
        setError(err);
      } finally {
        setLoaded(true);
        inFlight.current = null;
      }
    })();
    inFlight.current = run;
    return run;
  }, [client, onUnauthorized]);

  useEffect(() => {
    void refresh();
    readRoutingStrategy(client)
      .then(setStrategy)
      .catch(() => undefined);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [client, refresh]);

  const value = useMemo(
    () => ({ client, accounts, loaded, error, keysError, updatedAt, strategy, refresh, signOut: onSignOut }),
    [client, accounts, loaded, error, keysError, updatedAt, strategy, refresh, onSignOut],
  );
  return <RelayContext.Provider value={value}>{children}</RelayContext.Provider>;
}

export function useRelay(): RelayState {
  const value = useContext(RelayContext);
  if (!value) throw new Error("useRelay outside RelayProvider");
  return value;
}

// Pauses a subscription through the credentials API, or a provider key
// through its config entry.
export async function setAccountPaused(client: ManagementClient, account: Account, paused: boolean): Promise<void> {
  if (account.source === "config-key" && account.keyRef) {
    await setProviderKeyPaused(client, account.keyRef.provider, account.keyRef.apiKey, paused);
    return;
  }
  await setCredentialPaused(client, account.credential, paused);
}
