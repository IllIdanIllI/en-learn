import { createContext, useCallback, useEffect, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { generateWords } from '@/core/words/generate';
import { fixSavedWordNames } from '@/core/words/name';
import { planFill, runFill } from '@/core/words/fill';
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
  /** The visible fill run (empty transcriptions); null when it is not running. */
  fill: Progress | null;
  /** The message of a fill run that failed; Retry clears it and runs the fill again. */
  fillError: string | null;
  /** Starts the fill run unless one runs or a generation runs; once the name fix is done. */
  startFill(): void;
  retryFill(): void;
}

const Context = createContext<WordsJobValue | null>(null);

/** Holds the words generation job above the routes, so leaving the Words page neither loses it nor starts a second one. */
export function WordsJobProvider({ children }: { children: ReactNode }) {
  const { deps, lang } = useCore();
  const depsRef = useRef(deps);
  const langRef = useRef(lang);
  useEffect(() => {
    depsRef.current = deps;
    langRef.current = lang;
  }, [deps, lang]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<GenError | null>(null);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<ReadonlySet<number>>(new Set());
  const [version, setVersion] = useState(0);
  const [fill, setFill] = useState<Progress | null>(null);
  const [fillError, setFillError] = useState<string | null>(null);
  const queue = useRef<number[]>([]);
  const looping = useRef(false);
  const current = useRef<number[]>([]);
  const filling = useRef(false);
  // The fill in flight: a generation awaits it before each of its calls, so the two never hold the job lock together.
  const fillPromise = useRef<Promise<void> | null>(null);
  // Words the fill run left without a transcription, or that a failed call could not fill: not tried again in this app run.
  const skip = useRef<Set<number>>(new Set());
  // The name fix runs once per app start; the fill run waits for it so its queue goes first.
  const nameFix = useRef<Promise<void> | null>(null);
  // loop calls startFill after it ends; startFill is defined below loop, so loop reaches it through this ref.
  const startFillRef = useRef<() => void>(() => undefined);

  const loop = useCallback(async () => {
    looping.current = true;
    try {
      while (queue.current.length > 0) {
        const ids = queue.current.splice(0);
        current.current = ids;
        setProgress({ done: 0, total: ids.length });
        let stop = false;
        try {
          // A fill yields at its next transcription batch; its dictionary step may still run, and this waits for that too.
          if (fillPromise.current) await fillPromise.current;
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
      // After this finally, so startFill sees the generation as finished.
      queueMicrotask(() => startFillRef.current());
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
  const fixNames = useCallback(() => {
    if (nameFix.current === null) {
      nameFix.current = (async () => {
        try {
          const ids = await fixSavedWordNames(depsRef.current.db);
          if (ids.length > 0) run(ids);
        } catch (e) {
          setError({ message: e instanceof Error ? e.message : String(e) });
        }
      })();
    }
    return nameFix.current;
  }, [run]);

  const fillLoop = useCallback(async () => {
    try {
      await fixNames();
      // A generation started meanwhile (for example by the name fix) goes first; its end starts the fill again.
      if (looping.current) return;
      const plan = planFill(await listWords(depsRef.current.db), skip.current, { lang: langRef.current, net: depsRef.current.net !== undefined });
      setFillError(null);
      if (plan.phonetics.length + plan.dict.length === 0) return;
      try {
        const res = await runFill(depsRef.current, plan, (done, total) => setFill({ done, total }), () => looping.current);
        for (const id of res.emptied) skip.current.add(id);
        // A busy lock is not an error: the words stay empty and the next visit runs them.
        if (!res.ok && !res.busy) setFillError(res.message);
      } finally {
        setVersion((n) => n + 1);
      }
    } catch (e) {
      setFillError(e instanceof Error ? e.message : String(e));
    } finally {
      setFill(null);
      filling.current = false;
    }
  }, [fixNames]);
  const startFill = useCallback(() => {
    if (filling.current || looping.current) return;
    // Set before the first await, so a second call (StrictMode, a quick revisit) returns at once.
    filling.current = true;
    fillPromise.current = fillLoop();
  }, [fillLoop]);
  const retryFill = useCallback(() => {
    setFillError(null);
    startFill();
  }, [startFill]);
  useEffect(() => {
    startFillRef.current = startFill;
  }, [startFill]);

  const clearNotices = useCallback(() => {
    setBusy(false);
    setError(null);
  }, []);

  // Saved words with a bracketed tail are renamed once per app start, then regenerated. The fill run is not started here:
  // the Words page calls startFill on its visits, so a lesson started at app start is not blocked by it.
  useEffect(() => {
    void fixNames();
  }, [fixNames]);

  const value = useMemo(
    () => ({ running: progress !== null, progress, error, busy, active, run, clearNotices, version, fill, fillError, startFill, retryFill }),
    [progress, error, busy, active, run, clearNotices, version, fill, fillError, startFill, retryFill],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useWordsJob(): WordsJobValue {
  const value = useContext(Context);
  if (!value) throw new Error('useWordsJob must be used inside WordsJobProvider');
  return value;
}
