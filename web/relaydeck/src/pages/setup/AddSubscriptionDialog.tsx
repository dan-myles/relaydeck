import { useState, type FormEvent } from "react";
import { describeApiError } from "../../api/client";
import { ADVANCED_URL } from "../../lib/session";
import { providerInfo, SUBSCRIPTION_OPTIONS, subscriptionOption } from "../../lib/providers";
import { Dialog } from "../../components/Dialog";
import { CopyButton, Done, ProviderMark, StatusDot } from "../../components/Controls";
import { ArrowUpRight } from "../../components/Icons";
import type { useOAuthFlow } from "./useOAuthFlow";

type Flow = ReturnType<typeof useOAuthFlow>;

function isLocalBrowser(): boolean {
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
}

export function AddSubscriptionDialog({ oauth, onClose }: { oauth: Flow; onClose: () => void }) {
  const { flow } = oauth;
  const close = () => {
    if (flow.phase === "waiting" || flow.phase === "starting") void oauth.cancel();
    else oauth.reset();
    onClose();
  };
  const title = flow.phase !== "idle" && flow.reconnect ? `Reconnect ${providerInfo(flow.provider).name}` : "Add a subscription";

  return (
    <Dialog
      title={title}
      description={
        flow.phase !== "idle" && flow.reconnect
          ? "Sign in again on the provider's page with the same account."
          : "Sign in with a plan you already pay for. You sign in on the provider's own page; the relay keeps only the session."
      }
      onClose={close}
      width={560}
      footer={
        <div className="dialog-footer-row">
          <span className="muted">Kimi, Devin, Meta and token-file import are in Advanced.</span>
          <a className="text-button" href={ADVANCED_URL}>
            Open Advanced <ArrowUpRight />
          </a>
        </div>
      }
    >
      {flow.phase !== "idle" && <ActiveFlow oauth={oauth} onDone={close} />}
      <div className="provider-grid" role="list">
        {SUBSCRIPTION_OPTIONS.filter((option) => flow.phase === "idle" || option.provider !== flow.provider).map((option) => (
          <div role="listitem" key={option.provider}>
            <button
              type="button"
              className="provider-tile"
              disabled={flow.phase === "starting" || flow.phase === "waiting"}
              onClick={() => void oauth.begin(option.provider)}
            >
              <ProviderMark color={providerInfo(option.provider).color} />
              <span className="provider-tile-text">
                <span className="provider-tile-name">{option.name}</span>
                <span className="provider-tile-plan">{option.plan}</span>
              </span>
            </button>
          </div>
        ))}
      </div>
    </Dialog>
  );
}

function ActiveFlow({ oauth, onDone }: { oauth: Flow; onDone: () => void }) {
  const { flow } = oauth;
  if (flow.phase === "idle") return null;
  const option = subscriptionOption(flow.provider);
  const info = providerInfo(flow.provider);

  let status: { tone: "warn" | "live" | "bad" | "muted"; text: string };
  if (flow.phase === "starting") status = { tone: "muted", text: "Starting sign-in…" };
  else if (flow.phase === "waiting") status = { tone: "warn", text: "Waiting for you in the browser" };
  else if (flow.phase === "connected") status = { tone: "live", text: flow.reconnect ? "Back and live" : "Connected" };
  else status = { tone: "bad", text: "Sign-in didn't finish" };

  return (
    <section className={`flow-card flow-${flow.phase}`} aria-live="polite">
      <div className="flow-head">
        {flow.phase === "connected" ? <Done /> : <ProviderMark color={info.color} />}
        <div className="flow-title">
          <div className="flow-name">{option?.name ?? info.name}</div>
          <div className="flow-plan">{option?.plan}</div>
        </div>
        <div className={`flow-status tone-${status.tone}`}>
          <StatusDot tone={status.tone} />
          <span>{status.text}</span>
        </div>
      </div>

      {flow.phase === "waiting" && <WaitingBody oauth={oauth} host={option?.signInHost ?? "the provider"} />}

      {flow.phase === "connected" && (
        <>
          <p className="flow-text">
            {flow.reconnect
              ? "The relay routes to it again. Requests that failed while it was signed out were not replayed; your tools retry on their own."
              : "The relay can route requests to it now. It shows up under Subscriptions and in Usage."}
          </p>
          <div className="flow-actions">
            <button type="button" className="button button-primary" onClick={onDone} data-autofocus>
              Done
            </button>
          </div>
        </>
      )}

      {flow.phase === "failed" && (
        <>
          <p className="flow-text" role="alert">
            {flow.message}
          </p>
          <div className="flow-actions">
            <button type="button" className="button" onClick={oauth.reset}>
              Back
            </button>
            <button type="button" className="button button-primary" onClick={() => void oauth.begin(flow.provider, flow.reconnect)}>
              Try again
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function WaitingBody({ oauth, host }: { oauth: Flow; host: string }) {
  const { flow } = oauth;
  const [address, setAddress] = useState("");
  const [pasteOpen, setPasteOpen] = useState(!isLocalBrowser());
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [pasteSent, setPasteSent] = useState(false);
  if (flow.phase !== "waiting") return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPasteError(null);
    try {
      new URL(address.trim());
    } catch {
      setPasteError("Paste the full address from the browser's address bar.");
      return;
    }
    try {
      await oauth.submitRedirect(address);
      setPasteSent(true);
    } catch (error) {
      setPasteError(describeApiError(error));
    }
  };

  return (
    <>
      {flow.userCode ? (
        <div className="flow-text">
          <p>Open {host} and enter this code to approve the relay.</p>
          <div className="code-field">
            <span className="mono code-value">{flow.userCode}</span>
            <CopyButton value={flow.userCode} />
          </div>
        </div>
      ) : (
        <p className="flow-text">
          {flow.opened
            ? `We opened ${host} in a new tab. Approve access there and this updates on its own.`
            : `Open ${host} to approve access. This updates on its own once you're done.`}
        </p>
      )}
      <div className="flow-actions">
        <button type="button" className={flow.opened ? "button" : "button button-primary"} onClick={oauth.reopen}>
          {flow.opened ? "Reopen sign-in page" : "Open sign-in page"}
        </button>
        <CopyButton value={flow.url} label="Copy link" />
        <span className="flow-spacer" />
        <button type="button" className="text-button" onClick={() => void oauth.cancel()}>
          Cancel
        </button>
      </div>
      {!flow.userCode && (
        <div className="paste-fallback">
          {!pasteOpen ? (
            <button type="button" className="text-button" onClick={() => setPasteOpen(true)}>
              Signed in but the last page didn't load?
            </button>
          ) : (
            <form onSubmit={submit} className="paste-form">
              <label className="field">
                <span className="field-label">
                  {isLocalBrowser()
                    ? "If the last page didn't load, paste its address here."
                    : "You're on another machine than the relay, so the provider's last page won't load. Paste its address here."}
                </span>
                <input
                  className="input mono"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  placeholder="http://localhost:…/callback?code=…"
                  spellCheck={false}
                  autoComplete="off"
                  aria-invalid={pasteError ? true : undefined}
                />
              </label>
              {pasteError && (
                <p className="field-error" role="alert">
                  {pasteError}
                </p>
              )}
              {pasteSent && <p className="muted">Sent. Finishing sign-in…</p>}
              <button type="submit" className="button">
                Finish sign-in
              </button>
            </form>
          )}
        </div>
      )}
    </>
  );
}
