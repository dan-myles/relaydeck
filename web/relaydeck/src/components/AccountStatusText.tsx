import type { AccountState } from "../lib/accounts";
import { StatusDot, type Tone } from "./Controls";

export const STATE_TONE: Record<AccountState, Tone> = {
  live: "live",
  cooling: "warn",
  "signed-out": "warn",
  paused: "muted",
  error: "bad",
};

export function AccountStatusText({ state, label, detail }: { state: AccountState; label: string; detail?: string }) {
  return (
    <div className="status-text">
      <div className={`status-label tone-${STATE_TONE[state]}`}>
        <StatusDot tone={STATE_TONE[state]} />
        <span>{label}</span>
      </div>
      {detail && <div className="status-detail">{detail}</div>}
    </div>
  );
}
