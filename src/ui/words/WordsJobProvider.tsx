import { createContext, useCallback, useEffect, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { generateWords } from '@/core/words/generate';
import { fixSavedWordNames } from '@/core/words/name';
import { useCore } from '@/ui/app/CoreProvider';
import type { GenError } from '@/ui/today/StartSession';

type Progress = { done: number; total: number };

interface WordsJobValue {
  running: boolean;
  progress: Progress | null;
  error: GenError | null;
  /** A job found the core lock taken (a lesson is being built); the words that did not run stay pending. */
  busy: boolean;
  /** Ids of the running job and of the queued ones. */
  active: ReadonlySet<number>;
  /** Queues word ids (deduplicated); ids that arrive while a job runs wait and run after it. */
  run(ids: number[]): void;
  clearNotices(): void;
  /** Increments when a job ends, so a page reads its state again. */
  version: number;
}

const Context = createContext<WordsJobValue | null>(null);

/** Holds the words generation job above the routes, so leaving the Words page neither loses it nor starts a second one. */
export function WordsJobProvider({ children }: { children: ReactNode }) {
  const { deps } = useCore();
  const depsRef = useRef(deps);
  useEffect(() => {
    depsRef.current = deps;
  }, [deps]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<GenError | null>(null);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<ReadonlySet<number>>(new Set());
  const [version, setVersion] = useState(0);
  const queue = useRef<number[]>([]);
  const looping = useRef(false);
  const current = useRef<number[]>([]);
  const started = useRef(false);

  const loop = useCallback(async () => {
    looping.current = true;
    try {
      while (queue.current.length > 0) {
        const ids = queue.current.splice(0);
        current.current = ids;
        setProgress({ done: 0, total: ids.length });
        let stop = false;
        try {
          const res = await generateWords(depsRef.current, ids, (done, total) => setProgress({ done, total }));
          if (!res.ok) {
            if (res.code === 'busy') {
              setBusy(true);
              stop = true;
            } else {
              setError({ message: res.message, code: res.code });
            }
          }
        } catch (e) {
          setError({ message: e instanceof Error ? e.message : String(e) });
        }
        current.current = [];
        if (stop) queue.current = [];
        const left = new Set(queue.current);
        setActive(left);
        setVersion((n) => n + 1);
      }
    } finally {
      looping.current = false;
      setProgress(null);
    }
  }, []);

  const run = useCallback(
    (ids: number[]) => {
      const fresh = ids.filter((id, i) => ids.indexOf(id) === i && !queue.current.includes(id) && !current.current.includes(id));
      if (fresh.length === 0) return;
      queue.current.push(...fresh);
      setBusy(false);
      setError(null);
      setActive((prev) => new Set([...prev, ...fresh]));
      if (!looping.current) void loop();
    },
    [loop],
  );
  const clearNotices = useCallback(() => {
    setBusy(false);
    setError(null);
  }, []);

  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  }, [run]);
  // Saved words with a bracketed tail are renamed once, then regenerated; StrictMode's second mount sees the ref set.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        const ids = await fixSavedWordNames(depsRef.current.db);
        if (ids.length > 0) runRef.current(ids);
      } catch (e) {
        setError({ message: e instanceof Error ? e.message : String(e) });
      }
    })();
  }, []);

  const value = useMemo(
    () => ({ running: progress !== null, progress, error, busy, active, run, clearNotices, version }),
    [progress, error, busy, active, run, clearNotices, version],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useWordsJob(): WordsJobValue {
  const value = useContext(Context);
  if (!value) throw new Error('useWordsJob must be used inside WordsJobProvider');
  return value;
}
