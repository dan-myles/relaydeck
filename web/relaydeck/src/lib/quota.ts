import type { QuotaObservation } from "../api/types";
import { parseDate } from "./format";

// A capacity window parsed from the last response headers the provider sent.
export interface QuotaWindow {
  label: string;
  used: number; // 0..1
  resetsAt: Date | null;
}

export interface QuotaReading {
  observedAt: Date | null;
  windows: QuotaWindow[];
}

// Readings older than this are flagged: they only change when the account
// serves a request, so an idle or limited account keeps an old snapshot.
export const STALE_READING_MS = 60 * 60 * 1000;

export function parseQuota(provider: string, quota: QuotaObservation | undefined): QuotaReading | null {
  const signals = normalise(quota?.signals);
  if (Object.keys(signals).length === 0) return null;
  const observedAt = parseDate(quota?.observed_at);
  const windows =
    provider === "claude"
      ? claudeWindows(signals)
      : provider === "codex"
        ? codexWindows(signals, observedAt)
        : [];
  if (windows.length === 0) return null;
  return { observedAt, windows };
}

function normalise(signals: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(signals ?? {})) out[key.toLowerCase()] = value;
  return out;
}

function claudeWindows(signals: Record<string, string>): QuotaWindow[] {
  const windows: QuotaWindow[] = [];
  for (const [id, label] of [
    ["5h", "5-hour window"],
    ["7d", "7-day window"],
  ] as const) {
    const used = fraction(signals[`anthropic-ratelimit-unified-${id}-utilization`], 1);
    if (used === null) continue;
    windows.push({ label, used, resetsAt: unixSeconds(signals[`anthropic-ratelimit-unified-${id}-reset`]) });
  }
  return windows;
}

function codexWindows(signals: Record<string, string>, observedAt: Date | null): QuotaWindow[] {
  const windows: QuotaWindow[] = [];
  for (const id of ["primary", "secondary"] as const) {
    const used = fraction(signals[`x-codex-${id}-used-percent`], 100);
    if (used === null) continue;
    const minutes = Number(signals[`x-codex-${id}-window-minutes`]);
    let resetsAt = unixSeconds(signals[`x-codex-${id}-reset-at`]);
    const after = Number(signals[`x-codex-${id}-reset-after-seconds`]);
    if (!resetsAt && observedAt && Number.isFinite(after)) resetsAt = new Date(observedAt.getTime() + after * 1000);
    windows.push({ label: windowLabel(id, minutes), used, resetsAt });
  }
  return windows;
}

function windowLabel(id: "primary" | "secondary", minutes: number): string {
  if (Number.isFinite(minutes) && minutes > 0) {
    if (minutes === 10080) return "Weekly window";
    if (minutes % 1440 === 0) return `${minutes / 1440}-day window`;
    if (minutes % 60 === 0) return `${minutes / 60}-hour window`;
    return `${minutes}-minute window`;
  }
  return id === "primary" ? "Primary window" : "Secondary window";
}

function fraction(raw: string | undefined, scale: number): number | null {
  if (raw === undefined) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return Math.min(Math.max(value / scale, 0), 1);
}

function unixSeconds(raw: string | undefined): Date | null {
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return new Date(value * 1000);
}

export function isStale(reading: QuotaReading, now: Date = new Date()): boolean {
  return reading.observedAt !== null && now.getTime() - reading.observedAt.getTime() > STALE_READING_MS;
}
