import type { MotionState } from "../lib/motion";
import { ADVANCED_URL } from "../lib/session";
import { formatCount } from "../lib/format";
import { useRelay } from "../state/relay";
import { ArrowUpRight, BrandMark, ChartIcon, LinkIcon, PauseIcon, PlayIcon } from "../components/Icons";
import { StatusDot } from "../components/Controls";
import { routeHref, type Route } from "./route";

export function relayPortLabel(): string {
  const { port, protocol } = window.location;
  return `:${port || (protocol === "https:" ? "443" : "80")}`;
}

function useChromeFacts() {
  const { accounts, error, loaded } = useRelay();
  const attention = accounts.filter((account) => account.status.state === "signed-out" || account.status.state === "error").length;
  const current = accounts.reduce((sum, account) => {
    const buckets = account.credential.recent_requests ?? [];
    const last = buckets[buckets.length - 1];
    return sum + (last ? last.success + last.failed : 0);
  }, 0);
  const reference = accounts.find((account) => (account.credential.recent_requests ?? []).length > 0);
  const buckets = reference?.credential.recent_requests ?? [];
  const since = buckets.length > 0 ? buckets[buckets.length - 1].time.split("-")[0] : "";
  const reachable = loaded && !error;
  return { attention, current, since, reachable, loaded };
}

function NavLinks({ route, attention, variant }: { route: Route; attention: number; variant: "dock" | "tabs" }) {
  const items = [
    { page: "setup" as const, label: "Setup", icon: <LinkIcon />, badge: attention },
    { page: "usage" as const, label: "Usage", icon: <ChartIcon />, badge: 0 },
  ];
  return (
    <nav className={variant === "dock" ? "dock-nav" : "tabbar-nav"} aria-label="Pages">
      {items.map((item) => {
        const active = route.page === item.page;
        return (
          <a key={item.page} href={routeHref({ page: item.page })} className={active ? "nav-item is-active" : "nav-item"} aria-current={active ? "page" : undefined}>
            {item.icon}
            <span>{item.label}</span>
            {item.badge > 0 && (
              <span className="nav-badge" aria-label={`${item.badge} need attention`}>
                <StatusDot tone="warn" />
                {variant === "dock" && <span aria-hidden>{item.badge}</span>}
              </span>
            )}
          </a>
        );
      })}
    </nav>
  );
}

export function ModeSwitch({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "mode-switch is-compact" : "mode-switch"} role="group" aria-label="Interface mode">
      <span className="segment is-selected" aria-current="page">
        Simple
      </span>
      <a className="segment" href={ADVANCED_URL} title="Open the full management panel">
        Advanced
        {!compact && <ArrowUpRight />}
      </a>
    </div>
  );
}

function MotionButton({ motion, compact }: { motion: MotionState; compact?: boolean }) {
  if (motion.reduced) {
    return (
      <span className={compact ? "motion-chip is-icon" : "motion-chip"} title="Your system asks for reduced motion">
        {compact ? <PauseIcon /> : "Still"}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={compact ? "motion-chip is-icon" : "motion-chip"}
      aria-pressed={motion.paused}
      aria-label={motion.paused ? "Play background motion" : "Pause background motion"}
      onClick={motion.togglePaused}
    >
      {motion.paused ? <PlayIcon /> : <PauseIcon />}
      {!compact && <span>{motion.paused ? "Play" : "Pause"}</span>}
    </button>
  );
}

export function Dock({ route, motion }: { route: Route; motion: MotionState }) {
  const { signOut } = useRelay();
  const facts = useChromeFacts();
  return (
    <aside className="dock glass" aria-label="Relaydeck">
      <div className="dock-brand">
        <BrandMark />
        <span>Relaydeck</span>
      </div>
      <NavLinks route={route} attention={facts.attention} variant="dock" />
      <div className="dock-status" role="status">
        <div className="dock-status-line">
          <StatusDot tone={facts.reachable ? "accent" : facts.loaded ? "bad" : "muted"} />
          <span>{facts.reachable ? `Relay running on ${relayPortLabel()}` : facts.loaded ? "Relay not answering" : "Connecting…"}</span>
        </div>
        {facts.reachable && (
          <div className="dock-status-sub">
            {formatCount(facts.current)} {facts.current === 1 ? "request" : "requests"}
            {facts.since ? ` since ${facts.since}` : " in the last 10 minutes"}
          </div>
        )}
      </div>
      <div className="dock-row">
        <span className="dock-label">Background motion</span>
        <MotionButton motion={motion} />
      </div>
      <ModeSwitch />
      <button type="button" className="dock-signout" onClick={signOut}>
        Sign out
      </button>
    </aside>
  );
}

export function CompactTopBar({ motion }: { motion: MotionState }) {
  return (
    <header className="topbar glass">
      <div className="dock-brand">
        <BrandMark size={26} />
        <span>Relaydeck</span>
      </div>
      <MotionButton motion={motion} compact />
      <ModeSwitch compact />
    </header>
  );
}

export function RunningChip() {
  const facts = useChromeFacts();
  return (
    <div className="running-chip glass" role="status">
      <StatusDot tone={facts.reachable ? "accent" : facts.loaded ? "bad" : "muted"} />
      <span>
        {facts.reachable ? `Running on ${relayPortLabel()} · ${formatCount(facts.current)}${facts.since ? ` since ${facts.since}` : ""}` : facts.loaded ? "Relay not answering" : "Connecting…"}
      </span>
    </div>
  );
}

export function TabBar({ route }: { route: Route }) {
  const { attention } = useChromeFacts();
  return (
    <div className="tabbar glass">
      <NavLinks route={route} attention={attention} variant="tabs" />
    </div>
  );
}

export function CompactSignOut() {
  const { signOut } = useRelay();
  return (
    <div className="compact-footer">
      <a href={ADVANCED_URL}>Open Advanced</a>
      <button type="button" className="text-button" onClick={signOut}>
        Sign out
      </button>
    </div>
  );
}
