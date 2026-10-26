import type { RecentBucket } from "../api/types";
import type { Account } from "./accounts";

// The relay keeps 20 ten-minute buckets per account in memory. The newest
// bucket is the current, partial one.
export type UsageRange = "1h" | "3h";

export const RANGE_BUCKETS: Record<UsageRange, number> = { "1h": 6, "3h": 18 };
export const RANGE_LABEL: Record<UsageRange, string> = { "1h": "Last hour", "3h": "Last 3 hours" };
export const RANGE_SHORT: Record<UsageRange, string> = { "1h": "last hour", "3h": "last 3 h" };

export interface BucketSlice {
  label: string; // "15:00"
  span: string; // "15:00–15:10"
  byAccount: Map<string, { success: number; failed: number }>;
  success: number;
  failed: number;
}

export interface AccountUsage {
  account: Account;
  requests: number;
  failed: number;
  share: number;
  buckets: { success: number; failed: number }[];
}

export interface UsageSummary {
  buckets: BucketSlice[];
  accounts: AccountUsage[];
  requests: number;
  failed: number;
  currentBucket: number;
  lifetime: number;
}

function tail<T>(items: T[] | undefined, count: number): T[] {
  if (!items) return [];
  return items.slice(Math.max(0, items.length - count));
}

export function summariseUsage(accounts: Account[], range: UsageRange): UsageSummary {
  const count = RANGE_BUCKETS[range];
  const reference = accounts.find((account) => (account.credential.recent_requests ?? []).length > 0);
  const labels = tail(reference?.credential.recent_requests, count).map((bucket) => bucket.time);
  const buckets: BucketSlice[] = labels.map((time) => ({
    label: time.split("-")[0] ?? time,
    span: time.replace("-", "–"),
    byAccount: new Map(),
    success: 0,
    failed: 0,
  }));

  const usages: AccountUsage[] = accounts.map((account) => {
    const recent: RecentBucket[] = tail(account.credential.recent_requests, count);
    let requests = 0;
    let failed = 0;
    const perBucket = buckets.map(() => ({ success: 0, failed: 0 }));
    recent.forEach((bucket) => {
      // Align by label. Counters for keys and subscriptions come from two
      // requests that can straddle a 10-minute boundary; a bucket the
      // reference doesn't have yet is left for the next refresh.
      const target = labels.indexOf(bucket.time);
      if (target < 0) return;
      perBucket[target] = { success: bucket.success, failed: bucket.failed };
      buckets[target].byAccount.set(account.id, perBucket[target]);
      buckets[target].success += bucket.success;
      buckets[target].failed += bucket.failed;
      requests += bucket.success + bucket.failed;
      failed += bucket.failed;
    });
    return { account, requests, failed, share: 0, buckets: perBucket };
  });

  const total = usages.reduce((sum, usage) => sum + usage.requests, 0);
  for (const usage of usages) usage.share = total > 0 ? usage.requests / total : 0;
  const last = buckets[buckets.length - 1];

  return {
    buckets,
    accounts: usages,
    requests: total,
    failed: usages.reduce((sum, usage) => sum + usage.failed, 0),
    currentBucket: last ? last.success + last.failed : 0,
    lifetime: accounts.reduce((sum, account) => sum + account.credential.success + account.credential.failed, 0),
  };
}

export interface PeakBucket {
  span: string;
  requests: number;
}

export function peakBucket(summary: UsageSummary): PeakBucket | null {
  let best: PeakBucket | null = null;
  for (const bucket of summary.buckets) {
    const requests = bucket.success + bucket.failed;
    if (requests > 0 && (!best || requests > best.requests)) best = { span: bucket.span, requests };
  }
  return best;
}
