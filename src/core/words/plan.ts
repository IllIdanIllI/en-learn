import type { WordState } from './progress';
import { shuffle } from './check';
import { availableTypes, EXERCISE_OF, pickExercise, type Card } from './queue';
import type { CardType, WordExercise } from './types';

// Marks an item as used just now, inside one plan, so the next card of its type takes another item.
export const USED_LAST = '9999-12-31T00:00:00Z';

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

type Pos = [round: number, index: number];

// The card before and after a position, looking across the borders of neighbouring rounds.
function clashesAt<T extends { wordId: number }>(rounds: T[][], [k, i]: Pos): boolean {
  const cur = rounds[k] ?? [];
  const card = cur[i];
  if (!card) return false;
  const before = i > 0 ? cur[i - 1] : (rounds[k - 1] ?? []).at(-1);
  const after = i < cur.length - 1 ? cur[i + 1] : rounds[k + 1]?.[0];
  return before?.wordId === card.wordId || after?.wordId === card.wordId;
}

// Swaps two cards when neither ends up back to back with its word; otherwise leaves the rounds as they were.
function swapIfClean<T extends { wordId: number }>(rounds: T[][], p: Pos, q: Pos): boolean {
  const a = rounds[p[0]]?.[p[1]];
  const b = rounds[q[0]]?.[q[1]];
  if (!a || !b) return false;
  rounds[p[0]]![p[1]] = b;
  rounds[q[0]]![q[1]] = a;
  if (!clashesAt(rounds, p) && !clashesAt(rounds, q)) return true;
  rounds[p[0]]![p[1]] = a;
  rounds[q[0]]![q[1]] = b;
  return false;
}

// When round k starts with the word that ended round k-1, moves that word's card off the front of round k,
// or, when round k holds only that word, pulls the last card of round k-1 back to an earlier card of another word.
function breakBackToBack<T extends { wordId: number }>(rounds: T[][], k: number): void {
  const prev = rounds[k - 1] ?? [];
  const cur = rounds[k] ?? [];
  const first = cur[0];
  if (!first || prev.at(-1)?.wordId !== first.wordId) return;
  for (let j = 1; j < cur.length; j++) {
    if (cur[j]?.wordId !== first.wordId && swapIfClean(rounds, [k, 0], [k, j])) return;
  }
  for (let c = prev.length - 2; c >= 0; c--) {
    if (prev[c]?.wordId !== first.wordId && swapIfClean(rounds, [k - 1, c], [k - 1, prev.length - 1])) return;
  }
}

// The local swaps cannot always clear a border (a swap can land a word next to its twin on the far side),
// so a border that still clashes is retried with a fresh shuffle a few times.
const SHUFFLE_ATTEMPTS = 20;

function shuffledRounds<T extends { wordId: number }>(plans: T[][], rand: () => number): T[][] {
  const longest = Math.max(0, ...plans.map((p) => p.length));
  const rounds: T[][] = [];
  for (let k = 0; k < longest; k++) {
    const cards = plans.map((p) => p[k]).filter((c): c is T => c !== undefined);
    rounds.push(shuffle(cards, rand));
  }
  for (let k = 1; k < rounds.length; k++) breakBackToBack(rounds, k);
  return rounds;
}

function hasBorderClash<T extends { wordId: number }>(rounds: T[][]): boolean {
  return rounds.some((cur, k) => k > 0 && (rounds[k - 1] ?? []).at(-1)?.wordId === cur[0]?.wordId);
}

// Round k holds the k-th card of every word, shuffled with the practice's random source.
export function orderRounds<T extends { wordId: number }>(plans: T[][], rand: () => number): (T & { round: number })[] {
  let rounds = shuffledRounds(plans, rand);
  for (let attempt = 1; attempt < SHUFFLE_ATTEMPTS && hasBorderClash(rounds); attempt++) {
    rounds = shuffledRounds(plans, rand);
  }
  return rounds.flatMap((cards, k) => cards.map((c) => ({ ...c, round: k + 1 })));
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
