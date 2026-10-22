import type { Clock } from '@/core/ports';
import type { ISODate } from '@/core/domain';

const pad = (n: number): string => String(n).padStart(2, '0');

/** Dates are the local calendar day; `now()` is an ISO instant. */
export class TauriClock implements Clock {
  today(): ISODate {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  now(): string {
    return new Date().toISOString();
  }
}
