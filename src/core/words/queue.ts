import type { ISODate } from '@/core/domain';
import type { Settings } from '@/core/db/repos/settings';
import { NEW_PER_DAY, PRACTICE_SIZE } from './constants';
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
  if (stage === 2) return stage2;
  if (stage === 3) return stage3;
  return [...stage2, ...stage3];
}

const EXERCISE_OF: Partial<Record<CardType, ExerciseType>> = {
  gap_hint: 'gap',
  gap: 'gap',
  collocation: 'collocation',
  form: 'form',
  confusable: 'confusable',
  translation: 'translation',
};

export function pickCard(i: {
  stage: Stage;
  firstCard: boolean;
  exercises: WordExercise[];
  lastUsed: Map<number, string>;
  only?: CardType[];
  rand: () => number;
}): Card | null {
  const candidates = availableTypes(i.stage, i.firstCard, i.exercises).filter((t) => !i.only || i.only.includes(t));
  if (candidates.length === 0) return null;
  const type = candidates[Math.floor(i.rand() * candidates.length)];
  if (!type) return null;

  const exerciseType = EXERCISE_OF[type];
  if (!exerciseType) return { type, exercise: null };

  const pool = i.exercises.filter((e) => e.type === exerciseType);
  const never = pool.filter((e) => !i.lastUsed.has(e.id)).sort((a, b) => a.id - b.id);
  const first = never[0];
  if (first) return { type, exercise: first };
  const oldest = [...pool].sort(
    (a, b) => Date.parse(i.lastUsed.get(a.id) ?? '') - Date.parse(i.lastUsed.get(b.id) ?? '') || a.id - b.id,
  )[0];
  return { type, exercise: oldest ?? null };
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

// Word ids for one practice: due words (most overdue first), then new words up to today's allowance.
export function practiceQueue(words: QueueWord[], today: ISODate, extraNew = 0): number[] {
  const ready = words.filter((w) => w.word.generation === 'ready');
  const due = ready
    .filter((w) => w.state.due !== null && w.state.due <= today)
    .sort((a, b) => (a.state.due ?? '').localeCompare(b.state.due ?? '') || a.word.id - b.word.id);
  const newLimit = Math.max(0, NEW_PER_DAY + extraNew - startedOn(words, today));
  const fresh = ready
    .filter((w) => !w.state.reviewed)
    .sort((a, b) => a.word.added.localeCompare(b.word.added) || a.word.id - b.word.id)
    .slice(0, newLimit);
  return [...due, ...fresh].slice(0, PRACTICE_SIZE).map((w) => w.word.id);
}
