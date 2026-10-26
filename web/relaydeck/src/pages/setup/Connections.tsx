import { useEffect, useState } from "react";
import { describeApiError } from "../../api/client";
import { readAccessKeys } from "../../api/config";
import { formatDuration, maskSecret } from "../../lib/format";
import { ADVANCED_URL } from "../../lib/session";
import { useRelay } from "../../state/relay";
import { CopyButton, Notice, Segmented, StatusDot, type Tone } from "../../components/Controls";

type Tool = "claude" | "codex" | "sdk" | "curl";

const TOOLS: { value: Tool; label: string; short: string }[] = [
  { value: "claude", label: "Claude Code", short: "Claude Code" },
  { value: "codex", label: "Codex CLI", short: "Codex" },
  { value: "sdk", label: "OpenAI SDK", short: "SDK" },
  { value: "curl", label: "curl", short: "curl" },
];

export function snippetFor(tool: Tool, origin: string, key: string): string {
  switch (tool) {
    case "claude":
      return `export ANTHROPIC_BASE_URL=${origin}\nexport ANTHROPIC_AUTH_TOKEN=${key}\nclaude`;
    case "codex":
      return [
        "# ~/.codex/config.toml",
        'model_provider = "relaydeck"',
        "",
        "[model_providers.relaydeck]",
        'name = "Relaydeck"',
        `base_url = "${origin}/v1"`,
        'env_key = "RELAYDECK_API_KEY"',
        'wire_api = "responses"',
        "",
        `# then: export RELAYDECK_API_KEY=${key}`,
      ].join("\n");
    case "sdk":
      return `from openai import OpenAI\n\nclient = OpenAI(\n    base_url="${origin}/v1",\n    api_key="${key}",\n)`;
    case "curl":
      return `curl ${origin}/v1/models \\\n  -H "Authorization: Bearer ${key}"`;
  }
}

type TestResult =
  | { state: "idle" }
  | { state: "running" }
  | { state: "done"; tone: Tone; title: string; body: string; retryable: boolean };

export async function testConnection(origin: string, key: string | null): Promise<Exclude<TestResult, { state: "idle" } | { state: "running" }>> {
  const started = performance.now();
  let response: Response;
  try {
    response = await fetch(`${origin}/v1/models`, {
      headers: key ? { Authorization: `Bearer ${key}` } : {},
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
  } catch {
    return { state: "done", tone: "bad", title: "Relaydeck didn't answer", body: "The request never reached the relay. Check that it's still running.", retryable: true };
  }
  const ms = performance.now() - started;
  if (response.status === 401) {
    return {
      state: "done",
      tone: "bad",
      title: "Access key not accepted",
      body: "Relaydeck answered 401: the key isn't in the access list. Copy it again from the card above.",
      retryable: true,
    };
  }
  if (response.status === 403 && response.headers.get("X-CPA-SAFE-MODE")) {
    return {
      state: "done",
      tone: "warn",
      title: "Proxy is in safe mode",
      body: "The access keys still contain template values, so the relay refuses requests. Replace them in Advanced.",
      retryable: false,
    };
  }
  if (!response.ok) {
    return { state: "done", tone: "bad", title: `Relaydeck answered ${response.status}`, body: "The request reached the relay but didn't succeed.", retryable: true };
  }
  let count = 0;
  try {
    const body = (await response.json()) as { data?: unknown[] };
    count = Array.isArray(body.data) ? body.data.length : 0;
  } catch {
    count = 0;
  }
  if (count === 0) {
    return {
      state: "done",
      tone: "warn",
      title: "No accounts available",
      body: "Relaydeck is reachable but offers no models: every source is paused, cooling or missing. Add a subscription or key above.",
      retryable: true,
    };
  }
  return {
    state: "done",
    tone: "live",
    title: "Your tools can reach Relaydeck",
    body: `200 OK in ${formatDuration(ms)} with ${count} ${count === 1 ? "model" : "models"} available.`,
    retryable: true,
  };
}

export function ConnectionsSection() {
  const { client } = useRelay();
  const origin = window.location.origin;
  const [keys, setKeys] = useState<string[] | null>(null);
  const [keysError, setKeysError] = useState<unknown>(null);
  const [selected, setSelected] = useState(0);
  const [reveal, setReveal] = useState(false);
  const [tool, setTool] = useState<Tool>("claude");
  const [test, setTest] = useState<TestResult>({ state: "idle" });

  useEffect(() => {
    readAccessKeys(client)
      .then((list) => {
        setKeys(list);
        setKeysError(null);
      })
      .catch((error) => setKeysError(error));
  }, [client]);

  const key = keys && keys.length > 0 ? keys[Math.min(selected, keys.length - 1)] : null;
  const shownKey = key ? (reveal ? key : maskSecret(key)) : "any-value";
  const copyKey = key ?? "any-value";

  const runTest = async () => {
    setTest({ state: "running" });
    setTest(await testConnection(origin, key));
  };

  return (
    <section className="section" aria-labelledby="conn-title">
      <div className="section-head">
        <div>
          <h2 id="conn-title">Connections</h2>
          <p className="muted">Point Claude Code, Codex, or any OpenAI client at Relaydeck.</p>
        </div>
      </div>
      <div className="card connection-card">
        <div className="connection-fields">
          <div className="copy-field">
            <div className="copy-field-label">Base URL</div>
            <div className="copy-field-row">
              <span className="mono copy-field-value">{origin}/v1</span>
              <CopyButton value={`${origin}/v1`} />
            </div>
          </div>
          <div className="copy-field">
            <div className="copy-field-label">
              Access key, which your tools send
              {keys && keys.length > 1 && (
                <select className="inline-select" value={selected} onChange={(event) => setSelected(Number(event.target.value))} aria-label="Access key">
                  {keys.map((item, index) => (
                    <option key={index} value={index}>
                      Key {index + 1} · …{item.slice(-4)}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="copy-field-row">
              {keysError != null ? (
                <span className="muted">{describeApiError(keysError)}</span>
              ) : keys === null ? (
                <span className="muted">Loading…</span>
              ) : key ? (
                <>
                  <span className="mono copy-field-value" aria-label={reveal ? "Access key" : "Access key, hidden"}>
                    {shownKey}
                  </span>
                  <button type="button" className="text-button" aria-pressed={reveal} onClick={() => setReveal((value) => !value)}>
                    {reveal ? "Hide" : "Show"}
                  </button>
                  <CopyButton value={key} />
                </>
              ) : (
                <span className="muted">No access key. The relay accepts requests without one.</span>
              )}
            </div>
          </div>
        </div>
        {keys && keys.length === 0 && (
          <Notice tone="warn" title="Anyone who can reach this relay can use it">
            Add a client access key in <a href={ADVANCED_URL}>Advanced</a> to require one. Relaydeck doesn't create keys for you.
          </Notice>
        )}
        <Segmented label="Tool" value={tool} onChange={setTool} className="tool-tabs" options={TOOLS.map((item) => ({ value: item.value, label: <span><span className="label-long">{item.label}</span><span className="label-short">{item.short}</span></span> }))} />
        <div className="code-block">
          <pre className="mono">
            <code>{snippetFor(tool, origin, shownKey)}</code>
          </pre>
          <CopyButton value={snippetFor(tool, origin, copyKey)} className="code-copy text-button" />
        </div>
        <div className="connection-foot">
          <div className="test-result" aria-live="polite">
            {test.state === "done" ? (
              <>
                <div className={`status-label tone-${test.tone}`}>
                  <StatusDot tone={test.tone} />
                  <span>{test.title}</span>
                </div>
                <div className="status-detail">{test.body}</div>
              </>
            ) : (
              <span className="muted">{test.state === "running" ? "Sending a request to /v1/models…" : "Sends one model-list request with this key, like your tool would."}</span>
            )}
          </div>
          <button type="button" className="button" onClick={() => void runTest()} disabled={test.state === "running"}>
            {test.state === "done" ? "Run again" : "Test connection"}
          </button>
        </div>
      </div>
    </section>
  );
}
