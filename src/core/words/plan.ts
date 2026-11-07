import type { WordState } from './progress';
import { availableTypes, EXERCISE_OF, pickExercise, type Card } from './queue';
import type { CardType, WordExercise } from './types';

// Marks an item as used just now, inside one plan, so the next card of its type takes another item.
const USED_LAST = '9999-12-31T00:00:00Z';

// The card of a given type with no stage filter; null when the type needs an exercise and there is none.
export function cardOfType(type: CardType, exercises: WordExercise[], lastUsed: Map<number, string>): Card | null {
  const exerciseType = EXERCISE_OF[type];
  if (!exerciseType) return { type, exercise: null };
  const exercise = pickExercise(exercises.filter((e) => e.type === exerciseType), lastUsed);
  return exercise ? { type, exercise } : null;
}

// The extra card after a mistake repeats the missed type; a missed choice card becomes an anagram.
export function extraType(missed: CardType): CardType {
  return missed === 'choice' ? 'anagram' : missed;
}

// The cards of one word for one practice, fixed from its stage at the start.
export function planCards(i: {
  state: WordState;
  exercises: WordExercise[];
  lastUsed: Map<number, string>;
  rand: () => number;
}): Card[] {
  const { state, exercises, rand } = i;
  const used = new Map(i.lastUsed);
  const take = (type: CardType): Card[] => {
    const card = cardOfType(type, exercises, used);
    if (!card) return [];
    if (card.exercise) used.set(card.exercise.id, USED_LAST);
    return [card];
  };
  const plan = (types: CardType[]): Card[] => types.flatMap(take);
  const pick = <T>(list: T[]): T | undefined => list[Math.floor(rand() * list.length)];
  const hasGap = exercises.some((e) => e.type === 'gap');

  if (!state.reviewed) return plan(['choice', 'anagram', hasGap ? 'gap_hint' : 'anagram']);
  if (state.stage === 1) return plan(['anagram', hasGap ? 'gap_hint' : 'anagram']);

  const recall = availableTypes(2, false, exercises);
  if (state.stage === 2) {
    const first = pick(recall);
    if (!first) return [];
    const second = pick(recall.filter((t) => t !== first)) ?? first;
    return plan([first, second]);
  }
  if (state.stage === 3) {
    const lead = exercises.some((e) => e.type === 'translation') ? 'translation' : pick(recall);
    return lead ? plan([lead, 'use']) : plan(['use']);
  }
  const type = pick(availableTypes(4, false, exercises));
  return type ? plan([type]) : [];
}

// Interleaves the words' cards into rounds: round k holds the k-th card of every word.
export function orderRounds<T extends { wordId: number }>(plans: T[][]): (T & { round: number })[] {
  const sorted = [...plans].sort((a, b) => b.length - a.length);
  const longest = sorted[0]?.length ?? 0;
  const out: (T & { round: number })[] = [];
  for (let k = 0; k < longest; k++) {
    for (const plan of sorted) {
      const card = plan[k];
      if (card) out.push({ ...card, round: k + 1 });
    }
  }
  return out;
}

// Puts an extra card after a mistake at the end of the next round (a new round after the last one).
export function insertExtra<T extends { wordId: number; round: number }>(
  cards: T[],
  at: number,
  extra: Omit<T, 'round'>,
): T[] {
  const round = (cards[at]?.round ?? 0) + 1;
  const end = cards.reduce((found, c, j) => (c.round === round ? j : found), -1);
  if (end < 0) return [...cards, { ...extra, round } as T];

  let pos = end + 1;
  const sameWordNext = cards[end]?.wordId === extra.wordId || cards[pos]?.wordId === extra.wordId;
  const roundHoldsOther = cards.some((c) => c.round === round && c.wordId !== extra.wordId);
  if (sameWordNext && roundHoldsOther) pos = end;
  return [...cards.slice(0, pos), { ...extra, round } as T, ...cards.slice(pos)];
}
