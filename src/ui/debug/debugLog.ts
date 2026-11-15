import { createDebugLog, type DebugLog, type LogStorage } from '@/core/debug/log';

let store: DebugLog | null = null;

/** Reads `window.localStorage` only when first needed; null when it is missing or blocked. */
function localStorageOrNull(): LogStorage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function get(): DebugLog {
  store ??= createDebugLog({
    storage: localStorageOrNull(),
    now: () => performance.now(),
    wallClock: () => new Date().toISOString(),
  });
  return store;
}

/** The app's debug log; created on first use, so importing this module touches nothing. */
export const debugLog: DebugLog = {
  add: (kind, text) => get().add(kind, text),
  entries: () => get().entries(),
  count: () => get().count(),
  text: () => get().text(),
  clear: () => get().clear(),
  flush: () => get().flush(),
};

export function logDebug(kind: string, text: string): void {
  debugLog.add(kind, text);
}
