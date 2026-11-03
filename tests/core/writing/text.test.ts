import { describe, expect, test } from 'vitest';
import { countWords, errorRate, markFragments, MIN_WORDS, RATE_TARGET, TARGET_WORDS } from '@/core/writing/text';

describe('writing text constants', () => {
  test('exposes the thresholds', () => {
    expect(MIN_WORDS).toBe(50);
    expect(TARGET_WORDS).toBe(250);
    expect(RATE_TARGET).toBe(3);
  });
});

describe('countWords', () => {
  test('counts whitespace-separated words', () => {
    expect(countWords('  I  went\nhome. ')).toBe(3);
  });

  test('returns 0 for empty text', () => {
    expect(countWords('')).toBe(0);
  });
});

describe('errorRate', () => {
  test('returns errors per 100 words rounded to one decimal', () => {
    expect(errorRate(3, 200)).toBe(1.5);
    expect(errorRate(2, 300)).toBe(0.7);
    expect(errorRate(0, 250)).toBe(0);
  });

  test('returns null below the minimum word count', () => {
    expect(errorRate(1, 49)).toBeNull();
  });
});

describe('markFragments', () => {
  test('marks fragments and keeps the surrounding text', () => {
    expect(markFragments('I goes and he go.', ['goes', 'go'])).toEqual([
      { text: 'I ', error: false },
      { text: 'goes', error: true },
      { text: ' and he ', error: false },
      { text: 'go', error: true },
      { text: '.', error: false },
    ]);
  });

  test('ignores fragments that are not found', () => {
    expect(markFragments('I went home.', ['yesterday'])).toEqual([{ text: 'I went home.', error: false }]);
  });

  test('marks one occurrence per fragment entry', () => {
    expect(markFragments('go go go', ['go', 'go'])).toEqual([
      { text: 'go', error: true },
      { text: ' ', error: false },
      { text: 'go', error: true },
      { text: ' go', error: false },
    ]);
  });
});
