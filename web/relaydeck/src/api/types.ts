// Shapes returned by the v8 management API. Only the fields Relaydeck reads
// are declared; everything else is ignored.

export interface RecentBucket {
  time: string;
  success: number;
  failed: number;
}

export interface CooldownView {
  scope: string;
  model_key?: string;
  reason: string;
  retry_at: string;
  remaining_seconds: number;
  http_status?: number;
}

export interface QuotaObservation {
  observed_at?: string;
  signals?: Record<string, string>;
}

export interface Credential {
  id: string;
  auth_index: string;
  name: string;
  provider: string;
  label?: string;
  status: string;
  status_message?: string;
  disabled: boolean;
  unavailable: boolean;
  runtime_only?: boolean;
  source?: string;
  email?: string;
  account_type?: string;
  // For API-key credentials this is the raw upstream key. Never render it.
  account?: string;
  success: number;
  failed: number;
  recent_requests?: RecentBucket[];
  quota?: QuotaObservation;
  cooldowns?: CooldownView[] | null;
  next_retry_after?: string;
  last_refresh?: string;
  created_at?: string;
  id_token?: { plan_type?: string } | null;
}

export interface CredentialList {
  observed_at: string;
  files: Credential[];
}

export interface ProviderKeyEntry {
  "api-key": string;
  // Injected by the relay on reads; never written back.
  auth_index?: string;
  "excluded-models"?: string[] | null;
  [field: string]: unknown;
}

export interface ProviderKeyGroup {
  name?: string;
  "base-url"?: string;
  "excluded-models"?: string[] | null;
  disabled?: boolean;
  keys?: ProviderKeyEntry[];
  [field: string]: unknown;
}

export type ProviderKeyConfig = Record<string, ProviderKeyGroup[] | null>;

export interface OAuthStart {
  status: string;
  url?: string;
  state?: string;
  flow?: string;
  user_code?: string;
  error?: string;
}

export interface OAuthStatus {
  status: "ok" | "wait" | "error" | string;
  error?: string;
}

export interface ApiCallResult {
  status_code: number;
  body?: string;
}

export interface KeyUsageEntry {
  success: number;
  failed: number;
  recent_requests?: RecentBucket[];
}

// Grouped by provider (or OpenAI-compatible name), keyed by "base_url|api_key".
export type KeyUsage = Record<string, Record<string, KeyUsageEntry>>;
