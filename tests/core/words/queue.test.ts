import { describe, expect, test } from 'vitest';
import { availableTypes, pickCard, practiceQueue, type QueueWord } from '@/core/words/queue';
import type { WordState } from '@/core/words/progress';
import type { Word, WordExercise, ExerciseType } from '@/core/words/types';

function exercise(id: number, type: ExerciseType, wordId = 1): WordExercise {
  return { id, wordId, type, prompt: '', translation: null, cue: null, options: null, answers: [], note: null };
}

function word(id: number, added = '2026-10-04', generation: Word['generation'] = 'ready'): Word {
  return {
    id,
    word: `w${id}`,
    definition: '',
    translation: '',
    example: '',
    synonyms: [],
    link: '',
    added,
    generation,
  };
}

function state(overrides: Partial<WordState> = {}): WordState {
  return { stage: 1, passedUse: false, stageCorrect: 0, due: null, intervalDays: 0, reviewed: false, ...overrides };
}

const TODAY = '2026-11-04';

describe('availableTypes', () => {
  test('first card is always choice', () => {
    expect(availableTypes(1, true, [])).toEqual(['choice']);
    expect(availableTypes(3, true, [exercise(1, 'translation')])).toEqual(['choice']);
  });

  test('stage 1 is anagram, plus gap_hint when gap exercises exist', () => {
    expect(availableTypes(1, false, [])).toEqual(['anagram']);
    expect(availableTypes(1, false, [exercise(1, 'collocation')])).toEqual(['anagram']);
    expect(availableTypes(1, false, [exercise(1, 'gap')])).toEqual(['anagram', 'gap_hint']);
  });

  test('stage 2 is only the types that have exercises', () => {
    expect(availableTypes(2, false, [])).toEqual([]);
    expect(availableTypes(2, false, [exercise(1, 'gap'), exercise(2, 'form')])).toEqual(['gap', 'form']);
    expect(
      availableTypes(2, false, [
        exercise(1, 'gap'),
        exercise(2, 'collocation'),
        exercise(3, 'form'),
        exercise(4, 'confusable'),
      ]),
    ).toEqual(['gap', 'collocation', 'form', 'confusable']);
  });

  test('stage 3 is translation when it exists, and use', () => {
    expect(availableTypes(3, false, [])).toEqual(['use']);
    expect(availableTypes(3, false, [exercise(1, 'translation')])).toEqual(['translation', 'use']);
  });

  test('stage 4 is the union of stages 2 and 3', () => {
    const ex = [exercise(1, 'gap'), exercise(2, 'translation')];
    expect(availableTypes(4, false, ex)).toEqual([...availableTypes(2, false, ex), ...availableTypes(3, false, ex)]);
    expect(availableTypes(4, false, ex)).toEqual(['gap', 'translation', 'use']);
  });
});

describe('pickCard', () => {
  test('first card returns a choice card without an exercise', () => {
    const card = pickCard({ stage: 1, firstCard: true, exercises: [exercise(1, 'gap')], lastUsed: new Map(), rand: () => 0 });
    expect(card).toEqual({ type: 'choice', exercise: null });
  });

  test('anagram and use cards have no exercise', () => {
    const anagram = pickCard({ stage: 1, firstCard: false, exercises: [], lastUsed: new Map(), rand: () => 0 });
    expect(anagram).toEqual({ type: 'anagram', exercise: null });
    const use = pickCard({ stage: 3, firstCard: false, exercises: [], lastUsed: new Map(), only: ['use'], rand: () => 0 });
    expect(use).toEqual({ type: 'use', exercise: null });
  });

  test('gap_hint at stage 1 uses a gap exercise', () => {
    const gap = exercise(5, 'gap');
    const card = pickCard({ stage: 1, firstCard: false, exercises: [gap], lastUsed: new Map(), only: ['gap_hint'], rand: () => 0 });
    expect(card).toEqual({ type: 'gap_hint', exercise: gap });
  });

  test('prefers the never-used, then the least recently used exercise of the chosen type', () => {
    const exercises = [exercise(1, 'gap'), exercise(2, 'gap'), exercise(3, 'gap'), exercise(4, 'form')];
    const pick = (lastUsed: Map<number, string>) =>
      pickCard({ stage: 2, firstCard: false, exercises, lastUsed, only: ['gap'], rand: () => 0 })?.exercise?.id;

    expect(pick(new Map([[1, '2026-11-01T10:00:00Z'], [2, '2026-11-02T10:00:00Z']]))).toBe(3);
    expect(
      pick(
        new Map([
          [1, '2026-11-03T10:00:00Z'],
          [2, '2026-11-01T10:00:00Z'],
          [3, '2026-11-02T10:00:00Z'],
        ]),
      ),
    ).toBe(2);
  });

  test('among several never-used exercises the lowest id comes first', () => {
    const exercises = [exercise(7, 'form'), exercise(3, 'form'), exercise(5, 'form')];
    const card = pickCard({ stage: 2, firstCard: false, exercises, lastUsed: new Map(), only: ['form'], rand: () => 0.9 });
    expect(card?.exercise?.id).toBe(3);
  });

  test('picks the card type uniformly with rand', () => {
    const exercises = [exercise(1, 'translation')];
    const low = pickCard({ stage: 3, firstCard: false, exercises, lastUsed: new Map(), rand: () => 0 });
    const high = pickCard({ stage: 3, firstCard: false, exercises, lastUsed: new Map(), rand: () => 0.99 });
    expect(low?.type).toBe('translation');
    expect(high?.type).toBe('use');
  });

  test('only translation returns a translation card, also for a Learned word', () => {
    const t = exercise(9, 'translation');
    const card = pickCard({ stage: 4, firstCard: false, exercises: [t], lastUsed: new Map(), only: ['translation'], rand: () => 0 });
    expect(card).toEqual({ type: 'translation', exercise: t });
  });

  test('only translation returns null when the word has no translation exercise', () => {
    const card = pickCard({ stage: 4, firstCard: false, exercises: [exercise(1, 'gap')], lastUsed: new Map(), only: ['translation'], rand: () => 0 });
    expect(card).toBeNull();
  });

  test('returns null when no candidate type remains', () => {
    expect(pickCard({ stage: 2, firstCard: false, exercises: [], lastUsed: new Map(), rand: () => 0 })).toBeNull();
  });
});

describe('practiceQueue', () => {
  test('due words first, most overdue first (ties by id), then new words (oldest added first)', () => {
    const words: QueueWord[] = [
      { word: word(1, '2026-10-10'), state: state({ reviewed: true, due: '2026-11-02' }), firstReviewDate: '2026-10-10' },
      { word: word(2, '2026-10-10'), state: state({ reviewed: true, due: '2026-11-01' }), firstReviewDate: '2026-10-10' },
      { word: word(3, '2026-10-10'), state: state({ reviewed: true, due: '2026-11-01' }), firstReviewDate: '2026-10-10' },
      { word: word(4, '2026-10-20'), state: state(), firstReviewDate: null },
      { word: word(5, '2026-10-05'), state: state(), firstReviewDate: null },
    ];
    expect(practiceQueue(words, TODAY)).toEqual([2, 3, 1, 5, 4]);
  });

  test('new words are limited to NEW_PER_DAY minus those first reviewed today', () => {
    const fresh = Array.from({ length: 15 }, (_, i) => ({
      word: word(100 + i, `2026-10-${String(10 + i).padStart(2, '0')}`),
      state: state(),
      firstReviewDate: null,
    }));
    const todayStarted: QueueWord[] = [
      { word: word(1), state: state({ reviewed: true, due: '2026-11-10' }), firstReviewDate: TODAY },
      { word: word(2), state: state({ reviewed: true, due: '2026-11-10' }), firstReviewDate: TODAY },
      { word: word(3), state: state({ reviewed: true, due: '2026-11-10' }), firstReviewDate: TODAY },
    ];
    const queue = practiceQueue([...fresh, ...todayStarted], TODAY);
    expect(queue.filter((id) => id >= 100)).toHaveLength(7);
    expect(queue.filter((id) => id >= 100)).toEqual([100, 101, 102, 103, 104, 105, 106]);
  });

  test('no new words when NEW_PER_DAY is already used up today', () => {
    const today: QueueWord[] = Array.from({ length: 10 }, (_, i) => ({
      word: word(i + 1),
      state: state({ reviewed: true, due: '2026-11-10' }),
      firstReviewDate: TODAY,
    }));
    const fresh: QueueWord = { word: word(50), state: state(), firstReviewDate: null };
    expect(practiceQueue([...today, fresh], TODAY)).toEqual([]);
  });

  test('total is at most 20', () => {
    const due: QueueWord[] = Array.from({ length: 25 }, (_, i) => ({
      word: word(i + 1),
      state: state({ reviewed: true, due: '2026-10-01' }),
      firstReviewDate: '2026-09-01',
    }));
    const queue = practiceQueue(due, TODAY);
    expect(queue).toHaveLength(20);
    expect(queue).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  test('skips words without ready exercises', () => {
    const words: QueueWord[] = [
      { word: word(1, '2026-10-01', 'pending'), state: state(), firstReviewDate: null },
      { word: word(2, '2026-10-01', 'failed'), state: state({ reviewed: true, due: '2026-10-30' }), firstReviewDate: '2026-10-02' },
      { word: word(3, '2026-10-01', 'ready'), state: state(), firstReviewDate: null },
    ];
    expect(practiceQueue(words, TODAY)).toEqual([3]);
  });

  test('words answered today are not due, so Continue gives the next words', () => {
    const words: QueueWord[] = [
      { word: word(1), state: state({ reviewed: true, due: '2026-11-07' }), firstReviewDate: '2026-10-01' },
      { word: word(2), state: state({ reviewed: true, due: '2026-11-05' }), firstReviewDate: '2026-10-01' },
      { word: word(3), state: state({ reviewed: true, due: '2026-11-03' }), firstReviewDate: '2026-10-01' },
    ];
    expect(practiceQueue(words, TODAY)).toEqual([3]);
  });
});
