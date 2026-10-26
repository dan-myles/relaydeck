import { describeApiError, type ManagementClient } from "../api/client";
import { relayApiCall } from "../api/relay";
import type { KeyProviderOption } from "./providers";

export type KeyCheck =
  | { outcome: "works"; ms: number; models: string[] }
  | { outcome: "rejected"; status: number }
  | { outcome: "unverified"; reason: string };

// Asks the relay to list models with the new key before it is saved. The
// request goes out from the relay, so the browser never talks to the provider.
export async function checkProviderKey(
  client: ManagementClient,
  option: KeyProviderOption,
  baseUrl: string,
  apiKey: string,
): Promise<KeyCheck> {
  const target = option.check(baseUrl || option.defaultBaseUrl, apiKey);
  const started = performance.now();
  let result;
  try {
    result = await relayApiCall(client, { method: "GET", url: target.url, header: target.header });
  } catch (error) {
    return { outcome: "unverified", reason: describeApiError(error) };
  }
  const ms = performance.now() - started;
  const status = result?.status_code ?? 0;
  if (status >= 200 && status < 300) return { outcome: "works", ms, models: parseModelIds(result.body) };
  if (status === 401 || status === 403) return { outcome: "rejected", status };
  if (status === 404) {
    return {
      outcome: "unverified",
      reason: option.needsBaseUrl
        ? "The endpoint answered 404 for /models. Check the base URL; it usually ends in /v1."
        : "The provider answered 404 for its model list.",
    };
  }
  if (status === 429) return { outcome: "unverified", reason: "The provider is rate-limiting right now (429), so the key couldn't be checked." };
  if (status === 0) return { outcome: "unverified", reason: "The relay couldn't reach the provider." };
  return { outcome: "unverified", reason: `The provider answered ${status}.` };
}

export function parseModelIds(body: string | undefined): string[] {
  if (!body) return [];
  try {
    const parsed = JSON.parse(body) as { data?: { id?: unknown }[]; models?: { name?: unknown; id?: unknown }[] };
    const list = parsed.data ?? parsed.models ?? [];
    return Array.from(
      new Set(
        list
          .map((item) => (typeof item.id === "string" ? item.id : typeof (item as { name?: unknown }).name === "string" ? String((item as { name: string }).name) : ""))
          .filter(Boolean),
      ),
    ).sort();
  } catch {
    return [];
  }
}
