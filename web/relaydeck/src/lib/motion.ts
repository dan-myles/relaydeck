import { useEffect, useState } from "react";

const MOTION_KEY = "relaydeck.motion";

function readPaused(): boolean {
  try {
    return window.localStorage.getItem(MOTION_KEY) === "paused";
  } catch {
    return false;
  }
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export interface MotionState {
  // The user pressed Pause; remembered on this device.
  paused: boolean;
  // The system asks for reduced motion; the art stays still regardless.
  reduced: boolean;
  animating: boolean;
  togglePaused: () => void;
}

export function useMotion(): MotionState {
  const [paused, setPaused] = useState(readPaused);
  const [reduced, setReduced] = useState(prefersReducedMotion);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const togglePaused = () => {
    setPaused((current) => {
      const next = !current;
      try {
        if (next) window.localStorage.setItem(MOTION_KEY, "paused");
        else window.localStorage.removeItem(MOTION_KEY);
      } catch {
        // Not persisted; still applies to this tab.
      }
      return next;
    });
  };

  return { paused, reduced, animating: !paused && !reduced, togglePaused };
}
