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
import { extendOptions, type AddRound } from '@/core/session/choice';
import { findOrCreateSpellingWord } from '@/core/db/repos/spelling';
import { insertWritingText } from '@/core/db/repos/writing';
import { extendSession } from '@/core/session/extend';
import { generateSession } from '@/core/session/generate';
import { getTodayState } from '@/core/session/plan';
import { loadSessionView } from '@/core/session/view';
import type { LlmKind } from '@/core/domain';
import type { Db, Deps, LlmResult } from '@/core/ports';
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
const spotBlock = (paragraphs: number): GeneratedBlock => ({
  kind: 'task', format: 'spot', title: 'Find the errors', instruction: 'Write each correction on its own line.', formatExample: 'He go home → goes', minutes: 8,
  items: [], question: '',
  paragraphs: Array.from({ length: paragraphs }, (_, k) => ({
    text: `Paragraph ${k}: He go to school, she have a dog, they is happy, we was late, and I wants tea.`,
    errors: [
      { wrong: 'go', correction: 'goes', topicKey: 'articles', ruleSection: 'Basics' },
      { wrong: 'have', correction: 'has', topicKey: 'articles', ruleSection: 'Basics' },
      { wrong: 'is', correction: 'are', topicKey: 'articles', ruleSection: 'Basics' },
      { wrong: 'was', correction: 'were', topicKey: 'articles', ruleSection: 'Basics' },
      { wrong: 'wants', correction: 'want', topicKey: 'articles', ruleSection: 'Basics' },
    ],
  })),
});
const allOk = (s: GeneratedSession): ValidationResult => ({
  items: s.blocks.flatMap((b, bi) => [
    ...b.items.map((_, ii) => ({ ref: `b${bi}.i${ii}`, ok: true, reason: '' })),
    ...b.paragraphs.flatMap((p, pi) => p.errors.map((_, ei) => ({ ref: `b${bi}.p${pi}.e${ei}`, ok: true, reason: '' }))),
  ]),
});
const first: GeneratedSession = { blocks: [fixBlock(4, 'First'), speaking] };
const round = (o: Partial<AddRound> = {}): AddRound => ({ review: false, formats: [], spelling: false, writing: false, rewrite: false, ...o });
const reviewBlock = (n: number): GeneratedBlock => ({ ...fixBlock(n, 'Review'), kind: 'review', title: 'Review' });
const extra = (n: number): GeneratedSession => ({ blocks: [fixBlock(n, 'Extra')] });

/** Today's session generated and graded: every item answered, the items at even positions wrong. */
async function setup(script: Partial<Record<LlmKind, LlmResult<unknown>[]>>, words: string[] = []) {
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
  for (const w of words) await findOrCreateSpellingWord(db, w, `hint of ${w}`, '2026-10-01T10:00:00Z');
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
    expect(await extendSession(deps, sid, round({ formats: ['fix'] }))).toEqual({ ok: true, sessionId: sid });
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

  test('two concurrent extensions: one runs, the other is busy, and only one round is added', async () => {
    const gen = extra(7);
    const { db, deps, sid } = await setup({ generate_session: [ok(gen)], validate_session: [ok(allOk(gen))] });
    const results = await Promise.all([extendSession(deps, sid, round({ formats: ['fix'] })), extendSession(deps, sid, round({ formats: ['fix'] }))]);
    expect(results).toEqual([{ ok: true, sessionId: sid }, { ok: false, message: 'A lesson is already being generated', code: 'busy' }]);
    expect((await db.select<{ round: number }>('SELECT MAX(round) AS round FROM block'))[0]!.round).toBe(2);
  });

  test('the user prompt lists every round-1 prompt under Extra set and asks for one task block', async () => {
    const gen = extra(6);
    const { db, llm, deps, sid } = await setup({ generate_session: [ok(gen)], validate_session: [ok(allOk(gen))] });
    await extendSession(deps, sid, round({ formats: ['fix'] }));
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
    await extendSession(deps, sid, round({ formats: ['fix'] }));
    expect(await extendSession(deps, sid, round({ formats: ['fix'] }))).toEqual({ ok: false, message: 'The session has questions to answer first' });
    await db.execute("INSERT INTO answer (item_id, text, verdict) SELECT i.id, 'x', 'correct' FROM item i WHERE NOT EXISTS (SELECT 1 FROM answer a WHERE a.item_id = i.id)");
    expect((await extendSession(deps, sid, round({ formats: ['fix'] }))).ok).toBe(true);
    expect((await db.select<{ round: number }>('SELECT MAX(round) AS round FROM block'))[0]!.round).toBe(3);
  });

  test('refuses an open session and a session of another day', async () => {
    const gen = extra(6);
    const { db, deps, sid } = await setup({ generate_session: [ok(gen)], validate_session: [ok(allOk(gen))] });
    await extendSession(deps, sid, round({ formats: ['fix'] }));
    const open = await extendSession(deps, sid, round({ formats: ['fix'] }));
    expect(open.ok).toBe(false);
    const late: Deps = { ...deps, clock: new FixedClock('2026-10-21') };
    await db.execute("INSERT INTO answer (item_id, text, verdict) SELECT i.id, 'x', 'correct' FROM item i WHERE NOT EXISTS (SELECT 1 FROM answer a WHERE a.item_id = i.id)");
    const other = await extendSession(late, sid, round({ formats: ['fix'] }));
    expect(other.ok).toBe(false);
    expect((await db.select('SELECT id FROM block')).length).toBe(3);
  });

  test('nine items are a check violation: the model is asked again', async () => {
    const bad = extra(9);
    const good = extra(8);
    const { db, llm, deps, sid } = await setup({ generate_session: [ok(bad), ok(good)], validate_session: [ok(allOk(good))] });
    expect(await extendSession(deps, sid, round({ formats: ['fix'] }))).toEqual({ ok: true, sessionId: sid });
    expect(llm.calls.filter((c) => c.kind === 'generate_session')).toHaveLength(3);
    expect(llm.calls.filter((c) => c.kind === 'generate_session').at(-1)!.userPrompt).toContain('need 6 to 8');
    expect((await db.select('SELECT id FROM item i WHERE i.block_id IN (SELECT id FROM block WHERE round = 2)')).length).toBe(8);
  });

  test('two failed attempts leave the graded session untouched', async () => {
    const bad = extra(9);
    const { db, deps, sid } = await setup({ generate_session: [ok(bad), ok(bad)] });
    const res = await extendSession(deps, sid, round({ formats: ['fix'] }));
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
    expect(await extendSession(sat, sid, round({ formats: ['fix'] }))).toEqual({ ok: true, sessionId: sid });
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
    await expect(extendSession(flaky, sid, round({ formats: ['fix'] }))).rejects.toThrow('disk full');
    expect(await db.select('SELECT id FROM block WHERE round = 2')).toEqual([]);
    expect((await loadSessionView(db, sid)).open).toBe(false);
    expect((await getSettings(db)).closedSessions).toEqual([sid]);
    expect(await extendSession(deps, sid, round({ formats: ['fix'] }))).toEqual({ ok: true, sessionId: sid });
    expect((await db.select<{ round: number }>('SELECT MAX(round) AS round FROM block'))[0]!.round).toBe(2);
    expect(llm.calls.filter((c) => c.kind === 'generate_session')).toHaveLength(3);
  });

  test('fix and spot make one added round of two task blocks, the spot block over the error-spotting topics', async () => {
    const gen: GeneratedSession = { blocks: [fixBlock(6, 'Extra'), spotBlock(2)] };
    const { db, llm, deps, sid } = await setup({ generate_session: [ok(gen)], validate_session: [ok(allOk(gen))] });
    expect(await extendSession(deps, sid, round({ formats: ['fix', 'spot'] }))).toEqual({ ok: true, sessionId: sid });
    const calls = llm.calls.filter((c) => c.kind === 'generate_session');
    expect(calls).toHaveLength(2);
    const prompt = calls.at(-1)!.userPrompt;
    expect(prompt).toContain('1. task (format fix, topic articles)\n2. task (format spot)\n');
    const spotSection = prompt.split('## Error-spotting topics')[1]!.split('## Review input')[0]!;
    const spotTopics = (await buildGenerationContext(deps, '2026-10-20', false)).spotTopics;
    expect(spotTopics.length).toBeGreaterThan(0);
    for (const r of spotTopics) expect(spotSection).toContain(`### ${r.topic.key} `);
    expect(await db.select<{ format: string; round: number }>("SELECT format, round FROM block WHERE round = 2 AND kind = 'task' ORDER BY ord")).toEqual([
      { format: 'fix', round: 2 },
      { format: 'spot', round: 2 },
    ]);
  });

  test('a spot-only added round passes the check without items', async () => {
    const gen: GeneratedSession = { blocks: [spotBlock(2)] };
    const { llm, deps, sid } = await setup({ generate_session: [ok(gen)], validate_session: [ok(allOk(gen))] });
    expect(await extendSession(deps, sid, round({ formats: ['spot'] }))).toEqual({ ok: true, sessionId: sid });
    expect(llm.calls.filter((c) => c.kind === 'generate_session')).toHaveLength(2);
  });

  test('no format chosen is refused without a call', async () => {
    const { llm, deps, sid } = await setup({});
    expect((await extendSession(deps, sid, round({ formats: [] }))).ok).toBe(false);
    expect(llm.calls.filter((c) => c.kind === 'generate_session')).toHaveLength(1);
  });

  test('spot with no error-spotting topic is refused without a call', async () => {
    const { db, llm, deps, sid } = await setup({});
    await db.execute('UPDATE topic SET archived = 1');
    expect(await extendSession(deps, sid, round({ formats: ['spot'] }))).toEqual({ ok: false, message: 'No topics to spot errors in' });
    expect(llm.calls.filter((c) => c.kind === 'generate_session')).toHaveLength(1);
  });

  test('extendOptions defaults to the first round format and disables spot without spotting topics', async () => {
    const { db, deps, sid } = await setup({});
    expect(await extendOptions(deps, sid)).toMatchObject({ formats: { gap: null, fix: null, spot: null }, defaults: ['fix'], writing: true });
    await db.execute('UPDATE topic SET archived = 1');
    expect((await extendOptions(deps, sid)).formats.spot).toBe('no_topics');
  });

  test('extendOptions offers no writing on a light session', async () => {
    const { db, deps, sid } = await setup({});
    await db.execute('UPDATE session SET is_light = 1 WHERE id = ?', [sid]);
    expect((await extendOptions(deps, sid)).writing).toBe(false);
  });

  test('extending removes the session from the closed list', async () => {
    const gen = extra(6);
    const { db, deps, sid } = await setup({ generate_session: [ok(gen)], validate_session: [ok(allOk(gen))] });
    await closeSession(db, sid);
    expect(await getTodayState(deps)).toMatchObject({ kind: 'session', status: 'graded', closed: true });
    await extendSession(deps, sid, round({ formats: ['fix'] }));
    expect((await getSettings(db)).closedSessions).toEqual([]);
    expect(await getTodayState(deps)).toMatchObject({ closed: false });
  });
});

describe('extendOptions reasons of the added round', () => {
  test('the cards of an ordinary day: review and spelling and rewrite unavailable with their reasons', async () => {
    const { db, deps, sid } = await setup({}, ['alpha']);
    expect(await extendOptions(deps, sid)).toEqual({
      formats: { gap: null, fix: null, spot: null }, defaults: ['fix'], writing: true,
      reviewReason: null, spellingReason: 'no_words', rewriteReason: 'no_text',
    });
    await findOrCreateSpellingWord(db, 'beta', 'hint', '2026-10-01T10:00:00Z');
    expect((await extendOptions(deps, sid)).spellingReason).toBeNull();
  });

  test('no counted wrong answer today: review is unavailable (no mistakes); a spelling mistake does not count', async () => {
    const { db, deps, sid } = await setup({});
    await db.execute("UPDATE answer SET verdict = 'correct'");
    expect((await extendOptions(deps, sid)).reviewReason).toBe('no_mistakes');
  });

  test("today's checked text makes rewrite available", async () => {
    const { db, deps, sid } = await setup({});
    await addTodayText(db, sid, 60);
    expect((await extendOptions(deps, sid)).rewriteReason).toBeNull();
    const short = await setup({});
    await addTodayText(short.db, short.sid, 20);
    expect((await extendOptions(short.deps, short.sid)).rewriteReason).toBe('no_text');
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

/** A checked text of `words` words in a writing block of today's session. Returns the block id. */
async function addTodayText(db: Db, sid: number, words: number): Promise<number> {
  const { lastInsertId } = await db.execute(
    "INSERT INTO block (session_id, ord, kind, format, title, instruction, minutes, round) VALUES (?, 9, 'writing', 'essay', 'Essay', 'Write.', 20, 1)", [sid],
  );
  await insertWritingText(db, { blockId: lastInsertId, text: Array.from({ length: words }, (_, k) => `w${k}`).join(' '), words, sourceBlockId: null, createdAt: '2026-10-20T11:00:00Z' });
  return lastInsertId;
}

describe('extendSession with the other cards', () => {
  test("review only: a review block built from today's counted mistakes, round 2", async () => {
    const gen: GeneratedSession = { blocks: [reviewBlock(6)] };
    const { db, llm, deps, sid } = await setup({ generate_session: [ok(gen)], validate_session: [ok(allOk(gen))] });
    expect(await extendSession(deps, sid, round({ review: true }))).toEqual({ ok: true, sessionId: sid });
    const prompt = llm.calls.filter((c) => c.kind === 'generate_session').at(-1)!.userPrompt;
    expect(prompt).toContain('1. review (format gap or fix)');
    const wrong = await db.select<{ prompt: string }>("SELECT i.prompt AS prompt FROM item i JOIN answer a ON a.item_id = i.id WHERE a.verdict = 'wrong'");
    const section = prompt.split('## Review input')[1]!.split('## Inattention')[0]!;
    expect(wrong.length).toBeGreaterThan(0);
    for (const w of wrong) expect(section).toContain(w.prompt);
    expect(prompt).toContain('## Due re-checks\n\nNone.');
    expect(await db.select('SELECT kind, format, round FROM block WHERE round = 2')).toEqual([{ kind: 'review', format: 'fix', round: 2 }]);
  });

  test('review with no mistakes is refused without a call', async () => {
    const { db, llm, deps, sid } = await setup({});
    await db.execute("UPDATE answer SET verdict = 'correct'");
    expect(await extendSession(deps, sid, round({ review: true }))).toEqual({ ok: false, message: 'No mistakes to review' });
    expect(llm.calls.filter((c) => c.kind === 'generate_session')).toHaveLength(1);
  });

  test("spelling only: no model call, the words today's session did not use, in round 2", async () => {
    const { db, llm, deps, sid } = await setup({}, ['alpha', 'beta']);
    await findOrCreateSpellingWord(db, 'gamma', 'hint of gamma', '2026-10-02T10:00:00Z');
    await findOrCreateSpellingWord(db, 'delta', 'hint of delta', '2026-10-02T10:00:00Z');
    const calls = llm.calls.length;
    expect(await extendSession(deps, sid, round({ spelling: true }))).toEqual({ ok: true, sessionId: sid });
    expect(llm.calls).toHaveLength(calls);
    expect(await db.select('SELECT ord, kind, format, round FROM block WHERE round = 2')).toEqual([{ ord: 3, kind: 'spelling', format: 'spelling', round: 2 }]);
    const words = await db.select<{ expected: string }>('SELECT i.expected AS expected FROM item i JOIN block b ON b.id = i.block_id WHERE b.round = 2 ORDER BY i.ord');
    expect(words.map((w) => w.expected)).toEqual(['gamma', 'delta']);
  });

  test('spelling with no unused word is refused', async () => {
    const { llm, deps, sid } = await setup({}, ['alpha']);
    expect(await extendSession(deps, sid, round({ spelling: true }))).toEqual({ ok: false, message: 'No spelling words left' });
    expect(llm.calls.filter((c) => c.kind === 'generate_session')).toHaveLength(1);
  });

  test("rewrite only: no model call, the source is today's checked text", async () => {
    const { db, llm, deps, sid } = await setup({});
    const source = await addTodayText(db, sid, 60);
    const calls = llm.calls.length;
    expect(await extendSession(deps, sid, round({ rewrite: true }))).toEqual({ ok: true, sessionId: sid });
    expect(llm.calls).toHaveLength(calls);
    const rows = await db.select<{ kind: string; format: string; passage: string }>("SELECT kind, format, passage FROM block WHERE round = 2");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'writing', format: 'rewrite' });
    expect((JSON.parse(rows[0]!.passage) as { sourceBlockId: number }).sourceBlockId).toBe(source);
  });

  test('rewrite without a checked text is refused', async () => {
    const { deps, sid } = await setup({});
    expect(await extendSession(deps, sid, round({ rewrite: true }))).toEqual({ ok: false, message: 'No text to rewrite' });
  });

  test('every card: spelling, review, task, writing, rewrite in that order', async () => {
    const essayBlock: GeneratedBlock = {
      kind: 'writing', format: 'essay', title: 'Essay', instruction: 'Discuss both views.', formatExample: '', minutes: 40, items: [], paragraphs: [], question: '',
    };
    const gen: GeneratedSession = { blocks: [reviewBlock(6), fixBlock(6, 'Extra'), essayBlock] };
    const { db, deps, sid } = await setup({ generate_session: [ok(gen)], validate_session: [ok(allOk(gen))] }, ['alpha']);
    await findOrCreateSpellingWord(db, 'beta', 'hint', '2026-10-02T10:00:00Z');
    await addTodayText(db, sid, 60);
    expect(await extendSession(deps, sid, round({ review: true, formats: ['fix'], spelling: true, writing: true, rewrite: true }))).toEqual({ ok: true, sessionId: sid });
    const added = await db.select<{ kind: string; format: string }>('SELECT kind, format FROM block WHERE round = 2 ORDER BY ord');
    expect(added.map((b) => `${b.kind}:${b.format}`)).toEqual(['spelling:spelling', 'review:fix', 'task:fix', 'writing:essay', 'writing:rewrite']);
  });

  test('on a light session writing and rewrite are ignored, and rewrite alone is an empty choice', async () => {
    const gen: GeneratedSession = { blocks: [fixBlock(6, 'Extra')] };
    const { db, llm, deps, sid } = await setup({ generate_session: [ok(gen)], validate_session: [ok(allOk(gen))] });
    await db.execute('UPDATE session SET is_light = 1 WHERE id = ?', [sid]);
    await addTodayText(db, sid, 60);
    expect(await extendSession(deps, sid, round({ rewrite: true }))).toEqual({ ok: false, message: 'Choose at least one block' });
    expect(await extendSession(deps, sid, round({ formats: ['fix'], writing: true, rewrite: true }))).toEqual({ ok: true, sessionId: sid });
    expect((await db.select<{ kind: string }>('SELECT kind FROM block WHERE round = 2 ORDER BY ord')).map((b) => b.kind)).toEqual(['task']);
    expect(llm.calls.filter((c) => c.kind === 'generate_session')).toHaveLength(2);
  });

  test('an empty choice is refused without a call', async () => {
    const { llm, deps, sid } = await setup({});
    expect(await extendSession(deps, sid, round())).toEqual({ ok: false, message: 'Choose at least one block' });
    expect(llm.calls.filter((c) => c.kind === 'generate_session')).toHaveLength(1);
  });
});

describe('extendSession with writing', () => {
  const essay: GeneratedBlock = {
    kind: 'writing', format: 'essay', title: 'Essay', instruction: 'Some people think that cities are too big. Discuss both views and give your opinion.',
    formatExample: '', minutes: 40, items: [], paragraphs: [], question: '',
  };

  test('writing alone adds one essay block in round 2', async () => {
    const gen: GeneratedSession = { blocks: [essay] };
    const { db, deps, sid } = await setup({ generate_session: [ok(gen)], validate_session: [ok(allOk(gen))] });
    expect(await extendSession(deps, sid, round({ formats: [], writing: true }))).toEqual({ ok: true, sessionId: sid });
    expect(await db.select('SELECT kind, format, round FROM block WHERE round = 2')).toEqual([{ kind: 'writing', format: 'essay', round: 2 }]);
  });

  test('writing after the task blocks of the round', async () => {
    const gen: GeneratedSession = { blocks: [fixBlock(6, 'Extra'), essay] };
    const { db, llm, deps, sid } = await setup({ generate_session: [ok(gen)], validate_session: [ok(allOk(gen))] });
    expect(await extendSession(deps, sid, round({ formats: ['fix'], writing: true }))).toEqual({ ok: true, sessionId: sid });
    expect(llm.calls.filter((c) => c.kind === 'generate_session').at(-1)!.userPrompt).toContain('1. task (format fix, topic articles)\n2. writing (format essay)\n');
    expect((await db.select<{ kind: string }>('SELECT kind FROM block WHERE round = 2 ORDER BY ord')).map((b) => b.kind)).toEqual(['task', 'writing']);
  });

  test('on a light session writing is ignored: only the task block is added', async () => {
    const gen: GeneratedSession = { blocks: [fixBlock(6, 'Extra')] };
    const { db, llm, deps, sid } = await setup({ generate_session: [ok(gen)], validate_session: [ok(allOk(gen))] });
    await db.execute('UPDATE session SET is_light = 1 WHERE id = ?', [sid]);
    expect(await extendSession(deps, sid, round({ formats: ['fix'], writing: true }))).toEqual({ ok: true, sessionId: sid });
    expect(llm.calls.filter((c) => c.kind === 'generate_session').at(-1)!.userPrompt).not.toContain('writing (format essay)');
    expect((await db.select<{ kind: string }>('SELECT kind FROM block WHERE round = 2 ORDER BY ord')).map((b) => b.kind)).toEqual(['task']);
  });

  test('on a light session writing alone is an empty choice', async () => {
    const { db, deps, sid } = await setup({});
    await db.execute('UPDATE session SET is_light = 1 WHERE id = ?', [sid]);
    expect(await extendSession(deps, sid, round({ formats: [], writing: true }))).toEqual({ ok: false, message: 'Choose at least one block' });
  });
});
