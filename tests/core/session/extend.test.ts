import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { createTestDb } from '@/adapters/test/sqliteDb';
import { FakeLlm } from '@/adapters/test/fakeLlm';
import { FixedClock } from '@/adapters/test/fixedClock';
import { insertSeedRules, parseSeed, saveProgramme } from '@/core/programme/setup';
import { getSettings, setSetting } from '@/core/db/repos/settings';
import { closeSession } from '@/core/db/repos/sessions';
import { buildGenerationContext } from '@/core/session/context';
import { extendSession } from '@/core/session/extend';
import { generateSession } from '@/core/session/generate';
import { getTodayState } from '@/core/session/plan';
import { loadSessionView } from '@/core/session/view';
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

const fixItems = (n: number, tag: string): GeneratedBlock['items'] =>
  Array.from({ length: n }, (_, k) =>
    k % 2 === 0
      ? { prompt: `${tag} ${k}: I saw a owl.`, expected: 'an', topicKey: 'articles', ruleSection: 'Basics', isCheck: false, wrong: 'a owl' }
      : { prompt: `${tag} ${k}: He ate a banana.`, expected: '✓', topicKey: 'articles', ruleSection: 'Basics', isCheck: false, wrong: '' },
  );
const fixBlock = (n: number, tag: string): GeneratedBlock => ({
  kind: 'task', format: 'fix', title: 'Fix', instruction: 'Write ✓ or the fix.', formatExample: 'He has a umbrella. → an', minutes: 6,
  items: fixItems(n, tag), paragraphs: [], question: '',
});
const speaking: GeneratedBlock = {
  kind: 'speaking', format: 'question', title: 'Speaking', instruction: 'Answer aloud.', formatExample: '', minutes: 3,
  items: [], paragraphs: [], question: 'Describe a time when you helped someone.',
};
const allOk = (s: GeneratedSession): ValidationResult => ({
  items: s.blocks.flatMap((b, bi) => b.items.map((_, ii) => ({ ref: `b${bi}.i${ii}`, ok: true, reason: '' }))),
});
const first: GeneratedSession = { blocks: [fixBlock(4, 'First'), speaking] };
const extra = (n: number): GeneratedSession => ({ blocks: [fixBlock(n, 'Extra')] });

/** Today's session generated and graded: every item answered, the items at even positions wrong. */
async function setup(script: Partial<Record<LlmKind, LlmResult<unknown>[]>>) {
  const db = await createTestDb();
  const llm = new FakeLlm({ generate_session: [ok(first), ...(script.generate_session ?? [])], validate_session: [ok(allOk(first)), ...(script.validate_session ?? [])] });
  const deps: Deps = {
    db, llm, clock: new FixedClock('2026-10-20'),
    prompts: { load: async (k) => ({ system: 's', schema: schemas[k] ?? {} }) },
  };
  const { programme, rules } = parseSeed(seedFiles, '2026-10-19');
  await saveProgramme(db, programme);
  await insertSeedRules(db, rules, 'x');
  await setSetting(db, 'nativeLanguage', 'en');
  const res = await generateSession(deps, { light: false });
  if (!res.ok) throw new Error(res.message);
  await db.execute("INSERT INTO answer (item_id, text, verdict, fix) SELECT id, 'x', CASE WHEN id % 2 = 1 THEN 'wrong' ELSE 'correct' END, expected FROM item");
  await db.execute("UPDATE session SET status = 'graded' WHERE id = ?", [res.sessionId]);
  await db.execute("INSERT INTO session_feedback (session_id, patterns, tomorrow) VALUES (?, '[\"P1\"]', '[\"T1\"]')", [res.sessionId]);
  return { db, llm, deps, sid: res.sessionId };
}

describe('extendSession', () => {
  test('adds one round-2 task block of 6-8 items, keeps the round-1 answers and leaves the session graded', async () => {
    const gen = extra(7);
    const { db, deps, sid } = await setup({ generate_session: [ok(gen)], validate_session: [ok(allOk(gen))] });
    const before = await db.select('SELECT * FROM answer ORDER BY item_id');
    expect(await extendSession(deps, sid)).toEqual({ ok: true, sessionId: sid });
    const blocks = await db.select<{ ord: number; kind: string; format: string; round: number }>('SELECT ord, kind, format, round FROM block ORDER BY ord');
    expect(blocks).toEqual([
      { ord: 0, kind: 'task', format: 'fix', round: 1 },
      { ord: 1, kind: 'speaking', format: 'question', round: 1 },
      { ord: 2, kind: 'task', format: 'fix', round: 2 },
    ]);
    const added = await db.select<{ wrong: string | null; topic_id: number }>('SELECT i.wrong AS wrong, i.topic_id AS topic_id FROM item i JOIN block b ON b.id = i.block_id WHERE b.round = 2 ORDER BY i.ord');
    expect(added).toHaveLength(7);
    expect(added[0]).toEqual({ wrong: 'a owl', topic_id: 1 });
    expect(await db.select('SELECT * FROM answer ORDER BY item_id')).toEqual(before);
    const view = await loadSessionView(db, sid);
    expect(view.status).toBe('graded');
    expect(view.open).toBe(true);
    expect(await db.select("SELECT status FROM session WHERE id = ?", [sid])).toEqual([{ status: 'graded' }]);
  });

  test('the user prompt lists every round-1 prompt under Extra set and asks for one task block', async () => {
    const gen = extra(6);
    const { db, llm, deps, sid } = await setup({ generate_session: [ok(gen)], validate_session: [ok(allOk(gen))] });
    await extendSession(deps, sid);
    const prompt = llm.calls.filter((c) => c.kind === 'generate_session').at(-1)!.userPrompt;
    const section = prompt.split('## Extra set')[1]!.split('## Task topic')[0]!;
    const prompts = await db.select<{ prompt: string }>('SELECT i.prompt AS prompt FROM item i JOIN block b ON b.id = i.block_id WHERE b.round = 1');
    for (const p of prompts) expect(section).toContain(p.prompt);
    expect(section).toContain('6 to 8 items');
    expect(prompt).toContain('1. task (format fix, topic articles)');
    expect(prompt).not.toMatch(/^2\. /m);
    expect(prompt).not.toContain('Each of these topics needs one check item');
  });

  test('a second extension becomes round 3', async () => {
    const a = extra(6);
    const b: GeneratedSession = { blocks: [fixBlock(8, 'Third')] };
    const { db, deps, sid } = await setup({ generate_session: [ok(a), ok(b)], validate_session: [ok(allOk(a)), ok(allOk(b))] });
    await extendSession(deps, sid);
    expect(await extendSession(deps, sid)).toEqual({ ok: false, message: 'The session has questions to answer first' });
    await db.execute("INSERT INTO answer (item_id, text, verdict) SELECT i.id, 'x', 'correct' FROM item i WHERE NOT EXISTS (SELECT 1 FROM answer a WHERE a.item_id = i.id)");
    expect((await extendSession(deps, sid)).ok).toBe(true);
    expect((await db.select<{ round: number }>('SELECT MAX(round) AS round FROM block'))[0]!.round).toBe(3);
  });

  test('refuses an open session and a session of another day', async () => {
    const gen = extra(6);
    const { db, deps, sid } = await setup({ generate_session: [ok(gen)], validate_session: [ok(allOk(gen))] });
    await extendSession(deps, sid);
    const open = await extendSession(deps, sid);
    expect(open.ok).toBe(false);
    const late: Deps = { ...deps, clock: new FixedClock('2026-10-21') };
    await db.execute("INSERT INTO answer (item_id, text, verdict) SELECT i.id, 'x', 'correct' FROM item i WHERE NOT EXISTS (SELECT 1 FROM answer a WHERE a.item_id = i.id)");
    const other = await extendSession(late, sid);
    expect(other.ok).toBe(false);
    expect((await db.select('SELECT id FROM block')).length).toBe(3);
  });

  test('nine items are a check violation: the model is asked again', async () => {
    const bad = extra(9);
    const good = extra(8);
    const { db, llm, deps, sid } = await setup({ generate_session: [ok(bad), ok(good)], validate_session: [ok(allOk(good))] });
    expect(await extendSession(deps, sid)).toEqual({ ok: true, sessionId: sid });
    expect(llm.calls.filter((c) => c.kind === 'generate_session')).toHaveLength(3);
    expect(llm.calls.filter((c) => c.kind === 'generate_session').at(-1)!.userPrompt).toContain('need 6 to 8');
    expect((await db.select('SELECT id FROM item i WHERE i.block_id IN (SELECT id FROM block WHERE round = 2)')).length).toBe(8);
  });

  test('two failed attempts leave the graded session untouched', async () => {
    const bad = extra(9);
    const { db, deps, sid } = await setup({ generate_session: [ok(bad), ok(bad)] });
    const res = await extendSession(deps, sid);
    expect(res.ok).toBe(false);
    expect((await db.select('SELECT id FROM block')).length).toBe(2);
    expect(await db.select('SELECT status FROM session')).toEqual([{ status: 'graded' }]);
  });

  test('on a day without a task topic the topic of the counted wrong items is used', async () => {
    const gen = extra(6);
    const { db, llm, deps, sid } = await setup({ generate_session: [ok(gen)], validate_session: [ok(allOk(gen))] });
    await db.execute("UPDATE session SET date = '2026-10-24'");
    const sat: Deps = { ...deps, clock: new FixedClock('2026-10-24') };
    expect((await buildGenerationContext(sat, '2026-10-24', false)).taskTopic).toBeNull();
    expect(await extendSession(sat, sid)).toEqual({ ok: true, sessionId: sid });
    expect(llm.calls.filter((c) => c.kind === 'generate_session').at(-1)!.userPrompt).toContain('1. task (format fix, topic articles)');
  });

  test('a write failure removes the new round; the session is not open and a later extension is round 2', async () => {
    const gen = extra(6);
    const { db, llm, deps, sid } = await setup({ generate_session: [ok(gen), ok(gen)], validate_session: [ok(allOk(gen)), ok(allOk(gen))] });
    let items = 0;
    const flaky: Deps = {
      ...deps,
      db: {
        select: (sql, p) => db.select(sql, p),
        async execute(sql, p) {
          if (sql.startsWith('INSERT INTO item') && ++items === 3) throw new Error('disk full');
          return db.execute(sql, p);
        },
      },
    };
    await closeSession(db, sid);
    await expect(extendSession(flaky, sid)).rejects.toThrow('disk full');
    expect(await db.select('SELECT id FROM block WHERE round = 2')).toEqual([]);
    expect((await loadSessionView(db, sid)).open).toBe(false);
    expect((await getSettings(db)).closedSessions).toEqual([sid]);
    expect(await extendSession(deps, sid)).toEqual({ ok: true, sessionId: sid });
    expect((await db.select<{ round: number }>('SELECT MAX(round) AS round FROM block'))[0]!.round).toBe(2);
    expect(llm.calls.filter((c) => c.kind === 'generate_session')).toHaveLength(3);
  });

  test('extending removes the session from the closed list', async () => {
    const gen = extra(6);
    const { db, deps, sid } = await setup({ generate_session: [ok(gen)], validate_session: [ok(allOk(gen))] });
    await closeSession(db, sid);
    expect(await getTodayState(deps)).toMatchObject({ kind: 'session', status: 'graded', closed: true });
    await extendSession(deps, sid);
    expect((await getSettings(db)).closedSessions).toEqual([]);
    expect(await getTodayState(deps)).toMatchObject({ closed: false });
  });
});

describe('closeSession', () => {
  test('remembers an id once and keeps the last 30', async () => {
    const db = await createTestDb();
    await closeSession(db, 5);
    await closeSession(db, 5);
    expect((await getSettings(db)).closedSessions).toEqual([5]);
    for (let i = 100; i < 135; i++) await closeSession(db, i);
    const closed = (await getSettings(db)).closedSessions;
    expect(closed).toHaveLength(30);
    expect(closed.at(-1)).toBe(134);
    expect(closed).not.toContain(5);
  });
});
