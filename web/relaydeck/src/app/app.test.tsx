import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeRelay } from "../test/fakeRelay";
import { App } from "./App";

beforeEach(() => {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
});

afterEach(() => vi.unstubAllGlobals());

const credentials = {
  observed_at: "2026-10-26T15:25:00Z",
  files: [
    {
      id: "a",
      auth_index: "1",
      name: "claude-maya.json",
      provider: "claude",
      status: "active",
      disabled: false,
      unavailable: false,
      email: "maya@northwind.example",
      account_type: "oauth",
      success: 10,
      failed: 1,
      recent_requests: [{ time: "15:20-15:30", success: 4, failed: 0 }],
      quota: {},
    },
  ],
};

function relay() {
  return fakeRelay({
    "GET /v8/management/credentials?page=1&page_size=1": (call) =>
      call.headers.authorization === "Bearer right-key" ? { body: credentials } : { status: 401, body: { error: "invalid management key" } },
    "GET /v8/management/credentials": { body: credentials },
    "GET /v8/management/config/routing/strategy": { body: "round-robin" },
    "GET /v8/management/config/observability/usage/usage-statistics-enabled": { body: false },
    "GET /v8/management/config/observability/usage/redis-usage-queue-retention-seconds": { body: 60 },
    "GET /v8/management/config/api-keys": { body: { gemini: [{ name: "gemini-1", keys: [{ "api-key": "AIzaSyD-raw-upstream-key-3fQk", auth_index: "2" }] }] } },
    "GET /v8/management/observability/usage/api-keys": {
      body: { gemini: { "|AIzaSyD-raw-upstream-key-3fQk": { success: 3, failed: 0, recent_requests: [{ time: "15:20-15:30", success: 3, failed: 0 }] } } },
    },
    "GET /v8/management/config/access/api-keys": { body: ["rdk-client-access-7d2a"] },
  });
}

describe("Relaydeck app", () => {
  it("signs in with the management key, keeps it out of the URL and in this tab only", async () => {
    const calls = relay().calls;
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText("Management key"), "wrong-key");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("wasn't accepted"));

    await user.clear(screen.getByLabelText("Management key"));
    await user.type(screen.getByLabelText("Management key"), "right-key");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Setup" })).toBeTruthy();

    expect(window.location.href).not.toContain("right-key");
    expect(window.sessionStorage.getItem("relaydeck.management-key")).toBe("right-key");
    expect(window.localStorage.getItem("relaydeck.management-key")).toBeNull();
    expect(calls.every((call) => !call.path.includes("right-key"))).toBe(true);
  });

  it("labels provider keys and client access keys apart and never shows raw secrets by default", async () => {
    relay();
    window.sessionStorage.setItem("relaydeck.management-key", "right-key");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Provider API keys" })).toBeTruthy();
    expect(screen.getByText("Access key, which your tools send")).toBeTruthy();
    await screen.findByText("AIza••••••••3fQk");
    expect(document.body.textContent).not.toContain("raw-upstream-key");
    await screen.findByText("rdk-••••••••7d2a");
    expect(document.body.textContent).not.toContain("rdk-client-access-7d2a");
    // There is no way to create or rotate client access keys in Simple mode.
    expect(screen.queryByRole("button", { name: /create|rotate|new access key/i })).toBeNull();
  });

  it("keeps a working way into Advanced on the same origin", async () => {
    relay();
    window.sessionStorage.setItem("relaydeck.management-key", "right-key");
    render(<App />);
    const dock = await screen.findByRole("complementary", { name: "Relaydeck" });
    const advanced = within(dock).getByRole("link", { name: /Advanced/ });
    expect(advanced.getAttribute("href")).toBe("/management-advanced.html");
  });

  it("loads without writing anything to the relay", async () => {
    const { calls } = relay();
    window.sessionStorage.setItem("relaydeck.management-key", "right-key");
    window.location.hash = "#/usage";
    render(<App />);
    expect(await screen.findByRole("heading", { level: 1, name: "Usage" })).toBeTruthy();
    await screen.findByText(/Tokens, models and latency aren't available/);
    await waitFor(() => expect(calls.length).toBeGreaterThan(3));
    expect(calls.filter((call) => call.method !== "GET")).toEqual([]);
    expect(calls.some((call) => call.path.includes("/observability/usage/queue"))).toBe(false);
  });

  it("checks a remembered key with one request before loading anything", async () => {
    const { calls } = fakeRelay({ "GET /v8/management/credentials": { status: 401, body: { error: "invalid management key" } } });
    window.localStorage.setItem("relaydeck.management-key", "stale");
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Sign in to your relay" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("wasn't accepted");
    expect(window.localStorage.getItem("relaydeck.management-key")).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it("explains a lockout instead of retrying", async () => {
    const { calls } = fakeRelay({ "GET /v8/management/credentials": { status: 403, body: { error: "IP banned due to too many failed attempts. Try again in 29m" } } });
    window.sessionStorage.setItem("relaydeck.management-key", "stale");
    render(<App />);
    expect((await screen.findByRole("alert")).textContent).toContain("Too many wrong keys");
    expect(calls).toHaveLength(1);
  });
});
