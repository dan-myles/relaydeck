import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Tone } from "./Controls";
import { StatusDot } from "./Controls";

interface ToastMessage {
  id: number;
  text: string;
  tone: Tone;
}

const ToastContext = createContext<(text: string, tone?: Tone) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<ToastMessage | null>(null);
  const show = useCallback((text: string, tone: Tone = "live") => setMessage({ id: Date.now(), text, tone }), []);
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), 4200);
    return () => window.clearTimeout(timer);
  }, [message]);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-region" aria-live="polite" role="status">
        {message && (
          <div key={message.id} className="toast">
            <StatusDot tone={message.tone} />
            <span>{message.text}</span>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
