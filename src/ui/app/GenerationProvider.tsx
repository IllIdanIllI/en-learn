import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { GenerateResult, GenStage, OnStage } from '@/core/session/generate';
import type { GenError } from '@/ui/today/StartSession';

type Progress = { stage: GenStage; attempt: number };

interface GenerationValue {
  running: boolean;
  progress: Progress | null;
  error: GenError | null;
  /** Runs one job; ignored while another one runs. */
  run(job: (onStage: OnStage) => Promise<GenerateResult>): Promise<void>;
  clearError(): void;
  /** Increments when a job ends, so a page reads its state again. */
  version: number;
}

const Context = createContext<GenerationValue | null>(null);

/** Holds the running lesson or round job above the routes, so leaving Today neither loses the loader nor offers a second job. */
export function GenerationProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<GenError | null>(null);
  const [version, setVersion] = useState(0);
  const running = useRef(false);

  const run = useCallback(async (job: (onStage: OnStage) => Promise<GenerateResult>) => {
    if (running.current) return;
    running.current = true;
    setProgress({ stage: 'writing', attempt: 1 });
    setError(null);
    try {
      const res = await job((stage, attempt) => setProgress({ stage, attempt }));
      if (!res.ok) setError({ message: res.message, code: res.code });
    } catch (e) {
      setError({ message: e instanceof Error ? e.message : String(e) });
    } finally {
      running.current = false;
      setProgress(null);
      setVersion((n) => n + 1);
    }
  }, []);
  const clearError = useCallback(() => setError(null), []);

  const value = useMemo(
    () => ({ running: progress !== null, progress, error, run, clearError, version }),
    [progress, error, run, clearError, version],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useGeneration(): GenerationValue {
  const value = useContext(Context);
  if (!value) throw new Error('useGeneration must be used inside GenerationProvider');
  return value;
}
