import { describe, expect, it } from 'vitest';
import { appDate, canStartNewDay, dayWatcher, ruleDate } from '@/core/day';
import type { Clock } from '@/core/ports';

const at = (day: number, h: number, m = 0): Date => new Date(2026, 10, day, h, m);

describe('ruleDate', () => {
  it('shifts by the start hour', () => {
    expect(ruleDate(at(5, 4, 59), 5)).toBe('2026-11-04');
    expect(ruleDate(at(5, 5, 0), 5)).toBe('2026-11-05');
    expect(ruleDate(at(5, 0, 30), 0)).toBe('2026-11-05');
    expect(ruleDate(at(5, 11, 59), 12)).toBe('2026-11-04');
    expect(ruleDate(at(5, 12, 0), 12)).toBe('2026-11-05');
  });
});

describe('appDate', () => {
  it('takes the later of the rule date and the override', () => {
    expect(appDate(at(5, 3), { dayStartHour: 5, overrideDate: '2026-11-05' })).toBe('2026-11-05');
    expect(appDate(at(6, 6), { dayStartHour: 5, overrideDate: '2026-11-05' })).toBe('2026-11-06');
    expect(appDate(at(5, 3), { dayStartHour: 5, overrideDate: '2026-10-29' })).toBe('2026-11-04');
  });
  it('stays consistent when the start hour changes under an override', () => {
    expect(appDate(at(5, 6), { dayStartHour: 8, overrideDate: '2026-11-05' })).toBe('2026-11-05');
  });
});

describe('canStartNewDay', () => {
  it('is true only before the start hour without an override', () => {
    expect(canStartNewDay(at(5, 3), { dayStartHour: 5, overrideDate: null })).toBe(true);
    expect(canStartNewDay(at(5, 6), { dayStartHour: 5, overrideDate: null })).toBe(false);
    expect(canStartNewDay(at(5, 3), { dayStartHour: 0, overrideDate: null })).toBe(false);
    expect(canStartNewDay(at(5, 3), { dayStartHour: 5, overrideDate: '2026-11-05' })).toBe(false);
  });
});

describe('dayWatcher', () => {
  it('calls onChange once per change of the app date', () => {
    let date = '2026-11-05';
    const clock = { today: () => date } as unknown as Clock;
    let calls = 0;
    const check = dayWatcher(clock, () => calls++);
    check();
    expect(calls).toBe(0);
    date = '2026-11-06';
    check();
    expect(calls).toBe(1);
    check();
    expect(calls).toBe(1);
  });
});
