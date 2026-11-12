import type { ISODate } from '@/core/domain';
import type { Db, Deps, LlmResult } from '@/core/ports';
import type { WordCheckReply } from '@/core/llm/types';
import { callStructured } from '@/core/llm/call';
import { getSettings, setSetting } from '@/core/db/repos/settings';
import { getTopics } from '@/core/db/repos/programme';
import { findTopicRule } from '@/core/db/repos/writing';
import { insertReview, insertWordErrors, listExercises, listReviews, listWords } from '@/core/db/repos/words';
import { anagram, choiceOptions, revealsWord } from './check';
import { EXTRA_NEW_STEP } from './constants';
import { buildWordCheckPrompt, checkWordCheckReply } from './generated';
import { cardOfType, extraType, groupSizes, orderRounds, planCards, USED_LAST } from './plan';
import { replayWord, type WordState } from './progress';
import { canAddNew, extraNewFor, newQueue, newWords, reviewQueue, reviewWords, type Card, type QueueWord } from './queue';
import type { CardType, ReviewResult, Stage, Word, WordExercise, WordReview } from './types';

export interface WordView {
  word: Word;
  state: WordState;
  exercises: WordExercise[];
  reviews: WordReview[];
}

function groupBy<T>(items: T[], key: (t: T) => number): Map<number, T[]> {
  const m = new Map<number, T[]>();
  for (const i of items) {
    const list = m.get(key(i));
    if (list) list.push(i);
    else m.set(key(i), [i]);
  }
  return m;
}

export async function loadWordViews(db: Db): Promise<WordView[]> {
  const [words, exercises, reviews] = await Promise.all([listWords(db), listExercises(db), listReviews(db)]);
  const ex = groupBy(exercises, (e) => e.wordId);
  const rv = groupBy(reviews, (r) => r.wordId);
  return words.map((word) => {
    const wordReviews = rv.get(word.id) ?? [];
    // A saved gap, collocation or form that shows the word is left in the database but never practised.
    const exercises = (ex.get(word.id) ?? []).filter(
      (e) => !((e.type === 'gap' || e.type === 'collocation' || e.type === 'form') && revealsWord(e.prompt, e.answers, word.word)),
    );
    return { word, state: replayWord(wordReviews), exercises, reviews: wordReviews };
  });
}

export interface PracticeCard {
  wordId: number;
  word: Word;
  card: Card;
  options: string[] | null;
  letters: string | null;
  round: number;
}

// The last answer time of each exercise of a word, for choosing the least recently used item.
export function lastUsedOf(view: WordView): Map<number, string> {
  const lastUsed = new Map<number, string>();
  for (const r of view.reviews) {
    if (r.exerciseId === null) continue;
    const prev = lastUsed.get(r.exerciseId);
    if (prev === undefined || r.answeredAt > prev) lastUsed.set(r.exerciseId, r.answeredAt);
  }
  return lastUsed;
}

export function toPracticeCard(view: WordView, card: Card, all: Word[], rand: () => number): Omit<PracticeCard, 'round'> {
  const options =
    card.type === 'choice'
      ? choiceOptions(view.word, all.filter((w) => w.id !== view.word.id), rand)
      : card.type === 'confusable'
        ? (card.exercise?.options ?? null)
        : null;
  const letters = card.type === 'anagram' || card.type === 'build' || card.type === 'spell' ? anagram(view.word.word, rand) : null;
  return { wordId: view.word.id, word: view.word, card, options, letters };
}

// The extra card after a mistake: the missed type again (a missed choice card becomes a build card).
// queued: exercise ids of this word's cards still ahead in the practice; they count as just used, so the extra takes another item.
export function extraCardFor(
  view: WordView,
  missed: CardType,
  all: Word[],
  rand: () => number,
  queued: number[] = [],
): Omit<PracticeCard, 'round'> | null {
  const lastUsed = lastUsedOf(view);
  for (const id of queued) lastUsed.set(id, USED_LAST);
  const card = cardOfType(extraType(missed), view.exercises, lastUsed);
  return card ? toPracticeCard(view, card, all, rand) : null;
}

export type PracticeMode = 'new' | 'review';

const planOf = (view: WordView, all: Word[], rand: () => number): Omit<PracticeCard, 'round'>[] =>
  planCards({ state: view.state, exercises: view.exercises, lastUsed: lastUsedOf(view), rand }).map((card) =>
    toPracticeCard(view, card, all, rand),
  );

// A review training: the due words' cards in rounds. A new training: groups of new words, each group's word
// cards first (in queue order), then its tests in rounds; round numbers keep increasing across groups.
export async function buildPractice(deps: Deps, mode: PracticeMode, extraNew = 0): Promise<PracticeCard[]> {
  const rand = deps.rand ?? Math.random;
  const views = await loadWordViews(deps.db);
  const queue: QueueWord[] = views.map((v) => ({
    word: v.word,
    state: v.state,
    firstReviewDate: v.reviews.find((r) => r.counted)?.date ?? null,
  }));
  const all = views.map((v) => v.word);
  const byId = new Map(views.map((v) => [v.word.id, v]));
  const today = deps.clock.today();
  const ids = mode === 'review' ? reviewQueue(queue, today) : newQueue(queue, today, extraNew);
  const words = ids.flatMap((id) => byId.get(id) ?? []);
  if (mode === 'review') return orderRounds(words.map((v) => planOf(v, all, rand)), rand);

  const out: PracticeCard[] = [];
  let rounds = 0;
  let start = 0;
  for (const size of groupSizes(words.length)) {
    const group = words.slice(start, start + size);
    start += size;
    const intros = group.map((v) => ({ ...toPracticeCard(v, { type: 'intro', exercise: null }, all, rand), round: rounds + 1 }));
    const tests = orderRounds(group.map((v) => planOf(v, all, rand)), rand);
    out.push(...intros, ...tests.map((c) => ({ ...c, round: c.round + rounds })));
    rounds += Math.max(0, ...tests.map((c) => c.round));
  }
  return out;
}

export const isTest = (pc: PracticeCard): boolean => pc.card.type !== 'intro';

// The number of a test card among the training's tests: k is the next test's number (1 + tests before index), n is all tests.
export function testPosition(cards: PracticeCard[], index: number): { k: number; n: number } {
  return { k: cards.slice(0, index).filter(isTest).length + 1, n: cards.filter(isTest).length };
}

// Removes the word's cards after index from (the word is now known, so its later cards are not needed).
export function dropWord(cards: PracticeCard[], from: number, wordId: number): PracticeCard[] {
  return cards.filter((c, i) => i <= from || c.wordId !== wordId);
}

// The word is already known: a counted review that replays it as learned (see replayWord).
export async function markKnown(deps: Deps, wordId: number): Promise<void> {
  await recordAnswer(deps, { wordId, cardType: 'known', exerciseId: null, result: 'correct', text: '' });
}

export async function recordAnswer(
  deps: Deps,
  a: { wordId: number; cardType: CardType; exerciseId: number | null; result: ReviewResult; text: string },
): Promise<{ reviewId: number; counted: boolean }> {
  const today = deps.clock.today();
  const same = await deps.db.select('SELECT 1 FROM word_review WHERE word_id = ? AND date = ? LIMIT 1', [a.wordId, today]);
  const counted = same.length === 0;
  const review = {
    wordId: a.wordId,
    cardType: a.cardType,
    answeredAt: deps.clock.now(),
    date: today,
    result: a.result,
    counted,
    text: a.text,
  };
  // Exercises can be regenerated while a practice runs; if this one is gone, the answer is kept without it.
  let reviewId: number;
  try {
    reviewId = await insertReview(deps.db, { ...review, exerciseId: a.exerciseId });
  } catch (e) {
    if (a.exerciseId === null) throw e;
    reviewId = await insertReview(deps.db, { ...review, exerciseId: null });
  }
  return { reviewId, counted };
}

export async function checkUseIt(
  deps: Deps,
  wordId: number,
  sentence: string,
): Promise<LlmResult<WordCheckReply & { reviewId: number }>> {
  const word = (await listWords(deps.db)).find((w) => w.id === wordId);
  if (!word) throw new Error(`word not found: ${wordId}`);
  const topics = await getTopics(deps.db);
  const keys = new Set(topics.map((t) => t.key));
  const prompt = buildWordCheckPrompt(word, sentence, topics.map((t) => ({ key: t.key, title: t.title })));
  const res = await callStructured<WordCheckReply>(deps, 'word_check', prompt, {
    check: (r) => checkWordCheckReply(r, sentence, keys),
  });
  if (!res.ok) return res;
  const reply = res.data;
  const { reviewId } = await recordAnswer(deps, {
    wordId,
    cardType: 'use',
    exerciseId: null,
    result: reply.wordOk ? 'correct' : 'wrong',
    text: sentence,
  });
  const errors = [];
  for (const e of reply.errors) {
    const topicId = e.topicKey === '' ? null : ((await findTopicRule(deps.db, e.topicKey))?.topicId ?? null);
    errors.push({
      fragment: e.fragment,
      fix: e.fix,
      topicId,
      suggestedTopic: e.suggestedTopic === '' ? null : e.suggestedTopic,
      ruleSection: e.ruleSection === '' ? null : e.ruleSection,
      explanation: e.explanation,
    });
  }
  await insertWordErrors(deps.db, reviewId, errors);
  return { ...res, data: { ...reply, reviewId } };
}

export interface WordsOverview {
  counts: Record<Stage, number>;
  dueToday: number;
  available: number;
  nextDue: ISODate | null;
  canAddNew: boolean;
  /** Never-reviewed ready words within today's new-word allowance (not capped). */
  newAvailable: number;
  /** Due reviewed ready words (not capped). */
  reviewAvailable: number;
  /** Words with a counted review that are not Learned. */
  inProgress: number;
  /** Words at stage 4. */
  learned: number;
  /** All words, pending and failed generation included. */
  total: number;
}

export async function wordsOverview(db: Db, today: ISODate, extraNew = 0): Promise<WordsOverview> {
  const views = await loadWordViews(db);
  const counts: Record<Stage, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const v of views) counts[v.state.stage]++;
  const ready = views.filter((v) => v.word.generation === 'ready');
  const dueToday = ready.filter((v) => v.state.due !== null && v.state.due <= today).length;
  const queue: QueueWord[] = views.map((v) => ({
    word: v.word,
    state: v.state,
    firstReviewDate: v.reviews.find((r) => r.counted)?.date ?? null,
  }));
  const newAvailable = newWords(queue, today, extraNew).length;
  const reviewAvailable = reviewWords(queue, today).length;
  const later = ready.flatMap((v) => (v.state.due !== null && v.state.due > today ? [v.state.due] : [])).sort();
  return {
    counts,
    dueToday,
    newAvailable,
    reviewAvailable,
    available: newAvailable + reviewAvailable,
    nextDue: later[0] ?? null,
    canAddNew: canAddNew(queue, today, extraNew),
    inProgress: views.filter((v) => v.state.reviewed && v.state.stage < 4).length,
    learned: counts[4],
    total: views.length,
  };
}

export async function addExtraNew(db: Db, today: ISODate): Promise<void> {
  const { wordsExtraNew } = await getSettings(db);
  await setSetting(db, 'wordsExtraNew', { date: today, extra: extraNewFor(wordsExtraNew, today) + EXTRA_NEW_STEP });
}

export function stageChanges(
  before: Map<number, Stage>,
  after: Map<number, Stage>,
  words: Map<number, string>,
): { up: { word: string; stage: Stage }[]; down: { word: string; stage: Stage }[] } {
  const up: { word: string; stage: Stage }[] = [];
  const down: { word: string; stage: Stage }[] = [];
  for (const [id, stage] of after) {
    const was = before.get(id);
    if (was === undefined || stage === was) continue;
    (stage > was ? up : down).push({ word: words.get(id) ?? '', stage });
  }
  return { up, down };
}
