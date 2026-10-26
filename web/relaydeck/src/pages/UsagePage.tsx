import { useMemo, useState } from "react";
import { describeApiError } from "../api/client";
import { isServing, type Account } from "../lib/accounts";
import { formatClockSeconds, formatCount, formatPercent } from "../lib/format";
import { peakBucket, RANGE_LABEL, RANGE_SHORT, summariseUsage, type AccountUsage, type UsageRange } from "../lib/usage";
import { useRelay } from "../state/relay";
import { AccountStatusText } from "../components/AccountStatusText";
import { Notice, ProviderMark, Segmented, StatusDot } from "../components/Controls";
import { ChevronRight, FilterIcon } from "../components/Icons";
import { routeHref } from "../app/route";
import { ActivityChart, ChartLegend, type ChartSeries } from "./usage/ActivityChart";
import { AccountDrawer } from "./usage/AccountDrawer";
import { CapacitySection } from "./usage/Capacity";
import { RequestDetailSection } from "./usage/RequestDetail";

export const STRATEGY_TEXT: Record<string, { name: string; line: string }> = {
  "round-robin": { name: "Round-robin", line: "Round-robin across healthy accounts. Accounts that are cooling or signed out are skipped." },
  "weighted-round-robin": { name: "Weighted", line: "Weighted round-robin across healthy accounts. Accounts that are cooling or signed out are skipped." },
  "fill-first": { name: "Fill-first", line: "Fill-first: one account takes traffic until it hits a limit, then the next. Cooling or signed-out accounts are skipped." },
};

export function strategyText(strategy: string) {
  return STRATEGY_TEXT[strategy] ?? { name: strategy, line: `Routing strategy: ${strategy}.` };
}

export function seriesFor(accounts: Account[]): ChartSeries[] {
  const map = new Map<string, ChartSeries>();
  for (const account of accounts) {
    const key = account.kind === "key" && account.provider.startsWith("openai-compatibility") ? `compat:${account.providerName}` : account.provider;
    const label = account.provider === "codex" ? "Codex" : account.providerName;
    const series = map.get(key) ?? { key, label, color: account.color, members: [] };
    series.members.push(account.id);
    map.set(key, series);
  }
  return Array.from(map.values());
}

export function UsagePage({ accountIndex }: { accountIndex?: string }) {
  const { accounts, loaded, error, updatedAt, strategy, refresh } = useRelay();
  const [range, setRange] = useState<UsageRange>("3h");
  const [provider, setProvider] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const providers = useMemo(() => Array.from(new Map(accounts.map((account) => [account.provider, account.providerName])).entries()), [accounts]);
  const filtered = accounts.filter(
    (account) => (provider === "all" || account.provider === provider) && (accountFilter === "all" || account.id === accountFilter),
  );
  const summary = useMemo(() => summariseUsage(filtered, range), [filtered, range]);
  const series = useMemo(() => seriesFor(filtered), [filtered]);
  const peak = peakBucket(summary);
  const serving = filtered.filter(isServing).length;
  const cooling = filtered.filter((account) => account.status.state === "cooling").length;
  const signedOut = filtered.filter((account) => account.status.state === "signed-out").length;
  const paused = filtered.filter((account) => account.status.state === "paused").length;
  const drawerAccount = accountIndex ? accounts.find((account) => account.id === accountIndex) : undefined;
  const pool = useMemo(() => summariseUsage(accounts, range), [accounts, range]);
  const drawerUsage = drawerAccount ? pool.accounts.find((usage) => usage.account.id === drawerAccount.id) : undefined;
  const strategyInfo = strategyText(strategy);
  const succeeded = summary.requests > 0 ? (summary.requests - summary.failed) / summary.requests : NaN;

  const notServing = [cooling && `${cooling} cooling`, signedOut && `${signedOut} needs sign-in`, paused && `${paused} paused`].filter(Boolean).join(" · ");

  return (
    <div className="page">
      <header className="page-head">
        <h1>Usage</h1>
        <p className="lede">
          {accounts.length > 0
            ? `How your ${accounts.length === 1 ? "one account" : `${formatCount(accounts.length)} pooled accounts`} shared the ${RANGE_SHORT[range] === "last hour" ? "last hour" : "last 3 hours"}, from the relay's own counters.`
            : "How your pooled accounts share the traffic, from the relay's own counters."}
        </p>
      </header>

      <div className="toolbar">
        <Segmented
          label="Time range"
          value={range}
          onChange={setRange}
          options={(Object.keys(RANGE_LABEL) as UsageRange[]).map((value) => ({ value, label: RANGE_LABEL[value] }))}
        />
        <button type="button" className="button filter-toggle" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((value) => !value)}>
          <FilterIcon /> Filter
        </button>
        <div className={filtersOpen ? "filters is-open" : "filters"}>
          <label className="select-chip">
            <span>Provider</span>
            <select value={provider} onChange={(event) => setProvider(event.target.value)}>
              <option value="all">All</option>
              {providers.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="select-chip">
            <span>Account</span>
            <select value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)}>
              <option value="all">All {accounts.length}</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.shortName}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="freshness">
          <StatusDot tone={error ? "bad" : "accent"} />
          <span>
            {updatedAt ? `Updated ${formatClockSeconds(updatedAt)}` : "Loading"} · counters kept in memory for about 3 hours
          </span>
        </div>
      </div>

      {error != null && (
        <Notice tone="bad" title="Couldn't refresh the counters" action={<button className="button" onClick={() => void refresh()}>Try again</button>}>
          {describeApiError(error)} {updatedAt ? `Showing what the relay reported at ${formatClockSeconds(updatedAt)}.` : ""}
        </Notice>
      )}

      {!loaded ? (
        <div className="card list-skeleton tall" aria-busy="true" aria-label="Loading usage" />
      ) : accounts.length === 0 ? (
        <div className="card empty">
          <p className="empty-title">No accounts to measure yet</p>
          <p className="muted">
            Usage counts requests per account. <a href={routeHref({ page: "setup" })}>Add a subscription or key in Setup</a> and requests show up here within ten minutes.
          </p>
        </div>
      ) : (
        <>
          <section className="card stat-row" aria-label="Totals">
            <div className="stat">
              <div className="stat-label">Requests, {RANGE_SHORT[range]}</div>
              <div className="stat-value">{formatCount(summary.requests)}</div>
              <div className="stat-sub">
                {formatCount(summary.currentBucket)} since {summary.buckets[summary.buckets.length - 1]?.label ?? "—"}
              </div>
              <div className="stat-note">Sum of 10-minute counters</div>
            </div>
            <div className="stat">
              <div className="stat-label">Succeeded</div>
              <div className="stat-value">
                {Number.isFinite(succeeded) ? formatPercent(succeeded, succeeded < 1 && succeeded > 0.99 ? 1 : 0) : "—"}
                {Number.isFinite(succeeded) && <span className="stat-unit">%</span>}
              </div>
              <div className="stat-sub">{formatCount(summary.failed)} failed attempts</div>
              <div className="stat-note">Per-account success and failure counts</div>
            </div>
            <div className="stat">
              <div className="stat-label">Accounts serving</div>
              <div className="stat-value">
                {serving}
                <span className="stat-unit"> of {filtered.length}</span>
              </div>
              <div className="stat-sub">{notServing || "All serving"}</div>
              <div className="stat-note">From account status</div>
            </div>
            <div className="stat">
              <div className="stat-label">Since relay start</div>
              <div className="stat-value">{formatCount(summary.lifetime)}</div>
              <div className="stat-sub">Requests across these accounts</div>
              <div className="stat-note">Resets when the relay restarts</div>
            </div>
          </section>

          <section className="card" aria-labelledby="activity-title">
            <div className="card-head">
              <div>
                <h2 id="activity-title" className="card-title">
                  Requests every 10 minutes
                </h2>
                <p className="muted card-lede">
                  {peak
                    ? `Busiest stretch: ${peak.span}, with ${formatCount(peak.requests)} requests.${summary.failed > 0 ? ` ${formatCount(summary.failed)} ${summary.failed === 1 ? "attempt" : "attempts"} failed in this range.` : " Nothing failed in this range."}`
                    : "No requests in this range yet."}
                </p>
              </div>
              <ChartLegend series={series} />
            </div>
            <ActivityChart buckets={summary.buckets} series={series} />
          </section>

          <section className="card" aria-labelledby="accounts-title">
            <div className="card-head">
              <div>
                <h2 id="accounts-title" className="card-title">
                  Accounts
                </h2>
                <p className="muted card-lede">{strategyInfo.line}</p>
              </div>
              <span className="chip">
                <span className="muted">Strategy</span> {strategyInfo.name}
              </span>
            </div>
            <AccountsTable usages={summary.accounts} />
          </section>

          <CapacitySection accounts={filtered} />
          <RequestDetailSection accounts={accounts} lifetime={pool.lifetime} />
        </>
      )}

      {accountIndex && (
        <AccountDrawer
          account={drawerAccount}
          usage={drawerUsage}
          range={range}
          firstLabel={pool.buckets[0]?.label ?? ""}
          strategy={strategyInfo}
          onClose={() => {
            window.location.hash = routeHref({ page: "usage" });
          }}
        />
      )}
    </div>
  );
}

function AccountsTable({ usages }: { usages: AccountUsage[] }) {
  const sorted = [...usages].sort((a, b) => b.requests - a.requests);
  return (
    <div className="accounts-table" role="table" aria-label="Accounts">
      <div className="accounts-row accounts-header" role="row">
        <span role="columnheader">Account</span>
        <span role="columnheader">Share of requests</span>
        <span role="columnheader" className="num">
          Requests
        </span>
        <span role="columnheader" className="num">
          Failed
        </span>
        <span role="columnheader">Status</span>
        <span aria-hidden />
      </div>
      {sorted.map((usage) => {
        const { account } = usage;
        const last = usage.buckets[usage.buckets.length - 1];
        const current = last ? last.success + last.failed : 0;
        const detail =
          account.status.state === "live"
            ? `${formatCount(current)} in the current 10 min`
            : account.status.state === "signed-out"
              ? "Sign in again from Setup"
              : account.status.detail;
        return (
          <a key={account.id} role="row" className="accounts-row" href={routeHref({ page: "usage", account: account.id })}>
            <span role="cell" className="accounts-name">
              <ProviderMark color={account.color} size="sm" />
              <span>
                <span className="row-title">
                  {account.providerName} <span className="row-identity">{account.identity}</span>
                </span>
                <span className="row-sub">{account.plan}</span>
              </span>
            </span>
            <span role="cell" className="accounts-share">
              <span className="share-bar">
                <span style={{ width: `${Math.round(usage.share * 100)}%`, background: account.color }} />
              </span>
              <span className="share-pct">{Math.round(usage.share * 100)}%</span>
            </span>
            <span role="cell" className="num">
              {formatCount(usage.requests)}
            </span>
            <span role="cell" className={usage.failed > 0 && usage.failed / Math.max(usage.requests, 1) > 0.02 ? "num tone-accent" : "num"}>
              {formatCount(usage.failed)}
            </span>
            <span role="cell">
              <AccountStatusText state={account.status.state} label={account.status.label} detail={detail} />
            </span>
            <span role="cell" className="accounts-chevron" aria-hidden>
              <ChevronRight />
            </span>
          </a>
        );
      })}
    </div>
  );
}
