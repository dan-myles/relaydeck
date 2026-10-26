import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "./Icons";

// Open dialogs, innermost last. Only the innermost one handles keys.
const stack: symbol[] = [];

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface DialogProps {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  variant?: "modal" | "drawer";
  width?: number;
  // Hides the title visually while keeping it as the accessible name.
  hideTitle?: boolean;
  header?: ReactNode;
}

// A modal dialog or side drawer: focus moves in, Tab stays inside, Escape and
// the backdrop close it, and focus returns to the opener.
export function Dialog({ title, description, onClose, children, footer, variant = "modal", width, hideTitle, header }: DialogProps) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const token = Symbol("dialog");
    stack.push(token);
    const opener = document.activeElement as HTMLElement | null;
    const node = panel.current;
    // Focus the requested field, else the dialog itself, so it is announced
    // by name without putting a focus ring on the close button.
    (node?.querySelector<HTMLElement>("[data-autofocus]") ?? node)?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (event: KeyboardEvent) => {
      if (stack[stack.length - 1] !== token) return;
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      stack.splice(stack.indexOf(token), 1);
      if (stack.length === 0) document.body.style.overflow = previousOverflow;
      opener?.focus?.();
    };
  }, []);

  return createPortal(
    <div className={`overlay overlay-${variant}`} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div
        ref={panel}
        className={`dialog dialog-${variant}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        style={width ? { maxWidth: width } : undefined}
      >
        {variant === "drawer" && <div className="drawer-handle" aria-hidden />}
        <div className="dialog-head">
          {header}
          {!header && (
            <h2 id={titleId} className={hideTitle ? "visually-hidden" : "dialog-title"}>
              {title}
            </h2>
          )}
          {header && (
            <h2 id={titleId} className="visually-hidden">
              {title}
            </h2>
          )}
          <button type="button" className="icon-button dialog-close" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        {description && (
          <div id={descriptionId} className="dialog-description">
            {description}
          </div>
        )}
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
