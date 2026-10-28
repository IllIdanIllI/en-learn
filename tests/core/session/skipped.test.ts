import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { createTestDb } from '@/adapters/test/sqliteDb';
import { FakeLlm } from '@/adapters/test/fakeLlm';
import { FixedClock } from '@/adapters/test/fixedClock';
import { insertSeedRules, parseSeed, saveProgramme } from '@/core/programme/setup';
import { setSetting } from '@/core/db/repos/settings';
import { insertBlock, insertDraftSession, insertItem, type NewItem } from '@/core/db/repos/sessions';
import { listSkippedItems } from '@/core/db/repos/answers';
import { gradeSession } from '@/core/grading/grade';
import { loadSessionView } from '@/core/session/view';
import { reopenSkipped, skippedToSolve } from '@/core/session/skipped';
import { loadGradedFacts } from '@/core/progress/history';
import type { Db, Deps, LlmResult } from '@/core/ports';
import type { GradeResult } from '@/core/llm/types';

const seedDir = path.resolve(import.meta.dirname, '../../fixtures/seed');
const seedFiles = {
  programme: fs.readFileSync(path.join(seedDir, 'programme.json'), 'utf8'),
  rules: { 'articles.md': fs.readFileSync(path.join(seedDir, 'rules/articles.md'), 'utf8') },
};
const gradeSchema = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../../prompts/grade.schema.json'), 'utf8')) as object;
const ok = (data: unknown): LlmResult<unknown> => ({ ok: true, data, costUsd: 0, durationMs: 1, raw: JSON.stringify(data) });

const base: NewItem = {
  prompt: '', expected: '', paragraph: null, topicId: 1, ruleId: 1, ruleVersion: 1, ruleSection: 'Basics',
  spellingWordId: null, isCheck: false, status: 'active', note: null, wrong: null,
};
const blk = { instruction: 'i', formatExample: null, minutes: 5 };

/**
 * A graded session: spelling (2 items), fix (2 items), spot (1 item), speaking.
 * Item ids are first + 0..4; the answers are given per item id offset: [verdict | null for no row].
 */
async function addSession(db: Db, date: string, verdicts: (string | null)[]) {
  const sid = await insertDraftSession(db, { date, title: `S ${date}`, isLight: false, createdAt: 'x' });
  const b0 = await insertBlock(db, sid, 0, { ...blk, kind: 'spelling', format: 'spelling', title: 'Spelling', passage: null });
  const b1 = await insertBlock(db, sid, 1, { ...blk, kind: 'task', format: 'fix', title: 'Fix', passage: null });
  const b2 = await insertBlock(db, sid, 2, { ...blk, kind: 'task', format: 'spot', title: 'Spot', passage: JSON.stringify(['a apple']) });
  await insertBlock(db, sid, 3, { ...blk, kind: 'speaking', format: 'question', title: 'Speak', passage: 'Say it.' });
  await insertItem(db, b0, 0, { ...base, prompt: 'Not optional: ___', expected: 'necessary', spellingWordId: 1 });
  await insertItem(db, b0, 1, { ...base, prompt: 'Sure: ___', expected: 'definitely' });
  await insertItem(db, b1, 0, { ...base, prompt: 'She has a apple.', expected: 'an' });
  await insertItem(db, b1, 1, { ...base, prompt: 'He ate a banana.', expected: '✓' });
  await insertItem(db, b2, 0, { ...base, prompt: 'a apple', expected: 'an apple', paragraph: 0 });
  const last = (await db.select<{ m: number }>('SELECT MAX(id) AS m FROM item'))[0]!.m;
  const ids = [0, 1, 2, 3, 4].map((k) => last - 4 + k);
  for (const [k, v] of verdicts.entries()) {
    if (v !== null) await db.execute("INSERT INTO answer (item_id, text, verdict) VALUES (?, ?, ?)", [ids[k]!, v === 'skipped' ? '' : 'x', v]);
  }
  await db.execute("UPDATE session SET status = 'graded' WHERE id = ?", [sid]);
  return { sid, ids };
}

async function setup(today = '2026-10-20', script: LlmResult<unknown>[] = []) {
  const db = await createTestDb();
  const llm = new FakeLlm({ grade: script });
  const deps: Deps = { db, llm, clock: new FixedClock(today), prompts: { load: async () => ({ system: 's', schema: gradeSchema }) } };
  const { programme, rules } = parseSeed(seedFiles, '2026-10-19');
  await saveProgramme(db, programme);
  await insertSeedRules(db, rules, 'x');
  await setSetting(db, 'nativeLanguage', 'en');
  await db.execute("INSERT INTO spelling_word (word, hint, created_at) VALUES ('necessary', 'Not optional: ___', 'x')");
  return { db, deps, llm };
}

describe('skippedToSolve', () => {
  test('counts skipped gap, fix and spelling items of today; spot items do not count', async () => {
    const { db, deps } = await setup();
    const { sid } = await addSession(db, '2026-10-20', ['skipped', 'correct', 'skipped', 'wrong', 'skipped']);
    expect(await skippedToSolve(deps)).toEqual({ sessionId: sid, date: '2026-10-20', count: 2 });
  });

  test('yesterday comes first; two days ago and the future are ignored', async () => {
    const { db, deps } = await setup();
    await addSession(db, '2026-10-18', ['skipped', 'skipped', 'skipped', 'skipped', 'skipped']);
    await addSession(db, '2026-10-21', ['skipped', null, null, null, null]);
    const today = await addSession(db, '2026-10-20', ['skipped', 'correct', 'correct', 'correct', 'correct']);
    expect(await skippedToSolve(deps)).toEqual({ sessionId: today.sid, date: '2026-10-20', count: 1 });
    const yesterday = await addSession(db, '2026-10-19', ['correct', 'correct', 'skipped', 'correct', 'correct']);
    expect(await skippedToSolve(deps)).toEqual({ sessionId: yesterday.sid, date: '2026-10-19', count: 1 });
  });

  test('is null with nothing skipped, only spot skips, or items dropped by a dispute; a draft or generated session is not offered', async () => {
    const { db, deps } = await setup();
    expect(await skippedToSolve(deps)).toBeNull();
    await addSession(db, '2026-10-19', ['correct', 'correct', 'correct', 'correct', 'skipped']);
    expect(await skippedToSolve(deps)).toBeNull();
    const { sid, ids } = await addSession(db, '2026-10-20', ['correct', 'correct', 'skipped', 'correct', 'correct']);
    await db.execute("UPDATE answer SET dispute_decision = 'drop' WHERE item_id = ?", [ids[2]!]);
    expect(await skippedToSolve(deps)).toBeNull();
    await db.execute("UPDATE answer SET dispute_decision = NULL WHERE item_id = ?", [ids[2]!]);
    await db.execute("UPDATE session SET status = 'generated' WHERE id = ?", [sid]);
    expect(await skippedToSolve(deps)).toBeNull();
  });
});

describe('skippedToSolve edge cases', () => {
  test('items left unanswered after a reopen are still offered; unanswered spot items are not', async () => {
    const { db, deps } = await setup();
    const { sid } = await addSession(db, '2026-10-19', ['correct', null, 'correct', null, null]);
    expect(await skippedToSolve(deps)).toEqual({ sessionId: sid, date: '2026-10-19', count: 2 });
    expect(await reopenSkipped(db, sid, '2026-10-20')).toBe(0);
    expect(await skippedToSolve(deps)).toEqual({ sessionId: sid, date: '2026-10-19', count: 2 });
  });
});

describe('skipped items of added rounds', () => {
  /** Adds a round-2 fix block with one item per verdict (null = no answer row); returns the item ids. */
  async function addRound2(db: Db, sid: number, verdicts: (string | null)[]) {
    const b = await insertBlock(db, sid, 4, { ...blk, kind: 'task', format: 'fix', title: 'More', passage: null }, 2);
    const ids: number[] = [];
    for (const [k, v] of verdicts.entries()) {
      await insertItem(db, b, k, { ...base, prompt: `I saw a owl ${k}.`, expected: 'an' });
      const id = (await db.select<{ m: number }>('SELECT MAX(id) AS m FROM item'))[0]!.m;
      ids.push(id);
      if (v !== null) await db.execute('INSERT INTO answer (item_id, text, verdict) VALUES (?, ?, ?)', [id, v === 'skipped' ? '' : 'an', v]);
    }
    return ids;
  }

  test('a skipped round-2 item is counted and cleared', async () => {
    const { db, deps } = await setup();
    const { sid } = await addSession(db, '2026-10-20', ['correct', 'correct', 'correct', 'correct', 'correct']);
    const [first] = await addRound2(db, sid, ['skipped', 'correct']);
    expect(await skippedToSolve(deps)).toEqual({ sessionId: sid, date: '2026-10-20', count: 1 });
    expect(await reopenSkipped(db, sid, '2026-10-20')).toBe(1);
    expect(await db.select('SELECT 1 FROM answer WHERE item_id = ?', [first!])).toHaveLength(0);
    expect(await skippedToSolve(deps)).toEqual({ sessionId: sid, date: '2026-10-20', count: 1 });
  });

  test('today: while a round has no answers yet the session is not offered and nothing is cleared; after answering it, only the skips are', async () => {
    const { db, deps } = await setup();
    const { sid } = await addSession(db, '2026-10-20', ['skipped', 'correct', 'correct', 'correct', 'correct']);
    const ids = await addRound2(db, sid, [null, null]);
    expect(await skippedToSolve(deps)).toBeNull();
    expect(await reopenSkipped(db, sid, '2026-10-20')).toBe(0);
    expect(await db.select('SELECT 1 FROM answer WHERE verdict = ?', ['skipped'])).toHaveLength(1);
    for (const id of ids) await db.execute("INSERT INTO answer (item_id, text, verdict) VALUES (?, 'an', 'correct')", [id]);
    expect(await skippedToSolve(deps)).toEqual({ sessionId: sid, date: '2026-10-20', count: 1 });
    expect(await reopenSkipped(db, sid, '2026-10-20')).toBe(1);
  });

  test('today: a fresh round with a question block next to its gap block is still fresh, and is answered by its gap items', async () => {
    const { db, deps } = await setup();
    const { sid } = await addSession(db, '2026-10-20', ['skipped', 'correct', 'correct', 'correct', 'correct']);
    const ids = await addRound2(db, sid, [null]);
    const q = await insertBlock(db, sid, 5, { ...blk, kind: 'speaking', format: 'question', title: 'Speak', passage: 'Say it.' }, 2);
    await insertItem(db, q, 0, { ...base, prompt: 'Say', expected: '' });
    expect(await skippedToSolve(deps)).toBeNull();
    await db.execute("INSERT INTO answer (item_id, text, verdict) VALUES (?, 'an', 'correct')", [ids[0]!]);
    expect(await skippedToSolve(deps)).toEqual({ sessionId: sid, date: '2026-10-20', count: 1 });
  });

  test('today: a fresh added round alone does not offer the session', async () => {
    const { db, deps } = await setup();
    const { sid } = await addSession(db, '2026-10-20', ['correct', 'correct', 'correct', 'correct', 'correct']);
    await addRound2(db, sid, [null, null]);
    expect(await skippedToSolve(deps)).toBeNull();
    expect(await reopenSkipped(db, sid, '2026-10-20')).toBe(0);
  });

  test('yesterday: never-answered round-2 items are counted and cleared as a plain no-op', async () => {
    const { db, deps } = await setup();
    const { sid } = await addSession(db, '2026-10-19', ['correct', 'correct', 'correct', 'correct', 'correct']);
    await addRound2(db, sid, [null, null]);
    expect(await skippedToSolve(deps)).toEqual({ sessionId: sid, date: '2026-10-19', count: 2 });
  });

  test('a round left mid-solve (one answered, one not) stays counted today', async () => {
    const { db, deps } = await setup();
    const { sid } = await addSession(db, '2026-10-20', ['correct', 'correct', 'correct', 'correct', 'correct']);
    await addRound2(db, sid, ['correct', null]);
    expect(await skippedToSolve(deps)).toEqual({ sessionId: sid, date: '2026-10-20', count: 1 });
  });

  test('spot and question blocks of an added round stay excluded', async () => {
    const { db, deps } = await setup();
    const { sid } = await addSession(db, '2026-10-19', ['correct', 'correct', 'correct', 'correct', 'correct']);
    const spot = await insertBlock(db, sid, 4, { ...blk, kind: 'task', format: 'spot', title: 'Spot', passage: JSON.stringify(['a apple']) }, 2);
    await insertItem(db, spot, 0, { ...base, prompt: 'a apple', expected: 'an apple', paragraph: 0 });
    const q = await insertBlock(db, sid, 5, { ...blk, kind: 'speaking', format: 'question', title: 'Speak', passage: 'Say it.' }, 2);
    await insertItem(db, q, 0, { ...base, prompt: 'Say', expected: '' });
    expect(await skippedToSolve(deps)).toBeNull();
  });

  test('the view lists reopened round-2 items with their original numbers', async () => {
    const { db } = await setup();
    const { sid } = await addSession(db, '2026-10-20', ['correct', 'correct', 'correct', 'correct', 'correct']);
    await addRound2(db, sid, ['correct', 'skipped']);
    await reopenSkipped(db, sid, '2026-10-20');
    const view = await loadSessionView(db, sid);
    expect(view.open).toBe(true);
    const round2 = view.blocks.find((b) => b.round === 2)!;
    expect(round2.items.map((i) => [i.prompt, i.number])).toEqual([['I saw a owl 1.', 2]]);
  });
});

describe('reopenSkipped', () => {
  test('clears only the skipped gap, fix and spelling answers of that session', async () => {
    const { db } = await setup();
    const other = await addSession(db, '2026-10-19', ['skipped', 'skipped', 'skipped', 'skipped', 'skipped']);
    const { sid, ids } = await addSession(db, '2026-10-20', ['skipped', 'correct', 'skipped', 'wrong', 'skipped']);
    expect(await reopenSkipped(db, sid, '2026-10-20')).toBe(2);
    const left = (await db.select<{ item_id: number }>('SELECT item_id FROM answer ORDER BY item_id')).map((r) => r.item_id);
    expect(left.filter((id) => ids.includes(id))).toEqual([ids[1], ids[3], ids[4]]);
    expect(left.filter((id) => other.ids.includes(id))).toHaveLength(5);
    expect(await reopenSkipped(db, sid, '2026-10-20')).toBe(0);
  });

  test('the view then lists only the unanswered items of a block, with their original numbers and no answer key', async () => {
    const { db } = await setup();
    const { sid } = await addSession(db, '2026-10-20', ['skipped', 'correct', 'skipped', 'wrong', 'skipped']);
    await reopenSkipped(db, sid, '2026-10-20');
    const view = await loadSessionView(db, sid);
    expect(view.open).toBe(true);
    const [spelling, fix, spot] = view.blocks;
    expect(spelling).toMatchObject({ graded: false, itemCount: 2 });
    expect(spelling!.items.map((i) => [i.prompt, i.number])).toEqual([['Not optional: ___', 1]]);
    expect(fix!.items.map((i) => [i.prompt, i.number])).toEqual([['She has a apple.', 1]]);
    expect(spot!.graded).toBe(true);
    const open = JSON.stringify([spelling, fix]);
    for (const secret of ['necessary', 'definitely', '"expected"', '"answer"']) expect(open).not.toContain(secret);
  });

  test('grading afterwards grades only the reopened items; scores, spelling and the error bank include them; they stop being review input', async () => {
    const wrong: GradeResult['items'][number] = { ref: 'b1.i0', verdict: 'wrong', fix: 'an', ruleSection: 'Basics', explanation: 'Use an.', vocabularyNote: '', question: '' };
    const { db, deps, llm } = await setup('2026-10-20', [ok({ items: [wrong], spot: [], patterns: [], tomorrow: [], spellingErrors: [], ruleGaps: [] })]);
    const { sid, ids } = await addSession(db, '2026-10-20', ['skipped', 'correct', 'skipped', 'correct', 'correct']);
    expect(await listSkippedItems(db, sid)).toHaveLength(1);
    await reopenSkipped(db, sid, '2026-10-20');
    expect(await listSkippedItems(db, sid)).toHaveLength(0);

    const sub = { items: { [ids[0]!]: 'necessary', [ids[2]!]: 'a' }, spot: {} };
    expect(await gradeSession(deps, sid, sub, [])).toEqual({ kind: 'graded' });
    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0]!.userPrompt).toContain('She has a apple.');
    expect(llm.calls[0]!.userPrompt).not.toContain('He ate a banana.');

    const v = Object.fromEntries((await db.select<{ item_id: number; verdict: string }>('SELECT item_id, verdict FROM answer')).map((r) => [r.item_id, r.verdict]));
    expect(v).toEqual({ [ids[0]!]: 'correct', [ids[1]!]: 'correct', [ids[2]!]: 'wrong', [ids[3]!]: 'correct', [ids[4]!]: 'correct' });
    const facts = await loadGradedFacts(db);
    expect(facts.errorRows.filter((r) => r.effective === 'wrong').map((r) => r.itemId)).toEqual([ids[2]]);
    expect(facts.topicFacts.filter((f) => f.verdict === 'wrong')).toHaveLength(1);
    const attempts = await db.select<{ correct: number }>('SELECT correct FROM spelling_attempt WHERE session_id = ?', [sid]);
    expect(attempts).toEqual([{ correct: 1 }]);
    expect(await skippedToSolve(deps)).toBeNull();
    const view = await loadSessionView(db, sid);
    expect(view.open).toBe(false);
    expect(view.blocks[1]!.items).toHaveLength(2);
  });
});
