import { expect, test } from 'vitest';
import { createFillLogGate } from '@/ui/words/fillLog';

test('logs the first call, each new tenth and the last call', () => {
  const gate = createFillLogGate();
  const logged: number[] = [];
  for (let done = 0; done <= 100; done += 1) if (gate(done, 100)) logged.push(done);
  expect(logged).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
});

test('a short fill logs every step', () => {
  const gate = createFillLogGate();
  expect([0, 1, 2, 3].map((d) => gate(d, 3))).toEqual([true, true, true, true]);
});
