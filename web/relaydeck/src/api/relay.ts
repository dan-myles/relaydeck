import { ApiError, ManagementClient } from "./client";
import type { ApiCallResult, CredentialList, KeyUsage, OAuthStart, OAuthStatus } from "./types";

export async function listCredentials(client: ManagementClient, signal?: AbortSignal): Promise<CredentialList> {
  const { data } = await client.request<CredentialList>("/credentials", { signal });
  return { observed_at: data?.observed_at ?? new Date().toISOString(), files: data?.files ?? [] };
}

export async function setCredentialPaused(
  client: ManagementClient,
  credential: { name: string; auth_index: string },
  paused: boolean,
): Promise<void> {
  await client.request("/credentials/status", {
    method: "PATCH",
    body: { name: credential.name, auth_index: credential.auth_index, disabled: paused },
  });
}

// OAuth sign-in. is_webui asks the relay to forward the provider's localhost
// redirect back to itself, so the browser only ever talks to this origin.
export async function startOAuth(client: ManagementClient, provider: string): Promise<OAuthStart> {
  const { data } = await client.request<OAuthStart>("/oauth/auth-url", {
    method: "POST",
    body: { provider, is_webui: true },
  });
  if (!data?.url || !data.state) throw new ApiError(500, "invalid_response", "The relay didn't return a sign-in link.");
  return data;
}

export async function pollOAuth(client: ManagementClient, state: string): Promise<OAuthStatus> {
  const { data } = await client.request<OAuthStatus>(`/oauth/status?state=${encodeURIComponent(state)}`);
  return data ?? { status: "wait" };
}

export async function cancelOAuth(client: ManagementClient, state: string): Promise<void> {
  await client.request(`/oauth/session?state=${encodeURIComponent(state)}`, { method: "DELETE" });
}

// For relays reached from another machine: the provider redirects to the
// relay host's localhost, which this browser cannot reach. The user pastes
// that final address instead.
export async function submitOAuthRedirect(client: ManagementClient, provider: string, redirectUrl: string): Promise<void> {
  await client.request("/oauth/callback", { method: "POST", body: { provider, redirect_url: redirectUrl } });
}

export async function relayApiCall(
  client: ManagementClient,
  request: { method: string; url: string; header: Record<string, string> },
): Promise<ApiCallResult> {
  const { data } = await client.request<ApiCallResult>("/requests/api-call", { method: "POST", body: request });
  return data;
}

// Reading the usage queue removes what it returns. Callers must only use this
// after the user opted in for the current session.
export async function popUsageRecords(client: ManagementClient, count = 500): Promise<unknown[]> {
  const { data } = await client.request<unknown[]>(`/observability/usage/queue?count=${count}`);
  return Array.isArray(data) ? data : [];
}

// Counters for provider API keys, which the credentials list does not cover.
export async function readKeyUsage(client: ManagementClient, signal?: AbortSignal): Promise<KeyUsage> {
  const { data } = await client.request<KeyUsage>("/observability/usage/api-keys", { signal });
  return data && typeof data === "object" ? data : {};
}
