import { describe, expect, test, vi } from 'vitest';
import { createDebugLog, LOG_KEY, type DebugLog, type LogStorage } from '@/core/debug/log';

function spyStorage(initial: string | null = null): LogStorage & { getItem: ReturnType<typeof vi.fn>; setItem: ReturnType<typeof vi.fn> } {
  const data = new Map<string, string>();
  if (initial !== null) data.set(LOG_KEY, initial);
  return {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      data.set(key, value);
    }),
  };
}

function make(storage: LogStorage | null, cap?: number) {
  let ms = 0;
  const log = createDebugLog({ storage, now: () => ms, wallClock: () => 'WALL', ...(cap === undefined ? {} : { cap }) });
  return { log, setNow: (next: number) => (ms = next) };
}

describe('debug log', () => {
  test('keeps this run and the previous one', () => {
    const storage = spyStorage(JSON.stringify({ previous: [{ t: 0, kind: 'old', text: 'a' }], current: [{ t: 5, kind: 'k', text: 'b' }] }));
    const { log } = make(storage);
    expect(log.entries().previous).toEqual([{ t: 5, kind: 'k', text: 'b' }]);
    expect(log.entries().current).toEqual([{ t: 0, kind: 'run', text: 'WALL' }]);
  });

  test('caps at 1000 over both runs, dropping the previous run first, then the oldest current', () => {
    const old = Array.from({ length: 600 }, (_, i) => ({ t: i, kind: 'old', text: String(i) }));
    const storage = spyStorage(JSON.stringify({ previous: [], current: old }));
    const { log } = make(storage);
    for (let i = 0; i < 500; i += 1) log.add('k', `n${i}`);
    expect(log.count()).toBe(1000);
    expect(log.entries().previous).toHaveLength(499);
    expect(log.entries().previous[0]?.text).toBe('101');
    for (let i = 500; i < 1700; i += 1) log.add('k', `n${i}`);
    expect(log.count()).toBe(1000);
    expect(log.entries().previous).toEqual([]);
    expect(log.entries().current).toHaveLength(1000);
    expect(log.entries().current[0]?.text).toBe('n700');
    expect(log.entries().current.at(-1)?.text).toBe('n1699');
  });

  test('flush writes once to LOG_KEY', () => {
    const storage = spyStorage();
    const { log } = make(storage);
    log.add('a', 'b');
    log.flush();
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    const [key, value] = storage.setItem.mock.calls[0] as [string, string];
    expect(key).toBe(LOG_KEY);
    expect(JSON.parse(value).current.at(-1)).toEqual({ t: 0, kind: 'a', text: 'b' });
    log.flush();
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });

  test('add alone does not write', () => {
    const storage = spyStorage();
    const { log } = make(storage);
    log.add('a', 'b');
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  test('storage that throws on getItem or setItem is ignored', () => {
    const storage: LogStorage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('full');
      },
    };
    let log!: DebugLog;
    expect(() => {
      log = make(storage).log;
    }).not.toThrow();
    expect(() => {
      log.add('a', 'b');
      log.flush();
    }).not.toThrow();
    expect(log.count()).toBe(2);
  });

  test('a corrupt stored value counts as empty', () => {
    const { log } = make(spyStorage('{not json'));
    expect(log.entries().previous).toEqual([]);
    expect(log.count()).toBe(1);
  });

  test('text() has run headers and relative times, and leaves out an empty previous run', () => {
    const { log, setNow } = make(spyStorage());
    expect(log.text()).toBe('--- this run ---\n+0.000s run WALL');
    setNow(1234);
    log.add('click', 'hi');
    expect(log.text()).toBe('--- this run ---\n+0.000s run WALL\n+1.234s click hi');

    const withPrevious = make(spyStorage(JSON.stringify({ previous: [], current: [{ t: 1234, kind: 'old', text: 'x' }] })));
    expect(withPrevious.log.text()).toBe('--- previous run ---\n+1.234s old x\n--- this run ---\n+0.000s run WALL');
  });

  test('clear() empties both runs and writes the empty state on the next flush', () => {
    const storage = spyStorage();
    const { log } = make(storage);
    log.add('a', 'b');
    log.clear();
    expect(log.count()).toBe(0);
    expect(log.entries()).toEqual({ previous: [], current: [] });
    log.flush();
    expect(storage.setItem).toHaveBeenCalledWith(LOG_KEY, JSON.stringify({ previous: [], current: [] }));
  });
});
