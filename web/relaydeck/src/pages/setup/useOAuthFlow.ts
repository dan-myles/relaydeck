import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, describeApiError, type ManagementClient } from "../../api/client";
import { cancelOAuth, pollOAuth, startOAuth, submitOAuthRedirect } from "../../api/relay";

const POLL_MS = 2_000;

export type OAuthFlowState =
  | { phase: "idle" }
  | { phase: "starting"; provider: string; reconnect: boolean }
  | {
      phase: "waiting";
      provider: string;
      reconnect: boolean;
      url: string;
      state: string;
      userCode?: string;
      opened: boolean;
    }
  | { phase: "connected"; provider: string; reconnect: boolean }
  | { phase: "failed"; provider: string; reconnect: boolean; message: string };

export function oauthErrorMessage(raw: string): string {
  const text = raw.trim();
  if (/unknown or expired state/i.test(text)) return "The sign-in took too long and expired. Start again.";
  if (/state code error|invalid state/i.test(text)) return "The sign-in page returned a mismatched session. Start again from here.";
  if (/access_denied|denied/i.test(text)) return "Access wasn't approved on the provider's page.";
  if (/timeout/i.test(text)) return "No answer from the provider's page in time. Start again.";
  if (/save|persist/i.test(text)) return "Signed in, but the relay couldn't save the account. Check its auth directory is writable.";
  return text || "The provider didn't complete the sign-in.";
}

export function useOAuthFlow(client: ManagementClient, onConnected: () => void) {
  const [flow, setFlow] = useState<OAuthFlowState>({ phase: "idle" });
  const popup = useRef<Window | null>(null);
  const onConnectedRef = useRef(onConnected);
  onConnectedRef.current = onConnected;

  // Must run inside a click handler so the browser allows the new tab.
  const begin = useCallback(
    async (provider: string, reconnect = false) => {
      let win: Window | null = null;
      try {
        win = window.open("about:blank", "_blank");
      } catch {
        win = null;
      }
      popup.current = win;
      setFlow({ phase: "starting", provider, reconnect });
      try {
        const started = await startOAuth(client, provider);
        let opened = false;
        if (win && !win.closed) {
          win.opener = null;
          win.location.href = started.url!;
          opened = true;
        }
        setFlow({
          phase: "waiting",
          provider,
          reconnect,
          url: started.url!,
          state: started.state!,
          userCode: started.user_code,
          opened,
        });
      } catch (error) {
        win?.close();
        const message =
          error instanceof ApiError && error.code === "provider_not_found"
            ? "This relay doesn't offer that sign-in. It may need a newer version or a plugin."
            : describeApiError(error);
        setFlow({ phase: "failed", provider, reconnect, message });
      }
    },
    [client],
  );

  const waitingState = flow.phase === "waiting" ? flow.state : null;
  useEffect(() => {
    if (!waitingState) return;
    let stopped = false;
    const tick = async () => {
      try {
        const status = await pollOAuth(client, waitingState);
        if (stopped) return;
        if (status.status === "ok") {
          stopped = true;
          setFlow((current) => (current.phase === "waiting" ? { phase: "connected", provider: current.provider, reconnect: current.reconnect } : current));
          onConnectedRef.current();
        } else if (status.status === "error") {
          stopped = true;
          setFlow((current) =>
            current.phase === "waiting"
              ? { phase: "failed", provider: current.provider, reconnect: current.reconnect, message: oauthErrorMessage(status.error ?? "") }
              : current,
          );
        }
      } catch (error) {
        if (stopped) return;
        if (error instanceof ApiError && error.kind === "invalid") {
          stopped = true;
          setFlow((current) =>
            current.phase === "waiting"
              ? { phase: "failed", provider: current.provider, reconnect: current.reconnect, message: describeApiError(error) }
              : current,
          );
        }
        // Network blips: keep polling.
      }
    };
    const timer = window.setInterval(() => {
      if (!stopped) void tick();
    }, POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [client, waitingState]);

  const cancel = useCallback(async () => {
    const current = flow;
    setFlow({ phase: "idle" });
    popup.current?.close();
    popup.current = null;
    if (current.phase === "waiting") {
      try {
        await cancelOAuth(client, current.state);
      } catch {
        // The session expires on its own.
      }
    }
  }, [client, flow]);

  const reset = useCallback(() => {
    popup.current = null;
    setFlow({ phase: "idle" });
  }, []);

  const reopen = useCallback(() => {
    if (flow.phase !== "waiting") return;
    window.open(flow.url, "_blank", "noopener,noreferrer");
    setFlow({ ...flow, opened: true });
  }, [flow]);

  const submitRedirect = useCallback(
    async (address: string) => {
      if (flow.phase !== "waiting") return;
      await submitOAuthRedirect(client, flow.provider, address.trim());
    },
    [client, flow],
  );

  return { flow, begin, cancel, reset, reopen, submitRedirect };
}
