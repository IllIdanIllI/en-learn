import { describe, expect, test } from 'vitest';
import type { ISODate } from '@/core/domain';
import { errorOfDay } from '@/ui/app/GenerationProvider';

const err = { message: 'boom', code: 'timeout' };
const d = (s: string) => s as ISODate;

describe('errorOfDay', () => {
  test('an error of today shows, also when its job ended while the learner was away', () => {
    expect(errorOfDay(err, d('2026-11-02'), d('2026-11-02'))).toBe(err);
  });
  test('an error of another day is stale', () => {
    expect(errorOfDay(err, d('2026-11-01'), d('2026-11-02'))).toBeNull();
  });
  test('no error stays none', () => {
    expect(errorOfDay(null, null, d('2026-11-02'))).toBeNull();
  });
});
