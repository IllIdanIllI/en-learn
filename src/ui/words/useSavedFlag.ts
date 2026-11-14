import { useCallback, useEffect, useRef, useState } from 'react';

const SHOW_MS = 3000;

/** A "Saved" flag: markSaved shows it for three seconds, clear hides it at once. */
export function useSavedFlag(): { saved: boolean; markSaved(): void; clear(): void } {
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
    }, SHOW_MS);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return { saved, markSaved, clear };
}
