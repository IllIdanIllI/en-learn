import { describe, expect, test } from 'vitest';
import { outline } from '@/ui/voice/outline';

describe('outline', () => {
  test('silence gives 20 dots', () => {
    expect(outline(new Float32Array(24000))).toBe('....................');
  });

  test('a loud middle section marks only its cells', () => {
    const pcm = new Float32Array(24000);
    pcm.fill(0.5, 6000, 18000);
    expect(outline(pcm)).toBe('.....##########.....');
  });

  test('an empty clip gives an empty outline', () => {
    expect(outline(new Float32Array(0))).toBe('');
  });
});
