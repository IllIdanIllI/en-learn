import { useCallback, useEffect, useRef, useState } from 'react';

const SHOW_MS = 3000;

/** A "Saved" flag: markSaved shows it for `ms` (three seconds by default), clear hides it at once. */
export function useSavedFlag(ms = SHOW_MS): { saved: boolean; markSaved(): void; clear(): void } {
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const clear = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    setSaved(false);
  }, []);

  const markSaved = useCallback(() => {
    clearTimeout(timer.current);
    setSaved(true);
    timer.current = setTimeout(() => {
      timer.current = undefined;
      setSaved(false);
    }, ms);
  }, [ms]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return { saved, markSaved, clear };
}
