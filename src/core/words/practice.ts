import type { ISODate } from '@/core/domain';
import type { Db, Deps, LlmResult } from '@/core/ports';
import type { WordCheckReply } from '@/core/llm/types';
import { callStructured } from '@/core/llm/call';
import { getTopics } from '@/core/db/repos/programme';
import { findTopicRule } from '@/core/db/repos/writing';
import { insertReview, insertWordErrors, listExercises, listReviews, listWords } from '@/core/db/repos/words';
import { anagram, choiceOptions } from './check';
import { buildWordCheckPrompt, checkWordCheckReply } from './generated';
import { replayWord, type WordState } from './progress';
import { pickCard, practiceQueue, type Card, type QueueWord } from './queue';
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
    return { word, state: replayWord(wordReviews), exercises: ex.get(word.id) ?? [], reviews: wordReviews };
  });
}

export interface PracticeCard {
  wordId: number;
  word: Word;
  card: Card;
  options: string[] | null;
  letters: string | null;
  repeat: boolean;
}

export function cardFor(view: WordView, all: Word[], rand: () => number, only?: CardType[]): PracticeCard | null {
  const lastUsed = new Map<number, string>();
  for (const r of view.reviews) {
    if (r.exerciseId === null) continue;
    const prev = lastUsed.get(r.exerciseId);
    if (prev === undefined || r.answeredAt > prev) lastUsed.set(r.exerciseId, r.answeredAt);
  }
  const card = pickCard({
    stage: view.state.stage,
    firstCard: view.reviews.length === 0,
    exercises: view.exercises,
    lastUsed,
    only,
    rand,
  });
  if (!card) return null;
  const options =
    card.type === 'choice'
      ? choiceOptions(view.word, all.filter((w) => w.id !== view.word.id), rand)
      : card.type === 'confusable'
        ? (card.exercise?.options ?? null)
        : null;
  const letters = card.type === 'anagram' ? anagram(view.word.word, rand) : null;
  return { wordId: view.word.id, word: view.word, card, options, letters, repeat: false };
}

export async function buildPractice(deps: Deps): Promise<PracticeCard[]> {
  const rand = deps.rand ?? Math.random;
  const views = await loadWordViews(deps.db);
  const queue: QueueWord[] = views.map((v) => ({
    word: v.word,
    state: v.state,
    firstReviewDate: v.reviews.find((r) => r.counted)?.date ?? null,
  }));
  const all = views.map((v) => v.word);
  const byId = new Map(views.map((v) => [v.word.id, v]));
  const cards: PracticeCard[] = [];
  for (const id of practiceQueue(queue, deps.clock.today())) {
    const view = byId.get(id);
    const card = view ? cardFor(view, all, rand) : null;
    if (card) cards.push(card);
  }
  return cards;
}

export async function recordAnswer(
  deps: Deps,
  a: { wordId: number; cardType: CardType; exerciseId: number | null; result: ReviewResult; text: string },
): Promise<{ reviewId: number; counted: boolean }> {
  const today = deps.clock.today();
  const same = await deps.db.select('SELECT 1 FROM word_review WHERE word_id = ? AND date = ? LIMIT 1', [a.wordId, today]);
  const counted = same.length === 0;
  const reviewId = await insertReview(deps.db, {
    wordId: a.wordId,
    cardType: a.cardType,
    exerciseId: a.exerciseId,
    answeredAt: deps.clock.now(),
    date: today,
    result: a.result,
    counted,
    text: a.text,
  });
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
}

export async function wordsOverview(db: Db, today: ISODate): Promise<WordsOverview> {
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
  const later = ready.flatMap((v) => (v.state.due !== null && v.state.due > today ? [v.state.due] : [])).sort();
  return { counts, dueToday, available: practiceQueue(queue, today).length, nextDue: later[0] ?? null };
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
