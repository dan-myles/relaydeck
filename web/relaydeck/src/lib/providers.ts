// Display metadata for providers. Colours are the only per-provider accent;
// the interface itself stays monochrome with one pink for live and "now".

export interface ProviderInfo {
  id: string;
  name: string;
  color: string;
}

const KNOWN: Record<string, ProviderInfo> = {
  claude: { id: "claude", name: "Claude", color: "#E0896A" },
  codex: { id: "codex", name: "ChatGPT", color: "#8FA0F7" },
  gemini: { id: "gemini", name: "Gemini", color: "#7FB8F2" },
  "gemini-cli": { id: "gemini-cli", name: "Gemini", color: "#7FB8F2" },
  vertex: { id: "vertex", name: "Vertex", color: "#7FB8F2" },
  interactions: { id: "interactions", name: "Gemini", color: "#7FB8F2" },
  antigravity: { id: "antigravity", name: "Antigravity", color: "#8DD3A0" },
  xai: { id: "xai", name: "Grok", color: "#C9C9CF" },
  kimi: { id: "kimi", name: "Kimi", color: "#B49CF2" },
  devin: { id: "devin", name: "Devin", color: "#6FD0C4" },
  meta: { id: "meta", name: "Meta", color: "#79A6FF" },
};

const COMPAT_COLOR = "#E8E8EA";
const FALLBACK_COLOR = "#A1A1AA";

export function providerInfo(provider: string, label?: string): ProviderInfo {
  const id = provider.trim().toLowerCase();
  if (KNOWN[id]) return KNOWN[id];
  if (id === "openai-compatibility" || id.startsWith("openai-compatibility")) {
    return { id, name: label?.trim() || "OpenAI-compatible", color: COMPAT_COLOR };
  }
  return { id, name: label?.trim() || titleCase(id), color: FALLBACK_COLOR };
}

function titleCase(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

// Subscriptions Relaydeck can start from Simple mode. Others stay in Advanced.
export interface SubscriptionOption {
  provider: string;
  name: string;
  plan: string;
  signInHost: string;
}

export const SUBSCRIPTION_OPTIONS: SubscriptionOption[] = [
  { provider: "claude", name: "Claude", plan: "Pro or Max plan", signInHost: "claude.ai" },
  { provider: "codex", name: "ChatGPT", plan: "Plus · Pro · Codex", signInHost: "chatgpt.com" },
  { provider: "antigravity", name: "Antigravity", plan: "Google account", signInHost: "accounts.google.com" },
  { provider: "xai", name: "Grok", plan: "SuperGrok · X Premium", signInHost: "x.ai" },
];

export function subscriptionOption(provider: string): SubscriptionOption | undefined {
  return SUBSCRIPTION_OPTIONS.find((option) => option.provider === provider.toLowerCase());
}

// Provider API keys (api-keys.<provider> in the config).
export interface KeyProviderOption {
  provider: string;
  name: string;
  hint: string;
  placeholder: string;
  needsBaseUrl: boolean;
  defaultBaseUrl: string;
  // Whether the group must name its base-url. Claude and Gemini default to
  // their official endpoints; Codex keys would otherwise go to the ChatGPT
  // backend, which does not accept Platform keys.
  persistBaseUrl: boolean;
  check: (baseUrl: string, apiKey: string) => { url: string; header: Record<string, string> };
}

export const KEY_PROVIDER_OPTIONS: KeyProviderOption[] = [
  {
    provider: "openai-compatibility",
    name: "OpenAI-compatible",
    hint: "OpenRouter, DeepSeek, a local server: anything that speaks the OpenAI API.",
    placeholder: "sk-…",
    needsBaseUrl: true,
    defaultBaseUrl: "",
    persistBaseUrl: true,
    check: (baseUrl, apiKey) => ({
      url: `${trimSlash(baseUrl)}/models`,
      header: { Authorization: `Bearer ${apiKey}` },
    }),
  },
  {
    provider: "gemini",
    name: "Gemini",
    hint: "A Google AI Studio key.",
    placeholder: "AIza…",
    needsBaseUrl: false,
    defaultBaseUrl: "https://generativelanguage.googleapis.com",
    persistBaseUrl: false,
    check: (baseUrl, apiKey) => ({
      url: `${trimSlash(baseUrl)}/v1beta/models?pageSize=1`,
      header: { "x-goog-api-key": apiKey },
    }),
  },
  {
    provider: "claude",
    name: "Anthropic",
    hint: "An Anthropic Console key.",
    placeholder: "sk-ant-…",
    needsBaseUrl: false,
    defaultBaseUrl: "https://api.anthropic.com",
    persistBaseUrl: false,
    check: (baseUrl, apiKey) => ({
      url: `${trimSlash(baseUrl)}/v1/models?limit=1`,
      header: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    }),
  },
  {
    provider: "codex",
    name: "OpenAI",
    hint: "An OpenAI Platform key, used for Codex models.",
    placeholder: "sk-…",
    needsBaseUrl: false,
    defaultBaseUrl: "https://api.openai.com/v1",
    persistBaseUrl: true,
    check: (baseUrl, apiKey) => ({
      url: `${trimSlash(baseUrl)}/models`,
      header: { Authorization: `Bearer ${apiKey}` },
    }),
  },
  {
    provider: "xai",
    name: "xAI",
    hint: "An xAI Console key.",
    placeholder: "xai-…",
    needsBaseUrl: false,
    defaultBaseUrl: "https://api.x.ai/v1",
    persistBaseUrl: true,
    check: (baseUrl, apiKey) => ({
      url: `${trimSlash(baseUrl)}/models`,
      header: { Authorization: `Bearer ${apiKey}` },
    }),
  },
];

function trimSlash(value: string): string {
  return value.trim().replace(/\/+$/, "");
}
