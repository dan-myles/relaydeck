import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ManagementClient } from "../api/client";
import { DetailOptInDialog } from "../pages/usage/RequestDetail";
import { fakeRelay } from "../test/fakeRelay";
import { RecordsProvider, useRecords } from "./records";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const QUEUE = "/v8/management/observability/usage/queue";
const FLAG = "/v8/management/config/observability/usage/usage-statistics-enabled";

function relayWith(enabled: boolean) {
  let flag = enabled;
  return fakeRelay({
    [`GET ${FLAG}`]: () => ({ body: flag, headers: { ETag: '"h"' } }),
    [`PUT ${FLAG}`]: (call) => {
      flag = call.body as boolean;
      return { body: { status: "ok" } };
    },
    "GET /v8/management/config/observability/usage/redis-usage-queue-retention-seconds": { body: 120 },
    [`GET ${QUEUE}?count=500`]: {
      body: [
        {
          timestamp: "2026-10-26T15:24:51Z",
          model: "claude-sonnet-4-5",
          provider: "claude",
          auth_index: "3",
          api_key: "sk-client-should-not-survive",
          client_ip: "10.0.0.8",
          user_agent: "claude-cli/2.1.0",
          latency_ms: 3200,
          ttft_ms: 610,
          tokens: { input_tokens: 48200, output_tokens: 1100, cached_tokens: 41000 },
          failed: false,
          fail: { status_code: 0, body: "" },
        },
      ],
    },
  });
}

function Probe() {
  const records = useRecords();
  return (
    <div>
      <span data-testid="phase">{records.phase}</span>
      <span data-testid="count">{records.records.length}</span>
      <span data-testid="dump">{JSON.stringify(records.records)}</span>
      <button onClick={() => void records.turnOff()}>off</button>
    </div>
  );
}

describe("request records opt-in", () => {
  it("never reads the queue until the user opts in", async () => {
    const relay = relayWith(true);
    render(
      <RecordsProvider client={new ManagementClient("k")}>
        <Probe />
      </RecordsProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("phase").textContent).toBe("on-idle"));
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(relay.calls.some((call) => call.path.startsWith(QUEUE))).toBe(false);
  });

  it("turns the relay setting on, then reads and sanitises records", async () => {
    const relay = relayWith(false);
    const user = userEvent.setup();
    render(
      <RecordsProvider client={new ManagementClient("k")}>
        <Probe />
        <DetailOptInDialog onClose={() => undefined} />
      </RecordsProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("phase").textContent).toBe("off"));
    expect(screen.getByRole("dialog", { name: "Turn on request records?" })).toBeTruthy();
    expect(screen.getByText(/Reading removes them/)).toBeTruthy();
    expect(screen.getByText(/usage-statistics-enabled/)).toBeTruthy();
    expect(screen.getByText(/2 minutes/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Turn on" }));
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));

    const put = relay.calls.find((call) => call.method === "PUT")!;
    expect(put.body).toBe(true);
    const dump = screen.getByTestId("dump").textContent!;
    expect(dump).toContain("Claude Code");
    expect(dump).not.toContain("sk-client-should-not-survive");
    expect(dump).not.toContain("10.0.0.8");
    expect(dump).not.toContain("claude-cli/2.1.0");
  });

  it("does not rewrite the setting when it is already on", async () => {
    const relay = relayWith(true);
    const user = userEvent.setup();
    render(
      <RecordsProvider client={new ManagementClient("k")}>
        <Probe />
        <DetailOptInDialog onClose={() => undefined} />
      </RecordsProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("phase").textContent).toBe("on-idle"));
    await user.click(screen.getByRole("button", { name: "Start reading" }));
    await waitFor(() => expect(screen.getByTestId("phase").textContent).toBe("collecting"));
    expect(relay.calls.some((call) => call.method === "PUT")).toBe(false);
  });

  it("stops reading and turns the setting off", async () => {
    const relay = relayWith(false);
    const user = userEvent.setup();
    render(
      <RecordsProvider client={new ManagementClient("k")}>
        <Probe />
        <DetailOptInDialog onClose={() => undefined} />
      </RecordsProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("phase").textContent).toBe("off"));
    await user.click(screen.getByRole("button", { name: "Turn on" }));
    await waitFor(() => expect(screen.getByTestId("phase").textContent).toBe("collecting"));
    await user.click(screen.getByRole("button", { name: "off" }));
    await waitFor(() => expect(screen.getByTestId("phase").textContent).toBe("off"));
    const puts = relay.calls.filter((call) => call.method === "PUT").map((call) => call.body);
    expect(puts).toEqual([true, false]);
    const reads = relay.calls.filter((call) => call.path.startsWith(QUEUE)).length;
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(relay.calls.filter((call) => call.path.startsWith(QUEUE)).length).toBe(reads);
  });
});
