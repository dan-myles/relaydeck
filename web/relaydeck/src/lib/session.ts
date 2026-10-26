// The management key lives in sessionStorage (this tab only) unless the user
// asks to be remembered on this device. It never goes into the URL.

const KEY_NAME = "relaydeck.management-key";

export function loadStoredKey(): string | null {
  try {
    return window.sessionStorage.getItem(KEY_NAME) ?? window.localStorage.getItem(KEY_NAME);
  } catch {
    return null;
  }
}

export function storeKey(key: string, remember: boolean): void {
  try {
    window.sessionStorage.setItem(KEY_NAME, key);
    if (remember) window.localStorage.setItem(KEY_NAME, key);
    else window.localStorage.removeItem(KEY_NAME);
  } catch {
    // Storage can be unavailable (private mode); the key stays in memory.
  }
}

export function clearStoredKey(): void {
  try {
    window.sessionStorage.removeItem(KEY_NAME);
    window.localStorage.removeItem(KEY_NAME);
  } catch {
    // Nothing stored.
  }
}

// The upstream management panel, served by this relay from the same origin.
export const ADVANCED_URL = "/management-advanced.html";
