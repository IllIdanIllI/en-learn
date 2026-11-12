import { describe, expect, test } from 'vitest';
import { availableTypes } from '@/core/words/queue';
import { cardOfType, extraType, groupSizes, insertRetry, newWordTests, orderRounds, planCards } from '@/core/words/plan';
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
  test('new word: choice, build, gap_hint when a gap exercise exists (no intro card)', () => {
    expect(types(plan({}, [exercise(1, 'gap')]))).toEqual(['choice', 'build', 'gap_hint']);
  });

  test('new word without a gap exercise: choice, build, anagram', () => {
    expect(types(plan({}, []))).toEqual(['choice', 'build', 'anagram']);
  });

  test('in progress stage 1: anagram, gap_hint when a gap exercise exists', () => {
    expect(types(plan({ reviewed: true, stage: 1 }, [exercise(1, 'gap')]))).toEqual(['anagram', 'gap_hint']);
  });

  test('in progress stage 1 without a gap exercise: anagram, anagram', () => {
    expect(types(plan({ reviewed: true, stage: 1 }, []))).toEqual(['anagram', 'anagram']);
  });

  test('stage 2 with gap and form: two different types from gap, form and spell', () => {
    const ex = [exercise(1, 'gap'), exercise(2, 'form')];
    for (const rand of [0, 0.5, 0.99]) {
      const planned = types(plan({ reviewed: true, stage: 2 }, ex, new Map(), () => rand));
      expect(planned).toHaveLength(2);
      expect(new Set(planned).size).toBe(2);
      expect(planned.every((t) => t === 'gap' || t === 'form' || t === 'spell')).toBe(true);
    }
  });

  test('stage 2 with two gap items: the gap cards use different items', () => {
    for (const rand of [0, 0.5, 0.99]) {
      const cards = plan({ reviewed: true, stage: 2 }, [exercise(1, 'gap'), exercise(2, 'gap')], new Map(), () => rand);
      expect(cards).toHaveLength(2);
      expect(types(cards).every((t) => t === 'gap' || t === 'spell')).toBe(true);
      const gapIds = cards.filter((c) => c.type === 'gap').map((c) => c.exercise?.id);
      expect(new Set(gapIds).size).toBe(gapIds.length);
    }
  });

  test('stage 2 with one gap item: at most one gap card, and no same-type pair', () => {
    for (const rand of [0, 0.5, 0.99]) {
      const planned = types(plan({ reviewed: true, stage: 2 }, [exercise(1, 'gap')], new Map(), () => rand));
      expect(planned).toHaveLength(2);
      expect(new Set(planned).size).toBe(2);
      expect(planned.every((t) => t === 'gap' || t === 'spell')).toBe(true);
    }
  });

  test('stage 2 without recall exercises: two spell cards, no item', () => {
    const cards = plan({ reviewed: true, stage: 2 }, [exercise(1, 'translation')]);
    expect(types(cards)).toEqual(['spell', 'spell']);
    expect(cards.every((c) => c.exercise === null)).toBe(true);
  });

  test('a gap card takes the least recently used gap item', () => {
    const ex = [exercise(1, 'gap'), exercise(2, 'gap'), exercise(3, 'gap')];
    const lastUsed = new Map([
      [1, '2026-11-03T10:00:00Z'],
      [2, '2026-11-01T10:00:00Z'],
    ]);
    const cards = plan({ reviewed: true, stage: 2 }, ex, lastUsed, () => 0);
    expect(types(cards)).toEqual(['gap', 'spell']);
    expect(cards[0]?.exercise?.id).toBe(3);
  });

  test('stage 3 with translation: translation, use', () => {
    expect(types(plan({ reviewed: true, stage: 3 }, [exercise(1, 'translation')]))).toEqual(['translation', 'use']);
  });

  test('stage 3 without translation but with form: form or spell as the lead, then use', () => {
    for (const rand of [0, 0.99]) {
      const cards = plan({ reviewed: true, stage: 3 }, [exercise(1, 'form')], new Map(), () => rand);
      expect(types(cards)).toHaveLength(2);
      expect(['form', 'spell']).toContain(cards[0]?.type);
      expect(cards[1]?.type).toBe('use');
    }
  });

  test('stage 3 without translation and without recall exercises: spell, then use', () => {
    expect(types(plan({ reviewed: true, stage: 3 }, []))).toEqual(['spell', 'use']);
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

});

describe('cardOfType', () => {
  test('intro and build have no exercise', () => {
    expect(cardOfType('intro', [], new Map())).toEqual({ type: 'intro', exercise: null });
    expect(cardOfType('build', [], new Map())).toEqual({ type: 'build', exercise: null });
  });

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
  test('a missed choice or build card gets a build card, other types stay the same', () => {
    expect(extraType('choice')).toBe('build');
    expect(extraType('build')).toBe('build');
    expect(extraType('form')).toBe('form');
    expect(extraType('anagram')).toBe('anagram');
  });

  test('a missed spell card gives a spell card', () => {
    expect(extraType('spell')).toBe('spell');
  });
});

describe('orderRounds', () => {
  const card = (wordId: number, name: string) => ({ wordId, name });

  const PLANS_A = [
    [card(1, 'a1'), card(1, 'a2')],
    [card(2, 'b1'), card(2, 'b2')],
    [card(3, 'c1'), card(3, 'c2'), card(3, 'c3')],
  ];
  const PLANS_G = [
    [card(1, 'a1'), card(1, 'a2')],
    [card(2, 'g1'), card(2, 'g2'), card(2, 'g3')],
  ];

  function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  test('round k holds exactly the k-th card of every plan', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const ordered = orderRounds(PLANS_A, mulberry32(seed));
      const round = (k: number) => ordered.filter((c) => c.round === k).map((c) => c.name).sort();
      expect(round(1)).toEqual(['a1', 'b1', 'c1']);
      expect(round(2)).toEqual(['a2', 'b2', 'c2']);
      expect(round(3)).toEqual(['c3']);
      expect(ordered).toHaveLength(7);
    }
  });

  test('no two neighbours share a word, for any seed', () => {
    for (const plans of [PLANS_A, PLANS_G]) {
      for (let seed = 1; seed <= 50; seed++) {
        const ordered = orderRounds(plans, mulberry32(seed));
        for (let i = 1; i < ordered.length; i++) {
          expect(ordered[i]?.wordId).not.toBe(ordered[i - 1]?.wordId);
        }
      }
    }
  });

  test('the cards of a round are shuffled, not always in input order', () => {
    const firsts = new Set<string>();
    for (let seed = 1; seed <= 50; seed++) {
      firsts.add(orderRounds(PLANS_A, mulberry32(seed))[0]?.name ?? '');
    }
    expect(firsts.size).toBeGreaterThan(1);
  });

  test('a single word keeps its cards in order', () => {
    const ordered = orderRounds([[card(2, 'g1'), card(2, 'g2'), card(2, 'g3')]], () => 0.5);
    expect(ordered.map((c) => c.name)).toEqual(['g1', 'g2', 'g3']);
    expect(ordered.map((c) => c.round)).toEqual([1, 2, 3]);
  });

  test('no plans: no cards', () => {
    expect(orderRounds([], () => 0.5)).toEqual([]);
  });

  test('F=[F1,F2,F3], S=[S1,S2]: no two neighbours share a word, for 50 seeds and constant rand', () => {
    const F = [card(1, 'F1'), card(1, 'F2'), card(1, 'F3')];
    const S = [card(2, 'S1'), card(2, 'S2')];
    const sources = [...Array.from({ length: 50 }, (_, i) => mulberry32(i + 1)), () => 0, () => 0.99];
    for (const rand of sources) {
      const ordered = orderRounds([F, S], rand);
      expect(ordered).toHaveLength(5);
      for (let i = 1; i < ordered.length; i++) {
        expect(ordered[i]?.wordId).not.toBe(ordered[i - 1]?.wordId);
      }
      expect(ordered.filter((c) => c.round === 3).map((c) => c.name)).toEqual(['F3']);
    }
  });

  test('A=4, B=2, C=1 cards: no neighbours share a word, except in rounds 3 and 4 that hold only A', () => {
    const A = [card(1, 'a1'), card(1, 'a2'), card(1, 'a3'), card(1, 'a4')];
    const B = [card(2, 'b1'), card(2, 'b2')];
    const C = [card(3, 'c1')];
    const sources = [...Array.from({ length: 50 }, (_, i) => mulberry32(i + 1)), () => 0, () => 0.99];
    for (const rand of sources) {
      const ordered = orderRounds([A, B, C], rand);
      expect(ordered).toHaveLength(7);
      expect(ordered.filter((c) => c.round === 3).map((c) => c.name)).toEqual(['a3']);
      expect(ordered.filter((c) => c.round === 4).map((c) => c.name)).toEqual(['a4']);
      for (let i = 1; i < ordered.length; i++) {
        if (ordered[i]?.wordId === ordered[i - 1]?.wordId) {
          expect(ordered[i - 1]?.round).toBeGreaterThanOrEqual(3);
          expect(ordered[i]?.round).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });
});

describe('groupSizes', () => {
  test('groups of 2 or 3, larger groups first', () => {
    expect(
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => groupSizes(n)),
    ).toEqual([[], [1], [2], [3], [2, 2], [3, 2], [3, 3], [3, 2, 2], [3, 3, 2], [3, 3, 3], [3, 3, 2, 2]]);
  });
});

describe('newWordTests', () => {
  test('choice, build, then gap_hint when the word has gap exercises, else anagram', () => {
    expect(newWordTests(true)).toEqual(['choice', 'build', 'gap_hint']);
    expect(newWordTests(false)).toEqual(['choice', 'build', 'anagram']);
  });
});

describe('insertRetry', () => {
  const card = (wordId: number, name: string, round: number, type: CardType = 'build') => ({
    wordId,
    name,
    round,
    card: { type },
  });
  const names = (cards: { name: string }[]) => cards.map((c) => c.name);
  const X = { wordId: 1, name: 'X', card: { type: 'build' as const } };

  test('goes after the first test of another word after the mistake, with that card round', () => {
    const cards = [card(1, 'a', 1), card(2, 'b', 1), card(3, 'c', 1)];
    const out = insertRetry(cards, 0, X);
    expect(names(out)).toEqual(['a', 'b', 'X', 'c']);
    expect(out.map((c) => c.round)).toEqual([1, 1, 1, 1]);
  });

  test('skips the next card of the same word', () => {
    const cards = [card(1, 'a', 1), card(1, 'a2', 2), card(2, 'b', 2)];
    const out = insertRetry(cards, 0, X);
    expect(names(out)).toEqual(['a', 'a2', 'b', 'X']);
    expect(out.map((c) => c.round)).toEqual([1, 2, 2, 2]);
  });

  test('skips intro cards', () => {
    const cards = [card(1, 'A1', 1), card(3, 'introC', 1, 'intro'), card(2, 'B1', 1)];
    expect(names(insertRetry(cards, 0, X))).toEqual(['A1', 'introC', 'B1', 'X']);
  });

  test('a mistake with no other word after it appends with the last card round', () => {
    expect(names(insertRetry([card(1, 'A1', 1), card(1, 'A2', 2)], 0, X))).toEqual(['A1', 'A2', 'X']);
    expect(insertRetry([card(1, 'A1', 1), card(1, 'A2', 2)], 0, X).map((c) => c.round)).toEqual([1, 2, 2]);
  });

  test('a mistake on the last card appends', () => {
    expect(names(insertRetry([card(2, 'b', 1), card(1, 'a', 1)], 1, X))).toEqual(['b', 'a', 'X']);
  });

  test('the first other-word test after the mistake, even with a same-word card between', () => {
    expect(names(insertRetry([card(1, 'A1', 1), card(1, 'A2', 1), card(2, 'B1', 1), card(1, 'A3', 2)], 0, X))).toEqual([
      'A1', 'A2', 'B1', 'X', 'A3',
    ]);
  });
});
