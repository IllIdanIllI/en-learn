import { describe, expect, test } from 'vitest';
import { nextRequest } from '@/ui/voice/queue';

describe('nextRequest', () => {
  test('an empty queue has no next request', () => {
    expect(nextRequest([])).toBe(-1);
  });

  test('a press runs before the prefetches queued ahead of it', () => {
    expect(nextRequest([{ prefetch: true }, { prefetch: true }, { prefetch: false }])).toBe(2);
  });

  test('presses keep their order among themselves', () => {
    expect(nextRequest([{ prefetch: true }, { prefetch: false }, { prefetch: false }])).toBe(1);
  });

  test('with only prefetches queued, the first one runs', () => {
    expect(nextRequest([{ prefetch: true }, { prefetch: true }])).toBe(0);
  });
});
