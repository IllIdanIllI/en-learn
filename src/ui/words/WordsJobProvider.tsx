import { createContext, useCallback, useEffect, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { generatePhonetics, generateWords } from '@/core/words/generate';
import { fixSavedWordNames } from '@/core/words/name';
import { wordsMissingPhonetics } from '@/core/words/phonetics';
import { listWords } from '@/core/db/repos/words';
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
  // Start-up phonetics run: runs after the queue is empty, never shown in `active` (its words stay ready).
  const phonetics = useRef<number[]>([]);
  const looping = useRef(false);
  const current = useRef<number[]>([]);
  const started = useRef(false);

  const loop = useCallback(async () => {
    looping.current = true;
    try {
      while (queue.current.length > 0 || phonetics.current.length > 0) {
        if (queue.current.length === 0) {
          // Silent: no progress, so the Words page does not show "Creating exercises" or lock Regenerate.
          const ids = phonetics.current.splice(0);
          try {
            await generatePhonetics(depsRef.current, ids);
          } catch {
            // The words keep what they have; the next start runs them once more.
          }
          setVersion((n) => n + 1);
          continue;
        }
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
        if (stop) {
          queue.current = [];
          phonetics.current = [];
        }
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
  const runPhonetics = useCallback(
    (ids: number[]) => {
      if (ids.length === 0) return;
      phonetics.current.push(...ids);
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
  const runPhoneticsRef = useRef(runPhonetics);
  useEffect(() => {
    runPhoneticsRef.current = runPhonetics;
  }, [runPhonetics]);
  // Saved words with a bracketed tail are renamed once, then regenerated; then ready words without a transcription get
  // the phonetics run. Both once per start; StrictMode's second mount sees the ref set.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        const db = depsRef.current.db;
        const ids = await fixSavedWordNames(db);
        if (ids.length > 0) runRef.current(ids);
        runPhoneticsRef.current(wordsMissingPhonetics(await listWords(db)));
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
