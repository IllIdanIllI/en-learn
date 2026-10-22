import { describe, expect, test } from 'vitest';
import { addDays, daysBetween, formatTitleDate, isoWeekday } from '@/core/dates';

describe('dates', () => {
  test('addDays crosses month boundary', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
  });

  test('addDays is not shifted by DST change', () => {
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
  });

  test('daysBetween returns b minus a', () => {
    expect(daysBetween('2026-10-20', '2026-10-27')).toBe(7);
  });

  test('isoWeekday maps Monday to 1', () => {
    expect(isoWeekday('2026-10-19')).toBe(1);
  });

  test('formatTitleDate en', () => {
    expect(formatTitleDate('2026-10-20', 'en')).toBe('Tue 20 Oct');
  });

  test('formatTitleDate ru', () => {
    expect(formatTitleDate('2026-10-20', 'ru')).toBe('Вт 20 окт');
  });
});
