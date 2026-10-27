import { describe, expect, test } from 'vitest';
import { autoCorrect, autoSpot, normalizeAnswer } from '@/core/grading/autocheck';

const fix = { format: 'fix' as const, prompt: 'She lives in the Spain.', expected: 'Spain', wrong: 'the Spain' };
const gap = { format: 'gap' as const, prompt: 'She ___ to school.', expected: 'goes', wrong: null };

describe('normalizeAnswer', () => {
  test('lower case, trim, collapse spaces, apostrophes, edge punctuation', () => {
    expect(normalizeAnswer('  Don’t   GO. ')).toBe("don't go");
    expect(normalizeAnswer('"Yes!"')).toBe('yes');
  });
});

describe('autoCorrect', () => {
  test.each(['Spain', ' spain. ', 'in Spain', 'She lives in Spain'])('fix accepts %j', (a) => {
    expect(autoCorrect(fix, a)).toBe(true);
  });
  test.each(['lives in', 'a Spain', 'the Spain', 'Spain is', ''])('fix leaves %j to the LLM', (a) => {
    expect(autoCorrect(fix, a)).toBe(false);
  });
  test('expected ✓ accepts only ✓', () => {
    const ok = { ...fix, expected: '✓', wrong: null };
    expect(autoCorrect(ok, '✓')).toBe(true);
    expect(autoCorrect(ok, 'Spain')).toBe(false);
  });
  test('without wrong only an exact match counts', () => {
    expect(autoCorrect({ ...fix, wrong: null }, 'in Spain')).toBe(false);
    expect(autoCorrect({ ...fix, wrong: null }, 'Spain')).toBe(true);
  });
  test('wrong occurring twice gives no corrected sentence', () => {
    const twice = { ...fix, prompt: 'the Spain and the Spain', wrong: 'the Spain' };
    expect(autoCorrect(twice, 'and Spain')).toBe(false);
  });
  test('gap', () => {
    expect(autoCorrect(gap, 'goes')).toBe(true);
    expect(autoCorrect(gap, 'goes to')).toBe(true);
    expect(autoCorrect(gap, 'to school')).toBe(false);
    expect(autoCorrect(gap, 'go')).toBe(false);
  });
  test('curly apostrophe', () => {
    expect(autoCorrect({ ...gap, expected: "don't" }, 'don’t')).toBe(true);
  });
});

describe('autoSpot', () => {
  const text = 'He has went home and sent informations.';
  const errors = [
    { id: 1, prompt: 'has went', expected: 'has gone' },
    { id: 2, prompt: 'informations', expected: 'information' },
  ];
  test('one paired line', () => {
    expect(autoSpot(text, errors, 'has went → has gone')).toEqual({ found: [1] });
  });
  test('two paired lines', () => {
    expect(autoSpot(text, errors, 'has went → has gone\ninformations -> information')).toEqual({ found: [1, 2] });
  });
  test('unpaired line goes to the LLM', () => {
    expect(autoSpot(text, errors, 'has went → has gone\nthe cat → a cat')).toBeNull();
  });
  test('wrong correction goes to the LLM', () => {
    expect(autoSpot(text, errors, 'has went → had went')).toBeNull();
  });
  test('line without an arrow, or two lines for one error, go to the LLM', () => {
    expect(autoSpot(text, errors, 'has went')).toBeNull();
    expect(autoSpot(text, errors, 'has went → has gone\nhas went → has gone')).toBeNull();
  });
  test('empty text finds nothing', () => {
    expect(autoSpot(text, errors, '')).toEqual({ found: [] });
  });
});
