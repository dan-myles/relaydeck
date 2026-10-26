import { isKeyPaused } from "../api/config";
import type { Credential, KeyUsage, ProviderKeyGroup } from "../api/types";
import { formatClock, maskSecret, parseDate } from "./format";
import { providerInfo, subscriptionOption } from "./providers";

export type AccountState = "live" | "cooling" | "signed-out" | "paused" | "error";

export interface AccountStatus {
  state: AccountState;
  label: string;
  detail: string;
  until: Date | null;
}

// Where a provider key lives in the config, for pausing it.
export interface KeyRef {
  provider: string;
  apiKey: string;
  groupName: string;
  baseUrl: string;
  // Keys sharing the group; pausing an OpenAI-compatible key pauses them all.
  groupSize: number;
}

export interface Account {
  // Subscriptions come from the credentials list. Provider keys come from the
  // config and their counters from the API-key usage endpoint; the relay has
  // no cooldown view for them, so their status is derived from counters only.
  source: "credential" | "config-key";
  keyRef?: KeyRef;
  credential: Credential;
  // Stable id for routes and lists. Never contains a secret.
  id: string;
  // The relay's auth index, used to match request records. Empty when the
  // relay is not currently running the account (a paused provider group).
  authIndex: string;
  provider: string;
  providerName: string;
  color: string;
  kind: "subscription" | "key";
  // Short name for tables and charts: "Claude maya", "OpenRouter key".
  shortName: string;
  // Account identity: an email for subscriptions, a masked key for API keys.
  identity: string;
  plan: string;
  status: AccountStatus;
  canReconnect: boolean;
}

const SIGNED_OUT_PATTERN = /(unauthori[sz]ed|401|invalid[_ ]grant|expired|revoked|sign[- ]?in|re-?auth|refresh token|invalid token)/i;

export function accountStatus(credential: Credential, now: Date = new Date()): AccountStatus {
  if (credential.disabled || credential.status === "disabled") {
    return { state: "paused", label: "Paused", detail: "Skipped until you resume it", until: null };
  }
  const message = (credential.status_message ?? "").trim();
  const cooldown = earliestCooldown(credential, now);
  if (credential.status === "error" && SIGNED_OUT_PATTERN.test(message) && !cooldown) {
    return { state: "signed-out", label: "Sign-in expired", detail: "Needs you to sign in again", until: null };
  }
  if (cooldown) {
    return {
      state: "cooling",
      label: `Cooling until ${formatClock(cooldown.at)}`,
      detail: cooldown.status ? `Provider answered ${cooldown.status}` : "Waiting out a provider limit",
      until: cooldown.at,
    };
  }
  if (credential.unavailable || credential.status === "error") {
    return { state: "error", label: "Not available", detail: message || "The relay is skipping it", until: null };
  }
  if (credential.status === "pending" || credential.status === "refreshing") {
    return { state: "live", label: "Refreshing", detail: "Renewing its sign-in", until: null };
  }
  return { state: "live", label: "Live", detail: "", until: null };
}

function earliestCooldown(credential: Credential, now: Date): { at: Date; status?: number } | null {
  let best: { at: Date; status?: number } | null = null;
  for (const view of credential.cooldowns ?? []) {
    // Model-scoped cooldowns leave the account serving other models.
    if (view.scope !== "credential") continue;
    const at = parseDate(view.retry_at);
    if (!at || at <= now) continue;
    if (!best || at < best.at) best = { at, status: view.http_status };
  }
  if (!best) {
    const next = parseDate(credential.next_retry_after);
    if (next && next > now && credential.unavailable) best = { at: next };
  }
  return best;
}

export function toAccount(credential: Credential, now: Date = new Date()): Account {
  const kind = credential.account_type === "api_key" ? "key" : "subscription";
  const info = providerInfo(credential.provider, credential.label);
  const email = credential.email?.trim() || (kind === "subscription" ? credential.account?.trim() : "") || "";
  const identity = kind === "key" ? (credential.account ? maskSecret(credential.account) : "key") : email || credential.name;
  const shortName = kind === "key" ? `${info.name} key` : `${info.name} ${email ? email.split("@")[0] : credential.name}`;
  const status = accountStatus(credential, now);
  return {
    source: "credential",
    credential,
    id: `sub-${credential.auth_index}`,
    authIndex: credential.auth_index,
    provider: info.id,
    providerName: info.name,
    color: info.color,
    kind,
    shortName,
    identity,
    plan: planLabel(credential, kind),
    status,
    canReconnect: kind === "subscription" && subscriptionOption(credential.provider) !== undefined,
  };
}

function planLabel(credential: Credential, kind: "subscription" | "key"): string {
  if (kind === "key") return isCompatProvider(credential.provider) ? "OpenAI-compatible" : "API key";
  const plan = credential.id_token?.plan_type?.trim();
  const provider = credential.provider.toLowerCase();
  if (provider === "codex") return plan ? `${capitalise(plan)} subscription · Codex` : "Subscription · Codex";
  if (plan) return `${capitalise(plan)} subscription`;
  return "Subscription";
}

export function isCompatProvider(provider: string): boolean {
  return provider.trim().toLowerCase().startsWith("openai-compatibility");
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// Accounts the relay can route to right now.
export function isServing(account: Account): boolean {
  return account.status.state === "live";
}

export function keyStatus(credential: Credential): AccountStatus {
  if (credential.disabled) return { state: "paused", label: "Paused", detail: "Skipped until you resume it", until: null };
  const recent = (credential.recent_requests ?? []).slice(-3);
  const success = recent.reduce((sum, bucket) => sum + bucket.success, 0);
  const failed = recent.reduce((sum, bucket) => sum + bucket.failed, 0);
  if (failed > 0 && success === 0) {
    return { state: "error", label: "Failing", detail: `${failed} failed in the last 30 min, none succeeded`, until: null };
  }
  return { state: "live", label: "In rotation", detail: "", until: null };
}

// Builds one account per provider key in the config, with its counters.
export function keyAccounts(groupsByProvider: Record<string, ProviderKeyGroup[]>, usage: KeyUsage): Account[] {
  const accounts: Account[] = [];
  for (const [provider, groups] of Object.entries(groupsByProvider)) {
    groups.forEach((group) => {
      (group.keys ?? []).forEach((key) => {
        const apiKey = typeof key["api-key"] === "string" ? key["api-key"] : "";
        if (!apiKey) return;
        const baseUrl = typeof group["base-url"] === "string" ? group["base-url"].trim() : "";
        const compat = provider === "openai-compatibility";
        const groupName = typeof group.name === "string" ? group.name : "";
        const bucketKey = compat ? groupName.toLowerCase() || "openai-compatibility" : provider;
        const counters = findKeyUsage(usage[bucketKey], baseUrl, apiKey);
        const authIndex = typeof key.auth_index === "string" ? key.auth_index : "";
        const id = `key-${provider}-${fingerprint(`${groupName}|${baseUrl}|${apiKey}`)}`;
        const credential: Credential = {
          id,
          auth_index: authIndex,
          name: "",
          provider: compat ? "openai-compatibility" : provider,
          label: compat ? groupName : undefined,
          status: "active",
          disabled: isKeyPaused(group, key, provider),
          unavailable: false,
          account_type: "api_key",
          account: apiKey,
          success: counters?.success ?? 0,
          failed: counters?.failed ?? 0,
          recent_requests: counters?.recent_requests ?? [],
        };
        const info = providerInfo(credential.provider, compat ? displayCompatName(groupName) : undefined);
        accounts.push({
          source: "config-key",
          keyRef: { provider, apiKey, groupName, baseUrl, groupSize: (group.keys ?? []).length },
          credential,
          id,
          authIndex,
          provider: info.id,
          providerName: info.name,
          color: info.color,
          kind: "key",
          shortName: `${info.name} key`,
          identity: maskSecret(apiKey),
          plan: compat ? "OpenAI-compatible" : "API key",
          status: keyStatus(credential),
          canReconnect: false,
        });
      });
    });
  }
  return accounts;
}

function findKeyUsage(bucket: KeyUsage[string] | undefined, baseUrl: string, apiKey: string) {
  if (!bucket) return undefined;
  const exact = bucket[`${baseUrl}|${apiKey}`];
  if (exact) return exact;
  const match = Object.entries(bucket).find(([composite]) => composite.endsWith(`|${apiKey}`));
  return match?.[1];
}

export function displayCompatName(name: string): string {
  if (!name) return "OpenAI-compatible";
  if (/[A-Z]/.test(name)) return name;
  return name
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

// FNV-1a over the key material: a short stable id that reveals nothing.
function fingerprint(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
