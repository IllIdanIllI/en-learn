import { useEffect, useState } from 'react';
import { loadGardenState } from '@/core/progress/garden';
import { useCore } from '@/ui/app/CoreProvider';

/** Garden state for today; reloads when the data version changes. */
export function useGarden(): { fireflies: number; todayClosed: boolean } {
  const { deps, version } = useCore();
  const [state, setState] = useState({ fireflies: 0, todayClosed: false });
  useEffect(() => {
    let live = true;
    loadGardenState(deps.db, deps.clock.today())
      .then((s) => live && setState(s))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [deps, version]);
  return state;
}
