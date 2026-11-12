import { describe, expect, test } from 'vitest';
import { createTestDb } from '@/adapters/test/sqliteDb';
import { FixedClock } from '@/adapters/test/fixedClock';
import { FakeLlm } from '@/adapters/test/fakeLlm';
import { bundledPrompts } from '@/core/llm/bundledPrompts';
import { insertReview, insertWord, listExercises, listReviews, listWordErrors, replaceExercises, setGeneration } from '@/core/db/repos/words';
import {
  addExtraNew, buildPractice, checkUseIt, extraCardFor, loadWordViews, recordAnswer, stageChanges, wordsOverview,
} from '@/core/words/practice';
import { getSettings } from '@/core/db/repos/settings';
import { extraNewFor } from '@/core/words/queue';
import type { Deps, LlmResult } from '@/core/ports';
import type { ExerciseType, WordExercise, WordFields, WordReview } from '@/core/words/types';
import { revealsWord } from '@/core/words/check';
import { exercisesOf, LIMIT_WORDS, PREVIEW_WORDS } from '@/adapters/preview/wordsSeed';

const good = (data: unknown): LlmResult<unknown> => ({ ok: true, data, costUsd: 0, durationMs: 1, raw: '{}' });
const fail: LlmResult<unknown> = { ok: false, code: 'not_signed_in', message: 'sign in', costUsd: 0, durationMs: 1, raw: '' };
const fields = (word: string, over: Partial<WordFields> = {}): WordFields => ({
  word, definition: 'def', translation: '', example: '', synonyms: [], link: '', added: '2026-11-01', ...over,
});

async function setup(llm = new FakeLlm({}), today = '2026-11-04') {
  const db = await createTestDb();
  const deps: Deps = {
    db, llm, clock: new FixedClock(today), prompts: { load: async (kind) => bundledPrompts[kind] }, rand: () => 0.5,
  };
  return deps;
}
const addReady = async (deps: Deps, word: string, added = '2026-11-01', exercises: Omit<WordExercise, 'id' | 'wordId'>[] = []) => {
  const id = await insertWord(deps.db, fields(word, { added }), 't');
  await setGeneration(deps.db, id, 'ready');
  if (exercises.length) await replaceExercises(deps.db, id, exercises);
  return id;
};
const ex = (type: ExerciseType, over: Partial<Omit<WordExercise, 'id' | 'wordId' | 'type'>> = {}): Omit<WordExercise, 'id' | 'wordId'> => ({
  type, prompt: '', translation: null, cue: null, options: null, answers: [], note: null, ...over,
});
const review = (wordId: number, date: string, over: Partial<Omit<WordReview, 'id'>> = {}): Omit<WordReview, 'id'> => ({
  wordId, cardType: 'choice', exerciseId: null, answeredAt: `${date}T10:00:00.000Z`, date, result: 'correct', counted: true, text: '', ...over,
});

describe('recordAnswer', () => {
  test('second answer same day not counted', async () => {
    const deps = await setup();
    const id = await addReady(deps, 'alpha');
    const a = { wordId: id, cardType: 'choice' as const, exerciseId: null, result: 'correct' as const, text: '' };
    expect((await recordAnswer(deps, a)).counted).toBe(true);
    expect((await recordAnswer(deps, a)).counted).toBe(false);
    expect((await listReviews(deps.db)).map((r) => r.counted)).toEqual([true, false]);
  });

  test('an exercise regenerated away mid-practice: the answer is saved with no exercise', async () => {
    const deps = await setup();
    const id = await addReady(deps, 'alpha', '2026-11-01', [ex('gap', { answers: ['x'] })]);
    const [exercise] = await listExercises(deps.db);
    await replaceExercises(deps.db, id, []);
    const { reviewId, counted } = await recordAnswer(deps, {
      wordId: id, cardType: 'gap', exerciseId: exercise!.id, result: 'correct', text: 'x',
    });
    expect(counted).toBe(true);
    expect(await listReviews(deps.db)).toEqual([expect.objectContaining({ id: reviewId, exerciseId: null, cardType: 'gap', counted: true })]);
  });
});

describe('buildPractice', () => {
  test('ten new words give 40 cards: round 1 is the 10 intro cards, then choice, build and anagram rounds, no repeat field', async () => {
    const deps = await setup();
    for (let i = 0; i < 12; i++) await addReady(deps, `word${i}`);
    const cards = await buildPractice(deps);
    expect(cards).toHaveLength(40);
    expect(cards.slice(0, 10).every((c) => c.card.type === 'intro' && c.round === 1)).toBe(true);
    expect(new Set(cards.slice(0, 10).map((c) => c.wordId)).size).toBe(10);
    for (const c of cards.slice(0, 10)) {
      expect(c.options).toBeNull();
      expect(c.letters).toBeNull();
    }
    expect(cards.slice(10, 20).map((c) => c.card.type)).toEqual(Array(10).fill('choice'));
    for (const c of cards.slice(10, 20)) {
      expect(c.options).toContain(c.word.word);
      expect(c.letters).toBeNull();
    }
    expect(cards.slice(20, 30).map((c) => c.card.type)).toEqual(Array(10).fill('build'));
    expect(cards.slice(30).map((c) => c.card.type)).toEqual(Array(10).fill('anagram'));
    for (const c of cards.slice(20)) expect(c.letters).not.toBeNull();
    expect(cards.every((c) => !('repeat' in c))).toBe(true);
  });

  test('each round holds one card of every word; a word keeps its order; no word back to back; every card has a round', async () => {
    const deps = await setup();
    const stage2 = await addReady(deps, 'stage2', '2026-10-01', [ex('gap', { answers: ['x'] }), ex('form', { answers: ['y'] })]);
    await insertReview(deps.db, review(stage2, '2026-01-01'));
    await insertReview(deps.db, review(stage2, '2026-01-05'));
    const fresh = await addReady(deps, 'fresh', '2026-11-01', [ex('gap', { answers: ['x'] })]);
    const cards = await buildPractice(deps);
    const inRound = (k: number) => cards.filter((c) => c.round === k).map((c) => c.wordId).sort((a, b) => a - b);
    const ids = [fresh, stage2].sort((a, b) => a - b);
    expect(inRound(1)).toEqual(ids);
    expect(inRound(2)).toEqual(ids);
    expect(inRound(3)).toEqual([fresh]);
    expect(inRound(4)).toEqual([fresh]);
    const of = (id: number) => cards.filter((c) => c.wordId === id).map((c) => c.card.type);
    expect(of(fresh)).toEqual(['intro', 'choice', 'build', 'gap_hint']);
    expect(of(stage2)).toHaveLength(2);
    expect(of(stage2).every((t) => t === 'gap' || t === 'form' || t === 'spell')).toBe(true);
  });

  test('with a seeded random source no word is back to back across 50 practices', async () => {
    const mulberry32 = (seed: number) => {
      let a = seed >>> 0;
      return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    };
    const deps = await setup();
    const stage2 = await addReady(deps, 'stage2', '2026-10-01', [ex('gap', { answers: ['x'] }), ex('form', { answers: ['y'] })]);
    await insertReview(deps.db, review(stage2, '2026-01-01'));
    await insertReview(deps.db, review(stage2, '2026-01-05'));
    await addReady(deps, 'fresh', '2026-11-01', [ex('gap', { answers: ['x'] })]);
    await addReady(deps, 'fresh2', '2026-11-01', [ex('gap', { answers: ['x'] })]);
    for (let seed = 1; seed <= 50; seed++) {
      deps.rand = mulberry32(seed);
      const cards = await buildPractice(deps);
      for (let i = 1; i < cards.length; i++) expect(cards[i]?.wordId).not.toBe(cards[i - 1]?.wordId);
    }
  });

  test('card counts by stage: new 4, stage 2 with gap and form 2, stage 4 1', async () => {
    const deps = await setup();
    const fresh = await addReady(deps, 'fresh', '2026-10-01');
    const s2 = await addReady(deps, 's2', '2026-10-01', [ex('gap', { answers: ['x'] }), ex('form', { answers: ['y'] })]);
    await insertReview(deps.db, review(s2, '2026-01-01'));
    await insertReview(deps.db, review(s2, '2026-01-05'));
    const s4 = await addReady(deps, 's4', '2025-03-01', [
      ex('gap', { answers: ['x'] }), ex('form', { answers: ['y'] }), ex('translation', { translation: 't', answers: ['z'] }),
    ]);
    for (const d of ['2025-03-03', '2025-03-07', '2025-03-14', '2025-03-28', '2025-04-23', '2025-06-04']) {
      await insertReview(deps.db, review(s4, d));
    }
    const cards = await buildPractice(deps);
    const count = (id: number) => cards.filter((c) => c.wordId === id).length;
    expect([count(fresh), count(s2), count(s4)]).toEqual([4, 2, 1]);
  });

  test('a stage 2 word without exercises gets two spell cards with letters', async () => {
    const deps = await setup();
    const bare = await addReady(deps, 'bare');
    await insertReview(deps.db, review(bare, '2026-01-01'));
    await insertReview(deps.db, review(bare, '2026-01-05'));
    const cards = (await buildPractice(deps)).filter((c) => c.wordId === bare);
    expect(cards.map((c) => c.card.type)).toEqual(['spell', 'spell']);
    expect(cards.every((c) => c.card.exercise === null && c.letters !== null)).toBe(true);
  });
});

describe('extraCardFor', () => {
  const viewOf = async (deps: Deps, id: number) => {
    const views = await loadWordViews(deps.db);
    return { views, view: views.find((v) => v.word.id === id)! };
  };

  test('a wrong answer at stage 2 (stage now 1) with missed form gives a form card', async () => {
    const deps = await setup();
    const id = await addReady(deps, 'alpha', '2026-10-01', [ex('gap', { answers: ['x'] }), ex('form', { answers: ['y'] })]);
    await insertReview(deps.db, review(id, '2026-01-01', { result: 'wrong' }));
    const { views, view } = await viewOf(deps, id);
    expect(view.state.stage).toBe(1);
    const card = extraCardFor(view, 'form', views.map((v) => v.word), () => 0.5);
    expect(card?.card.type).toBe('form');
    expect(card?.card.exercise?.type).toBe('form');
    expect(card?.wordId).toBe(id);
  });

  test('a missed choice card gives a build card with letters', async () => {
    const deps = await setup();
    const id = await addReady(deps, 'alpha');
    const { views, view } = await viewOf(deps, id);
    const card = extraCardFor(view, 'choice', views.map((v) => v.word), () => 0.5);
    expect(card?.card.type).toBe('build');
    expect(card?.letters).not.toBeNull();
  });

  test('the extra card takes another item than the word still has queued in this practice', async () => {
    const deps = await setup();
    const id = await addReady(deps, 'alpha', '2026-10-01', [
      ex('gap', { answers: ['x'] }), ex('gap', { answers: ['y'] }), ex('gap', { answers: ['z'] }),
    ]);
    const { views, view } = await viewOf(deps, id);
    const [g1, g2, g3] = view.exercises.map((e) => e.id).sort((a, b) => a - b) as [number, number, number];
    await insertReview(deps.db, review(id, '2026-11-04', { cardType: 'gap', exerciseId: g1, result: 'wrong', answeredAt: '2026-11-04T10:00:00.000Z' }));
    const after = await viewOf(deps, id);
    const all = views.map((v) => v.word);
    // Without the queued card g2 the never-used g2 would come first.
    expect(extraCardFor(after.view, 'gap', all, () => 0.5)?.card.exercise?.id).toBe(g2);
    expect(extraCardFor(after.view, 'gap', all, () => 0.5, [g2])?.card.exercise?.id).toBe(g3);
  });
});

describe('saved exercises that reveal the word', () => {
  test('a gap that reveals the word is not planned; the clean gap is', async () => {
    const deps = await setup();
    const id = await addReady(deps, 'intermittent', '2026-11-01', [
      ex('gap', { prompt: 'Intermittent ___ showers kept on.', answers: ['rain'] }),
      ex('gap', { prompt: 'The sky was ___ today.', answers: ['grey'] }),
    ]);
    const views = await loadWordViews(deps.db);
    expect(views.find((v) => v.word.id === id)!.exercises.map((e) => e.prompt)).toEqual(['The sky was ___ today.']);
    const cards = (await buildPractice(deps)).filter((c) => c.wordId === id);
    expect(cards.map((c) => c.card.type)).toEqual(['intro', 'choice', 'build', 'gap_hint']);
    expect(cards[3]?.card.exercise?.prompt).toBe('The sky was ___ today.');
  });

  test('a collocation and a form that reveal the word are dropped; other types are kept', async () => {
    const deps = await setup();
    const id = await addReady(deps, 'intermittent', '2026-11-01', [
      ex('collocation', { prompt: 'an intermittent ___', answers: ['x'] }),
      ex('form', { prompt: 'It rained ___ today, intermittent.', answers: ['x'] }),
      ex('confusable', { prompt: 'A ___ signal.', answers: ['intermittent'], options: ['intermittent', 'steady'] }),
    ]);
    const views = await loadWordViews(deps.db);
    expect(views.find((v) => v.word.id === id)!.exercises.map((e) => e.type)).toEqual(['confusable']);
  });
});

describe('seeded practice words', () => {
  test('no seeded gap, collocation or form reveals its word', () => {
    for (const w of [...PREVIEW_WORDS, ...LIMIT_WORDS]) {
      for (const e of exercisesOf(w)) {
        if (e.type === 'gap' || e.type === 'collocation' || e.type === 'form') {
          expect(revealsWord(e.prompt, e.answers, w.word)).toBe(false);
        }
      }
    }
  });
});

describe('checkUseIt', () => {
  const reply = {
    wordOk: false, wordNote: 'n',
    errors: [
      { fragment: 'goed', fix: 'went', topicKey: 'a', suggestedTopic: '', ruleSection: '', explanation: 'irregular' },
      { fragment: 'the', fix: 'a', topicKey: '', suggestedTopic: 'Articles', ruleSection: 'Basics', explanation: 'article' },
    ],
  };
  async function seeded(llm: FakeLlm) {
    const deps = await setup(llm);
    await deps.db.execute("INSERT INTO programme (title, start_date, end_date) VALUES ('P','2026-10-01','2026-12-01')");
    await deps.db.execute("INSERT INTO topic (programme_id, key, title, kind) VALUES (1,'a','A','learn')");
    await deps.db.execute('INSERT INTO rule (topic_id, current_version) VALUES (1,1)');
    return deps;
  }

  test('stores review and errors with topic ids', async () => {
    const deps = await seeded(new FakeLlm({ word_check: [good(reply)] }));
    const id = await addReady(deps, 'alpha');
    const res = await checkUseIt(deps, id, 'I goed to the shop');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const reviews = await listReviews(deps.db);
    expect(res.data.reviewId).toBe(reviews[0]!.id);
    expect(reviews[0]).toMatchObject({ cardType: 'use', exerciseId: null, result: 'wrong', text: 'I goed to the shop', counted: true });
    const errs = await listWordErrors(deps.db);
    expect(errs.map((e) => [e.fragment, e.topicId, e.suggestedTopic, e.ruleSection])).toEqual([
      ['goed', 1, null, null],
      ['the', null, 'Articles', 'Basics'],
    ]);
  });

  test('failure records nothing', async () => {
    const deps = await seeded(new FakeLlm({ word_check: [fail] }));
    const id = await addReady(deps, 'alpha');
    const res = await checkUseIt(deps, id, 'I goed');
    expect(res.ok).toBe(false);
    expect(await listReviews(deps.db)).toEqual([]);
    expect(await listWordErrors(deps.db)).toEqual([]);
  });
});

describe('wordsOverview', () => {
  test('counts per stage', async () => {
    const deps = await setup();
    const a = await addReady(deps, 'a');
    const b = await addReady(deps, 'b');
    const p = await insertWord(deps.db, fields('pending'), 't');
    await insertReview(deps.db, review(a, '2026-10-01'));
    await insertReview(deps.db, review(a, '2026-10-02'));
    const views = await loadWordViews(deps.db);
    expect(views.find((v) => v.word.id === a)!.reviews).toHaveLength(2);
    expect(views.find((v) => v.word.id === p)!.reviews).toEqual([]);
    const o = await wordsOverview(deps.db, '2026-11-04');
    expect(o.counts[1] + o.counts[2] + o.counts[3] + o.counts[4]).toBe(3);
    expect(o.counts[2]).toBe(1);
    expect(o.counts[1]).toBe(2);
    // b is new and ready; a is due (<= today); pending word is excluded
    expect(o.available).toBe(2);
    expect(o.dueToday).toBe(1);
    expect(b).toBeGreaterThan(0);
  });

  test('nextDue is the earliest due date after today', async () => {
    const deps = await setup();
    const a = await addReady(deps, 'a');
    await insertReview(deps.db, review(a, '2026-11-04'));
    const view = (await loadWordViews(deps.db))[0]!;
    const o = await wordsOverview(deps.db, '2026-11-04');
    expect(o.dueToday).toBe(0);
    expect(o.nextDue).toBe(view.state.due);
    expect(o.nextDue! > '2026-11-04').toBe(true);
  });
});

describe('in-progress counts and extra new words', () => {
  test('inProgress, learned and total: a learned word is not in progress, a failed reviewed one is', async () => {
    const deps = await setup();
    const learned = await addReady(deps, 'learned');
    for (const d of ['2026-09-01', '2026-09-05', '2026-09-12', '2026-09-26', '2026-10-20', '2026-11-01']) {
      await insertReview(deps.db, review(learned, d));
    }
    const a = await addReady(deps, 'a');
    const f = await insertWord(deps.db, fields('f'), 't');
    await setGeneration(deps.db, f, 'failed');
    await addReady(deps, 'unreviewed1');
    await addReady(deps, 'unreviewed2');
    await insertWord(deps.db, fields('pending'), 't');
    await insertReview(deps.db, review(a, '2026-11-04'));
    await insertReview(deps.db, review(f, '2026-11-03'));
    const views = await loadWordViews(deps.db);
    expect(views.find((v) => v.word.id === learned)!.state.stage).toBe(4);
    const o = await wordsOverview(deps.db, '2026-11-04');
    expect(o.inProgress).toBe(2);
    expect(o.learned).toBe(1);
    expect(o.total).toBe(6);
    expect(o.canAddNew).toBe(false);
  });

  test('addExtraNew adds 10 each time and resets next day', async () => {
    const deps = await setup();
    await addExtraNew(deps.db, '2026-11-04');
    await addExtraNew(deps.db, '2026-11-04');
    const stored = (await getSettings(deps.db)).wordsExtraNew;
    expect(extraNewFor(stored, '2026-11-04')).toBe(20);
    expect(extraNewFor(stored, '2026-11-05')).toBe(0);
  });
});

describe('stageChanges', () => {
  test('lists up and down', () => {
    const before = new Map<number, 1 | 2 | 3 | 4>([[1, 1], [2, 3], [3, 2]]);
    const after = new Map<number, 1 | 2 | 3 | 4>([[1, 2], [2, 1], [3, 2], [4, 1]]);
    const words = new Map([[1, 'up'], [2, 'down'], [3, 'same'], [4, 'new']]);
    expect(stageChanges(before, after, words)).toEqual({
      up: [{ word: 'up', stage: 2 }],
      down: [{ word: 'down', stage: 1 }],
    });
  });
});
