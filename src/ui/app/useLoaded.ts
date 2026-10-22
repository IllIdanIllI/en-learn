import { useEffect, useState } from 'react';
import { useCore } from './CoreProvider';

export type Loaded<T> = { data: T } | { error: string } | null;

/** Runs `load` on mount and again when `key` or the core version changes; stale results are dropped. */
export function useLoaded<T>(load: () => Promise<T>, key: string | number = 0): Loaded<T> {
  const { version } = useCore();
  const [state, setState] = useState<Loaded<T>>(null);
  useEffect(() => {
    let live = true;
    load().then(
      (data) => {
        if (live) setState({ data });
      },
      (e: unknown) => {
        if (live) setState({ error: e instanceof Error ? e.message : String(e) });
      },
    );
    return () => {
      live = false;
    };
    // `load` is a fresh closure on every render; the page changes `key` when data must be read again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, key]);
  return state;
}
