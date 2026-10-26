import { useEffect, useRef, useState } from "react";
import { describeApiError } from "../../api/client";
import type { Account } from "../../lib/accounts";
import { formatClock, formatClockSeconds, formatCompact, formatCount, formatDuration } from "../../lib/format";
import { totalRecords, type RequestRecord } from "../../lib/records";
import { useRecords } from "../../state/records";
import { Dialog } from "../../components/Dialog";
import { Notice, StatusDot } from "../../components/Controls";

function retentionText(seconds: number): string {
  if (seconds >= 3600) return "an hour";
  if (seconds % 60 === 0 && seconds >= 120) return `${seconds / 60} minutes`;
  return `${seconds} seconds`;
}

export function DetailOptInDialog({ onClose }: { onClose: () => void }) {
  const records = useRecords();
  const [error, setError] = useState<string | null>(null);
  const alreadyOn = records.relayEnabled === true;
  const confirm = async () => {
    setError(null);
    try {
      await records.start();
      onClose();
    } catch (err) {
      setError(describeApiError(err));
    }
  };
  return (
    <Dialog
      title={alreadyOn ? "Read request records here?" : "Turn on request records?"}
      description={alreadyOn ? "Request records are already on for this relay." : "This changes a relay setting, not just this page."}
      onClose={onClose}
      width={520}
    >
      <ul className="bullets">
        {!alreadyOn && (
          <li>
            The relay starts keeping each request's model, tokens, timing and account for {retentionText(records.retentionSeconds)} (the setting{" "}
            <span className="mono">usage-statistics-enabled</span>).
          </li>
        )}
        <li>This page reads them while it's open. Reading removes them, so another reader of the usage queue would miss them.</li>
        <li>Nothing is saved. Close the tab and the detail is gone; there is no 24 h or 7 d view.</li>
        <li>Prompts and responses are never recorded.</li>
        {!alreadyOn && <li>Records stay on for the relay until you turn them off.</li>}
      </ul>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <button type="button" className="button button-ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="button button-primary" onClick={() => void confirm()} disabled={records.busy}>
          {records.busy ? "Turning on…" : alreadyOn ? "Start reading" : "Turn on"}
        </button>
      </div>
    </Dialog>
  );
}

export function RequestDetailSection({ accounts, lifetime }: { accounts: Account[]; lifetime: number }) {
  const records = useRecords();
  const [optIn, setOptIn] = useState(false);

  if (records.phase === "collecting") return <SessionView accounts={accounts} lifetime={lifetime} />;

  return (
    <section className="card detail-card" aria-labelledby="detail-title">
      <div className="detail-intro">
        <h2 id="detail-title" className="card-title">
          {records.phase === "on-idle" ? "Request records are on for this relay" : "Tokens, models and latency aren't available"}
        </h2>
        <p className="muted">
          {records.phase === "on-idle"
            ? "Something turned on request records, so the relay is keeping them briefly. This page doesn't read them unless you ask."
            : "The relay only shares per-request detail when request records are switched on, and even then it keeps them briefly. Counts above don't need it."}
        </p>
        {records.error != null && records.phase === "unknown" && <p className="field-error">{describeApiError(records.error)}</p>}
        <div className="detail-actions">
          <button type="button" className="button button-primary" onClick={() => setOptIn(true)} disabled={records.phase === "unknown"}>
            {records.phase === "on-idle" ? "Read records in this session" : "Show detail for this session"}
          </button>
          {records.phase === "on-idle" ? (
            <button type="button" className="button" onClick={() => void records.turnOff().catch(() => undefined)} disabled={records.busy}>
              Turn records off
            </button>
          ) : (
            <span className="muted small">Switches request records on for the whole relay</span>
          )}
        </div>
      </div>
      <div className="detail-caveats">
        <h3>Before you switch it on</h3>
        <ul className="bullets">
          <li>Records are held in memory for {retentionText(records.retentionSeconds)}, an hour at most, and lost when the relay restarts.</li>
          <li>Reading a record removes it. If anything else reads the relay's usage queue, it will miss what this page takes.</li>
          <li>You only see requests made while this page is open. Nothing is saved, so there is no 24 h or 7 d view.</li>
          <li>Prompts and responses are never recorded.</li>
        </ul>
      </div>
      {optIn && <DetailOptInDialog onClose={() => setOptIn(false)} />}
    </section>
  );
}

function SessionView({ accounts, lifetime }: { accounts: Account[]; lifetime: number }) {
  const records = useRecords();
  const startLifetime = useRef(lifetime);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 5000);
    return () => window.clearInterval(timer);
  }, []);
  const names = new Map(accounts.filter((account) => account.authIndex).map((account) => [account.authIndex, account.shortName]));
  const totals = totalRecords(records.records);
  const sinceMs = records.since ? now.getTime() - records.since.getTime() : 0;
  const quietFor = records.lastArrival ? now.getTime() - records.lastArrival.getTime() : sinceMs;
  const trafficMoved = lifetime > startLifetime.current;
  const notArriving = sinceMs > 60_000 && quietFor > 60_000 && trafficMoved && records.error == null;

  return (
    <section className="card detail-card is-session" aria-labelledby="session-title">
      <div className="session-head">
        <div>
          <h2 id="session-title" className="card-title">
            Request detail, this session
          </h2>
          <div className="session-line">
            <StatusDot tone="accent" />
            <span>
              Collecting while this tab is open{records.since ? `, since ${formatClock(records.since)}` : ""} · {formatCount(totals.count)} requests seen
            </span>
          </div>
          <p className="muted small">Not saved. Other readers of the usage queue miss what this page reads. Records stay on until you turn them off.</p>
        </div>
        <div className="session-actions">
          <button type="button" className="button button-ghost" onClick={records.stopReading}>
            Stop reading
          </button>
          <button type="button" className="button" onClick={() => void records.turnOff().catch(() => undefined)} disabled={records.busy}>
            Turn records off
          </button>
        </div>
      </div>

      {records.error != null && (
        <Notice tone="bad" title="Couldn't read records">
          {describeApiError(records.error)} Reading retries every few seconds.
        </Notice>
      )}
      {notArriving && (
        <Notice
          tone="warn"
          title="No records in the last minute"
          action={
            <button type="button" className="button" onClick={() => void records.turnOff().catch(() => undefined)}>
              Turn records off
            </button>
          }
        >
          Requests are flowing ({formatCount(lifetime - startLifetime.current)} since you started), but no records reached this page. Something else may be reading the usage queue first.
        </Notice>
      )}

      <div className="stat-row stat-row-tight">
        <Stat value={formatCompact(totals.input)} label="input tokens" />
        <Stat value={formatCompact(totals.output)} label="output tokens" />
        <Stat value={totals.cachedReported ? formatCompact(totals.cached) : "—"} label="cached input" note="where the provider reports it" />
        <Stat value={formatDuration(totals.medianLatencyMs)} label="median total" note={totals.medianTtftMs ? `first token ${formatDuration(totals.medianTtftMs)}` : undefined} />
      </div>

      {records.records.length === 0 ? (
        <p className="muted session-empty">Waiting for the next request. Records show here within a few seconds of arriving.</p>
      ) : (
        <RecordsTable records={records.records.slice(0, 50)} names={names} />
      )}
      <p className="muted small">
        Tool is a label guessed from the client's user agent. A failed request shows the status the provider returned; whether it was retried on another account isn't shown, because
        the records don't link retries.
      </p>
    </section>
  );
}

function Stat({ value, label, note }: { value: string; label: string; note?: string }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {note && <div className="stat-note">{note}</div>}
    </div>
  );
}

export function RecordsTable({ records, names }: { records: RequestRecord[]; names: Map<string, string> }) {
  return (
    <div className="table-scroll">
      <table className="data-table records-table">
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">Tool</th>
            <th scope="col">Model</th>
            <th scope="col">Served by</th>
            <th scope="col" className="num">In</th>
            <th scope="col" className="num">Out</th>
            <th scope="col" className="num">Cached</th>
            <th scope="col" className="num">First token</th>
            <th scope="col" className="num">Total</th>
            <th scope="col">Result</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id}>
              <td>{formatClockSeconds(record.at)}</td>
              <td>{record.tool}</td>
              <td className="mono-ish">{record.model}</td>
              <td>{names.get(record.authIndex) ?? record.provider ?? "—"}</td>
              <td className="num">{record.failed ? "—" : formatCompact(record.input)}</td>
              <td className="num">{record.failed ? "—" : formatCompact(record.output)}</td>
              <td className="num">{record.cached === null || record.failed ? "—" : formatCompact(record.cached)}</td>
              <td className="num">{record.ttftMs ? formatDuration(record.ttftMs) : "—"}</td>
              <td className="num">{formatDuration(record.latencyMs)}</td>
              <td className={record.failed ? "tone-accent" : "tone-live"}>{record.failed ? `${record.statusCode || "failed"}${record.statusCode === 429 ? " rate limit" : ""}` : "200"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
