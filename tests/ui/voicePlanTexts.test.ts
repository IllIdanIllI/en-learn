import { describe, expect, test } from 'vitest';
import { planTexts } from '@/ui/voice/planTexts';

const card = (word: string, example: string) => ({ word: { word, example } });

describe('planTexts', () => {
  test('the words come first in card order, then the examples in card order', () => {
    const cards = [card('a', 'ex a'), card('b', 'ex b'), card('c', 'ex c')];
    expect(planTexts(cards, 0)).toEqual(['a', 'b', 'c', 'ex a', 'ex b', 'ex c']);
  });

  test('it starts at the current card', () => {
    const cards = [card('a', 'ex a'), card('b', 'ex b'), card('c', 'ex c')];
    expect(planTexts(cards, 1)).toEqual(['b', 'c', 'ex b', 'ex c']);
  });

  test('an empty example is skipped', () => {
    expect(planTexts([card('a', ''), card('b', 'ex b')], 0)).toEqual(['a', 'b', 'ex b']);
  });

  test('a repeated word or example is listed once', () => {
    const cards = [card('a', 'ex a'), card('a', 'ex a'), card('b', 'ex a')];
    expect(planTexts(cards, 0)).toEqual(['a', 'b', 'ex a']);
  });

  test('an index past the end gives an empty plan', () => {
    expect(planTexts([card('a', 'ex a')], 1)).toEqual([]);
    expect(planTexts([], 0)).toEqual([]);
  });
});
