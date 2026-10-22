import type { Clock } from '@/core/ports';
import type { ISODate } from '@/core/domain';

export class FixedClock implements Clock {
  private readonly todayValue: ISODate;
  private readonly nowValue: string | undefined;

  constructor(today: ISODate, now?: string) {
    this.todayValue = today;
    this.nowValue = now;
  }

  today(): ISODate {
    return this.todayValue;
  }

  now(): string {
    return this.nowValue ?? `${this.todayValue}T12:00:00.000Z`;
  }
}
