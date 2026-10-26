import { ApiError, ManagementClient } from "./client";
import type { ProviderKeyEntry, ProviderKeyGroup } from "./types";

// Config paths mirror the v8 YAML tree. Lists are replaced whole, so every
// write reads the current value with its ETag first and sends If-Match. A
// concurrent edit fails with 412 instead of being overwritten.

export async function readConfigValue<T>(
  client: ManagementClient,
  path: string,
): Promise<{ value: T | null; etag: string | null }> {
  try {
    const result = await client.request<T>(`/config/${path}`);
    return { value: result.data, etag: result.etag };
  } catch (error) {
    if (error instanceof ApiError && error.kind === "not-found") {
      // The key is absent. The ETag of the whole document still guards the write.
      const whole = await client.request<unknown>("/config");
      return { value: null, etag: whole.etag };
    }
    throw error;
  }
}

export async function writeConfigValue(
  client: ManagementClient,
  path: string,
  value: unknown,
  etag: string | null,
): Promise<void> {
  await client.request(`/config/${path}`, { method: "PUT", body: value, ifMatch: etag ?? undefined });
}

export async function readUsageRecordsEnabled(client: ManagementClient): Promise<boolean> {
  const { value } = await readConfigValue<boolean>(client, "observability/usage/usage-statistics-enabled");
  return value === true;
}

export async function setUsageRecordsEnabled(client: ManagementClient, enabled: boolean): Promise<void> {
  const path = "observability/usage/usage-statistics-enabled";
  const { etag } = await readConfigValue<boolean>(client, path);
  await writeConfigValue(client, path, enabled, etag);
}

export async function readRoutingStrategy(client: ManagementClient): Promise<string> {
  const { value } = await readConfigValue<string>(client, "routing/strategy");
  return typeof value === "string" && value !== "" ? value : "round-robin";
}

export async function readUsageRetentionSeconds(client: ManagementClient): Promise<number> {
  const { value } = await readConfigValue<number>(client, "observability/usage/redis-usage-queue-retention-seconds");
  return typeof value === "number" && value > 0 ? Math.min(value, 3600) : 60;
}

// Client access keys (access.api-keys). These are the keys tools send to the
// relay. Relaydeck only reads them.
export async function readAccessKeys(client: ManagementClient): Promise<string[]> {
  const { value } = await readConfigValue<unknown>(client, "access/api-keys");
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === "string") return entry;
      if (entry && typeof entry === "object" && typeof (entry as { key?: unknown }).key === "string") {
        return (entry as { key: string }).key;
      }
      return "";
    })
    .filter((key) => key !== "");
}

export async function readProviderKeys(client: ManagementClient): Promise<Record<string, ProviderKeyGroup[]>> {
  const { value } = await readConfigValue<Record<string, ProviderKeyGroup[] | null>>(client, "api-keys");
  const out: Record<string, ProviderKeyGroup[]> = {};
  if (!value || typeof value !== "object") return out;
  for (const [provider, groups] of Object.entries(value)) {
    if (Array.isArray(groups)) out[provider] = groups;
  }
  return out;
}

export interface NewProviderKey {
  provider: string;
  apiKey: string;
  baseUrl?: string;
  // OpenAI-compatible groups are named after the upstream (it becomes the
  // provider name) and must list the models they serve.
  groupName?: string;
  models?: string[];
}

// Appends one group holding the new key to api-keys.<provider>. Existing
// groups, other providers and the rest of the config are left untouched.
export async function addProviderKey(client: ManagementClient, input: NewProviderKey): Promise<void> {
  const path = `api-keys/${input.provider}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { value, etag } = await readConfigValue<ProviderKeyGroup[]>(client, path);
    const groups = Array.isArray(value) ? value.map(stripAuthIndexes) : [];
    if (groups.some((group) => (group.keys ?? []).some((key) => key["api-key"] === input.apiKey))) {
      throw new ApiError(409, "duplicate_key", "This key is already in the relay.");
    }
    const group: ProviderKeyGroup = {
      name: uniqueGroupName(groups, input.groupName || input.provider, Boolean(input.groupName)),
    };
    if (input.baseUrl) group["base-url"] = input.baseUrl;
    group.keys = [{ "api-key": input.apiKey }];
    if (input.models && input.models.length > 0) group.models = input.models.map((name) => ({ name }));
    try {
      await writeConfigValue(client, path, [...groups, group], etag);
      return;
    } catch (error) {
      // Someone saved in between; read again and re-apply the append once.
      if (attempt === 0 && error instanceof ApiError && error.status === 412) continue;
      throw error;
    }
  }
}

function stripAuthIndexes(group: ProviderKeyGroup): ProviderKeyGroup {
  if (!Array.isArray(group.keys)) return group;
  return {
    ...group,
    keys: group.keys.map((key) => {
      const copy: ProviderKeyEntry = { ...key };
      delete copy.auth_index;
      delete copy["auth-index"];
      return copy;
    }),
  };
}

// Group names keep the user's capitalisation but only letters, digits and
// dashes; uniqueness is checked case-insensitively.
export function uniqueGroupName(groups: ProviderKeyGroup[], base: string, exactFirst = false): string {
  const slug =
    base
      .trim()
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "key";
  const taken = new Set(groups.map((group) => group.name?.toLowerCase()));
  if (exactFirst && !taken.has(slug.toLowerCase())) return slug;
  for (let n = exactFirst ? 2 : 1; ; n++) {
    const name = `${slug}-${n}`;
    if (!taken.has(name.toLowerCase())) return name;
  }
}

const PAUSE_PATTERN = "*";

// The effective exclusion list of one key: its own list, else its group's.
export function effectiveExclusions(group: ProviderKeyGroup, key: ProviderKeyEntry): string[] {
  const own = key["excluded-models"];
  if (Array.isArray(own)) return own;
  return Array.isArray(group["excluded-models"]) ? group["excluded-models"] : [];
}

// OpenAI-compatible keys have no per-key exclusions; their group is paused
// with its own disabled flag, which covers every key in it.
export function isKeyPaused(group: ProviderKeyGroup, key: ProviderKeyEntry, provider = ""): boolean {
  if (provider === "openai-compatibility") return group.disabled === true;
  return effectiveExclusions(group, key).some((item) => item.trim() === PAUSE_PATTERN);
}

// Pauses or resumes one provider key the way the relay itself does: by adding
// or removing the "*" model exclusion on that key (or, for OpenAI-compatible
// upstreams, the group's disabled flag). Everything else in the provider's
// list is written back unchanged.
export async function setProviderKeyPaused(client: ManagementClient, provider: string, apiKey: string, paused: boolean): Promise<void> {
  const path = `api-keys/${provider}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { value, etag } = await readConfigValue<ProviderKeyGroup[]>(client, path);
    const groups = Array.isArray(value) ? value.map(stripAuthIndexes) : [];
    let found = false;
    const next = groups.map((group) => {
      if (!Array.isArray(group.keys)) return group;
      if (provider === "openai-compatibility") {
        if (!group.keys.some((key) => key["api-key"] === apiKey)) return group;
        found = true;
        const updated: ProviderKeyGroup = { ...group };
        if (paused) updated.disabled = true;
        else delete updated.disabled;
        return updated;
      }
      return {
        ...group,
        keys: group.keys.map((key) => {
          if (key["api-key"] !== apiKey) return key;
          found = true;
          const inherited = Array.isArray(group["excluded-models"]) ? group["excluded-models"] : [];
          const current = effectiveExclusions(group, key).filter((item) => item.trim() !== PAUSE_PATTERN);
          const updated: ProviderKeyEntry = { ...key };
          if (paused) updated["excluded-models"] = [...current, PAUSE_PATTERN];
          else if (sameList(current, inherited)) delete updated["excluded-models"];
          else updated["excluded-models"] = current;
          return updated;
        }),
      };
    });
    if (!found) throw new ApiError(404, "key_not_found", "This key is no longer in the relay's config.");
    try {
      await writeConfigValue(client, path, next, etag);
      return;
    } catch (error) {
      if (attempt === 0 && error instanceof ApiError && error.status === 412) continue;
      throw error;
    }
  }
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}
