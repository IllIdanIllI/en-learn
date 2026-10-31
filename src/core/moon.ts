import type { ISODate } from '@/core/domain';

const DAY_MS = 86_400_000;
const REFERENCE_NEW_MOON_MS = Date.parse('2000-01-06T18:14:00Z');
const SYNODIC_MONTH_DAYS = 29.530588853;

/** Lunar phase at noon UTC of `date`: 0 = new moon, 0.5 = full moon, always in [0, 1). */
export function moonPhase(date: ISODate): number {
  const noonMs = Date.parse(`${date}T12:00:00Z`);
  const cycles = (noonMs - REFERENCE_NEW_MOON_MS) / DAY_MS / SYNODIC_MONTH_DAYS;
  return cycles - Math.floor(cycles);
}
