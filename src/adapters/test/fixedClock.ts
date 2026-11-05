import type { Clock } from '@/core/ports';
import type { ISODate } from '@/core/domain';
import { DEFAULT_DAY, type DayConfig } from '@/core/day';

export class FixedClock implements Clock {
  private readonly todayValue: ISODate;
  private readonly nowValue: string | undefined;
  private cfg: DayConfig = DEFAULT_DAY;

  constructor(today: ISODate, now?: string) {
    this.todayValue = today;
    this.nowValue = now;
  }

  today(): ISODate {
    return this.todayValue;
  }

  calendarDate(): ISODate {
    return this.todayValue;
  }

  /** Stored but unused: the fixed date does not move. */
  configure(cfg: DayConfig): void {
    this.cfg = cfg;
  }

  canStartNewDay(): boolean {
    return false;
  }

  now(): string {
    return this.nowValue ?? `${this.todayValue}T12:00:00.000Z`;
  }
}
