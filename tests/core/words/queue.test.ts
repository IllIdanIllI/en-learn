import { describe, expect, test } from 'vitest';
import { availableTypes, canAddNew, extraNewFor, newQueue, pickExercise, reviewQueue, type QueueWord } from '@/core/words/queue';
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
    transcription: '',
    partOfSpeech: '',
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

  test('stage 2 is the types that have exercises, then spell', () => {
    expect(availableTypes(2, false, [])).toEqual(['spell']);
    expect(availableTypes(2, false, [exercise(1, 'gap'), exercise(2, 'form')])).toEqual(['gap', 'form', 'spell']);
    expect(
      availableTypes(2, false, [
        exercise(1, 'gap'),
        exercise(2, 'collocation'),
        exercise(3, 'form'),
        exercise(4, 'confusable'),
      ]),
    ).toEqual(['gap', 'collocation', 'form', 'confusable', 'spell']);
  });

  test('stage 3 is translation when it exists, and use', () => {
    expect(availableTypes(3, false, [])).toEqual(['use']);
    expect(availableTypes(3, false, [exercise(1, 'translation')])).toEqual(['translation', 'use']);
  });

  test('stage 4 is the union of stages 2 and 3', () => {
    const ex = [exercise(1, 'gap'), exercise(2, 'translation')];
    expect(availableTypes(4, false, ex)).toEqual([...availableTypes(2, false, ex), ...availableTypes(3, false, ex)]);
    expect(availableTypes(4, false, ex)).toEqual(['gap', 'spell', 'translation', 'use']);
  });
});

describe('pickExercise', () => {
  test('prefers the never-used, then the least recently used exercise', () => {
    const exercises = [exercise(1, 'gap'), exercise(2, 'gap'), exercise(3, 'gap')];
    const pick = (lastUsed: Map<number, string>) => pickExercise(exercises, lastUsed)?.id;

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
    expect(pickExercise(exercises, new Map())?.id).toBe(3);
  });

  test('returns null for an empty pool', () => {
    expect(pickExercise([], new Map())).toBeNull();
  });
});

describe('reviewQueue', () => {
  test('due reviewed words, most overdue first (ties by id); new words are not in it', () => {
    const words: QueueWord[] = [
      { word: word(1, '2026-10-10'), state: state({ reviewed: true, due: '2026-11-02' }), firstReviewDate: '2026-10-10' },
      { word: word(2, '2026-10-10'), state: state({ reviewed: true, due: '2026-11-01' }), firstReviewDate: '2026-10-10' },
      { word: word(3, '2026-10-10'), state: state({ reviewed: true, due: '2026-11-01' }), firstReviewDate: '2026-10-10' },
      { word: word(4, '2026-10-20'), state: state(), firstReviewDate: null },
      { word: word(5, '2026-10-05'), state: state(), firstReviewDate: null },
    ];
    expect(reviewQueue(words, TODAY)).toEqual([2, 3, 1]);
  });

  test('total is at most 10 words', () => {
    const due: QueueWord[] = Array.from({ length: 25 }, (_, i) => ({
      word: word(i + 1),
      state: state({ reviewed: true, due: '2026-10-01' }),
      firstReviewDate: '2026-09-01',
    }));
    const queue = reviewQueue(due, TODAY);
    expect(queue).toHaveLength(10);
    expect(queue).toEqual(Array.from({ length: 10 }, (_, i) => i + 1));
  });

  test('skips words without ready exercises', () => {
    const words: QueueWord[] = [
      { word: word(1, '2026-10-01', 'pending'), state: state({ reviewed: true, due: '2026-10-30' }), firstReviewDate: '2026-10-02' },
      { word: word(2, '2026-10-01', 'failed'), state: state({ reviewed: true, due: '2026-10-30' }), firstReviewDate: '2026-10-02' },
      { word: word(3, '2026-10-01', 'ready'), state: state({ reviewed: true, due: '2026-10-30' }), firstReviewDate: '2026-10-02' },
    ];
    expect(reviewQueue(words, TODAY)).toEqual([3]);
  });

  test('words answered today are not due, so Continue gives the next words', () => {
    const words: QueueWord[] = [
      { word: word(1), state: state({ reviewed: true, due: '2026-11-07' }), firstReviewDate: '2026-10-01' },
      { word: word(2), state: state({ reviewed: true, due: '2026-11-05' }), firstReviewDate: '2026-10-01' },
      { word: word(3), state: state({ reviewed: true, due: '2026-11-03' }), firstReviewDate: '2026-10-01' },
    ];
    expect(reviewQueue(words, TODAY)).toEqual([3]);
  });
});

describe('newQueue', () => {
  test('never-reviewed ready words, oldest added first (ties by id)', () => {
    const words: QueueWord[] = [
      { word: word(1, '2026-10-10'), state: state({ reviewed: true, due: '2026-11-02' }), firstReviewDate: '2026-10-10' },
      { word: word(4, '2026-10-20'), state: state(), firstReviewDate: null },
      { word: word(5, '2026-10-05'), state: state(), firstReviewDate: null },
    ];
    expect(newQueue(words, TODAY)).toEqual([5, 4]);
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
    expect(newQueue([...fresh, ...todayStarted], TODAY)).toEqual([100, 101, 102, 103, 104, 105, 106]);
  });

  test('no new words when NEW_PER_DAY is already used up today', () => {
    const today: QueueWord[] = Array.from({ length: 10 }, (_, i) => ({
      word: word(i + 1),
      state: state({ reviewed: true, due: '2026-11-10' }),
      firstReviewDate: TODAY,
    }));
    const fresh: QueueWord = { word: word(50), state: state(), firstReviewDate: null };
    expect(newQueue([...today, fresh], TODAY)).toEqual([]);
  });

  test('total is at most 10 words', () => {
    const fresh = Array.from({ length: 25 }, (_, i) => ({ word: word(i + 1), state: state(), firstReviewDate: null }));
    expect(newQueue(fresh, TODAY)).toEqual(Array.from({ length: 10 }, (_, i) => i + 1));
  });

  test('skips words without ready exercises', () => {
    const words: QueueWord[] = [
      { word: word(1, '2026-10-01', 'pending'), state: state(), firstReviewDate: null },
      { word: word(2, '2026-10-01', 'failed'), state: state(), firstReviewDate: null },
      { word: word(3, '2026-10-01', 'ready'), state: state(), firstReviewDate: null },
    ];
    expect(newQueue(words, TODAY)).toEqual([3]);
  });
});

describe('extra new words', () => {
  const started = (n: number): QueueWord[] =>
    Array.from({ length: n }, (_, i) => ({
      word: word(i + 1),
      state: state({ reviewed: true, due: '2026-11-10' }),
      firstReviewDate: TODAY,
    }));
  const fresh = (n: number, generation: Word['generation'] = 'ready'): QueueWord[] =>
    Array.from({ length: n }, (_, i) => ({ word: word(100 + i, '2026-10-10', generation), state: state(), firstReviewDate: null }));

  test('extraNew raises the limit', () => {
    const words = [...started(10), ...fresh(3)];
    expect(newQueue(words, TODAY, 0).filter((id) => id >= 100)).toEqual([]);
    expect(newQueue(words, TODAY, 10).filter((id) => id >= 100)).toEqual([100, 101, 102]);
  });

  test('extraNewFor is 0 for null or another date', () => {
    expect(extraNewFor(null, TODAY)).toBe(0);
    expect(extraNewFor({ date: '2026-11-03', extra: 20 }, TODAY)).toBe(0);
    expect(extraNewFor({ date: TODAY, extra: 20 }, TODAY)).toBe(20);
  });

  test('canAddNew needs the limit used up and a fresh ready word', () => {
    expect(canAddNew([...started(10), ...fresh(1)], TODAY, 0)).toBe(true);
    expect(canAddNew([...started(10), ...fresh(1, 'pending')], TODAY, 0)).toBe(false);
    expect(canAddNew([...started(10), ...fresh(1, 'failed')], TODAY, 0)).toBe(false);
    expect(canAddNew([...started(9), ...fresh(1)], TODAY, 0)).toBe(false);
    expect(canAddNew([...started(10), ...fresh(1)], TODAY, 10)).toBe(false);
  });
});
