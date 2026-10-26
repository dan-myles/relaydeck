// Masks a secret to a short recognisable form: a prefix and the last four.
// The middle is never kept, so the result is safe to render and screenshot.
export function maskSecret(secret: string, dots = 8): string {
  const value = secret.trim();
  if (value.length <= 8) return "•".repeat(Math.max(value.length, 4));
  const dash = value.indexOf("-", 1);
  const prefixLength = dash > 0 && dash <= 6 ? dash + 1 : Math.min(4, value.length - 8);
  return value.slice(0, prefixLength) + "•".repeat(dots) + value.slice(-4);
}

const numberFormat = new Intl.NumberFormat("en-US");

export function formatCount(value: number): string {
  return numberFormat.format(Math.round(value));
}

export function formatCompact(value: number): string {
  if (value >= 1_000_000) return `${trimZero((value / 1_000_000).toFixed(1))}M`;
  if (value >= 10_000) return `${Math.round(value / 1000)}k`;
  if (value >= 1000) return `${trimZero((value / 1000).toFixed(1))}k`;
  return String(Math.round(value));
}

function trimZero(value: string): string {
  return value.endsWith(".0") ? value.slice(0, -2) : value;
}

export function formatPercent(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return "—";
  return (value * 100).toFixed(digits);
}

export function formatClock(date: Date): string {
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function formatClockSeconds(date: Date): string {
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// "17:00" today, "Mon 08:00" within a week, otherwise a short date.
export function formatResetTime(date: Date, now: Date = new Date()): string {
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return formatClock(date);
  const days = (date.getTime() - now.getTime()) / 86_400_000;
  if (days > 0 && days < 7) {
    return `${date.toLocaleDateString("en-GB", { weekday: "short" })} ${formatClock(date)}`;
  }
  return `${date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} ${formatClock(date)}`;
}

export function formatAgo(date: Date, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds} s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest === 0 ? `${hours} h ago` : `${hours} h ${rest} min ago`;
  const days = Math.floor(hours / 24);
  return `${days} d ago`;
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${trimZero((ms / 1000).toFixed(1))} s`;
}

export function parseDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getFullYear() < 2000) return null;
  return date;
}
