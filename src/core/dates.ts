import type { ISODate } from './domain';

export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const DAY_MS = 86_400_000;

const TITLE_NAMES = {
  en: {
    weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  },
  ru: {
    weekdays: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
    months: ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'],
  },
} as const;

function toUtcMs(d: ISODate): number {
  const [y, m, day] = d.split('-').map(Number);
  return Date.UTC(y ?? 0, (m ?? 1) - 1, day ?? 1);
}

function fromUtcMs(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(d: ISODate, n: number): ISODate {
  return fromUtcMs(toUtcMs(d) + n * DAY_MS);
}

export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / DAY_MS);
}

export function isoWeekday(d: ISODate): IsoWeekday {
  const sunday0 = new Date(toUtcMs(d)).getUTCDay();
  return (sunday0 === 0 ? 7 : sunday0) as IsoWeekday;
}

export function formatTitleDate(d: ISODate, lang: 'ru' | 'en'): string {
  const names = TITLE_NAMES[lang];
  const [, m, day] = d.split('-').map(Number);
  const weekday = names.weekdays[isoWeekday(d) - 1];
  const month = names.months[(m ?? 1) - 1];
  if (weekday === undefined || month === undefined) {
    throw new Error(`Invalid ISO date: ${d}`);
  }
  return `${weekday} ${day} ${month}`;
}
