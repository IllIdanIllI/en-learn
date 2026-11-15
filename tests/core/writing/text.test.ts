import { describe, expect, test } from 'vitest';
import { countWords, errorRate, markFragments, markText, MIN_WORDS, overallBand, placeFragments, RATE_TARGET, TARGET_WORDS } from '@/core/writing/text';
import type { TextAssessment } from '@/core/llm/types';

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

describe('markText', () => {
  test('marks errors and strengths side by side', () => {
    expect(markText('He goes home. On the other hand, they stay.', ['goes'], ['On the other hand'])).toEqual([
      { text: 'He ', error: false, strength: false },
      { text: 'goes', error: true, strength: false },
      { text: ' home. ', error: false, strength: false },
      { text: 'On the other hand', error: false, strength: true },
      { text: ', they stay.', error: false, strength: false },
    ]);
  });

  test('an error wins over a strength that overlaps it', () => {
    expect(markText('He goes to school.', ['goes'], ['He goes to'])).toEqual([
      { text: 'He ', error: false, strength: false },
      { text: 'goes', error: true, strength: false },
      { text: ' to school.', error: false, strength: false },
    ]);
  });

  test('a strength takes a free occurrence when the first one is taken by an error', () => {
    expect(markText('go home, go away', ['go home'], ['go'])).toEqual([
      { text: 'go home', error: true, strength: false },
      { text: ', ', error: false, strength: false },
      { text: 'go', error: false, strength: true },
      { text: ' away', error: false, strength: false },
    ]);
  });

  test('errors are placed exactly as markFragments places them, whatever the strengths are', () => {
    const errors = ['go', 'go'];
    expect(markText('go go go', errors, ['go go']).filter((r) => r.error).map((r) => r.text)).toEqual(['go', 'go']);
  });

  test('placeFragments reports which strengths found a free occurrence', () => {
    const placed = placeFragments('He goes to school. Good day.', ['goes'], ['He goes to', 'Good day']);
    expect(placed.filter((p) => p.strength).map((p) => p.idx)).toEqual([1]);
  });

  test('markFragments keeps its two-field runs', () => {
    expect(markFragments('a b', ['b'])).toEqual([{ text: 'a ', error: false }, { text: 'b', error: true }]);
  });
});

describe('overallBand', () => {
  const of = (...b: number[]): TextAssessment => ({
    taskResponse: { band: b[0]!, note: '' }, coherence: { band: b[1]!, note: '' }, vocabulary: { band: b[2]!, note: '' }, grammar: { band: b[3]!, note: '' },
  });

  test('rounds the mean to the nearest half band, a quarter up', () => {
    expect(overallBand(of(6, 6, 6, 6))).toBe(6);
    expect(overallBand(of(6, 6.5, 6, 6.5))).toBe(6.5); // 6.25
    expect(overallBand(of(7, 7, 7, 6))).toBe(7); // 6.75
    expect(overallBand(of(6, 6, 6, 6.5))).toBe(6); // 6.125
    expect(overallBand(of(6, 6.5, 6.5, 6.5))).toBe(6.5); // 6.375
    expect(overallBand(of(5.5, 5.5, 6, 6.5))).toBe(6); // 5.875
    expect(overallBand(of(9, 9, 9, 9))).toBe(9);
  });
});
