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

// The extra card after a mistake repeats the missed type; a missed choice or build card becomes a build card.
export function extraType(missed: CardType): CardType {
  return missed === 'choice' || missed === 'build' ? 'build' : missed;
}

// The tests of a never-reviewed word, in order.
export function newWordTests(hasGap: boolean): CardType[] {
  return ['choice', 'build', hasGap ? 'gap_hint' : 'anagram'];
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

  if (!state.reviewed) return plan(newWordTests(hasGap));
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

type Ends = { first: number; last: number };

// Candidate first and last cards of a round, most preferred first (the shuffled ends before any change).
function endOptions(n: number): Ends[] {
  if (n === 1) return [{ first: 0, last: 0 }];
  const out: Ends[] = [];
  for (let first = 0; first < n; first++) {
    for (let last = n - 1; last >= 0; last--) if (first !== last) out.push({ first, last });
  }
  return out;
}

// Picks each round's first and last card so that no round starts with the word that ended the round before,
// and no round ends with the word that starts the round after. Layer k is keyed by the word of round k's last card.
// A layer with no valid choice (the border is between one word and itself) keeps the shuffled ends.
function chooseEnds<T extends { wordId: number }>(rounds: T[][]): Ends[] {
  type Entry = { ends: Ends; prev: number | null };
  const layers: Map<number, Entry>[] = [];
  let prevKeys: (number | null)[] = [null];
  rounds.forEach((cards) => {
    const layer = new Map<number, Entry>();
    for (const ends of endOptions(cards.length)) {
      const first = cards[ends.first]?.wordId;
      const last = cards[ends.last]?.wordId;
      if (first === undefined || last === undefined || layer.has(last)) continue;
      const prev = prevKeys.find((pk) => pk === null || pk !== first);
      if (prev !== undefined) layer.set(last, { ends, prev });
    }
    if (layer.size === 0) {
      for (const ends of endOptions(cards.length)) {
        const last = cards[ends.last]?.wordId;
        if (last !== undefined && !layer.has(last)) layer.set(last, { ends, prev: prevKeys[0] ?? null });
      }
    }
    layers.push(layer);
    prevKeys = [...layer.keys()];
  });

  const ends = rounds.map((cards) => ({ first: 0, last: cards.length - 1 }));
  let key: number | null = [...(layers[layers.length - 1]?.keys() ?? [])][0] ?? null;
  for (let k = layers.length - 1; k >= 0; k--) {
    const entry = key === null ? undefined : layers[k]?.get(key);
    if (entry) ends[k] = entry.ends;
    key = entry?.prev ?? null;
  }
  return ends;
}

// The round in the chosen order: first card, the rest in shuffled order, last card.
function arrange<T>(cards: T[], ends: Ends): T[] {
  const head = cards[ends.first];
  const tail = cards[ends.last];
  if (cards.length === 1 || head === undefined || tail === undefined) return cards;
  return [head, ...cards.filter((_, i) => i !== ends.first && i !== ends.last), tail];
}

// Round k holds the k-th card of every word. Each round is shuffled with the practice's random source,
// then its ends are chosen so that no word's cards sit back to back across a round border.
export function orderRounds<T extends { wordId: number }>(plans: T[][], rand: () => number): (T & { round: number })[] {
  const longest = Math.max(0, ...plans.map((p) => p.length));
  const rounds: T[][] = [];
  for (let k = 0; k < longest; k++) {
    const cards = plans.map((p) => p[k]).filter((c): c is T => c !== undefined);
    rounds.push(shuffle(cards, rand));
  }
  const ends = chooseEnds(rounds);
  return rounds.flatMap((cards, k) => arrange(cards, ends[k] ?? { first: 0, last: cards.length - 1 }).map((c) => ({ ...c, round: k + 1 })));
}

// Sizes of the groups of a new training: as few groups as hold 3 words each, as even as possible, larger first.
export function groupSizes(n: number): number[] {
  if (n === 0) return [];
  const groups = Math.ceil(n / 3);
  const base = Math.floor(n / groups);
  const extra = n % groups;
  return Array.from({ length: groups }, (_, g) => (g < extra ? base + 1 : base));
}

// Puts the extra card after a mistake right after the first test of another word that follows the mistake,
// so the word is not repeated back to back; it takes that card's round. With no such test, it goes at the end.
export function insertRetry<T extends { wordId: number; round: number; card: { type: CardType } }>(
  cards: T[],
  at: number,
  extra: Omit<T, 'round'>,
): T[] {
  const j = cards.findIndex((c, i) => i > at && c.card.type !== 'intro' && c.wordId !== extra.wordId);
  const next = cards[j];
  if (next === undefined) return [...cards, { ...extra, round: cards[cards.length - 1]?.round ?? 1 } as T];
  return [...cards.slice(0, j + 1), { ...extra, round: next.round } as T, ...cards.slice(j + 1)];
}
