import type { Clock } from '@/core/ports';
import type { ISODate } from '@/core/domain';
import { appDate, canStartNewDay, DEFAULT_DAY, localDate, type DayConfig } from '@/core/day';

/** Dates are the local calendar day shifted by the day config; `now()` is an ISO instant. */
export class TauriClock implements Clock {
  private cfg: DayConfig = DEFAULT_DAY;

  configure(cfg: DayConfig): void {
    this.cfg = cfg;
  }

  today(): ISODate {
    return appDate(new Date(), this.cfg);
  }

  calendarDate(): ISODate {
    return localDate(new Date());
  }

  canStartNewDay(): boolean {
    return canStartNewDay(new Date(), this.cfg);
  }

  now(): string {
    return new Date().toISOString();
  }
}
