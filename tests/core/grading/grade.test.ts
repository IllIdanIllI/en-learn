import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { createTestDb } from '@/adapters/test/sqliteDb';
import { FakeLlm } from '@/adapters/test/fakeLlm';
import { FixedClock } from '@/adapters/test/fixedClock';
import { insertSeedRules, parseSeed, saveProgramme } from '@/core/programme/setup';
import { getSettings, setSetting } from '@/core/db/repos/settings';
import { insertBlock, insertDraftSession, insertItem, setSessionStatus, type NewItem } from '@/core/db/repos/sessions';
import { itemDraftKey, loadDraftAnswers, saveDraftAnswer } from '@/core/db/repos/drafts';
import { rebuildSession } from '@/core/session/generate';
import { gradeSession, hasAwaiting } from '@/core/grading/grade';
import type { Submission } from '@/core/grading/precheck';
import { blockScores } from '@/core/progress/derive';
import { loadGradedFacts, getTopicStates } from '@/core/progress/history';
import type { Db, Deps, LlmResult } from '@/core/ports';
import type { GradeResult } from '@/core/llm/types';

const seedDir = path.resolve(import.meta.dirname, '../../fixtures/seed');
const promptsDir = path.resolve(import.meta.dirname, '../../../prompts');
const seedFiles = {
  programme: fs.readFileSync(path.join(seedDir, 'programme.json'), 'utf8'),
  rules: { 'articles.md': fs.readFileSync(path.join(seedDir, 'rules/articles.md'), 'utf8') },
};
const gradeSchema = JSON.parse(fs.readFileSync(path.join(promptsDir, 'grade.schema.json'), 'utf8')) as object;

const ok = (data: unknown): LlmResult<unknown> => ({ ok: true, data, costUsd: 0.01, durationMs: 5, raw: JSON.stringify(data) });

type Entry = GradeResult['items'][number];
const entry = (ref: string, verdict: Entry['verdict'], o: Partial<Entry> = {}): Entry => ({
  ref, verdict, fix: '', ruleSection: '', explanation: '', vocabularyNote: '', question: '', ...o,
});
const result = (o: Partial<GradeResult> = {}): GradeResult => ({
  items: [], spot: [], patterns: [], tomorrow: [], spellingErrors: [], ruleGaps: [], ...o,
});

const SPOT_REFS = [0, 1, 2, 3, 4].map((e) => `b2.p0.e${e}`);
const spotEntries = (found: number[]) => [
  ...SPOT_REFS.map((r, k) => (found.includes(k) ? entry(r, 'correct') : entry(r, 'wrong', { fix: 'x', ruleSection: 'Basics', explanation: 'Rule.' }))),
];
const spotResult = (found: number[], extra: { text: string; explanation: string }[] = []) => ({
  blockRef: 'b2', paragraph: 0, found: found.map((k) => SPOT_REFS[k]!), extra,
});
/** A full grade response for the default submission: i2 wrong, 2 of 5 spot errors found. */
const fullResult = (o: Partial<GradeResult> = {}): GradeResult =>
  result({
    items: [entry('b1.i0', 'correct'), entry('b1.i1', 'correct'), entry('b1.i2', 'wrong', { fix: 'an', ruleSection: 'Basics', explanation: 'Use an.' }), ...spotEntries([0, 1])],
    spot: [spotResult([0, 1])],
    ...o,
  });

const SPOT_BLOCK = 3;
const subm = (o: { items?: Record<number, string>; spot?: string } = {}): Submission => ({
  items: { 1: 'necessary', 2: 'an', 3: '✓', 4: 'a', ...o.items },
  spot: { [`${SPOT_BLOCK}:0`]: o.spot ?? 'a apple → an apple\na hour → an hour' },
});

async function setup(date: string, today: string, script: LlmResult<unknown>[], status: 'generated' | 'draft' = 'generated') {
  const raw = await createTestDb();
  const llm = new FakeLlm({ grade: script });
  const failure = { pending: null as RegExp | null };
  const db: Db = {
    select: (sql, p) => raw.select(sql, p),
    async execute(sql, p) {
      if (failure.pending?.test(sql)) {
        failure.pending = null;
        throw new Error('disk full');
      }
      return raw.execute(sql, p);
    },
  };
  const deps: Deps = {
    db, llm, clock: new FixedClock(today),
    prompts: { load: async () => ({ system: 's', schema: gradeSchema }) },
  };
  const { programme, rules } = parseSeed(seedFiles, '2026-10-19');
  await saveProgramme(db, programme);
  await insertSeedRules(db, rules, 'x');
  await setSetting(db, 'nativeLanguage', 'en');
  await raw.execute("INSERT INTO spelling_word (word, hint, created_at) VALUES ('necessary', 'Not optional: ___', 'x')");
  const sid = await insertDraftSession(db, { date, title: 't', isLight: false, createdAt: 'x' });
  const base = { paragraph: null, topicId: null, ruleId: null, ruleVersion: null, ruleSection: null, spellingWordId: null, isCheck: false, status: 'active', note: null, wrong: null } as const;
  const linked: Pick<NewItem, 'topicId' | 'ruleId' | 'ruleVersion' | 'ruleSection'> = { topicId: 1, ruleId: 1, ruleVersion: 1, ruleSection: 'Basics' };
  const blk = { instruction: 'i', formatExample: null, minutes: 5 };
  const b0 = await insertBlock(db, sid, 0, { ...blk, kind: 'spelling', format: 'spelling', title: 'Spelling', passage: null });
  await insertItem(db, b0, 0, { ...base, prompt: 'Not optional: ___', expected: 'necessary', spellingWordId: 1 });
  const b1 = await insertBlock(db, sid, 1, { ...blk, kind: 'task', format: 'fix', title: 'Fix', passage: null });
  await insertItem(db, b1, 0, { ...base, ...linked, prompt: 'She has a apple.', expected: 'an' });
  await insertItem(db, b1, 1, { ...base, ...linked, prompt: 'He ate a banana.', expected: '✓' });
  await insertItem(db, b1, 2, { ...base, ...linked, prompt: 'It is a hour long.', expected: 'an', isCheck: true });
  const b2 = await insertBlock(db, sid, 2, { ...blk, kind: 'task', format: 'spot', title: 'Spot', passage: JSON.stringify(['a apple, a hour, a egg, a umbrella, a orange']) });
  expect(b2).toBe(SPOT_BLOCK);
  for (const [k, w] of ['a apple', 'a hour', 'a egg', 'a umbrella', 'a orange'].entries()) {
    await insertItem(db, b2, k, { ...base, ...linked, prompt: w, expected: w.replace('a ', 'an '), paragraph: 0 });
  }
  await setSessionStatus(db, sid, status);
  return { db, llm, deps, sid, failure };
}

const rows = <T>(db: Db, sql: string, p?: unknown[]) => db.select<T>(sql, p);
const verdicts = async (db: Db) =>
  Object.fromEntries((await rows<{ item_id: number; verdict: string }>(db, 'SELECT item_id, verdict FROM answer')).map((r) => [r.item_id, r.verdict]));
const sessionRow = async (db: Db) => (await rows<{ status: string; graded_at: string | null }>(db, 'SELECT status, graded_at FROM session'))[0]!;
const answerCount = async (db: Db) => (await rows<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM answer'))[0]!.n;
const userPrompt = (llm: FakeLlm, n = 0) => llm.calls[n]!.userPrompt;

describe('gradeSession', () => {
  test('happy path stores answers, error bank shows wrong items, topic opens with pending 1/3/7 from session date', async () => {
    const { db, deps, sid } = await setup('2026-10-20', '2026-10-20', [ok(fullResult({ patterns: ['article before a vowel sound'], tomorrow: ['a / an'] }))]);
    expect(await gradeSession(deps, sid, subm(), [])).toEqual({ kind: 'graded' });
    expect(await sessionRow(db)).toEqual({ status: 'graded', graded_at: '2026-10-20T12:00:00.000Z' });
    expect(await verdicts(db)).toEqual({ 1: 'correct', 2: 'correct', 3: 'correct', 4: 'wrong', 5: 'correct', 6: 'correct', 7: 'wrong', 8: 'wrong', 9: 'wrong' });
    const wrongFix = (await rows<{ fix: string; rule_section: string; explanation: string; text: string }>(db, 'SELECT * FROM answer WHERE item_id = 4'))[0]!;
    expect(wrongFix).toMatchObject({ fix: 'an', rule_section: 'Basics', explanation: 'Use an.', text: 'a' });
    const bank = (await loadGradedFacts(db)).errorRows.filter((r) => r.effective === 'wrong').map((r) => r.itemId);
    expect(bank).toEqual([4, 7, 8, 9]);
    const topic = (await getTopicStates(db)).get(1)!;
    expect(topic.status).toBe('open');
    expect(topic.pending).toEqual(['2026-10-21', '2026-10-23', '2026-10-27']);
    const fb = (await rows<{ patterns: string; tomorrow: string }>(db, 'SELECT * FROM session_feedback'))[0]!;
    expect(JSON.parse(fb.patterns)).toEqual(['article before a vowel sound']);
    expect((await rows<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM llm_call WHERE session_id = ?', [sid]))[0]!.n).toBe(1);
  });

  test('grading an open round sends only its refs, keeps earlier answers and appends the patterns', async () => {
    const { db, llm, deps, sid } = await setup('2026-10-20', '2026-10-20', [
      ok(fullResult({ patterns: ['first pattern'], tomorrow: ['first tomorrow'] })),
      ok(result({ items: [entry('b4.i0', 'wrong', { fix: 'an', ruleSection: 'Basics', explanation: 'Use an.' }), entry('b4.i1', 'correct')], patterns: ['first pattern', 'second pattern'], tomorrow: ['second tomorrow'] })),
    ]);
    expect(await gradeSession(deps, sid, subm(), [])).toEqual({ kind: 'graded' });
    const before = await rows(db, 'SELECT * FROM answer ORDER BY item_id');
    const b4 = await insertBlock(db, sid, 4, { instruction: 'i', formatExample: null, minutes: 5, kind: 'task', format: 'fix', title: 'More', passage: null }, 2);
    const it = { paragraph: null, topicId: 1, ruleId: 1, ruleVersion: 1, ruleSection: 'Basics', spellingWordId: null, isCheck: false, status: 'active', note: null } as const;
    await insertItem(db, b4, 0, { ...it, prompt: 'I saw a owl.', expected: 'an', wrong: 'a owl' });
    await insertItem(db, b4, 1, { ...it, prompt: 'He ate a pear.', expected: '✓', wrong: null });

    expect(await gradeSession(deps, sid, { items: { 10: 'a', 11: '✓' }, spot: {} }, [])).toEqual({ kind: 'graded' });
    const second = userPrompt(llm, 1);
    expect(second.match(/^### b\d+\.i\d+/gm)).toEqual(['### b4.i0']);
    expect(await rows(db, 'SELECT * FROM answer WHERE item_id <= 9 ORDER BY item_id')).toEqual(before);
    expect(await verdicts(db)).toMatchObject({ 10: 'wrong', 11: 'correct' });
    const fb = (await rows<{ patterns: string; tomorrow: string }>(db, 'SELECT * FROM session_feedback'))[0]!;
    expect(JSON.parse(fb.patterns)).toEqual(['first pattern', 'second pattern']);
    expect(JSON.parse(fb.tomorrow)).toEqual(['first tomorrow', 'second tomorrow']);
    expect((await sessionRow(db)).status).toBe('graded');
  });

  test('finish on an open round skips only the blank open items', async () => {
    const { db, deps, sid } = await setup('2026-10-20', '2026-10-20', [ok(fullResult())]);
    await gradeSession(deps, sid, subm(), []);
    const b4 = await insertBlock(db, sid, 4, { instruction: 'i', formatExample: null, minutes: 5, kind: 'task', format: 'fix', title: 'More', passage: null }, 2);
    await insertItem(db, b4, 0, { paragraph: null, topicId: 1, ruleId: 1, ruleVersion: 1, ruleSection: 'Basics', spellingWordId: null, isCheck: false, status: 'active', note: null, prompt: 'I saw a owl.', expected: 'an', wrong: 'a owl' });
    expect(await gradeSession(deps, sid, { items: {}, spot: {} }, [], { finish: true })).toEqual({ kind: 'graded' });
    expect(await verdicts(db)).toMatchObject({ 4: 'wrong', 10: 'skipped' });
  });

  test('finish skips blank gap/fix/spelling items without a question and grades the answered ones', async () => {
    const { db, deps, sid } = await setup('2026-10-20', '2026-10-20', [ok(result())]);
    const sub = subm({ items: { 1: '', 2: '', 3: '', 4: 'an' }, spot: '' });
    expect((await gradeSession(deps, sid, sub, [])).kind).toBe('questions');
    expect(await gradeSession(deps, sid, sub, [], { finish: true })).toEqual({ kind: 'graded' });
    const v = await verdicts(db);
    expect(v).toMatchObject({ 1: 'skipped', 2: 'skipped', 3: 'skipped', 4: 'correct' });
  });

  test('finish still asks about an unknown symbol answer', async () => {
    const { deps, sid } = await setup('2026-10-20', '2026-10-20', [ok(result())]);
    const out = await gradeSession(deps, sid, subm({ items: { 2: '', 3: '~' } }), [], { finish: true });
    expect(out).toEqual({ kind: 'questions', questions: [{ itemId: 3, kind: 'shorthand', symbol: '~' }] });
  });

  test('drafts of the session are deleted when it is graded, not when grading fails', async () => {
    const { db, deps, sid, failure } = await setup('2026-10-20', '2026-10-20', [ok(fullResult()), ok(fullResult())]);
    await saveDraftAnswer(db, sid, itemDraftKey(2), 'necessary');
    failure.pending = /INSERT INTO answer/;
    expect((await gradeSession(deps, sid, subm(), [])).kind).toBe('error');
    expect((await loadDraftAnswers(db, sid)).size).toBe(1);
    expect(await gradeSession(deps, sid, subm(), [])).toEqual({ kind: 'graded' });
    expect((await loadDraftAnswers(db, sid)).size).toBe(0);
  });

  test('grade message carries labelled items, rule body of the stored version, spot lines and settings', async () => {
    const { llm, deps, sid } = await setup('2026-10-20', '2026-10-20', [ok(fullResult())]);
    await gradeSession(deps, sid, subm({ spot: 'a apple → an apple\na hour → an hour\nthe cat → a cat' }), []);
    const p = userPrompt(llm);
    expect(p).toContain('### b1.i2');
    expect(p).toContain('Prompt: It is a hour long.');
    expect(p).toContain('Expected: an');
    expect(p).toContain('Learner answer: a');
    expect(p).toContain('Topic key: articles');
    expect(p).toContain('Rule section: Basics');
    expect(p).toContain('version 1');
    expect(p).toContain('Use "a" before a consonant sound and "an" before a vowel sound.');
    expect(p).toContain('b2.p0.e1');
    expect(p).toContain('a hour → an hour');
    expect(p).toContain('Spelling variant: british');
    expect(p).not.toContain('b0.i0');
    expect(p.match(/Rule body/g)).toHaveLength(1);
  });

  test('grading uses session date not today', async () => {
    const { db, deps, sid } = await setup('2026-10-20', '2026-10-21', [ok(fullResult())]);
    await gradeSession(deps, sid, subm(), []);
    expect((await getTopicStates(db)).get(1)!.pending[0]).toBe('2026-10-21');
    expect((await getTopicStates(db)).get(1)!.history[0]).toEqual({ date: '2026-10-20', event: 'error' });
  });

  test('gradeSession is idempotent on graded session', async () => {
    const { llm, deps, sid } = await setup('2026-10-20', '2026-10-20', [ok(fullResult())]);
    await gradeSession(deps, sid, subm(), []);
    expect(await gradeSession(deps, sid, subm(), [])).toEqual({ kind: 'graded' });
    expect(llm.calls.filter((c) => c.kind === 'grade')).toHaveLength(1);
  });

  test('a draft session is not gradable', async () => {
    const { llm, deps, sid } = await setup('2026-10-20', '2026-10-20', [], 'draft');
    expect(await gradeSession(deps, sid, subm(), [])).toMatchObject({ kind: 'error', message: 'Session not ready', code: 'session_not_ready' });
    expect(llm.calls).toHaveLength(0);
  });

  test('spelling block is graded by code and writes attempts', async () => {
    const { db, llm, deps, sid } = await setup('2026-10-20', '2026-10-20', [ok(fullResult())]);
    await gradeSession(deps, sid, subm({ items: { 1: '  Necesary ' } }), []);
    expect(await verdicts(db)).toMatchObject({ 1: 'wrong' });
    const a = (await rows<{ fix: string }>(db, 'SELECT fix FROM answer WHERE item_id = 1'))[0]!;
    expect(a.fix).toBe('necessary');
    expect(await rows(db, 'SELECT word_id, session_id, correct FROM spelling_attempt')).toEqual([{ word_id: 1, session_id: 1, correct: 0 }]);
    expect(userPrompt(llm)).not.toContain('Necesary');
  });

  test('correct spelling, case-insensitive, writes a correct attempt', async () => {
    const { db, deps, sid } = await setup('2026-10-20', '2026-10-20', [ok(fullResult())]);
    await gradeSession(deps, sid, subm({ items: { 1: 'NECESSARY' } }), []);
    expect(await rows(db, 'SELECT correct FROM spelling_attempt')).toEqual([{ correct: 1 }]);
  });

  test('everything matching is graded in code without calling the LLM', async () => {
    const { db, llm, deps, sid } = await setup('2026-10-20', '2026-10-20', []);
    expect(await gradeSession(deps, sid, subm({ items: { 4: 'an' } }), [])).toEqual({ kind: 'graded' });
    expect(llm.calls).toHaveLength(0);
    expect(await sessionRow(db)).toMatchObject({ status: 'graded' });
    expect(await verdicts(db)).toEqual({ 1: 'correct', 2: 'correct', 3: 'correct', 4: 'correct', 5: 'correct', 6: 'correct', 7: 'wrong', 8: 'wrong', 9: 'wrong' });
  });

  test('only the items that do not match are sent to the LLM', async () => {
    const r = result({ items: [entry('b1.i2', 'wrong', { fix: 'an', ruleSection: 'Basics', explanation: 'Use an.' })] });
    const { db, llm, deps, sid } = await setup('2026-10-20', '2026-10-20', [ok(r)]);
    expect(await gradeSession(deps, sid, subm(), [])).toEqual({ kind: 'graded' });
    expect(userPrompt(llm).match(/^### b\d.*$/gm)).toEqual(['### b1.i2']);
    expect(await verdicts(db)).toMatchObject({ 2: 'correct', 3: 'correct', 4: 'wrong', 5: 'correct', 6: 'correct' });
  });

  test('+ on a ✓ item is correct and nothing is asked', async () => {
    const { db, llm, deps, sid } = await setup('2026-10-20', '2026-10-20', []);
    expect(await gradeSession(deps, sid, subm({ items: { 3: '+', 4: 'an' } }), [])).toEqual({ kind: 'graded' });
    expect(llm.calls).toHaveLength(0);
    expect((await verdicts(db))[3]).toBe('correct');
  });

  test('~ confirmed as correct is stored in acceptedShorthands and graded as ✓', async () => {
    const { db, llm, deps, sid } = await setup('2026-10-20', '2026-10-20', [ok(fullResult())]);
    const sub = subm({ items: { 3: '~' } });
    const first = await gradeSession(deps, sid, sub, []);
    expect(first).toEqual({ kind: 'questions', questions: [{ itemId: 3, kind: 'shorthand', symbol: '~' }] });
    expect(llm.calls).toHaveLength(0);
    expect(await gradeSession(deps, sid, sub, [{ itemId: 3, shorthandMeansCorrect: true }])).toEqual({ kind: 'graded' });
    expect((await getSettings(db)).acceptedShorthands).toEqual(['✓', '~']);
    expect(userPrompt(llm)).not.toContain('Learner answer: ~');
    expect((await rows<{ text: string }>(db, 'SELECT text FROM answer WHERE item_id = 3'))[0]!.text).toBe('✓');
  });

  test('~ not meaning correct needs text', async () => {
    const { deps, sid } = await setup('2026-10-20', '2026-10-20', [ok(fullResult())]);
    const sub = subm({ items: { 3: '~' } });
    const again = await gradeSession(deps, sid, sub, [{ itemId: 3, shorthandMeansCorrect: false }]);
    expect(again).toMatchObject({ kind: 'questions', questions: [{ itemId: 3, kind: 'shorthand' }] });
    expect(await gradeSession(deps, sid, sub, [{ itemId: 3, shorthandMeansCorrect: false, text: 'an' }])).toEqual({ kind: 'graded' });
  });

  test('blank skipped gives verdict skipped, not counted, not sent', async () => {
    const { db, llm, deps, sid } = await setup('2026-10-20', '2026-10-20', [
      ok(fullResult({ items: [entry('b1.i0', 'correct'), entry('b1.i2', 'wrong', { fix: 'an', ruleSection: 'Basics', explanation: 'Use an.' }), ...spotEntries([0, 1])] })),
    ]);
    const sub = subm({ items: { 3: '' } });
    expect(await gradeSession(deps, sid, sub, [])).toEqual({ kind: 'questions', questions: [{ itemId: 3, kind: 'blank' }] });
    expect(await gradeSession(deps, sid, sub, [{ itemId: 3, skip: true }])).toEqual({ kind: 'graded' });
    expect((await verdicts(db))[3]).toBe('skipped');
    expect(userPrompt(llm)).not.toContain('He ate a banana.');
    const scores = blockScores((await loadGradedFacts(db)).scored.filter((s) => s.sessionId === 1));
    expect(scores.find((s) => s.blockId === 2)).toMatchObject({ correct: 1, counted: 2 });
  });

  test('needs_clarification on one item returns questions; next call with text re-grades only that item', async () => {
    const first = fullResult({
      items: [entry('b1.i0', 'correct'), entry('b1.i1', 'needs_clarification', { question: 'Is "a/an" one answer?' }), entry('b1.i2', 'wrong', { fix: 'an', ruleSection: 'Basics', explanation: 'Use an.' }), ...spotEntries([0, 1])],
    });
    const second = result({ items: [entry('b1.i1', 'correct')] });
    const { db, llm, deps, sid } = await setup('2026-10-20', '2026-10-20', [ok(first), ok(second)]);
    const sub = subm({ items: { 3: 'a/an' } });
    const q = await gradeSession(deps, sid, sub, []);
    expect(q).toEqual({ kind: 'questions', questions: [{ itemId: 3, kind: 'llm', text: 'Is "a/an" one answer?' }] });
    expect((await sessionRow(db)).status).toBe('generated');
    expect(await answerCount(db)).toBe(0);
    expect(await gradeSession(deps, sid, sub, [{ itemId: 3, text: 'an' }])).toEqual({ kind: 'graded' });
    const p = userPrompt(llm, 1);
    expect(p.match(/^### b\d+\.i\d+/gm)).toEqual(['### b1.i1']);
    expect(p).toContain('Learner answer: an');
    expect(p).not.toContain('b2.p0');
    expect(await verdicts(db)).toMatchObject({ 3: 'correct', 4: 'wrong', 5: 'correct' });
  });

  test('tone violation in both attempts gives error and writes nothing', async () => {
    const bad = fullResult({ patterns: ['The same error again'] });
    const { db, llm, deps, sid } = await setup('2026-10-20', '2026-10-20', [ok(bad), ok(bad)]);
    const res = await gradeSession(deps, sid, subm(), []);
    expect(res).toMatchObject({ kind: 'error' });
    if (res.kind === 'error') expect(res.message).toContain('again');
    expect(llm.calls).toHaveLength(2);
    expect(await answerCount(db)).toBe(0);
    expect((await sessionRow(db)).status).toBe('generated');
  });

  test('a missing session carries its code', async () => {
    const { deps } = await setup('2026-10-20', '2026-10-20', []);
    expect(await gradeSession(deps, 99, subm(), [])).toMatchObject({ kind: 'error', code: 'session_not_found' });
  });

  test.each(['not_signed_in', 'budget'] as const)('a %s failure of the grade call carries its code', async (code) => {
    const failed: LlmResult<unknown> = { ok: false, code, message: `llm said ${code}`, costUsd: 0, durationMs: 1, raw: '' };
    const { llm, deps, sid } = await setup('2026-10-20', '2026-10-20', [failed]);
    expect(await gradeSession(deps, sid, subm(), [])).toMatchObject({ kind: 'error', message: `llm said ${code}`, code });
    expect(llm.calls).toHaveLength(1);
  });

  test('an omitted item is an invalid response and is retried', async () => {
    const partial = fullResult({ items: [entry('b1.i0', 'correct')] });
    const { llm, deps, sid } = await setup('2026-10-20', '2026-10-20', [ok(partial), ok(fullResult())]);
    expect(await gradeSession(deps, sid, subm(), [])).toEqual({ kind: 'graded' });
    expect(llm.calls).toHaveLength(2);
  });

  test('db write fails once during apply gives error; retry applies the kept result without a new grade call', async () => {
    const { db, llm, deps, sid, failure } = await setup('2026-10-20', '2026-10-20', [ok(fullResult())]);
    failure.pending = /INTO spot_answer/;
    const res = await gradeSession(deps, sid, subm(), []);
    expect(res.kind).toBe('error');
    expect((await sessionRow(db)).status).toBe('generated');
    if (res.kind !== 'error') return;
    expect(await res.retry()).toEqual({ kind: 'graded' });
    expect((await sessionRow(db)).status).toBe('graded');
    expect(llm.calls).toHaveLength(1);
    expect(await verdicts(db)).toMatchObject({ 4: 'wrong', 5: 'correct' });
    expect(await rows(db, 'SELECT * FROM spot_answer')).toHaveLength(1);
  });

  test('spelling error in a gap answer creates the word with its hint and a wrong attempt for this session', async () => {
    const r = fullResult({ spellingErrors: [{ word: 'umbrella', hint: 'You open it when it rains: ___' }] });
    const { db, deps, sid } = await setup('2026-10-20', '2026-10-20', [ok(r)]);
    await gradeSession(deps, sid, subm({ items: { 2: 'an umbrela' } }), []);
    const w = (await rows<{ id: number; hint: string; created_at: string }>(db, "SELECT * FROM spelling_word WHERE word = 'umbrella'"))[0]!;
    expect(w).toMatchObject({ hint: 'You open it when it rains: ___', created_at: '2026-10-20T12:00:00.000Z' });
    expect(await rows(db, 'SELECT correct FROM spelling_attempt WHERE word_id = ?', [w.id])).toEqual([{ correct: 0 }]);
  });

  test('a reported spelling error on a word already tested correctly in the session ends wrong', async () => {
    const r = fullResult({ spellingErrors: [{ word: 'necessary', hint: 'x' }] });
    const { db, deps, sid } = await setup('2026-10-20', '2026-10-20', [ok(r)]);
    await gradeSession(deps, sid, subm(), []);
    expect(await rows(db, 'SELECT correct FROM spelling_attempt')).toEqual([{ correct: 0 }]);
    expect(await rows(db, 'SELECT * FROM spelling_word')).toHaveLength(1);
  });

  test('spot: 2 of 5 errors found and 1 extra gives block score 2/5 and one extra finding', async () => {
    const r = fullResult({ spot: [spotResult([0, 1], [{ text: 'a banana → an banana', explanation: 'Not an error.' }])] });
    const { db, deps, sid } = await setup('2026-10-20', '2026-10-20', [ok(r)]);
    await gradeSession(deps, sid, subm({ spot: 'a apple → an apple\na hour → an hour\na banana → an banana' }), []);
    const scores = blockScores((await loadGradedFacts(db)).scored);
    expect(scores.find((s) => s.blockId === SPOT_BLOCK)).toMatchObject({ correct: 2, counted: 5 });
    expect(await rows(db, 'SELECT paragraph, text, explanation FROM extra_finding')).toEqual([
      { paragraph: 0, text: 'a banana → an banana', explanation: 'Not an error.' },
    ]);
    const sa = (await rows<{ text: string }>(db, 'SELECT text FROM spot_answer'))[0]!;
    expect(sa.text).toContain('a hour → an hour');
    const a5 = (await rows<{ text: string; fix: string }>(db, 'SELECT text, fix FROM answer WHERE item_id = 5'))[0]!;
    expect(a5).toEqual({ text: 'a apple → an apple', fix: 'an apple' });
    const a9 = (await rows<{ text: string }>(db, 'SELECT text FROM answer WHERE item_id = 9'))[0]!;
    expect(a9.text).toBe('');
  });

  test('defect keeps the item out of answers and scores; rule_gap stores a pending proposal', async () => {
    const r = fullResult({
      items: [
        entry('b1.i0', 'defect', { explanation: 'Two valid answers.' }),
        entry('b1.i1', 'rule_gap', { explanation: 'Not covered.' }),
        entry('b1.i2', 'correct'),
        ...spotEntries([0, 1]),
      ],
      ruleGaps: [{ ref: 'b1.i1', ruleTopicKey: 'articles', proposal: 'New body', explanation: 'Adds a case', sources: [] }],
    });
    const { db, deps, sid } = await setup('2026-10-20', '2026-10-20', [ok(r)]);
    await gradeSession(deps, sid, subm(), []);
    expect(await rows(db, 'SELECT status, note FROM item WHERE id = 2')).toEqual([{ status: 'defect', note: 'Two valid answers.' }]);
    expect((await verdicts(db))[2]).toBeUndefined();
    expect(await rows(db, 'SELECT item_id, rule_id, status, proposal FROM rule_gap')).toEqual([{ item_id: 3, rule_id: 1, status: 'pending', proposal: 'New body' }]);
    expect((await verdicts(db))[3]).toBe('rule_gap');
  });

  test('apply failing after answers are written leaves item statuses unchanged', async () => {
    const r = fullResult({ items: [entry('b1.i0', 'defect', { explanation: 'Two valid answers.' }), entry('b1.i1', 'correct'), entry('b1.i2', 'correct'), ...spotEntries([0, 1])] });
    const { db, deps, sid, failure } = await setup('2026-10-20', '2026-10-20', [ok(r)]);
    failure.pending = /INTO session_feedback/;
    const res = await gradeSession(deps, sid, subm(), []);
    expect(res.kind).toBe('error');
    expect(await answerCount(db)).toBeGreaterThan(0);
    expect(await rows(db, "SELECT id FROM item WHERE status != 'active'")).toEqual([]);
    if (res.kind !== 'error') return;
    expect(await res.retry()).toEqual({ kind: 'graded' });
    expect(await rows(db, "SELECT id FROM item WHERE status = 'defect'")).toEqual([{ id: 2 }]);
  });

  const clarify = () =>
    fullResult({ items: [entry('b1.i0', 'correct'), entry('b1.i1', 'needs_clarification', { question: 'Which?' }), entry('b1.i2', 'correct'), ...spotEntries([0, 1])] });

  test('answers edited while a question is open are graded afresh, not replaced by the kept partial result', async () => {
    const { db, llm, deps, sid } = await setup('2026-10-20', '2026-10-20', [ok(clarify()), ok(fullResult())]);
    const q = await gradeSession(deps, sid, subm({ items: { 3: 'a/an' } }), []);
    expect(q.kind).toBe('questions');
    expect(hasAwaiting(sid)).toBe(true);
    // The learner edits item 3 instead of answering the question, then submits.
    expect(await gradeSession(deps, sid, subm({ items: { 3: 'an' } }), [])).toEqual({ kind: 'graded' });
    expect(hasAwaiting(sid)).toBe(false);
    expect(llm.calls).toHaveLength(2);
    expect(userPrompt(llm, 1).match(/^### b\d+\.i\d+/gm)).toContain('### b1.i1');
    expect(userPrompt(llm, 1)).toContain('Learner answer: an');
    expect((await rows<{ text: string }>(db, 'SELECT text FROM answer WHERE item_id = 3'))[0]!.text).toBe('an');
  });

  test('the kept partial result is dropped when its session is rebuilt, and when the session is graded', async () => {
    const { deps, sid } = await setup('2026-10-20', '2026-10-20', [ok(clarify())]);
    await gradeSession(deps, sid, subm({ items: { 3: 'a/an' } }), []);
    expect(hasAwaiting(sid)).toBe(true);
    await expect(rebuildSession(deps, sid, { light: false })).rejects.toThrow(); // no scripted generate result; the old session is gone
    expect(hasAwaiting(sid)).toBe(false);

    const other = await setup('2026-10-20', '2026-10-20', [ok(clarify())]);
    await gradeSession(other.deps, other.sid, subm({ items: { 3: 'a/an' } }), []);
    await other.db.execute("UPDATE session SET status = 'graded'");
    await other.db.execute("INSERT INTO answer (item_id, text, verdict) SELECT id, 'x', 'correct' FROM item"); // nothing left open
    expect(await gradeSession(other.deps, other.sid, subm(), [])).toEqual({ kind: 'graded' });
    expect(hasAwaiting(other.sid)).toBe(false);
  });

  test('retry after an LLM error that then yields questions returns the questions', async () => {
    const bad = fullResult({ patterns: ['again'] });
    const clar = fullResult({ items: [entry('b1.i0', 'correct'), entry('b1.i1', 'needs_clarification', { question: 'Which?' }), entry('b1.i2', 'correct'), ...spotEntries([0, 1])] });
    const { deps, sid } = await setup('2026-10-20', '2026-10-20', [ok(bad), ok(bad), ok(clar), ok(result({ items: [entry('b1.i1', 'correct')] }))]);
    const res = await gradeSession(deps, sid, subm({ items: { 3: 'a/an' } }), []);
    expect(res.kind).toBe('error');
    if (res.kind !== 'error') return;
    expect(await res.retry()).toEqual({ kind: 'questions', questions: [{ itemId: 3, kind: 'llm', text: 'Which?' }] });
    expect(await gradeSession(deps, sid, subm({ items: { 3: 'a/an' } }), [{ itemId: 3, text: 'an' }])).toEqual({ kind: 'graded' });
  });

  test('a rule_gap verdict without a ruleGaps entry is an invalid response and is retried', async () => {
    const noGap = fullResult({ items: [entry('b1.i0', 'rule_gap'), entry('b1.i1', 'correct'), entry('b1.i2', 'correct'), ...spotEntries([0, 1])] });
    const withGap = { ...noGap, ruleGaps: [{ ref: 'b1.i0', ruleTopicKey: 'articles', proposal: 'P', explanation: 'E', sources: [] }] };
    const { db, llm, deps, sid } = await setup('2026-10-20', '2026-10-20', [ok(noGap), ok(withGap)]);
    expect(await gradeSession(deps, sid, subm(), [])).toEqual({ kind: 'graded' });
    expect(llm.calls).toHaveLength(2);
    expect(await rows(db, 'SELECT status FROM rule_gap')).toEqual([{ status: 'pending' }]);
  });
});
