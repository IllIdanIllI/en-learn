import { describe, expect, test } from 'vitest';
import { createTestDb } from '@/adapters/test/sqliteDb';
import { FixedClock } from '@/adapters/test/fixedClock';
import { FakeLlm } from '@/adapters/test/fakeLlm';
import { bundledPrompts } from '@/core/llm/bundledPrompts';
import { insertReview, insertWord, listReviews, listWordErrors, setGeneration } from '@/core/db/repos/words';
import { addExtraNew, buildPractice, checkUseIt, loadWordViews, recordAnswer, stageChanges, wordsOverview } from '@/core/words/practice';
import { getSettings } from '@/core/db/repos/settings';
import { extraNewFor } from '@/core/words/queue';
import type { Deps, LlmResult } from '@/core/ports';
import type { WordFields, WordReview } from '@/core/words/types';

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
const addReady = async (deps: Deps, word: string, added = '2026-11-01') => {
  const id = await insertWord(deps.db, fields(word, { added }), 't');
  await setGeneration(deps.db, id, 'ready');
  return id;
};
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
});

describe('buildPractice', () => {
  test('returns at most 20 cards and the first card of a new word is choice', async () => {
    const deps = await setup();
    for (let i = 0; i < 12; i++) await addReady(deps, `word${i}`);
    const cards = await buildPractice(deps);
    expect(cards.length).toBeLessThanOrEqual(20);
    expect(cards.length).toBe(10);
    for (const c of cards) {
      expect(c.card.type).toBe('choice');
      expect(c.options).toContain(c.word.word);
      expect(c.letters).toBeNull();
      expect(c.repeat).toBe(false);
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
