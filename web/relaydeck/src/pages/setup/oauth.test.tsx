import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ManagementClient } from "../../api/client";
import { fakeRelay } from "../../test/fakeRelay";
import { AddSubscriptionDialog } from "./AddSubscriptionDialog";
import { oauthErrorMessage, useOAuthFlow } from "./useOAuthFlow";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function Harness({ onConnected = () => undefined }: { onConnected?: () => void }) {
  const [client] = useState(() => new ManagementClient("mgmt"));
  const oauth = useOAuthFlow(client, onConnected);
  return <AddSubscriptionDialog oauth={oauth} onClose={() => undefined} />;
}

function fakePopup() {
  const popup = { closed: false, opener: {} as unknown, location: { href: "about:blank" }, close: vi.fn() };
  vi.stubGlobal("open", vi.fn(() => popup));
  return popup;
}

describe("subscription sign-in", () => {
  it("starts a web sign-in, opens the provider page and finishes on ok", async () => {
    let polls = 0;
    const relay = fakeRelay({
      "POST /v8/management/oauth/auth-url": { body: { status: "ok", url: "https://claude.ai/oauth/authorize?state=abc", state: "abc" } },
      "GET /v8/management/oauth/status?state=abc": () => {
        polls += 1;
        return { body: polls < 2 ? { status: "wait" } : { status: "ok" } };
      },
    });
    const popup = fakePopup();
    const onConnected = vi.fn();
    const user = userEvent.setup();
    render(<Harness onConnected={onConnected} />);

    await user.click(screen.getByRole("button", { name: /Claude/ }));
    await screen.findByText("Waiting for you in the browser");

    const start = relay.calls.find((call) => call.path === "/v8/management/oauth/auth-url")!;
    expect(start.method).toBe("POST");
    expect(start.body).toEqual({ provider: "claude", is_webui: true });
    expect(popup.location.href).toBe("https://claude.ai/oauth/authorize?state=abc");
    expect(popup.opener).toBeNull();

    await waitFor(() => expect(onConnected).toHaveBeenCalled(), { timeout: 6000 });
    expect(await screen.findByText("Connected")).toBeTruthy();
  }, 10000);

  it("shows the provider's error and lets the user try again", async () => {
    fakeRelay({
      "POST /v8/management/oauth/auth-url": { body: { status: "ok", url: "https://auth.openai.com/x", state: "s1" } },
      "GET /v8/management/oauth/status?state=s1": { body: { status: "error", error: "unknown or expired state" } },
    });
    fakePopup();
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /ChatGPT/ }));
    expect(await screen.findByText("The sign-in took too long and expired. Start again.", {}, { timeout: 5000 })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  }, 10000);

  it("cancels the pending session on the relay", async () => {
    const relay = fakeRelay({
      "POST /v8/management/oauth/auth-url": { body: { status: "ok", url: "https://claude.ai/x", state: "s2" } },
      "GET /v8/management/oauth/status?state=s2": { body: { status: "wait" } },
      "DELETE /v8/management/oauth/session?state=s2": { body: { status: "ok", cancelled: true } },
    });
    const popup = fakePopup();
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /Claude/ }));
    await screen.findByText("Waiting for you in the browser");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(relay.calls.some((call) => call.method === "DELETE" && call.path === "/v8/management/oauth/session?state=s2")).toBe(true));
    expect(popup.close).toHaveBeenCalled();
  });

  it("explains a provider the relay doesn't offer", async () => {
    fakeRelay({ "POST /v8/management/oauth/auth-url": { status: 404, body: { error: "provider_not_found" } } });
    fakePopup();
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /Grok/ }));
    expect(await screen.findByText(/doesn't offer that sign-in/)).toBeTruthy();
  });

  it("submits a pasted redirect for relays on another machine", async () => {
    const relay = fakeRelay({
      "POST /v8/management/oauth/auth-url": { body: { status: "ok", url: "https://claude.ai/x", state: "s3" } },
      "GET /v8/management/oauth/status?state=s3": { body: { status: "wait" } },
      "POST /v8/management/oauth/callback": { body: { status: "ok" } },
    });
    fakePopup();
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /Claude/ }));
    await screen.findByText("Waiting for you in the browser");
    await user.click(screen.getByRole("button", { name: /didn't load/ }));
    await user.type(screen.getByPlaceholderText(/callback/), "http://localhost:54545/callback?code=c0de&state=s3");
    await user.click(screen.getByRole("button", { name: "Finish sign-in" }));
    await waitFor(() => {
      const call = relay.calls.find((item) => item.path === "/v8/management/oauth/callback");
      expect(call?.body).toEqual({ provider: "claude", redirect_url: "http://localhost:54545/callback?code=c0de&state=s3" });
    });
  });

  it("shows device codes for device sign-in", async () => {
    fakeRelay({
      "POST /v8/management/oauth/auth-url": { body: { status: "ok", url: "https://accounts.x.ai/device", state: "s4", flow: "device", user_code: "WXYZ-1234" } },
      "GET /v8/management/oauth/status?state=s4": { body: { status: "wait" } },
    });
    fakePopup();
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /Grok/ }));
    expect(await screen.findByText("WXYZ-1234")).toBeTruthy();
    await act(async () => undefined);
  });
});

describe("oauthErrorMessage", () => {
  it("maps relay errors to plain language", () => {
    expect(oauthErrorMessage("State code error")).toMatch(/mismatched session/);
    expect(oauthErrorMessage("Failed to save authentication tokens")).toMatch(/couldn't save/);
    expect(oauthErrorMessage("")).toMatch(/didn't complete/);
  });
});
