import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { createTestDb } from '@/adapters/test/sqliteDb';
import { FakeLlm } from '@/adapters/test/fakeLlm';
import { FixedClock } from '@/adapters/test/fixedClock';
import { insertSeedRules, parseSeed, saveProgramme } from '@/core/programme/setup';
import { setSetting } from '@/core/db/repos/settings';
import { cleanupDrafts } from '@/core/db/repos/sessions';
import { buildGenerationContext, renderContext } from '@/core/session/context';
import { getTodayState } from '@/core/session/plan';
import { generateSession, rebuildSession } from '@/core/session/generate';
import type { LlmKind } from '@/core/domain';
import type { Deps, LlmResult } from '@/core/ports';
import type { GeneratedBlock, GeneratedSession, ValidationResult } from '@/core/llm/types';

const seedDir = path.resolve(import.meta.dirname, '../../fixtures/seed');
const promptsDir = path.resolve(import.meta.dirname, '../../../prompts');
const seedFiles = {
  programme: fs.readFileSync(path.join(seedDir, 'programme.json'), 'utf8'),
  rules: { 'articles.md': fs.readFileSync(path.join(seedDir, 'rules/articles.md'), 'utf8') },
};
const schemas = Object.fromEntries(
  (['generate_session', 'validate_session'] as const).map((k) => [
    k,
    JSON.parse(fs.readFileSync(path.join(promptsDir, `${k}.schema.json`), 'utf8')) as object,
  ]),
);

const ok = (data: unknown): LlmResult<unknown> => ({ ok: true, data, costUsd: 0.01, durationMs: 5, raw: JSON.stringify(data) });

const item = (n: number, over: Partial<GeneratedBlock['items'][number]> = {}): GeneratedBlock['items'][number] => ({
  prompt: `I saw ___ owl number ${n}.`, expected: 'an', topicKey: 'articles', ruleSection: 'Basics', isCheck: false, wrong: '', ...over,
});

const fixBlock = (kind: 'review' | 'task', checkFirst = false): GeneratedBlock => ({
  kind, format: 'fix', title: 'Fix', instruction: 'Write ✓ or the fix.', formatExample: 'He has a umbrella. → an', minutes: 6,
  items: [
    item(1, { prompt: 'She has a apple.', expected: 'an', isCheck: checkFirst, wrong: 'a apple' }),
    item(2, { prompt: 'He ate a banana.', expected: '✓' }),
    item(3, { prompt: 'It is a hour long.', expected: 'an', wrong: 'a hour' }),
  ],
  paragraphs: [], question: '',
});

const speaking: GeneratedBlock = {
  kind: 'speaking', format: 'question', title: 'Speaking', instruction: 'Answer aloud.', formatExample: '', minutes: 3,
  items: [], paragraphs: [], question: 'Describe a time when you helped someone.',
};

const spotBlock = (): GeneratedBlock => ({
  kind: 'task', format: 'spot', title: 'Spot', instruction: 'Write wrong → right.', formatExample: 'a apple → an', minutes: 10,
  items: [],
  paragraphs: [0, 1].map((p) => ({
    text: `P${p}: a apple, a hour, a egg, a umbrella and a orange.`,
    errors: ['a apple', 'a hour', 'a egg', 'a umbrella', 'a orange'].map((w) => ({
      wrong: w, correction: w.replace('a ', 'an '), topicKey: 'articles', ruleSection: 'Basics',
    })),
  })),
  question: '',
});

const taskDay = (): GeneratedSession => ({ blocks: [fixBlock('task'), speaking] });
const allOk = (s: GeneratedSession): ValidationResult => ({
  items: s.blocks.flatMap((b, bi) => [
    ...b.items.map((_, ii) => ({ ref: `b${bi}.i${ii}`, ok: true, reason: '' })),
    ...b.paragraphs.flatMap((p, pi) => p.errors.map((_, ei) => ({ ref: `b${bi}.p${pi}.e${ei}`, ok: true, reason: '' }))),
  ]),
});

async function setup(date: string, script: Partial<Record<LlmKind, LlmResult<unknown>[]>>) {
  const db = await createTestDb();
  const llm = new FakeLlm(script);
  const deps: Deps = {
    db, llm, clock: new FixedClock(date),
    prompts: { load: async (k) => ({ system: 's', schema: schemas[k] ?? {} }) },
  };
  const { programme, rules } = parseSeed(seedFiles, '2026-10-19');
  await saveProgramme(db, programme);
  await insertSeedRules(db, rules, 'x');
  await setSetting(db, 'nativeLanguage', 'en');
  return { db, llm, deps };
}

/** Graded session on `date` with one wrong answer on topic 1 (articles), so a check is due the next day. */
async function gradeWrong(db: Deps['db'], date: string) {
  await db.execute("INSERT INTO session (date, title, is_light, status, created_at) VALUES (?, 'old', 0, 'graded', 'x')", [date]);
  const sid = (await db.select<{ id: number }>('SELECT id FROM session WHERE date = ?', [date]))[0]?.id;
  await db.execute("INSERT INTO block (session_id, ord, kind, format, title, instruction, minutes) VALUES (?, 0, 'task', 'fix', 't', 'i', 5)", [sid]);
  const bid = (await db.select<{ id: number }>('SELECT id FROM block WHERE session_id = ?', [sid]))[0]?.id;
  await db.execute("INSERT INTO item (block_id, ord, prompt, expected, topic_id, status) VALUES (?, 0, 'She has a apple.', 'an', 1, 'active')", [bid]);
  await db.execute("INSERT INTO answer (item_id, text, verdict, fix) VALUES (1, 'a', 'wrong', 'an')");
}

const sessions = (db: Deps['db']) =>
  db.select<{ id: number; status: string; title: string; is_light: number }>("SELECT * FROM session WHERE status != 'graded' ORDER BY id");
const count = async (db: Deps['db'], table: string) => (await db.select<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))[0]?.n;
const ungraded = async (db: Deps['db']) => (await sessions(db)).length;

describe('generateSession', () => {
  test('happy path stores a generated session with title and answer key', async () => {
    const gen = taskDay();
    const { db, deps } = await setup('2026-10-20', { generate_session: [ok(gen)], validate_session: [ok(allOk(gen))] });
    const res = await generateSession(deps, { light: false });
    expect(res).toEqual({ ok: true, sessionId: 1 });
    const [s] = await sessions(db);
    expect(s).toMatchObject({ status: 'generated', title: 'Week 1, Tue 20 Oct · Articles', is_light: 0 });
    const blocks = await db.select<{ kind: string; format: string }>('SELECT kind, format FROM block ORDER BY ord');
    expect(blocks.map((b) => b.kind)).toEqual(['task', 'speaking']);
    const passages = await db.select<{ passage: string | null }>("SELECT passage FROM block WHERE kind = 'speaking'");
    expect(passages).toEqual([{ passage: 'Describe a time when you helped someone.' }]);
    const items = await db.select<{ expected: string; topic_id: number; rule_id: number; rule_version: number; rule_section: string; status: string }>(
      'SELECT * FROM item ORDER BY id',
    );
    expect(items.map((i) => i.expected)).toEqual(['an', '✓', 'an']);
    expect(items[0]).toMatchObject({ topic_id: 1, rule_id: 1, rule_version: 1, rule_section: 'Basics', status: 'active' });
    expect(await count(db, 'spelling_attempt')).toBe(0);
    const calls = await db.select<{ kind: string; session_id: number | null }>('SELECT kind, session_id FROM llm_call ORDER BY id');
    expect(calls).toEqual([{ kind: 'generate_session', session_id: 1 }, { kind: 'validate_session', session_id: 1 }]);
  });

  test('a fix item stores its wrong fragment; other items store NULL; blocks get round 1', async () => {
    const gen = { blocks: [fixBlock('task'), speaking] };
    const { db, deps } = await setup('2026-10-20', { generate_session: [ok(gen)], validate_session: [ok(allOk(gen))] });
    expect((await generateSession(deps, { light: false })).ok).toBe(true);
    const fix = await db.select<{ expected: string; wrong: string | null }>(
      "SELECT i.expected, i.wrong FROM item i JOIN block b ON b.id = i.block_id WHERE b.format = 'fix' ORDER BY i.id",
    );
    expect(fix.map((r) => r.wrong)).toEqual(['a apple', null, 'a hour']);
    const rounds = await db.select<{ round: number }>('SELECT round FROM block');
    expect(rounds.every((r) => r.round === 1)).toBe(true);
  });

  test('an item marked defect is stored as defect and keeps its reason', async () => {
    const gen = { blocks: [{ ...fixBlock('task'), items: [...fixBlock('task').items, item(4, { expected: '✓' }), item(5, { expected: '✓' })] }, speaking] };
    const val = allOk(gen);
    val.items[3] = { ref: 'b0.i3', ok: false, reason: 'TD-2: two answers' };
    const { db, deps } = await setup('2026-10-20', { generate_session: [ok(gen)], validate_session: [ok(val)] });
    expect((await generateSession(deps, { light: false })).ok).toBe(true);
    const rows = await db.select<{ status: string; note: string | null }>('SELECT status, note FROM item ORDER BY id');
    expect(rows.map((r) => r.status)).toEqual(['active', 'active', 'active', 'defect', 'active']);
    expect(rows[3]?.note).toBe('TD-2: two answers');
  });

  test('first attempt fails checkGenerated, second passes: three llm calls, one session', async () => {
    const bad: GeneratedSession = { blocks: [{ ...fixBlock('task'), items: fixBlock('task').items.slice(0, 2) }, speaking] };
    const good = taskDay();
    const { db, deps } = await setup('2026-10-20', {
      generate_session: [ok(bad), ok(good)], validate_session: [ok(allOk(good))],
    });
    expect((await generateSession(deps, { light: false })).ok).toBe(true);
    expect(await count(db, 'llm_call')).toBe(3);
    const kinds = await db.select<{ kind: string }>('SELECT kind FROM llm_call ORDER BY id');
    expect(kinds.map((k) => k.kind)).toEqual(['generate_session', 'generate_session', 'validate_session']);
    expect(await count(db, 'session')).toBe(1);
    expect((await sessions(db))[0]?.status).toBe('generated');
  });

  test('two failing attempts return ok:false and leave no session rows', async () => {
    const bad: GeneratedSession = { blocks: [{ ...fixBlock('task'), items: fixBlock('task').items.slice(0, 2) }, speaking] };
    const { db, deps } = await setup('2026-10-20', { generate_session: [ok(bad), ok(bad), ok(bad), ok(bad)], validate_session: [] });
    const res = await generateSession(deps, { light: false });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toContain('need at least 3');
    expect(await count(db, 'session')).toBe(0);
    expect(await count(db, 'block')).toBe(0);
    const calls = await db.select<{ kind: string }>('SELECT kind FROM llm_call');
    expect(calls.map((c) => c.kind)).toEqual(['generate_session', 'generate_session']);
  });

  test('an error thrown after the draft insert leaves no session rows', async () => {
    const { db, deps } = await setup('2026-10-20', {});
    deps.llm.call = async () => { throw new Error('boom'); };
    await expect(generateSession(deps, { light: false })).rejects.toThrow('boom');
    expect(await count(db, 'session')).toBe(0);
  });

  test('defects that break the counts fail the attempt', async () => {
    const gen = taskDay();
    const val = allOk(gen);
    val.items[0] = { ref: 'b0.i0', ok: false, reason: 'TD-2' };
    const { db, deps } = await setup('2026-10-20', {
      generate_session: [ok(gen), ok(gen)], validate_session: [ok(val), ok(val)],
    });
    const res = await generateSession(deps, { light: false });
    expect(res.ok).toBe(false);
    expect(await count(db, 'session')).toBe(0);
  });

  test('due topic: context lists it, and a session without its check item fails', async () => {
    const noCheck = { blocks: [fixBlock('review'), fixBlock('task'), speaking] };
    const { db, llm, deps } = await setup('2026-10-20', { generate_session: [ok(noCheck), ok(noCheck), ok(noCheck), ok(noCheck)] });
    await gradeWrong(db, '2026-10-19');
    const res = await generateSession(deps, { light: false });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toContain('due: "articles"');
    const prompt = llm.calls[0]?.userPrompt ?? '';
    expect(prompt).toContain('## Due re-checks');
    expect(prompt).toContain('articles');
    expect(prompt).toContain('Use "a" before a consonant sound');
    expect(prompt).toContain('She has a apple.');
    expect(await ungraded(db)).toBe(0);
  });

  test('due topic with a check item passes', async () => {
    const gen = { blocks: [fixBlock('review', true), fixBlock('task'), speaking] };
    const { db, deps } = await setup('2026-10-20', { generate_session: [ok(gen)], validate_session: [ok(allOk(gen))] });
    await gradeWrong(db, '2026-10-19');
    expect((await generateSession(deps, { light: false })).ok).toBe(true);
    const checks = await db.select<{ n: number }>('SELECT COUNT(*) AS n FROM item WHERE is_check = 1');
    expect(checks[0]?.n).toBe(1);
  });

  test('light day: is_light, no task block', async () => {
    const gen = { blocks: [fixBlock('review', true), speaking] };
    const { db, llm, deps } = await setup('2026-10-20', { generate_session: [ok(gen)], validate_session: [ok(allOk(gen))] });
    await gradeWrong(db, '2026-10-19');
    expect((await generateSession(deps, { light: true })).ok).toBe(true);
    const [s] = await sessions(db);
    expect(s?.is_light).toBe(1);
    const kinds = await db.select<{ kind: string }>(
      "SELECT kind FROM block WHERE session_id = (SELECT id FROM session WHERE date = '2026-10-20') ORDER BY ord",
    );
    expect(kinds.map((k) => k.kind)).toEqual(['review', 'speaking']);
    expect(llm.calls[0]?.userPrompt).toContain('Light day: yes');
    const review = await db.select<{ n: number }>("SELECT COUNT(*) AS n FROM item i JOIN block b ON b.id = i.block_id WHERE b.kind = 'review' AND b.session_id = 2");
    expect(review[0]?.n).toBeLessThanOrEqual(5);
  });

  test('light day rejects a generated task block', async () => {
    const gen = { blocks: [fixBlock('review', true), fixBlock('task'), speaking] };
    const { db, deps } = await setup('2026-10-20', { generate_session: [ok(gen), ok(gen), ok(gen), ok(gen)] });
    await gradeWrong(db, '2026-10-19');
    const res = await generateSession(deps, { light: true });
    expect(res.ok).toBe(false);
    expect(await ungraded(db)).toBe(0);
  });

  test('spelling block is built by code and comes first', async () => {
    const gen = taskDay();
    const { db, deps } = await setup('2026-10-20', { generate_session: [ok(gen)], validate_session: [ok(allOk(gen))] });
    for (let i = 1; i <= 10; i++) {
      await db.execute("INSERT INTO spelling_word (word, hint, created_at) VALUES (?, ?, 'x')", [`word${i}`, `hint${i}`]);
    }
    expect((await generateSession(deps, { light: false })).ok).toBe(true);
    const blocks = await db.select<{ id: number; kind: string; format: string; minutes: number }>('SELECT id, kind, format, minutes FROM block ORDER BY ord');
    expect(blocks.map((b) => b.kind)).toEqual(['spelling', 'task', 'speaking']);
    expect(blocks[0]).toMatchObject({ format: 'spelling', minutes: 4 });
    const words = await db.select<{ prompt: string; expected: string; spelling_word_id: number; topic_id: number | null }>(
      'SELECT prompt, expected, spelling_word_id, topic_id FROM item WHERE block_id = ? ORDER BY ord', [blocks[0]?.id],
    );
    expect(words).toHaveLength(10);
    expect(words[0]).toEqual({ prompt: 'hint1', expected: 'word1', spelling_word_id: 1, topic_id: null });
  });

  test('spot block: passage is a JSON array and each error becomes an item', async () => {
    const gen = { blocks: [spotBlock(), speaking] };
    const { db, deps } = await setup('2026-10-19', { generate_session: [ok(gen)], validate_session: [ok(allOk(gen))] });
    expect((await generateSession(deps, { light: false })).ok).toBe(true);
    const [b] = await db.select<{ passage: string }>("SELECT passage FROM block WHERE kind = 'task'");
    expect(JSON.parse(b?.passage ?? '[]')).toHaveLength(2);
    const rows = await db.select<{ prompt: string; expected: string; paragraph: number; is_check: number }>(
      'SELECT prompt, expected, paragraph, is_check FROM item ORDER BY ord',
    );
    expect(rows).toHaveLength(10);
    expect(rows[5]).toEqual({ prompt: 'a apple', expected: 'an apple', paragraph: 1, is_check: 0 });
    expect(await db.select('SELECT id FROM item WHERE wrong IS NOT NULL')).toEqual([]);
  });

  const failed = (code: 'not_signed_in' | 'budget' | 'timeout'): LlmResult<unknown> => ({
    ok: false, code, message: `llm said ${code}`, costUsd: 0, durationMs: 1, raw: '',
  });

  test.each(['not_signed_in', 'budget'] as const)('a %s failure carries its code and removes the draft', async (code) => {
    const { db, deps } = await setup('2026-10-20', { generate_session: [failed(code)] });
    expect(await generateSession(deps, { light: false })).toEqual({ ok: false, message: `llm said ${code}`, code });
    expect(await count(db, 'session')).toBe(0);
  });

  test('a timeout that repeats carries the timeout code', async () => {
    const { deps } = await setup('2026-10-20', { generate_session: [failed('timeout'), failed('timeout')] });
    expect(await generateSession(deps, { light: false })).toMatchObject({ ok: false, code: 'timeout' });
  });

  test('refuses when a non-draft session exists; drafts are cleaned', async () => {
    const gen = taskDay();
    const { db, deps } = await setup('2026-10-20', { generate_session: [ok(gen)], validate_session: [ok(allOk(gen))] });
    await generateSession(deps, { light: false });
    expect(await generateSession(deps, { light: false })).toEqual({ ok: false, message: 'Session exists', code: 'session_exists' });
    await db.execute("UPDATE session SET status = 'draft'");
    await cleanupDrafts(db);
    expect(await count(db, 'session')).toBe(0);
  });

  test('rebuildSession replaces an ungraded session and refuses a graded one', async () => {
    const gen = taskDay();
    const { db, deps } = await setup('2026-10-20', {
      generate_session: [ok(gen), ok(gen)], validate_session: [ok(allOk(gen)), ok(allOk(gen))],
    });
    await generateSession(deps, { light: false });
    const res = await rebuildSession(deps, 1, { light: false });
    expect(res).toEqual({ ok: true, sessionId: 2 }); // ids are not reused
    expect(await count(db, 'session')).toBe(1);
    expect(await count(db, 'block')).toBe(2);
    await db.execute("UPDATE session SET status = 'graded'");
    await expect(rebuildSession(deps, 2, { light: false })).rejects.toThrow('graded');
  });

  test('rebuildSession refuses a session of another day', async () => {
    const { db, deps } = await setup('2026-10-20', {});
    await gradeWrong(db, '2026-10-19');
    await db.execute("UPDATE session SET status = 'generated'");
    await expect(rebuildSession(deps, 1, { light: false })).rejects.toThrow('another day');
  });
});

describe('context', () => {
  test('renders labelled sections with the rule body in full', async () => {
    const { db, deps } = await setup('2026-10-20', {});
    await gradeWrong(db, '2026-10-19');
    const text = renderContext(await buildGenerationContext(deps, '2026-10-20', false));
    for (const label of [
      '- Date: 2026-10-20', '- Week: 1', '- Slot: topic', '- Light day: no', '## Blocks to produce',
      '## Task topic', '## Error-spotting topics', '## Review input', '## Inattention errors', '## Due re-checks', '## Topic keys allowed',
    ]) expect(text).toContain(label);
    expect(text).toContain('Use "a" before a consonant sound and "an" before a vowel sound.');
    expect(text).toContain('learner answer: a');
  });

  test('lists the allowed rule section headings verbatim for the topic', async () => {
    const { deps } = await setup('2026-10-20', {});
    const ctx = await buildGenerationContext(deps, '2026-10-20', false);
    const headings = [...ctx.taskTopic!.body.matchAll(/^##[ \t]+(.*\S)[ \t]*$/gm)].map((m) => m[1]);
    expect(headings.length).toBeGreaterThan(0);
    const line = `Allowed rule sections (copy one verbatim): ${headings.map((h) => `"${h}"`).join(', ')}`;
    expect(renderContext(ctx)).toContain(line);
  });
});

describe('spelling in review', () => {
  test('a graded spelling miss is not review input and creates no review block', async () => {
    const { db, deps } = await setup('2026-10-20', {});
    await db.execute("INSERT INTO session (date, title, is_light, status, created_at) VALUES ('2026-10-19','old',0,'graded','x')");
    await db.execute("INSERT INTO block (session_id, ord, kind, format, title, instruction, minutes) VALUES (1,0,'spelling','spelling','s','i',3)");
    await db.execute("INSERT INTO item (block_id, ord, prompt, expected, status) VALUES (1,0,'the hint','receive','active'),(1,1,'hint2','separate','active')");
    await db.execute("INSERT INTO answer (item_id, text, verdict, fix, is_inattention) VALUES (1,'recieve','wrong','receive',0),(2,'seperate','wrong','separate',1)");
    const ctx = await buildGenerationContext(deps, '2026-10-20', false);
    expect(ctx.reviewInputs).toEqual([]);
    expect(ctx.inattention).toEqual([]);
    expect(ctx.blocks.map((b) => b.kind)).toEqual(['task', 'speaking']);
    expect(renderContext(ctx)).not.toContain('recieve');
    expect(renderContext(ctx)).not.toContain('seperate');
  });
});

describe('getTodayState', () => {
  test('rest on Wednesday', async () => {
    const { deps } = await setup('2026-10-21', {});
    expect(await getTodayState(deps)).toEqual({ kind: 'rest' });
  });

  test('rule_missing when the week topic has no rule', async () => {
    const { deps } = await setup('2026-10-27', {});
    const s = await getTodayState(deps);
    expect(s.kind).toBe('rule_missing');
    if (s.kind === 'rule_missing') expect(s.topics.map((t) => t.key)).toEqual(['conditionals']);
  });

  test('no_programme and no_session with missing error-spotting rules', async () => {
    const empty = await createTestDb();
    const base = await setup('2026-10-20', {});
    expect(await getTodayState({ ...base.deps, db: empty })).toEqual({ kind: 'no_programme' });
    const s = await getTodayState(base.deps);
    expect(s.kind).toBe('no_session');
    if (s.kind === 'no_session') {
      expect(s.plan.task).toEqual({ format: 'fix', topicId: 1 });
      expect(s.missingRuleTopics.map((t) => t.key)).toEqual(['third-person-s']);
    }
  });

  test('session once generated', async () => {
    const gen = taskDay();
    const { deps } = await setup('2026-10-20', { generate_session: [ok(gen)], validate_session: [ok(allOk(gen))] });
    await generateSession(deps, { light: false });
    expect(await getTodayState(deps)).toEqual({ kind: 'session', sessionId: 1, status: 'generated' });
  });

  test('an earlier generated session is shown when there is none for today', async () => {
    const gen = taskDay();
    const { db, deps } = await setup('2026-10-20', { generate_session: [ok(gen)], validate_session: [ok(allOk(gen))] });
    await generateSession(deps, { light: false });
    const next = { ...deps, clock: new FixedClock('2026-10-22') };
    expect(await getTodayState(next)).toEqual({ kind: 'earlier_session', sessionId: 1, date: '2026-10-20', restDay: false });
    // Wednesday is a rest day: starting today's session there must be light.
    expect(await getTodayState({ ...deps, clock: new FixedClock('2026-10-21') })).toMatchObject({ kind: 'earlier_session', restDay: true });
    // The most recent one wins.
    await db.execute("INSERT INTO session (date, title, is_light, status, created_at) VALUES ('2026-10-21','n',0,'generated','x')");
    expect(await getTodayState(next)).toMatchObject({ kind: 'earlier_session', date: '2026-10-21' });
  });

  test('earlier graded sessions and drafts do not count; today wins over an earlier one', async () => {
    const { db, deps } = await setup('2026-10-20', {});
    await gradeWrong(db, '2026-10-19');
    await db.execute("INSERT INTO session (date, title, is_light, status, created_at) VALUES ('2026-10-18','d',0,'draft','x')");
    expect((await getTodayState(deps)).kind).toBe('no_session');
    await db.execute("INSERT INTO session (date, title, is_light, status, created_at) VALUES ('2026-10-17','g',0,'generated','x')");
    expect((await getTodayState(deps)).kind).toBe('earlier_session');
    await db.execute("INSERT INTO session (date, title, is_light, status, created_at) VALUES ('2026-10-20','t',0,'generated','x')");
    expect((await getTodayState(deps)).kind).toBe('session');
  });
});
