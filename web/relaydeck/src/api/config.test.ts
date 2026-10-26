import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeRelay } from "../test/fakeRelay";
import { ApiError, ManagementClient } from "./client";
import { addProviderKey, isKeyPaused, readAccessKeys, setProviderKeyPaused, setUsageRecordsEnabled, uniqueGroupName } from "./config";

afterEach(() => vi.unstubAllGlobals());

const client = () => new ManagementClient("mgmt-secret");

describe("addProviderKey", () => {
  it("appends a group with If-Match and keeps existing groups untouched", async () => {
    const existing = [
      { name: "gemini-1", "base-url": "https://generativelanguage.googleapis.com", keys: [{ "api-key": "AIza-old-key-0001", auth_index: "7", weight: 3 }], priority: 2 },
    ];
    const relay = fakeRelay({
      "GET /v8/management/config/api-keys/gemini": { body: existing, headers: { ETag: '"hash-1"' } },
      "PUT /v8/management/config/api-keys/gemini": { body: { status: "ok" } },
    });

    await addProviderKey(client(), { provider: "gemini", apiKey: "AIza-new-key-0002" });

    const put = relay.calls.find((call) => call.method === "PUT")!;
    expect(put.path).toBe("/v8/management/config/api-keys/gemini");
    expect(put.headers["if-match"]).toBe('"hash-1"');
    expect(put.headers.authorization).toBe("Bearer mgmt-secret");
    expect(put.body).toEqual([
      { name: "gemini-1", "base-url": "https://generativelanguage.googleapis.com", keys: [{ "api-key": "AIza-old-key-0001", weight: 3 }], priority: 2 },
      { name: "gemini-2", keys: [{ "api-key": "AIza-new-key-0002" }] },
    ]);
    // Only the provider's own list is written; other providers and settings are not sent.
    expect(relay.calls.filter((call) => call.method !== "GET")).toHaveLength(1);
  });

  it("creates the list when the provider has none, guarded by the document ETag", async () => {
    const relay = fakeRelay({
      "GET /v8/management/config/api-keys/codex": { status: 404, body: { error: "not_found" } },
      "GET /v8/management/config": { body: {}, headers: { ETag: '"doc-hash"' } },
      "PUT /v8/management/config/api-keys/codex": { body: { status: "ok" } },
    });

    await addProviderKey(client(), { provider: "codex", apiKey: "sk-proj-abcdef123456", baseUrl: "https://api.openai.com/v1" });

    const put = relay.calls.find((call) => call.method === "PUT")!;
    expect(put.headers["if-match"]).toBe('"doc-hash"');
    expect(put.body).toEqual([{ name: "codex-1", "base-url": "https://api.openai.com/v1", keys: [{ "api-key": "sk-proj-abcdef123456" }] }]);
  });

  it("re-reads and re-applies once when the config changed in between", async () => {
    let reads = 0;
    let writes = 0;
    const relay = fakeRelay({
      "GET /v8/management/config/api-keys/openai-compatibility": () => {
        reads += 1;
        return reads === 1
          ? { body: [], headers: { ETag: '"v1"' } }
          : { body: [{ name: "deepseek", "base-url": "https://api.deepseek.com/v1", keys: [{ "api-key": "sk-ds-1111" }] }], headers: { ETag: '"v2"' } };
      },
      "PUT /v8/management/config/api-keys/openai-compatibility": () => {
        writes += 1;
        return writes === 1 ? { status: 412, body: { error: "precondition_failed" } } : { body: { status: "ok" } };
      },
    });

    await addProviderKey(client(), {
      provider: "openai-compatibility",
      apiKey: "sk-or-v1-zzzz9999",
      baseUrl: "https://openrouter.ai/api/v1",
      groupName: "OpenRouter",
      models: ["moonshotai/kimi-k2"],
    });

    const puts = relay.calls.filter((call) => call.method === "PUT");
    expect(puts).toHaveLength(2);
    expect(puts[1].headers["if-match"]).toBe('"v2"');
    expect(puts[1].body).toEqual([
      { name: "deepseek", "base-url": "https://api.deepseek.com/v1", keys: [{ "api-key": "sk-ds-1111" }] },
      { name: "OpenRouter", "base-url": "https://openrouter.ai/api/v1", keys: [{ "api-key": "sk-or-v1-zzzz9999" }], models: [{ name: "moonshotai/kimi-k2" }] },
    ]);
  });

  it("gives up after a second conflict instead of overwriting", async () => {
    fakeRelay({
      "GET /v8/management/config/api-keys/claude": { body: [], headers: { ETag: '"v1"' } },
      "PUT /v8/management/config/api-keys/claude": { status: 412, body: { error: "precondition_failed" } },
    });
    await expect(addProviderKey(client(), { provider: "claude", apiKey: "sk-ant-api03-xyz" })).rejects.toMatchObject({ status: 412, kind: "conflict" });
  });

  it("refuses to add a key that is already configured", async () => {
    const relay = fakeRelay({
      "GET /v8/management/config/api-keys/claude": { body: [{ name: "claude-1", keys: [{ "api-key": "sk-ant-dup" }] }], headers: { ETag: '"v1"' } },
    });
    await expect(addProviderKey(client(), { provider: "claude", apiKey: "sk-ant-dup" })).rejects.toBeInstanceOf(ApiError);
    expect(relay.calls.some((call) => call.method === "PUT")).toBe(false);
  });

  it("surfaces validation errors from the relay", async () => {
    fakeRelay({
      "GET /v8/management/config/api-keys/xai": { body: [], headers: { ETag: '"v1"' } },
      "PUT /v8/management/config/api-keys/xai": { status: 400, body: { error: "invalid_config", message: "api-keys.xai[0].base-url is invalid" } },
    });
    await expect(addProviderKey(client(), { provider: "xai", apiKey: "xai-123456789" })).rejects.toMatchObject({ message: "api-keys.xai[0].base-url is invalid" });
  });
});

describe("usage records setting", () => {
  it("writes the relay-wide flag with If-Match", async () => {
    const relay = fakeRelay({
      "GET /v8/management/config/observability/usage/usage-statistics-enabled": { body: false, headers: { ETag: '"h"' } },
      "PUT /v8/management/config/observability/usage/usage-statistics-enabled": { body: { status: "ok" } },
    });
    await setUsageRecordsEnabled(client(), true);
    const put = relay.calls.find((call) => call.method === "PUT")!;
    expect(put.body).toBe(true);
    expect(put.headers["if-match"]).toBe('"h"');
  });
});

describe("readAccessKeys", () => {
  it("reads client access keys without writing anything", async () => {
    const relay = fakeRelay({ "GET /v8/management/config/access/api-keys": { body: ["rdk-one", "rdk-two"] } });
    expect(await readAccessKeys(client())).toEqual(["rdk-one", "rdk-two"]);
    expect(relay.calls.every((call) => call.method === "GET")).toBe(true);
  });

  it("treats a missing list as no keys", async () => {
    fakeRelay({
      "GET /v8/management/config/access/api-keys": { status: 404, body: { error: "not_found" } },
      "GET /v8/management/config": { body: {} },
    });
    expect(await readAccessKeys(client())).toEqual([]);
  });
});

describe("uniqueGroupName", () => {
  it("numbers generic groups and keeps named upstreams", () => {
    expect(uniqueGroupName([{ name: "gemini-1" }], "gemini")).toBe("gemini-2");
    expect(uniqueGroupName([], "OpenRouter", true)).toBe("OpenRouter");
    expect(uniqueGroupName([{ name: "openrouter" }], "OpenRouter", true)).toBe("OpenRouter-2");
  });
});

describe("setProviderKeyPaused", () => {
  const groups = () => [
    {
      name: "MockRouter",
      "base-url": "https://example.test/v1",
      "excluded-models": ["legacy-*"],
      keys: [{ "api-key": "sk-a", auth_index: "1" }, { "api-key": "sk-b", auth_index: "2", weight: 2 }],
      models: [{ name: "m" }],
    },
  ];

  it("pauses one key with the relay's '*' exclusion and leaves the rest as they were", async () => {
    const relay = fakeRelay({
      "GET /v8/management/config/api-keys/xai": { body: groups(), headers: { ETag: '"e1"' } },
      "PUT /v8/management/config/api-keys/xai": { body: { status: "ok" } },
    });
    await setProviderKeyPaused(client(), "xai", "sk-b", true);
    const put = relay.calls.find((call) => call.method === "PUT")!;
    expect(put.headers["if-match"]).toBe('"e1"');
    expect(put.body).toEqual([
      {
        name: "MockRouter",
        "base-url": "https://example.test/v1",
        "excluded-models": ["legacy-*"],
        keys: [{ "api-key": "sk-a" }, { "api-key": "sk-b", weight: 2, "excluded-models": ["legacy-*", "*"] }],
        models: [{ name: "m" }],
      },
    ]);
  });

  it("resumes by dropping the override when it only repeated the group's list", async () => {
    const paused = groups();
    paused[0].keys[1] = { ...paused[0].keys[1], "excluded-models": ["legacy-*", "*"] } as never;
    expect(isKeyPaused(paused[0], paused[0].keys[1])).toBe(true);
    const relay = fakeRelay({
      "GET /v8/management/config/api-keys/xai": { body: paused, headers: { ETag: '"e2"' } },
      "PUT /v8/management/config/api-keys/xai": { body: { status: "ok" } },
    });
    await setProviderKeyPaused(client(), "xai", "sk-b", false);
    const put = relay.calls.find((call) => call.method === "PUT")!;
    expect((put.body as { keys: unknown[] }[])[0].keys[1]).toEqual({ "api-key": "sk-b", weight: 2 });
  });

  it("pauses an OpenAI-compatible upstream with its group flag", async () => {
    const relay = fakeRelay({
      "GET /v8/management/config/api-keys/openai-compatibility": { body: groups(), headers: { ETag: '"e4"' } },
      "PUT /v8/management/config/api-keys/openai-compatibility": { body: { status: "ok" } },
    });
    await setProviderKeyPaused(client(), "openai-compatibility", "sk-a", true);
    const body = relay.calls.find((call) => call.method === "PUT")!.body as Record<string, unknown>[];
    expect(body[0].disabled).toBe(true);
    expect(body[0].keys).toEqual([{ "api-key": "sk-a" }, { "api-key": "sk-b", weight: 2 }]);
  });

  it("fails clearly when the key is gone", async () => {
    fakeRelay({ "GET /v8/management/config/api-keys/gemini": { body: [], headers: { ETag: '"e3"' } } });
    await expect(setProviderKeyPaused(client(), "gemini", "nope", true)).rejects.toMatchObject({ code: "key_not_found" });
  });
});
