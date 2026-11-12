import type { ISODate } from '@/core/domain';
import type { Settings } from '@/core/db/repos/settings';
import { NEW_PER_DAY, PRACTICE_WORDS } from './constants';
import type { WordState } from './progress';
import type { CardType, ExerciseType, Stage, Word, WordExercise } from './types';

export interface Card {
  type: CardType;
  exercise: WordExercise | null;
}

const STAGE2: { type: CardType; exercise: ExerciseType }[] = [
  { type: 'gap', exercise: 'gap' },
  { type: 'collocation', exercise: 'collocation' },
  { type: 'form', exercise: 'form' },
  { type: 'confusable', exercise: 'confusable' },
];

const has = (exercises: WordExercise[], type: ExerciseType) => exercises.some((e) => e.type === type);

// Card types the stage can show; the first card of a word is always the choice card.
export function availableTypes(stage: Stage, firstCard: boolean, exercises: WordExercise[]): CardType[] {
  if (firstCard) return ['choice'];
  const stage2 = STAGE2.filter((s) => has(exercises, s.exercise)).map((s) => s.type);
  const stage3: CardType[] = has(exercises, 'translation') ? ['translation', 'use'] : ['use'];
  if (stage === 1) return has(exercises, 'gap') ? ['anagram', 'gap_hint'] : ['anagram'];
  if (stage === 2) return [...stage2, 'spell'];
  if (stage === 3) return stage3;
  return [...stage2, 'spell', ...stage3];
}

export const EXERCISE_OF: Partial<Record<CardType, ExerciseType>> = {
  gap_hint: 'gap',
  gap: 'gap',
  collocation: 'collocation',
  form: 'form',
  confusable: 'confusable',
  translation: 'translation',
};

// Never-used item with the lowest id first, else the least recently used (ties by id).
export function pickExercise(pool: WordExercise[], lastUsed: Map<number, string>): WordExercise | null {
  const never = pool.filter((e) => !lastUsed.has(e.id)).sort((a, b) => a.id - b.id);
  const first = never[0];
  if (first) return first;
  const oldest = [...pool].sort(
    (a, b) => Date.parse(lastUsed.get(a.id) ?? '') - Date.parse(lastUsed.get(b.id) ?? '') || a.id - b.id,
  )[0];
  return oldest ?? null;
}

export interface QueueWord {
  word: Word;
  state: WordState;
  firstReviewDate: ISODate | null;
}

export function extraNewFor(stored: Settings['wordsExtraNew'], today: ISODate): number {
  return stored && stored.date === today ? stored.extra : 0;
}

const startedOn = (words: QueueWord[], today: ISODate) => words.filter((w) => w.firstReviewDate === today).length;

// True when today's new-word allowance is used up and a fresh ready word is waiting.
export function canAddNew(words: QueueWord[], today: ISODate, extraNew: number): boolean {
  return (
    startedOn(words, today) >= NEW_PER_DAY + extraNew &&
    words.some((w) => w.word.generation === 'ready' && !w.state.reviewed)
  );
}

// Ready reviewed words due today or earlier, most overdue first (ties by id).
export function reviewWords(words: QueueWord[], today: ISODate): QueueWord[] {
  return words
    .filter((w) => w.word.generation === 'ready' && w.state.due !== null && w.state.due <= today)
    .sort((a, b) => (a.state.due ?? '').localeCompare(b.state.due ?? '') || a.word.id - b.word.id);
}

// Ready words never reviewed, oldest added first, within today's new-word allowance.
export function newWords(words: QueueWord[], today: ISODate, extraNew = 0): QueueWord[] {
  const newLimit = Math.max(0, NEW_PER_DAY + extraNew - startedOn(words, today));
  return words
    .filter((w) => w.word.generation === 'ready' && !w.state.reviewed)
    .sort((a, b) => a.word.added.localeCompare(b.word.added) || a.word.id - b.word.id)
    .slice(0, newLimit);
}

const firstIds = (words: QueueWord[]): number[] => words.slice(0, PRACTICE_WORDS).map((w) => w.word.id);

// Word ids for one review training: at most PRACTICE_WORDS.
export function reviewQueue(words: QueueWord[], today: ISODate): number[] {
  return firstIds(reviewWords(words, today));
}

// Word ids for one new training: at most PRACTICE_WORDS.
export function newQueue(words: QueueWord[], today: ISODate, extraNew = 0): number[] {
  return firstIds(newWords(words, today, extraNew));
}
