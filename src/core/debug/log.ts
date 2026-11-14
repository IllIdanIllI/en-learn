export interface LogEntry {
  /** Milliseconds since this run started, rounded. */
  t: number;
  kind: string;
  text: string;
}

export interface LogStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface DebugLog {
  add(kind: string, text: string): void;
  entries(): { previous: LogEntry[]; current: LogEntry[] };
  count(): number;
  text(): string;
  clear(): void;
  flush(): void;
}

export const LOG_KEY = 'en-learn.debugLog';

const DEFAULT_CAP = 1000;

function isEntry(value: unknown): value is LogEntry {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.t === 'number' && typeof v.kind === 'string' && typeof v.text === 'string';
}

/** Reads the stored log; anything unreadable counts as empty. */
function readStored(storage: LogStorage | null): LogEntry[] {
  try {
    const raw = storage?.getItem(LOG_KEY) ?? null;
    if (raw === null) return [];
    const parsed = JSON.parse(raw) as { current?: unknown };
    return Array.isArray(parsed.current) ? parsed.current.filter(isEntry) : [];
  } catch {
    return [];
  }
}

/** Keeps the entries of this run and the previous one; storage failures are ignored. */
export function createDebugLog(opts: { storage: LogStorage | null; now: () => number; wallClock: () => string; cap?: number }): DebugLog {
  const { storage, now, wallClock } = opts;
  const cap = opts.cap ?? DEFAULT_CAP;
  const start = now();
  // The stored run becomes the previous run; the stored previous run is dropped.
  let previous: LogEntry[] = readStored(storage);
  let current: LogEntry[] = [{ t: 0, kind: 'run', text: wallClock() }];
  let dirty = true;

  // Drops the previous run first, then the oldest entries of this run.
  function trim() {
    while (previous.length + current.length > cap) {
      if (previous.length > 0) previous.shift();
      else current.shift();
    }
  }

  function add(kind: string, text: string) {
    current.push({ t: Math.round(now() - start), kind, text });
    dirty = true;
    trim();
  }

  function formatRun(entries: LogEntry[]): string[] {
    return entries.map((e) => `+${(e.t / 1000).toFixed(3)}s ${e.kind} ${e.text}`);
  }

  return {
    add,
    entries: () => ({ previous: [...previous], current: [...current] }),
    count: () => previous.length + current.length,
    text() {
      const lines: string[] = [];
      if (previous.length > 0) lines.push('--- previous run ---', ...formatRun(previous));
      lines.push('--- this run ---', ...formatRun(current));
      return lines.join('\n');
    },
    clear() {
      previous = [];
      current = [];
      dirty = true;
    },
    flush() {
      if (!dirty) return;
      dirty = false;
      try {
        storage?.setItem(LOG_KEY, JSON.stringify({ previous, current }));
      } catch {
        // Full or blocked storage: the entries stay in memory.
      }
    },
  };
}
