import { useState } from "react";
import { describeApiError } from "../../api/client";
import type { Account } from "../../lib/accounts";
import { formatAgo, formatClock, formatCount, parseDate } from "../../lib/format";
import { ADVANCED_URL } from "../../lib/session";
import { RANGE_SHORT, type AccountUsage, type UsageRange } from "../../lib/usage";
import { useRecords } from "../../state/records";
import { setAccountPaused, useRelay } from "../../state/relay";
import { AccountStatusText } from "../../components/AccountStatusText";
import { Dialog } from "../../components/Dialog";
import { ProviderMark } from "../../components/Controls";
import { ArrowUpRight } from "../../components/Icons";
import { useToast } from "../../components/Toast";
import { accountReading, QuotaWindows } from "./Capacity";
import { DetailOptInDialog, RecordsTable } from "./RequestDetail";

const REPORTER: Record<string, string> = { claude: "Anthropic", codex: "OpenAI" };

export function AccountDrawer({
  account,
  usage,
  range,
  firstLabel,
  strategy,
  onClose,
}: {
  account: Account | undefined;
  usage: AccountUsage | undefined;
  range: UsageRange;
  firstLabel: string;
  strategy: { name: string };
  onClose: () => void;
}) {
  const { client, refresh, loaded } = useRelay();
  const records = useRecords();
  const toast = useToast();
  const [optIn, setOptIn] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!account && !loaded) {
    return (
      <Dialog title="Loading account" variant="drawer" onClose={onClose}>
        <div className="list-skeleton tall" aria-busy="true" aria-label="Loading account" />
      </Dialog>
    );
  }

  if (!account) {
    return (
      <Dialog title="Account not found" variant="drawer" onClose={onClose}>
        <p className="muted">This account isn't in the relay any more. It may have been removed or renamed.</p>
      </Dialog>
    );
  }

  const now = new Date();
  const reading = accountReading(account);
  const refreshed = parseDate(account.credential.last_refresh);
  const max = Math.max(1, ...(usage?.buckets ?? []).map((bucket) => bucket.success));
  const maxFailed = Math.max(1, ...(usage?.buckets ?? []).map((bucket) => bucket.failed));
  const own = account.authIndex ? records.records.filter((record) => record.authIndex === account.authIndex) : [];
  const paused = account.status.state === "paused";

  const togglePause = async () => {
    setBusy(true);
    try {
      await setAccountPaused(client, account, !paused);
      toast(paused ? `${account.shortName} is back in rotation.` : `${account.shortName} is paused. The relay skips it.`, paused ? "live" : "muted");
      await refresh();
    } catch (error) {
      toast(describeApiError(error), "bad");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={account.shortName}
      variant="drawer"
      onClose={onClose}
      header={
        <div className="drawer-head">
          <ProviderMark color={account.color} size="lg" />
          <div>
            <div className="drawer-title">{account.shortName}</div>
            <div className="muted">
              {account.identity} · {account.plan}
            </div>
          </div>
        </div>
      }
      footer={
        <div className="drawer-actions">
          <button type="button" className="button button-primary" onClick={() => void togglePause()} disabled={busy}>
            {paused ? "Resume this account" : "Pause this account"}
          </button>
          <a className="button" href={ADVANCED_URL}>
            Open in Advanced <ArrowUpRight />
          </a>
        </div>
      }
    >
      <div className="stat-row stat-row-drawer">
        <div className="stat">
          <div className="stat-value">{formatCount(usage?.requests ?? 0)}</div>
          <div className="stat-label">requests, {RANGE_SHORT[range]}</div>
        </div>
        <div className="stat">
          <div className="stat-value">{Math.round((usage?.share ?? 0) * 100)}%</div>
          <div className="stat-label">of the pool</div>
        </div>
        <div className="stat">
          <div className="stat-value">{formatCount(usage?.failed ?? 0)}</div>
          <div className="stat-label">failed attempts</div>
        </div>
        <div className="stat">
          <div className="stat-value">{formatCount(account.credential.success + account.credential.failed)}</div>
          <div className="stat-label">since relay start</div>
        </div>
      </div>

      <h3 className="drawer-section">Every 10 minutes</h3>
      <div className="mini-chart" aria-label={`Requests every 10 minutes for ${account.shortName}`} role="img">
        {(usage?.buckets ?? []).map((bucket, index) => (
          <div key={index} className="mini-col">
            <span className="mini-fail" style={{ opacity: bucket.failed ? 1 : 0, width: `${Math.max(40, (bucket.failed / maxFailed) * 100)}%` }} />
            <span className="mini-bar" style={{ height: `${(bucket.success / max) * 100}%`, background: account.color }} />
          </div>
        ))}
      </div>
      <div className="mini-axis" aria-hidden>
        <span>{firstLabel}</span>
        <span className="is-now">now</span>
      </div>

      <h3 className="drawer-section">Status</h3>
      <dl className="facts">
        <div>
          <dt>Right now</dt>
          <dd>
            <AccountStatusText state={account.status.state} label={account.status.label} />
          </dd>
        </div>
        {account.status.state !== "live" && account.status.detail && (
          <div>
            <dt>Why</dt>
            <dd>{account.status.detail}</dd>
          </div>
        )}
        <div>
          <dt>Routing</dt>
          <dd>{paused ? "Skipped while paused" : `In ${strategy.name.toLowerCase()} while healthy`}</dd>
        </div>
        {refreshed && (
          <div>
            <dt>Sign-in refreshed</dt>
            <dd>{refreshed.toDateString() === now.toDateString() ? `Today ${formatClock(refreshed)}` : refreshed.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</dd>
          </div>
        )}
      </dl>

      {reading && (
        <>
          <div className="drawer-section-row">
            <h3 className="drawer-section">Limits</h3>
            <span className="muted small">
              Reported by {REPORTER[account.provider] ?? account.providerName}
              {reading.observedAt ? ` ${formatAgo(reading.observedAt, now)}` : ""}. Not a forecast.
            </span>
          </div>
          <QuotaWindows reading={reading} color={account.color} now={now} />
        </>
      )}

      {records.phase === "collecting" ? (
        <div className="drawer-records">
          <h3 className="drawer-section">Requests this session</h3>
          {own.length === 0 ? <p className="muted">No records for this account since you started reading.</p> : <RecordsTable records={own.slice(0, 20)} names={new Map([[account.authIndex, account.shortName]])} />}
        </div>
      ) : (
        <div className="callout">
          <div className="callout-title">Models, tokens and latency for this account</div>
          <p className="muted">Needs request detail, which is off. It covers only requests made while the page is open.</p>
          <button type="button" className="text-button" onClick={() => setOptIn(true)}>
            Show detail for this session →
          </button>
        </div>
      )}
      {optIn && <DetailOptInDialog onClose={() => setOptIn(false)} />}
    </Dialog>
  );
}
