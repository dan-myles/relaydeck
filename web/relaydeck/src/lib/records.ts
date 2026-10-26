// Per-request usage records popped from the relay's queue. Only the fields
// shown on screen are kept; keys, client addresses, headers and error bodies
// are dropped as soon as a record arrives.

export interface RequestRecord {
  id: string;
  at: Date;
  model: string;
  provider: string;
  authIndex: string;
  tool: string;
  input: number;
  output: number;
  cached: number | null;
  latencyMs: number;
  ttftMs: number;
  failed: boolean;
  statusCode: number;
}

let sequence = 0;

export function sanitiseRecord(raw: unknown): RequestRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const tokens = (record.tokens ?? {}) as Record<string, unknown>;
  const fail = (record.fail ?? {}) as Record<string, unknown>;
  const at = new Date(String(record.timestamp ?? ""));
  if (Number.isNaN(at.getTime())) return null;
  const cachedPresent = tokens.cache_read_tokens_present === true || num(tokens.cached_tokens) > 0;
  const cached = Math.max(num(tokens.cached_tokens), num(tokens.cache_read_tokens));
  const failed = record.failed === true;
  sequence += 1;
  return {
    id: `${String(record.request_id ?? "")}#${sequence}`,
    at,
    model: str(record.alias) || str(record.model) || "unknown",
    provider: str(record.provider),
    authIndex: str(record.auth_index),
    tool: guessTool(str(record.user_agent)),
    input: num(tokens.input_tokens),
    output: num(tokens.output_tokens),
    cached: cachedPresent ? cached : null,
    latencyMs: num(record.latency_ms),
    ttftMs: num(record.ttft_ms),
    failed,
    statusCode: failed ? num(fail.status_code) : 200,
  };
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

// A label guessed from the client's User-Agent. The raw string is not kept.
export function guessTool(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (!ua) return "Unknown";
  if (ua.includes("claude-cli") || ua.includes("claude-code") || ua.includes("claude code")) return "Claude Code";
  if (ua.includes("codex")) return "Codex CLI";
  if (ua.includes("gemini-cli")) return "Gemini CLI";
  if (ua.includes("opencode")) return "OpenCode";
  if (ua.includes("cursor")) return "Cursor";
  if (ua.includes("curl/")) return "curl";
  if (ua.includes("openai/python") || ua.includes("openai/js") || ua.includes("openai-node")) return "OpenAI SDK";
  if (ua.includes("anthropic/") || ua.includes("anthropic-sdk")) return "Anthropic SDK";
  return "Other client";
}

export interface RecordTotals {
  count: number;
  input: number;
  output: number;
  cached: number;
  cachedReported: boolean;
  medianLatencyMs: number;
  medianTtftMs: number;
}

export function totalRecords(records: RequestRecord[]): RecordTotals {
  const latencies = records.filter((r) => r.latencyMs > 0).map((r) => r.latencyMs);
  const ttfts = records.filter((r) => r.ttftMs > 0).map((r) => r.ttftMs);
  return {
    count: records.length,
    input: records.reduce((sum, r) => sum + r.input, 0),
    output: records.reduce((sum, r) => sum + r.output, 0),
    cached: records.reduce((sum, r) => sum + (r.cached ?? 0), 0),
    cachedReported: records.some((r) => r.cached !== null),
    medianLatencyMs: median(latencies),
    medianTtftMs: median(ttfts),
  };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
