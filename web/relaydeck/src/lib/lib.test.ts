import { describe, expect, it } from "vitest";
import type { Credential } from "../api/types";
import { accountStatus, keyAccounts, toAccount } from "./accounts";
import { maskSecret } from "./format";
import { parseModelIds } from "./keycheck";
import { isStale, parseQuota } from "./quota";
import { guessTool, sanitiseRecord } from "./records";
import { summariseUsage } from "./usage";

const NOW = new Date("2026-10-26T15:25:00Z");

function credential(overrides: Partial<Credential>): Credential {
  return {
    id: "c1",
    auth_index: "1",
    name: "claude-maya.json",
    provider: "claude",
    status: "active",
    disabled: false,
    unavailable: false,
    success: 0,
    failed: 0,
    ...overrides,
  };
}

describe("maskSecret", () => {
  it("keeps a recognisable prefix and the last four only", () => {
    expect(maskSecret("sk-or-v1-0123456789abcdef4be8")).toBe("sk-••••••••4be8");
    expect(maskSecret("AIzaSyD-very-secret-3fQk")).toBe("AIza••••••••3fQk");
    expect(maskSecret("short")).toBe("•••••");
    const masked = maskSecret("sk-ant-api03-MIDDLESECRET-tail");
    expect(masked).not.toContain("MIDDLE");
  });
});

describe("accounts", () => {
  it("never exposes the raw upstream key of API-key accounts", () => {
    const account = toAccount(credential({ account_type: "api_key", account: "AIzaSyD-very-secret-3fQk", provider: "gemini", label: "gemini-apikey" }), NOW);
    expect(account.kind).toBe("key");
    expect(account.identity).not.toContain("very-secret");
    expect(account.shortName).toBe("Gemini key");
  });

  it("classifies live, paused, cooling and signed-out states from relay fields only", () => {
    expect(accountStatus(credential({}), NOW).state).toBe("live");
    expect(accountStatus(credential({ disabled: true }), NOW).state).toBe("paused");
    const cooling = accountStatus(
      credential({ status: "error", unavailable: true, cooldowns: [{ scope: "credential", reason: "quota", retry_at: "2026-10-26T15:41:00Z", remaining_seconds: 960, http_status: 429 }] }),
      NOW,
    );
    expect(cooling.state).toBe("cooling");
    expect(cooling.detail).toBe("Provider answered 429");
    expect(accountStatus(credential({ status: "error", unavailable: true, status_message: "401 unauthorized: token expired" }), NOW).state).toBe("signed-out");
    expect(accountStatus(credential({ status: "error", unavailable: true, status_message: "upstream 500" }), NOW).state).toBe("error");
    // A cooldown on one model leaves the account serving others.
    expect(
      accountStatus(credential({ cooldowns: [{ scope: "model", model_key: "x", reason: "quota", retry_at: "2026-10-26T15:41:00Z", remaining_seconds: 960 }] }), NOW).state,
    ).toBe("live");
  });
});

describe("keyAccounts", () => {
  it("joins config keys with their counters and masks them", () => {
    const accounts = keyAccounts(
      {
        gemini: [{ name: "gemini-1", keys: [{ "api-key": "AIzaSyD-very-secret-3fQk", auth_index: "g1" }] }],
        "openai-compatibility": [{ name: "MockRouter", "base-url": "http://up/v1", disabled: true, keys: [{ "api-key": "sk-mock-1", auth_index: "m1" }] }],
      },
      {
        gemini: { "|AIzaSyD-very-secret-3fQk": { success: 5, failed: 0, recent_requests: [{ time: "15:20-15:30", success: 5, failed: 0 }] } },
        mockrouter: { "http://up/v1|sk-mock-1": { success: 9, failed: 2, recent_requests: [] } },
      },
    );
    expect(accounts.map((account) => [account.shortName, account.credential.success, account.status.state])).toEqual([
      ["Gemini key", 5, "live"],
      ["MockRouter key", 9, "paused"],
    ]);
    expect(accounts[0].identity).not.toContain("very-secret");
  });

  it("reports a key whose recent attempts all failed", () => {
    const [account] = keyAccounts(
      { claude: [{ name: "claude-1", keys: [{ "api-key": "sk-ant-x", auth_index: "c" }] }] },
      { claude: { "|sk-ant-x": { success: 0, failed: 4, recent_requests: [{ time: "a", success: 0, failed: 4 }] } } },
    );
    expect(account.status.state).toBe("error");
  });
});

describe("parseQuota", () => {
  it("reads Anthropic unified windows", () => {
    const reading = parseQuota("claude", {
      observed_at: "2026-10-26T15:21:00Z",
      signals: {
        "Anthropic-Ratelimit-Unified-5h-Utilization": "0.64",
        "Anthropic-Ratelimit-Unified-5h-Reset": String(Date.parse("2026-10-26T17:00:00Z") / 1000),
        "Anthropic-Ratelimit-Unified-7d-Utilization": "0.31",
      },
    })!;
    expect(reading.windows.map((window) => [window.label, window.used])).toEqual([
      ["5-hour window", 0.64],
      ["7-day window", 0.31],
    ]);
    expect(reading.windows[0].resetsAt?.toISOString()).toBe("2026-10-26T17:00:00.000Z");
    expect(isStale(reading, NOW)).toBe(false);
  });

  it("reads Codex windows and derives resets from reset-after", () => {
    const reading = parseQuota("codex", {
      observed_at: "2026-10-26T14:00:00Z",
      signals: { "X-Codex-Primary-Used-Percent": "48", "X-Codex-Primary-Window-Minutes": "300", "X-Codex-Primary-Reset-After-Seconds": "3600", "X-Codex-Secondary-Used-Percent": "22", "X-Codex-Secondary-Window-Minutes": "10080" },
    })!;
    expect(reading.windows.map((window) => window.label)).toEqual(["5-hour window", "Weekly window"]);
    expect(reading.windows[0].used).toBeCloseTo(0.48);
    expect(reading.windows[0].resetsAt?.toISOString()).toBe("2026-10-26T15:00:00.000Z");
    expect(isStale(reading, NOW)).toBe(true);
  });

  it("reports nothing for providers without signals", () => {
    expect(parseQuota("gemini", { signals: {} })).toBeNull();
    expect(parseQuota("claude", undefined)).toBeNull();
  });
});

describe("summariseUsage", () => {
  const buckets = (values: [number, number][]) =>
    values.map(([success, failed], index) => ({ time: `${String(12 + Math.floor(index / 6)).padStart(2, "0")}:${(index % 6) * 10}`.padEnd(5, "0") + "-xx", success, failed }));

  it("sums only the buckets in range and computes shares", () => {
    const a = toAccount(credential({ auth_index: "a", recent_requests: buckets(Array.from({ length: 20 }, () => [10, 1])), success: 900, failed: 10 }), NOW);
    const b = toAccount(credential({ auth_index: "b", provider: "codex", recent_requests: buckets(Array.from({ length: 20 }, () => [30, 0])), success: 100, failed: 0 }), NOW);
    const hour = summariseUsage([a, b], "1h");
    expect(hour.buckets).toHaveLength(6);
    expect(hour.requests).toBe(6 * 11 + 6 * 30);
    expect(hour.failed).toBe(6);
    expect(hour.accounts[1].share).toBeCloseTo(180 / 246);
    expect(hour.lifetime).toBe(1010);
    expect(summariseUsage([a, b], "3h").buckets).toHaveLength(18);
  });
});

describe("records", () => {
  it("drops identifying fields and keeps the numbers", () => {
    const record = sanitiseRecord({
      timestamp: "2026-10-26T15:24:40Z",
      model: "claude-sonnet-4-5",
      auth_index: "2",
      api_key: "rdk-secret",
      access_token_sha256: "abc",
      client_ip: "1.2.3.4",
      response_headers: { "Set-Cookie": ["x"] },
      user_agent: "codex_cli_rs/0.50",
      failed: true,
      fail: { status_code: 429, body: "rate limited for org-123" },
      latency_ms: 300,
    })!;
    expect(record.statusCode).toBe(429);
    expect(record.tool).toBe("Codex CLI");
    expect(JSON.stringify(record)).not.toMatch(/rdk-secret|1\.2\.3\.4|org-123|Set-Cookie|codex_cli_rs/);
  });

  it("guesses common tools", () => {
    expect(guessTool("curl/8.5.0")).toBe("curl");
    expect(guessTool("OpenAI/Python 1.40")).toBe("OpenAI SDK");
    expect(guessTool("")).toBe("Unknown");
  });
});

describe("parseModelIds", () => {
  it("reads OpenAI and Gemini model lists", () => {
    expect(parseModelIds(JSON.stringify({ data: [{ id: "b" }, { id: "a" }, { id: "a" }] }))).toEqual(["a", "b"]);
    expect(parseModelIds(JSON.stringify({ models: [{ name: "models/gemini-2.5-pro" }] }))).toEqual(["models/gemini-2.5-pro"]);
    expect(parseModelIds("not json")).toEqual([]);
  });
});
