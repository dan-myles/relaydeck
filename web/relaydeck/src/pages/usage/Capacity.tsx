import type { Account } from "../../lib/accounts";
import { formatAgo, formatResetTime } from "../../lib/format";
import { isStale, parseQuota, type QuotaReading } from "../../lib/quota";
import { Meter } from "../../components/Controls";

const REPORTS_LIMITS = new Set(["claude", "codex"]);

export function accountReading(account: Account): QuotaReading | null {
  return parseQuota(account.provider, account.credential.quota);
}

export function QuotaWindows({ reading, color, now }: { reading: QuotaReading; color: string; now: Date }) {
  return (
    <div className="quota-windows">
      {reading.windows.map((window) => {
        const full = window.used >= 0.995;
        return (
          <div key={window.label} className="quota-window">
            <div className="quota-line">
              <span>{window.label}</span>
              <strong className={full ? "tone-accent" : undefined}>{Math.round(window.used * 100)}% used</strong>
            </div>
            <Meter value={window.used} color={full ? "var(--accent)" : color} label={`${window.label} used`} />
            {window.resetsAt && <div className="quota-reset">Resets {formatResetTime(window.resetsAt, now)}</div>}
          </div>
        );
      })}
    </div>
  );
}

export function CapacitySection({ accounts }: { accounts: Account[] }) {
  const now = new Date();
  const withReading = accounts.map((account) => ({ account, reading: accountReading(account) }));
  const reported = withReading.filter((item) => item.reading !== null) as { account: Account; reading: QuotaReading }[];
  const waiting = withReading.filter((item) => item.reading === null && REPORTS_LIMITS.has(item.account.provider)).map((item) => item.account);
  const silentNames = Array.from(new Set(withReading.filter((item) => !REPORTS_LIMITS.has(item.account.provider)).map((item) => item.account.providerName)));

  return (
    <section className="card" aria-labelledby="cap-title">
      <h2 id="cap-title" className="card-title">
        Capacity and resets
      </h2>
      <p className="muted card-lede">The last limits each provider reported in a response. A reading, not a forecast: it only changes when that account serves a request.</p>
      {accounts.length === 0 ? (
        <p className="muted">No accounts match.</p>
      ) : (
        <div className="capacity-grid">
          {reported.map(({ account, reading }) => {
            const stale = isStale(reading, now);
            return (
              <article key={account.id} className="capacity-card">
                <header className="capacity-head">
                  <span className="capacity-name">
                    <span className="dot" style={{ background: account.color }} aria-hidden />
                    {account.shortName}
                  </span>
                  <span className={stale ? "capacity-age tone-warn" : "capacity-age"}>
                    {reading.observedAt ? `Reported ${formatAgo(reading.observedAt, now)}` : "Reported"}
                  </span>
                </header>
                <QuotaWindows reading={reading} color={account.color} now={now} />
                {stale && <p className="capacity-note tone-warn">Old reading: no traffic since. Refreshes on the next request.</p>}
              </article>
            );
          })}
          {waiting.length > 0 && (
            <article className="capacity-card capacity-quiet">
              <h3>No reading yet</h3>
              <p className="muted">
                {waiting.map((account) => account.shortName).join(", ")} report limits only after serving a request since the relay started.
              </p>
            </article>
          )}
          {silentNames.length > 0 && (
            <article className="capacity-card capacity-quiet">
              <h3>{joinNames(silentNames)}</h3>
              <p className="muted">These providers don't report limits, so there is nothing to show.</p>
            </article>
          )}
        </div>
      )}
    </section>
  );
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
