import { describe, expect, test } from 'vitest';
import { availableTypes } from '@/core/words/queue';
import { cardOfType, extraType, insertExtra, orderRounds, planCards } from '@/core/words/plan';
import type { WordState } from '@/core/words/progress';
import type { CardType, ExerciseType, WordExercise } from '@/core/words/types';

function exercise(id: number, type: ExerciseType, wordId = 1): WordExercise {
  return { id, wordId, type, prompt: '', translation: null, cue: null, options: null, answers: [], note: null };
}

function state(overrides: Partial<WordState> = {}): WordState {
  return { stage: 1, passedUse: false, stageCorrect: 0, due: null, intervalDays: 0, reviewed: false, ...overrides };
}

const plan = (overrides: Partial<WordState>, exercises: WordExercise[], lastUsed = new Map<number, string>(), rand = () => 0) =>
  planCards({ state: state(overrides), exercises, lastUsed, rand });

const types = (cards: { type: CardType }[]) => cards.map((c) => c.type);

describe('planCards', () => {
  test('new word: choice, anagram, gap_hint when a gap exercise exists', () => {
    expect(types(plan({}, [exercise(1, 'gap')]))).toEqual(['choice', 'anagram', 'gap_hint']);
  });

  test('new word without a gap exercise: choice, anagram, anagram', () => {
    expect(types(plan({}, []))).toEqual(['choice', 'anagram', 'anagram']);
  });

  test('in progress stage 1: anagram, gap_hint when a gap exercise exists', () => {
    expect(types(plan({ reviewed: true, stage: 1 }, [exercise(1, 'gap')]))).toEqual(['anagram', 'gap_hint']);
  });

  test('in progress stage 1 without a gap exercise: anagram, anagram', () => {
    expect(types(plan({ reviewed: true, stage: 1 }, []))).toEqual(['anagram', 'anagram']);
  });

  test('stage 2 with gap and form: two different types from gap and form', () => {
    const ex = [exercise(1, 'gap'), exercise(2, 'form')];
    for (const rand of [0, 0.5, 0.99]) {
      const planned = types(plan({ reviewed: true, stage: 2 }, ex, new Map(), () => rand));
      expect(planned).toHaveLength(2);
      expect(new Set(planned).size).toBe(2);
      expect(planned.every((t) => t === 'gap' || t === 'form')).toBe(true);
    }
  });

  test('stage 2 with two gap items: two gap cards with different items', () => {
    const cards = plan({ reviewed: true, stage: 2 }, [exercise(1, 'gap'), exercise(2, 'gap')]);
    expect(types(cards)).toEqual(['gap', 'gap']);
    expect(cards.map((c) => c.exercise?.id)).toEqual([1, 2]);
  });

  test('stage 2 with one gap item: two gap cards, the same item allowed', () => {
    const cards = plan({ reviewed: true, stage: 2 }, [exercise(1, 'gap')]);
    expect(types(cards)).toEqual(['gap', 'gap']);
    expect(cards.map((c) => c.exercise?.id)).toEqual([1, 1]);
  });

  test('stage 2 without recall exercises: no cards', () => {
    expect(plan({ reviewed: true, stage: 2 }, [exercise(1, 'translation')])).toEqual([]);
  });

  test('stage 3 with translation: translation, use', () => {
    expect(types(plan({ reviewed: true, stage: 3 }, [exercise(1, 'translation')]))).toEqual(['translation', 'use']);
  });

  test('stage 3 without translation but with form: form, use', () => {
    expect(types(plan({ reviewed: true, stage: 3 }, [exercise(1, 'form')]))).toEqual(['form', 'use']);
  });

  test('stage 3 with neither: use only', () => {
    expect(types(plan({ reviewed: true, stage: 3 }, []))).toEqual(['use']);
  });

  test('learned: exactly one card, of a type available at stage 4', () => {
    const ex = [exercise(1, 'gap'), exercise(2, 'translation')];
    const allowed = availableTypes(4, false, ex);
    for (const rand of [0, 0.3, 0.6, 0.99]) {
      const cards = plan({ reviewed: true, stage: 4 }, ex, new Map(), () => rand);
      expect(cards).toHaveLength(1);
      expect(allowed).toContain(cards[0]?.type);
    }
  });

  test('two cards of the same type pick different items, least recently used first', () => {
    const ex = [exercise(1, 'gap'), exercise(2, 'gap'), exercise(3, 'gap')];
    const lastUsed = new Map([
      [1, '2026-11-03T10:00:00Z'],
      [2, '2026-11-01T10:00:00Z'],
    ]);
    const cards = plan({ reviewed: true, stage: 2 }, ex, lastUsed);
    expect(cards.map((c) => c.exercise?.id)).toEqual([3, 2]);
  });
});

describe('cardOfType', () => {
  test('gap returns a gap card regardless of stage', () => {
    const gap = exercise(5, 'gap');
    expect(cardOfType('gap', [gap], new Map())).toEqual({ type: 'gap', exercise: gap });
  });

  test('returns null when the type needs an exercise and there is none', () => {
    expect(cardOfType('form', [], new Map())).toBeNull();
  });

  test('anagram has no exercise', () => {
    expect(cardOfType('anagram', [], new Map())).toEqual({ type: 'anagram', exercise: null });
  });
});

describe('extraType', () => {
  test('a missed choice card gets an anagram, other types stay the same', () => {
    expect(extraType('choice')).toBe('anagram');
    expect(extraType('form')).toBe('form');
  });
});

describe('orderRounds', () => {
  const card = (wordId: number, name: string) => ({ wordId, name });

  test('round by round, words with more cards first, equal counts keep input order', () => {
    const ordered = orderRounds([
      [card(1, 'a1'), card(1, 'a2')],
      [card(2, 'b1'), card(2, 'b2')],
      [card(3, 'c1'), card(3, 'c2'), card(3, 'c3')],
    ]);
    expect(ordered.map((c) => c.name)).toEqual(['c1', 'a1', 'b1', 'c2', 'a2', 'b2', 'c3']);
    expect(ordered.map((c) => c.round)).toEqual([1, 1, 1, 2, 2, 2, 3]);
  });

  test('no word twice in a row when there are several words', () => {
    const ordered = orderRounds([
      [card(1, 'a1'), card(1, 'a2')],
      [card(2, 'g1'), card(2, 'g2'), card(2, 'g3')],
    ]);
    expect(ordered.map((c) => c.name)).toEqual(['g1', 'a1', 'g2', 'a2', 'g3']);
  });

  test('a single word keeps its cards together', () => {
    const ordered = orderRounds([[card(2, 'g1'), card(2, 'g2'), card(2, 'g3')]]);
    expect(ordered.map((c) => c.name)).toEqual(['g1', 'g2', 'g3']);
  });

  test('no plans: no cards', () => {
    expect(orderRounds([])).toEqual([]);
  });
});

describe('insertExtra', () => {
  const card = (wordId: number, name: string, round: number) => ({ wordId, name, round });
  const names = (cards: { name: string }[]) => cards.map((c) => c.name);

  test('goes after the last card of the next round, with that round number', () => {
    const cards = [card(1, 'a1', 1), card(2, 'b1', 1), card(1, 'a2', 2), card(2, 'b2', 2), card(3, 'c1', 3)];
    const out = insertExtra(cards, 0, { wordId: 9, name: 'x' });
    expect(names(out)).toEqual(['a1', 'b1', 'a2', 'b2', 'x', 'c1']);
    expect(out.map((c) => c.round)).toEqual([1, 1, 2, 2, 2, 3]);
  });

  test('no next round: appended with the next round number', () => {
    const cards = [card(1, 'a1', 1), card(2, 'b1', 1)];
    const out = insertExtra(cards, 0, { wordId: 9, name: 'x' });
    expect(names(out)).toEqual(['a1', 'b1', 'x']);
    expect(out.map((c) => c.round)).toEqual([1, 1, 2]);
  });

  test('a mistake on the last card appends', () => {
    const cards = [card(1, 'a1', 1), card(2, 'b1', 1)];
    const out = insertExtra(cards, 1, { wordId: 9, name: 'x' });
    expect(names(out)).toEqual(['a1', 'b1', 'x']);
    expect(out.map((c) => c.round)).toEqual([1, 1, 2]);
  });

  test('next to a card of the same word, goes one place earlier', () => {
    const cards = [
      card(1, 'g1', 1),
      card(2, 'a1', 1),
      card(3, 'b1', 1),
      card(1, 'g2', 2),
      card(2, 'a2', 2),
      card(3, 'b2', 2),
      card(1, 'g3', 3),
    ];
    const out = insertExtra(cards, 0, { wordId: 1, name: 'gX' });
    expect(names(out)).toEqual(['g1', 'a1', 'b1', 'g2', 'a2', 'gX', 'b2', 'g3']);
    expect(out.map((c) => c.round)).toEqual([1, 1, 1, 2, 2, 2, 2, 3]);
  });

  test('when the target round holds only the same word, it stays at the end of that round', () => {
    const cards = [card(1, 'g1', 1), card(2, 'a1', 1), card(1, 'g2', 2)];
    const out = insertExtra(cards, 0, { wordId: 1, name: 'gX' });
    expect(names(out)).toEqual(['g1', 'a1', 'g2', 'gX']);
    expect(out.map((c) => c.round)).toEqual([1, 1, 2, 2]);
  });
});
