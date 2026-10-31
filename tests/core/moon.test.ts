import { describe, expect, test } from 'vitest';
import { moonPhase } from '@/core/moon';

const TOLERANCE = 0.04;

function circleDistance(p: number, t: number): number {
  const d = Math.abs(p - t);
  return Math.min(d, 1 - d);
}

describe('moonPhase', () => {
  test('new moon of 2024-04-08 (solar eclipse) is near 0', () => {
    expect(circleDistance(moonPhase('2024-04-08'), 0)).toBeLessThan(TOLERANCE);
  });

  test.each(['2000-01-21', '2025-09-07', '2026-03-03'])('full moon of %s (lunar eclipse) is near 0.5', (date) => {
    expect(circleDistance(moonPhase(date), 0.5)).toBeLessThan(TOLERANCE);
  });

  test('result is in [0, 1)', () => {
    const p = moonPhase('1999-12-31');
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThan(1);
  });
});
