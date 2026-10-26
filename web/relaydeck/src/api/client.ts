// Management API client. Every call goes to the origin that served the page;
// the management key travels only in the Authorization header.

export const MANAGEMENT_BASE = "/v8/management";

export type ApiErrorKind =
  | "unauthorized"
  | "forbidden"
  | "management-off"
  | "not-found"
  | "conflict"
  | "invalid"
  | "server"
  | "network";

export class ApiError extends Error {
  readonly status: number;
  readonly kind: ApiErrorKind;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.kind = kindForStatus(status, code);
  }
}

function kindForStatus(status: number, code: string): ApiErrorKind {
  if (status === 0) return "network";
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return code === "" ? "management-off" : "not-found";
  if (status === 409 || status === 412) return "conflict";
  if (status >= 400 && status < 500) return "invalid";
  return "server";
}

export interface ApiResult<T> {
  data: T;
  etag: string | null;
}

type FetchLike = typeof fetch;

export interface RequestOptions {
  method?: string;
  body?: unknown;
  ifMatch?: string | null;
  signal?: AbortSignal;
}

export class ManagementClient {
  private readonly key: string;
  private readonly fetchImpl: FetchLike;

  constructor(key: string, fetchImpl: FetchLike = (...args) => fetch(...args)) {
    this.key = key;
    this.fetchImpl = fetchImpl;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.key}`,
      Accept: "application/json",
    };
    let body: string | undefined;
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.body);
    }
    if (options.ifMatch) headers["If-Match"] = options.ifMatch;

    let response: Response;
    try {
      response = await this.fetchImpl(MANAGEMENT_BASE + path, {
        method: options.method ?? "GET",
        headers,
        body,
        signal: options.signal,
        credentials: "same-origin",
        cache: "no-store",
        referrerPolicy: "no-referrer",
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      throw new ApiError(0, "network", "The relay didn't answer.");
    }

    const text = await response.text();
    let parsed: unknown = null;
    if (text !== "") {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
    }
    if (!response.ok) {
      const payload = (parsed ?? {}) as { error?: unknown; message?: unknown };
      const code = typeof payload.error === "string" ? payload.error : "";
      const message = typeof payload.message === "string" ? payload.message : code || response.statusText;
      throw new ApiError(response.status, code, message);
    }
    return { data: parsed as T, etag: response.headers.get("ETag") };
  }
}

// Messages for errors that can happen on any management call.
export function describeApiError(error: unknown): string {
  if (!(error instanceof ApiError)) return "Something went wrong. Try again.";
  switch (error.kind) {
    case "network":
      return "The relay didn't answer. Check that it's still running.";
    case "unauthorized":
      return "The management key was not accepted. Sign in again.";
    case "forbidden":
      return error.message || "The relay refused this request.";
    case "management-off":
      return "Management is turned off on this relay.";
    case "conflict":
      return "The settings changed somewhere else. Reload and try again.";
    default:
      return error.message || `The relay answered ${error.status}.`;
  }
}
