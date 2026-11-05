import { useEffect } from 'react';
import { dayWatcher } from '@/core/day';
import type { Clock } from '@/core/ports';

/** Calls `onChange` when the app's date changes: checked every minute and when the window gets focus. */
export function useDayWatch(clock: Clock, onChange: () => void): void {
  useEffect(() => {
    const check = dayWatcher(clock, onChange);
    const timer = window.setInterval(check, 60_000);
    window.addEventListener('focus', check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', check);
    };
  }, [clock, onChange]);
}
