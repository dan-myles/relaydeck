import { useState } from "react";
import { describeApiError } from "../api/client";
import type { Account } from "../lib/accounts";
import { formatCount } from "../lib/format";
import { ADVANCED_URL } from "../lib/session";
import { setAccountPaused, useRelay } from "../state/relay";
import { AccountStatusText } from "../components/AccountStatusText";
import { Notice, OverflowMenu, ProviderMark, type MenuItem } from "../components/Controls";
import { PlusIcon } from "../components/Icons";
import { useToast } from "../components/Toast";
import { AddKeyDialog } from "./setup/AddKeyDialog";
import { AddSubscriptionDialog } from "./setup/AddSubscriptionDialog";
import { ConnectionsSection } from "./setup/Connections";
import { useOAuthFlow } from "./setup/useOAuthFlow";

export function SetupPage() {
  const { client, accounts, loaded, error, keysError, refresh } = useRelay();
  const [dialog, setDialog] = useState<"subscription" | "key" | null>(null);
  const oauth = useOAuthFlow(client, () => void refresh());

  const subscriptions = accounts.filter((account) => account.source === "credential");
  const keys = accounts.filter((account) => account.source === "config-key");

  return (
    <div className="page">
      <header className="page-head">
        <h1>Setup</h1>
        <p className="lede">Give the relay accounts or keys to draw from, then point your tools at it.</p>
      </header>

      {error != null && (
        <Notice tone="bad" title="Couldn't load accounts" action={<button className="button" onClick={() => void refresh()}>Try again</button>}>
          {describeApiError(error)}
        </Notice>
      )}

      <section className="section" aria-labelledby="subs-title">
        <div className="section-head">
          <div>
            <h2 id="subs-title">Subscriptions</h2>
            <p className="muted">Plans you already pay for. You sign in on the provider's own page.</p>
          </div>
          <button
            type="button"
            className="button button-primary"
            onClick={() => {
              oauth.reset();
              setDialog("subscription");
            }}
          >
            <PlusIcon /> <span className="label-long">Add subscription</span>
            <span className="label-short">Add</span>
          </button>
        </div>
        {!loaded ? (
          <div className="list-skeleton" aria-busy="true" aria-label="Loading subscriptions" />
        ) : subscriptions.length === 0 ? (
          <div className="empty">
            <p className="empty-title">No subscriptions yet</p>
            <p className="muted">Add a Claude, ChatGPT, Antigravity or Grok plan you already pay for. Requests share it with any keys you add.</p>
          </div>
        ) : (
          <ul className="rows">
            {subscriptions.map((account) => (
              <SubscriptionRow
                key={account.id}
                account={account}
                onReconnect={() => {
                  setDialog("subscription");
                  void oauth.begin(account.provider, true);
                }}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="section" aria-labelledby="keys-title">
        <div className="section-head">
          <div>
            <h2 id="keys-title">Provider API keys</h2>
            <p className="muted">Keys from Gemini, OpenAI, Anthropic, xAI, or any OpenAI-compatible endpoint.</p>
          </div>
          <button type="button" className="button" onClick={() => setDialog("key")}>
            <PlusIcon /> <span className="label-long">Add API key</span>
            <span className="label-short">Add</span>
          </button>
        </div>
        {keysError != null && (
          <Notice tone="bad" title="Couldn't read provider keys" action={<button className="button" onClick={() => void refresh()}>Try again</button>}>
            {describeApiError(keysError)}
          </Notice>
        )}
        {!loaded ? (
          <div className="list-skeleton" aria-busy="true" aria-label="Loading provider keys" />
        ) : keys.length === 0 ? (
          keysError == null && (
            <div className="empty">
              <p className="empty-title">No provider keys</p>
              <p className="muted">Add a key if you pay per use. Keys and subscriptions share the traffic.</p>
            </div>
          )
        ) : (
          <ul className="rows">
            {keys.map((account) => (
              <ProviderKeyRow key={account.id} account={account} />
            ))}
          </ul>
        )}
      </section>

      <ConnectionsSection />

      {dialog === "subscription" && <AddSubscriptionDialog oauth={oauth} onClose={() => setDialog(null)} />}
      {dialog === "key" && (
        <AddKeyDialog
          client={client}
          onClose={() => setDialog(null)}
          onSaved={() => {
            void refresh();
            // The relay reloads its config in the background.
            window.setTimeout(() => void refresh(), 1500);
          }}
        />
      )}
    </div>
  );
}

function usePauseAction(account: Account | undefined) {
  const { client, refresh } = useRelay();
  const toast = useToast();
  return async (paused: boolean) => {
    if (!account) return;
    try {
      await setAccountPaused(client, account, paused);
      toast(paused ? `${account.shortName} is paused. The relay skips it.` : `${account.shortName} is back in rotation.`, paused ? "muted" : "live");
      await refresh();
    } catch (error) {
      toast(describeApiError(error), "bad");
    }
  };
}

function accountMenu(account: Account, setPaused: (paused: boolean) => Promise<void>, onReconnect?: () => void): MenuItem[] {
  const items: MenuItem[] = [];
  const shared = account.keyRef && account.keyRef.provider === "openai-compatibility" && account.keyRef.groupSize > 1;
  const suffix = shared ? ` all ${account.keyRef!.groupSize} ${account.providerName} keys` : "";
  if (account.status.state === "paused") items.push({ label: `Resume${suffix}`, onSelect: () => void setPaused(false) });
  else items.push({ label: `Pause${suffix}`, onSelect: () => void setPaused(true) });
  if (onReconnect && account.canReconnect) items.push({ label: "Sign in again", onSelect: onReconnect });
  items.push({ label: "Details in Usage", onSelect: () => (window.location.hash = `#/usage/account/${encodeURIComponent(account.id)}`) });
  items.push({ label: "Open in Advanced", onSelect: () => window.location.assign(ADVANCED_URL) });
  return items;
}

function requestsIn3h(account: Account): number {
  const buckets = account.credential.recent_requests ?? [];
  return buckets.slice(-18).reduce((sum, bucket) => sum + bucket.success + bucket.failed, 0);
}

function rowDetail(account: Account): string {
  const { state, detail } = account.status;
  if (state === "live") return `${formatCount(requestsIn3h(account))} requests in 3 h`;
  return detail;
}

function SubscriptionRow({ account, onReconnect }: { account: Account; onReconnect: () => void }) {
  const setPaused = usePauseAction(account);
  const needsSignIn = account.status.state === "signed-out" && account.canReconnect;
  return (
    <li className={`row ${needsSignIn ? "row-attention" : ""}`}>
      <ProviderMark color={account.color} />
      <div className="row-main">
        <div className="row-title">
          <span>{account.providerName}</span>
          <span className="row-identity">{account.identity}</span>
        </div>
        <div className="row-sub">{account.plan}</div>
      </div>
      <div className="row-status">
        <AccountStatusText state={account.status.state} label={account.status.label} detail={rowDetail(account)} />
      </div>
      {needsSignIn && (
        <button type="button" className="button button-primary row-cta" onClick={onReconnect}>
          Reconnect
        </button>
      )}
      <div className="row-actions">
        <OverflowMenu label={`Actions for ${account.providerName} ${account.identity}`} items={accountMenu(account, setPaused, onReconnect)} />
      </div>
    </li>
  );
}

function ProviderKeyRow({ account }: { account: Account }) {
  const setPaused = usePauseAction(account);
  const ref = account.keyRef!;
  const subtitle =
    ref.provider === "openai-compatibility"
      ? `OpenAI-compatible${ref.baseUrl ? ` · ${hostAndPath(ref.baseUrl)}` : ""}`
      : ref.baseUrl
        ? hostAndPath(ref.baseUrl)
        : "Official endpoint";
  return (
    <li className="row">
      <ProviderMark color={account.color} />
      <div className="row-main">
        <div className="row-title">
          <span>{account.providerName}</span>
          <span className="row-identity mono">{account.identity}</span>
        </div>
        <div className="row-sub">{subtitle}</div>
      </div>
      <div className="row-status">
        <AccountStatusText state={account.status.state} label={account.status.label} detail={rowDetail(account)} />
      </div>
      <div className="row-actions">
        <OverflowMenu label={`Actions for ${account.providerName} key`} items={accountMenu(account, setPaused)} />
      </div>
    </li>
  );
}

function hostAndPath(value: string): string {
  try {
    const url = new URL(value);
    return `${url.host}${url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "")}`;
  } catch {
    return value;
  }
}
