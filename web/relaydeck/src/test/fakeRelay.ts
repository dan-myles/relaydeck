import { vi } from "vitest";

export interface RecordedCall {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
}

type Handler = (call: RecordedCall) => { status?: number; body?: unknown; headers?: Record<string, string> } | undefined;

// A scripted stand-in for the relay's management API. Routes match on
// "METHOD /path" (query string included when the route has one).
export function fakeRelay(routes: Record<string, Handler | { status?: number; body?: unknown; headers?: Record<string, string> }>) {
  const calls: RecordedCall[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://127.0.0.1:8317");
    const method = (init?.method ?? "GET").toUpperCase();
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries((init?.headers as Record<string, string>) ?? {})) headers[key.toLowerCase()] = value;
    const body = typeof init?.body === "string" && init.body !== "" ? JSON.parse(init.body) : undefined;
    const call = { method, path: url.pathname + url.search, headers, body };
    calls.push(call);
    const route = routes[`${method} ${url.pathname}${url.search}`] ?? routes[`${method} ${url.pathname}`];
    const result = typeof route === "function" ? route(call) : route;
    if (!result) return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
    return new Response(result.body === undefined ? "" : JSON.stringify(result.body), {
      status: result.status ?? 200,
      headers: { "Content-Type": "application/json", ...(result.headers ?? {}) },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}
