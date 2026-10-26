import { useMemo, useState, type FormEvent } from "react";
import { describeApiError, type ManagementClient } from "../../api/client";
import { addProviderKey } from "../../api/config";
import { checkProviderKey, type KeyCheck } from "../../lib/keycheck";
import { formatDuration, maskSecret } from "../../lib/format";
import { KEY_PROVIDER_OPTIONS } from "../../lib/providers";
import { Dialog } from "../../components/Dialog";
import { Done, Segmented, StatusDot } from "../../components/Controls";

type Phase =
  | { step: "form" }
  | { step: "checking" }
  | { step: "checked"; check: KeyCheck }
  | { step: "saving"; check: KeyCheck }
  | { step: "saved"; check: KeyCheck; name: string };

export function AddKeyDialog({ client, onClose, onSaved }: { client: ManagementClient; onClose: () => void; onSaved: () => void }) {
  const [providerId, setProviderId] = useState(KEY_PROVIDER_OPTIONS[0].provider);
  const option = KEY_PROVIDER_OPTIONS.find((item) => item.provider === providerId)!;
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [phase, setPhase] = useState<Phase>({ step: "form" });
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<Set<string>>(new Set());
  const [manualModels, setManualModels] = useState("");
  const [modelFilter, setModelFilter] = useState("");

  const displayName = option.needsBaseUrl ? name.trim() || "OpenAI-compatible" : option.name;
  const busy = phase.step === "checking" || phase.step === "saving";

  const reset = (next: string) => {
    setProviderId(next);
    setPhase({ step: "form" });
    setError(null);
    setModels(new Set());
  };

  const validate = (): string | null => {
    if (option.needsBaseUrl && !name.trim()) return "Name the provider, for example OpenRouter.";
    if (option.needsBaseUrl) {
      try {
        const url = new URL(baseUrl.trim());
        if (url.protocol !== "https:" && url.protocol !== "http:") return "The endpoint must start with https:// or http://.";
      } catch {
        return "Enter the endpoint as a full URL, for example https://openrouter.ai/api/v1.";
      }
    }
    if (!apiKey.trim()) return "Paste the key.";
    return null;
  };

  const runCheck = async (event?: FormEvent) => {
    event?.preventDefault();
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setPhase({ step: "checking" });
    const check = await checkProviderKey(client, option, baseUrl.trim(), apiKey.trim());
    if (check.outcome === "works" && option.provider !== "openai-compatibility") {
      await save(check);
      return;
    }
    setPhase({ step: "checked", check });
  };

  const chosenModels = (): string[] => {
    const typed = manualModels
      .split(/[\s,]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    return Array.from(new Set([...models, ...typed]));
  };

  const save = async (check: KeyCheck) => {
    if (option.provider === "openai-compatibility" && chosenModels().length === 0) {
      setError("Choose at least one model for the relay to offer.");
      return;
    }
    setError(null);
    setPhase({ step: "saving", check });
    try {
      await addProviderKey(client, {
        provider: option.provider,
        apiKey: apiKey.trim(),
        baseUrl: option.persistBaseUrl ? (baseUrl.trim() || option.defaultBaseUrl).replace(/\/+$/, "") : undefined,
        groupName: option.needsBaseUrl ? name.trim() : undefined,
        models: option.provider === "openai-compatibility" ? chosenModels() : undefined,
      });
      setPhase({ step: "saved", check, name: displayName });
      onSaved();
    } catch (err) {
      setError(describeApiError(err));
      setPhase({ step: "checked", check });
    }
  };

  const filteredModels = useMemo(() => {
    if (phase.step !== "checked" && phase.step !== "saving") return [];
    if (phase.check.outcome !== "works") return [];
    const filter = modelFilter.trim().toLowerCase();
    return phase.check.models.filter((model) => !filter || model.toLowerCase().includes(filter)).slice(0, 200);
  }, [phase, modelFilter]);

  if (phase.step === "saved") {
    return (
      <Dialog title={`${phase.name} key added`} onClose={onClose} width={520}>
        <div className="saved-card">
          <div className="flow-head">
            <Done />
            <div className="flow-title">
              <div className="flow-name">{phase.check.outcome === "works" ? `${phase.name} key works` : `${phase.name} key added`}</div>
              <div className="flow-plan">
                {phase.check.outcome === "works"
                  ? `Test request passed in ${formatDuration(phase.check.ms)}`
                  : "Not checked. It shows as failing in Usage if the provider rejects it."}
              </div>
            </div>
          </div>
          <div className="key-preview">
            <div>
              <div className="row-title">{phase.name}</div>
              <div className="mono muted">{maskSecret(apiKey)}</div>
            </div>
            <div className="status-label tone-live">
              <StatusDot tone="live" />
              <span>Added</span>
            </div>
          </div>
          <p className="muted small">Other providers and keys in the relay's config were left as they were.</p>
          <div className="flow-actions">
            <span className="flow-spacer" />
            <button type="button" className="button button-primary" onClick={onClose} data-autofocus>
              Done
            </button>
          </div>
        </div>
      </Dialog>
    );
  }

  const check = phase.step === "checked" || phase.step === "saving" ? phase.check : null;

  return (
    <Dialog title="Add an API key" description="A key from a provider you pay per use. The relay checks it before saving." onClose={onClose} width={560}>
      <form onSubmit={runCheck} className="form-stack" noValidate>
        <Segmented
          label="Provider"
          value={providerId}
          onChange={reset}
          className="provider-tabs"
          options={KEY_PROVIDER_OPTIONS.map((item) => ({ value: item.provider, label: item.name }))}
        />
        <p className="muted small">{option.hint}</p>
        {option.needsBaseUrl && (
          <>
            <label className="field">
              <span className="field-label">Name</span>
              <input className="input" value={name} onChange={(event) => {
                  setName(event.target.value);
                  if (phase.step !== "form") setPhase({ step: "form" });
                }}
                placeholder="OpenRouter"
                disabled={busy}
              />
            </label>
            <label className="field">
              <span className="field-label">Endpoint</span>
              <input
                className="input mono"
                value={baseUrl}
                onChange={(event) => {
                  setBaseUrl(event.target.value);
                  if (phase.step !== "form") setPhase({ step: "form" });
                }}
                placeholder="https://openrouter.ai/api/v1"
                spellCheck={false}
                autoComplete="off"
                disabled={busy}
              />
            </label>
          </>
        )}
        <label className="field">
          <span className="field-label">Key</span>
          <span className={`input-wrap ${check?.outcome === "rejected" ? "is-invalid" : ""}`}>
            <input
              className="input mono"
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(event) => {
                setApiKey(event.target.value);
                if (phase.step !== "form") setPhase({ step: "form" });
              }}
              placeholder={option.placeholder}
              spellCheck={false}
              autoComplete="off"
              disabled={busy}
              aria-invalid={check?.outcome === "rejected" ? true : undefined}
              data-autofocus
            />
            <button type="button" className="input-action" onClick={() => setShowKey((value) => !value)} aria-pressed={showKey}>
              {showKey ? "Hide" : "Show"}
            </button>
          </span>
        </label>

        {check?.outcome === "rejected" && (
          <p className="field-error" role="alert">
            {displayName} rejected this key ({check.status}). Check that it's active and copied in full.
          </p>
        )}
        {check?.outcome === "unverified" && (
          <div className="notice notice-warn" role="status">
            <div className="notice-title">
              <StatusDot tone="warn" />
              <span>Couldn't check the key</span>
            </div>
            <div className="notice-body">{check.reason} You can still add it; Usage shows whether requests succeed.</div>
          </div>
        )}
        {check?.outcome === "works" && option.provider === "openai-compatibility" && (
          <fieldset className="model-picker">
            <legend>
              The key works. Choose the models the relay should offer ({check.models.length} available).
            </legend>
            {check.models.length > 12 && (
              <input className="input" placeholder="Filter models" value={modelFilter} onChange={(event) => setModelFilter(event.target.value)} aria-label="Filter models" />
            )}
            <div className="model-list">
              {filteredModels.map((model) => (
                <label key={model} className="check">
                  <input
                    type="checkbox"
                    checked={models.has(model)}
                    onChange={(event) => {
                      const next = new Set(models);
                      if (event.target.checked) next.add(model);
                      else next.delete(model);
                      setModels(next);
                    }}
                  />
                  <span className="mono">{model}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {check && check.outcome !== "rejected" && option.provider === "openai-compatibility" && (check.outcome !== "works" || check.models.length === 0) && (
          <label className="field">
            <span className="field-label">Models to offer, separated by commas</span>
            <input className="input mono" value={manualModels} onChange={(event) => setManualModels(event.target.value)} placeholder="deepseek/deepseek-chat" spellCheck={false} />
          </label>
        )}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}

        <div className="dialog-actions">
          <button type="button" className="button button-ghost" onClick={onClose}>
            Cancel
          </button>
          {check && check.outcome !== "rejected" ? (
            <button type="button" className="button button-primary" disabled={busy} onClick={() => void save(check)}>
              {phase.step === "saving" ? "Saving…" : check.outcome === "works" ? "Add key" : "Add anyway"}
            </button>
          ) : (
            <button type="submit" className="button button-primary" disabled={busy}>
              {phase.step === "checking" ? "Checking…" : check?.outcome === "rejected" ? "Try again" : "Check and add"}
            </button>
          )}
        </div>
      </form>
    </Dialog>
  );
}
