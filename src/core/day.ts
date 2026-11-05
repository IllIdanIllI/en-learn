import type { ISODate } from './domain';

export interface DayConfig {
  /** Whole hours 0-12: the app's day starts at this local hour. */
  dayStartHour: number;
  /** Set by "Start a new day"; stops mattering once the rule date reaches it. */
  overrideDate: ISODate | null;
}

export const DEFAULT_DAY: DayConfig = { dayStartHour: 5, overrideDate: null };

const pad = (n: number): string => String(n).padStart(2, '0');

/** The local calendar date. */
export function localDate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The local calendar date of (now - start hour), built from local components so DST follows the local clock. */
export function ruleDate(now: Date, startHour: number): ISODate {
  return localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() - startHour, now.getMinutes(), now.getSeconds()));
}

/** The app's date: the later of the rule date and the override date. */
export function appDate(now: Date, cfg: DayConfig): ISODate {
  const rule = ruleDate(now, cfg.dayStartHour);
  return cfg.overrideDate !== null && cfg.overrideDate > rule ? cfg.overrideDate : rule;
}

/** True while the app's date is behind the calendar date (before the start hour). */
export function canStartNewDay(now: Date, cfg: DayConfig): boolean {
  return cfg.dayStartHour > 0 && appDate(now, cfg) < localDate(now);
}
