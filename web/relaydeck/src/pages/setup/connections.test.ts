import { afterEach, describe, expect, it, vi } from "vitest";
import { snippetFor, testConnection } from "./Connections";

afterEach(() => vi.unstubAllGlobals());

function respond(status: number, body: unknown, headers: Record<string, string> = {}) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status, headers }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("testConnection", () => {
  it("calls /v1/models with the client access key, not the management key", async () => {
    const fetchMock = respond(200, { data: [{ id: "a" }, { id: "b" }] });
    const result = await testConnection("http://127.0.0.1:8317", "rdk-1234");
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:8317/v1/models", expect.objectContaining({ headers: { Authorization: "Bearer rdk-1234" } }));
    expect(result.tone).toBe("live");
    expect(result.body).toContain("2 models");
  });

  it("explains a rejected access key", async () => {
    respond(401, { error: "invalid api key" });
    expect((await testConnection("http://h", "x")).title).toBe("Access key not accepted");
  });

  it("explains safe mode", async () => {
    respond(403, { error: "unsafe_example_api_key" }, { "X-CPA-SAFE-MODE": "example-api-key" });
    expect((await testConnection("http://h", "x")).title).toBe("Proxy is in safe mode");
  });

  it("explains an empty pool", async () => {
    respond(200, { data: [] });
    expect((await testConnection("http://h", "x")).title).toBe("No accounts available");
  });

  it("explains an unreachable relay", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("failed"))));
    expect((await testConnection("http://h", "x")).title).toBe("Relaydeck didn't answer");
  });
});

describe("snippetFor", () => {
  it("points each tool at the relay", () => {
    expect(snippetFor("claude", "http://127.0.0.1:8317", "KEY")).toContain("ANTHROPIC_BASE_URL=http://127.0.0.1:8317\n");
    expect(snippetFor("codex", "http://127.0.0.1:8317", "KEY")).toContain('base_url = "http://127.0.0.1:8317/v1"');
    expect(snippetFor("curl", "http://h", "KEY")).toContain('Authorization: Bearer KEY');
  });
});
