import { useState, type FormEvent } from "react";
import { ApiError, ManagementClient } from "../api/client";
import { ADVANCED_URL } from "../lib/session";
import { BrandMark } from "../components/Icons";

export function loginErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return "Something went wrong. Try again.";
  switch (error.kind) {
    case "unauthorized":
      return "That key wasn't accepted. Repeated wrong keys lock this address out for 30 minutes.";
    case "forbidden":
      return error.message.includes("remote")
        ? "This relay only accepts management from its own machine. Turn on management.allow-remote to sign in from here."
        : error.message || "The relay refused the sign-in.";
    case "management-off":
      return "Management is off on this relay. Set management.secret-key in its config, then restart it.";
    case "network":
      return "The relay didn't answer. Check that it's running.";
    default:
      return error.message || `The relay answered ${error.status}.`;
  }
}

export function Login({ onSignedIn }: { onSignedIn: (key: string, remember: boolean) => void }) {
  const [key, setKey] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = key.trim();
    if (!trimmed) {
      setError("Enter the management key.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await new ManagementClient(trimmed).request("/credentials?page=1&page_size=1");
      onSignedIn(trimmed, remember);
    } catch (err) {
      setError(loginErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <main className="login">
      <form className="login-card glass" onSubmit={submit} aria-labelledby="login-title" noValidate>
        <div className="dock-brand">
          <BrandMark />
          <span>Relaydeck</span>
        </div>
        <h1 id="login-title">Sign in to your relay</h1>
        <p className="muted">Use the management key from this relay's config (management.secret-key). It stays in this browser.</p>
        <label className="field">
          <span className="field-label">Management key</span>
          <input
            className="input mono"
            type="password"
            autoComplete="current-password"
            spellCheck={false}
            value={key}
            onChange={(event) => setKey(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "login-error" : undefined}
            data-autofocus
            autoFocus
          />
        </label>
        <label className="check">
          <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
          <span>Remember on this device</span>
        </label>
        {error && (
          <p id="login-error" className="field-error" role="alert">
            {error}
          </p>
        )}
        <div className="login-actions">
          <a className="text-button" href={ADVANCED_URL}>
            Open Advanced instead
          </a>
          <button type="submit" className="button button-primary" disabled={busy}>
            {busy ? "Checking…" : "Sign in"}
          </button>
        </div>
      </form>
    </main>
  );
}
