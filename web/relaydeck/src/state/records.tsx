import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ManagementClient } from "../api/client";
import { readUsageRecordsEnabled, readUsageRetentionSeconds, setUsageRecordsEnabled } from "../api/config";
import { popUsageRecords } from "../api/relay";
import { sanitiseRecord, type RequestRecord } from "../lib/records";

// Request detail is strictly opt-in. Nothing here reads the queue until the
// user starts a session, and the session ends when the tab closes.

const POLL_MS = 5_000;
const MAX_RECORDS = 2_000;

export type RecordsPhase = "unknown" | "off" | "on-idle" | "collecting";

export interface RecordsState {
  phase: RecordsPhase;
  // The relay-wide usage-statistics-enabled setting, as last read.
  relayEnabled: boolean | null;
  retentionSeconds: number;
  since: Date | null;
  records: RequestRecord[];
  lastArrival: Date | null;
  error: unknown;
  busy: boolean;
  // Turns the relay setting on if needed, then starts reading in this tab.
  start: () => Promise<void>;
  // Stops reading in this tab; the relay setting is left as it is.
  stopReading: () => void;
  // Stops reading and turns the relay setting off.
  turnOff: () => Promise<void>;
  reload: () => Promise<void>;
}

const RecordsContext = createContext<RecordsState | null>(null);

export function RecordsProvider({ client, children }: { client: ManagementClient; children: ReactNode }) {
  const [relayEnabled, setRelayEnabled] = useState<boolean | null>(null);
  const [retentionSeconds, setRetention] = useState(60);
  const [collecting, setCollecting] = useState(false);
  const [since, setSince] = useState<Date | null>(null);
  const [records, setRecords] = useState<RequestRecord[]>([]);
  const [lastArrival, setLastArrival] = useState<Date | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const polling = useRef(false);

  const reload = useCallback(async () => {
    try {
      const [enabled, retention] = await Promise.all([readUsageRecordsEnabled(client), readUsageRetentionSeconds(client)]);
      setRelayEnabled(enabled);
      setRetention(retention);
      if (!enabled) setCollecting(false);
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, [client]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!collecting) return;
    let cancelled = false;
    const tick = async () => {
      if (polling.current || cancelled) return;
      polling.current = true;
      try {
        const raw = await popUsageRecords(client);
        if (cancelled) return;
        const fresh = raw.map(sanitiseRecord).filter((record): record is RequestRecord => record !== null);
        if (fresh.length > 0) {
          setRecords((current) => [...fresh.reverse(), ...current].slice(0, MAX_RECORDS));
          setLastArrival(new Date());
        }
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        polling.current = false;
      }
    };
    void tick();
    const timer = window.setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [client, collecting]);

  const start = useCallback(async () => {
    setBusy(true);
    try {
      if (!(await readUsageRecordsEnabled(client))) await setUsageRecordsEnabled(client, true);
      setRelayEnabled(true);
      setSince(new Date());
      setRecords([]);
      setLastArrival(null);
      setError(null);
      setCollecting(true);
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setBusy(false);
    }
  }, [client]);

  const stopReading = useCallback(() => setCollecting(false), []);

  const turnOff = useCallback(async () => {
    setBusy(true);
    setCollecting(false);
    try {
      await setUsageRecordsEnabled(client, false);
      setRelayEnabled(false);
      setError(null);
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setBusy(false);
    }
  }, [client]);

  const phase: RecordsPhase = collecting
    ? "collecting"
    : relayEnabled === null
      ? "unknown"
      : relayEnabled
        ? "on-idle"
        : "off";

  const value = useMemo(
    () => ({ phase, relayEnabled, retentionSeconds, since, records, lastArrival, error, busy, start, stopReading, turnOff, reload }),
    [phase, relayEnabled, retentionSeconds, since, records, lastArrival, error, busy, start, stopReading, turnOff, reload],
  );
  return <RecordsContext.Provider value={value}>{children}</RecordsContext.Provider>;
}

export function useRecords(): RecordsState {
  const value = useContext(RecordsContext);
  if (!value) throw new Error("useRecords outside RecordsProvider");
  return value;
}
