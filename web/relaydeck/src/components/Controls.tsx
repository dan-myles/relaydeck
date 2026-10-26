import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { CheckIcon, DotsIcon } from "./Icons";

// A single-choice control rendered as a radio group; arrow keys move the choice.
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className = "",
}: {
  label: string;
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (event: KeyboardEvent, index: number) => {
    const delta = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = (index + delta + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div className={`segmented ${className}`} role="radiogroup" aria-label={label}>
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            className={selected ? "segment is-selected" : "segment"}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => onKey(event, index)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function CopyButton({ value, label = "Copy", className = "text-button" }: { value: string; label?: string; className?: string }) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  useEffect(() => {
    if (state === "idle") return;
    const timer = window.setTimeout(() => setState("idle"), 1600);
    return () => window.clearTimeout(timer);
  }, [state]);
  const copy = async () => {
    setState((await copyText(value)) ? "done" : "failed");
  };
  return (
    <button type="button" className={className} onClick={copy}>
      <span aria-live="polite">{state === "done" ? "Copied" : state === "failed" ? "Copy failed" : label}</span>
    </button>
  );
}

// The Clipboard API exists only on secure origins; a relay opened over plain
// HTTP on a LAN address falls back to a hidden textarea.
export async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall through to the legacy path.
  }
  const area = document.createElement("textarea");
  area.value = value;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  area.remove();
  return copied;
}

export type Tone = "live" | "warn" | "bad" | "muted" | "accent";

export function StatusDot({ tone }: { tone: Tone }) {
  return <span className={`dot dot-${tone}`} aria-hidden />;
}

export function Meter({ value, color, label }: { value: number; color?: string; label: string }) {
  const percent = Math.round(Math.min(Math.max(value, 0), 1) * 100);
  return (
    <div className="meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
      <span className="meter-fill" style={{ width: `${percent}%`, background: color }} />
    </div>
  );
}

export function ProviderMark({ color, size = "md" }: { color: string; size?: "sm" | "md" | "lg" }) {
  return (
    <span className={`provider-mark provider-mark-${size}`} style={{ "--provider": color } as CSSProperties} aria-hidden>
      <span />
    </span>
  );
}

export interface MenuItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
}

// Overflow menu: a button that opens a list of actions. Arrow keys move,
// Escape closes and returns focus to the button.
export function OverflowMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>("[role=menuitem]:not([disabled])")?.focus();
    const onDown = (event: MouseEvent) => {
      if (!list.current?.contains(event.target as Node) && !button.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const onKey = (event: KeyboardEvent) => {
    const nodes = Array.from(list.current?.querySelectorAll<HTMLElement>("[role=menuitem]:not([disabled])") ?? []);
    const index = nodes.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      button.current?.focus();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      nodes[(index + 1) % nodes.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      nodes[(index - 1 + nodes.length) % nodes.length]?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div className="menu-anchor">
      <button
        ref={button}
        type="button"
        className="icon-button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <DotsIcon />
      </button>
      {open && (
        <div ref={list} id={id} className="menu" role="menu" aria-label={label} onKeyDown={onKey}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className="menu-item"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                button.current?.focus();
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Notice({ tone, title, children, action }: { tone: Tone; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className={`notice notice-${tone}`} role={tone === "bad" ? "alert" : "status"}>
      <div className="notice-title">
        <StatusDot tone={tone} />
        <span>{title}</span>
      </div>
      {children && <div className="notice-body">{children}</div>}
      {action && <div className="notice-action">{action}</div>}
    </div>
  );
}

export function Done() {
  return (
    <span className="done-mark" aria-hidden>
      <CheckIcon />
    </span>
  );
}
