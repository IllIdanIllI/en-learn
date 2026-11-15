import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { createTestDb } from '@/adapters/test/sqliteDb';
import { FakeLlm } from '@/adapters/test/fakeLlm';
import { FixedClock } from '@/adapters/test/fixedClock';
import { insertSeedRules, parseSeed, saveProgramme } from '@/core/programme/setup';
import { setSetting } from '@/core/db/repos/settings';
import { recentEssayPrompts, setBlockInstruction } from '@/core/db/repos/writing';
import { buildGenerationContext, renderContext } from '@/core/session/context';
import type { LessonChoice } from '@/core/session/choice';
import { checkEssayPrompt, essayPromptInput, newEssayPrompt } from '@/core/writing/topic';
import type { Db, Deps, LlmResult } from '@/core/ports';

const seedDir = path.resolve(import.meta.dirname, '../fixtures/seed');
const promptsDir = path.resolve(import.meta.dirname, '../../prompts');
const seedFiles = {
  programme: fs.readFileSync(path.join(seedDir, 'programme.json'), 'utf8'),
  rules: { 'articles.md': fs.readFileSync(path.join(seedDir, 'rules/articles.md'), 'utf8') },
};
const essaySchema = JSON.parse(fs.readFileSync(path.join(promptsDir, 'essay_prompt.schema.json'), 'utf8')) as object;

const CANNED = 'Some people think that cities should ban cars from their centres. To what extent do you agree or disagree?';
const NEW_PROMPT = 'Some people believe that museums should charge no entry fee. Do the advantages of free access outweigh the disadvantages?';
const ok = (data: unknown): LlmResult<unknown> => ({ ok: true, data, costUsd: 0.01, durationMs: 5, raw: JSON.stringify(data) });
const fail = (message: string): LlmResult<unknown> => ({ ok: false, code: 'cli_error', message, costUsd: 0, durationMs: 1, raw: '' });
const writingOnly: LessonChoice = { review: false, formats: [], spelling: false, speaking: false, writing: true, rewrite: false };

/** A dated session with one writing block per instruction, in the given format; returns the block ids. */
async function addEssays(db: Db, date: string, status: string, rows: { format?: string; instruction: string }[]): Promise<number[]> {
  const { lastInsertId: sid } = await db.execute('INSERT INTO session (date, title, status, created_at) VALUES (?, ?, ?, ?)', [date, 'Writing', status, `${date}T09:00:00Z`]);
  const ids: number[] = [];
  for (const [i, r] of rows.entries()) {
    const { lastInsertId } = await db.execute(
      "INSERT INTO block (session_id, ord, kind, format, title, instruction, minutes) VALUES (?, ?, 'writing', ?, 'Essay', ?, 40)",
      [sid, i + 1, r.format ?? 'essay', r.instruction],
    );
    ids.push(lastInsertId);
  }
  return ids;
}

const dateOf = (n: number) => new Date(Date.UTC(2026, 8, 1 + n)).toISOString().slice(0, 10);

async function setup(script: LlmResult<unknown>[] = [], today = '2026-10-20') {
  const db = await createTestDb();
  const llm = new FakeLlm({ essay_prompt: script });
  const { programme, rules } = parseSeed(seedFiles, '2026-10-19');
  await saveProgramme(db, programme);
  await insertSeedRules(db, rules, 'x');
  await setSetting(db, 'nativeLanguage', 'en');
  const deps: Deps = { db, llm, clock: new FixedClock(today), prompts: { load: async () => ({ system: 'SYS', schema: essaySchema }) } };
  return { db, llm, deps };
}

describe('recentEssayPrompts', () => {
  test('30 newest essay prompts, newest first, rewrites excluded', async () => {
    const db = await createTestDb();
    for (let i = 0; i < 35; i++) await addEssays(db, dateOf(i), 'graded', [{ instruction: `prompt ${i}` }]);
    await addEssays(db, dateOf(40), 'graded', [{ format: 'rewrite', instruction: 'rewrite me' }]);
    const recent = await recentEssayPrompts(db, 30);
    expect(recent).toHaveLength(30);
    expect(recent[0]).toBe('prompt 34');
    expect(recent[29]).toBe('prompt 5');
    expect(recent).not.toContain('rewrite me');
  });

  test('on one day the later block comes first', async () => {
    const db = await createTestDb();
    await addEssays(db, '2026-10-10', 'graded', [{ instruction: 'first of the day' }, { instruction: 'second of the day' }]);
    expect(await recentEssayPrompts(db, 30)).toEqual(['second of the day', 'first of the day']);
  });
});

describe('the recent prompts in the lesson context', () => {
  test('listed under their heading, newest first, when the lesson has an essay block', async () => {
    const { db, deps } = await setup();
    await addEssays(db, '2026-10-10', 'graded', [{ instruction: 'old prompt' }]);
    await addEssays(db, '2026-10-15', 'graded', [{ instruction: 'middle prompt' }]);
    const ctx = await buildGenerationContext(deps, '2026-10-20', false, writingOnly);
    expect(renderContext(ctx)).toContain('## Recent essay prompts (do not reuse or paraphrase)\n\n- middle prompt\n- old prompt\n');
  });

  test('absent when the lesson has no essay block', async () => {
    const { db, deps } = await setup();
    await addEssays(db, '2026-10-10', 'graded', [{ instruction: 'old prompt' }]);
    const ctx = await buildGenerationContext(deps, '2026-10-20', false);
    expect(renderContext(ctx)).not.toContain('Recent essay prompts');
  });

  test('absent when the list is empty', async () => {
    const { deps } = await setup();
    const ctx = await buildGenerationContext(deps, '2026-10-20', false, writingOnly);
    expect(renderContext(ctx)).not.toContain('Recent essay prompts');
  });
});

describe('checkEssayPrompt', () => {
  const listed = [CANNED];

  test('length: 40 to 600 characters after trimming', () => {
    expect(checkEssayPrompt({ prompt: 'x'.repeat(39) }, listed)).not.toBeNull();
    expect(checkEssayPrompt({ prompt: `  ${'x'.repeat(38)}  ` }, listed)).not.toBeNull();
    expect(checkEssayPrompt({ prompt: 'x'.repeat(40) }, listed)).toBeNull();
    expect(checkEssayPrompt({ prompt: 'x'.repeat(600) }, listed)).toBeNull();
    expect(checkEssayPrompt({ prompt: 'x'.repeat(601) }, listed)).not.toBeNull();
  });

  test('a listed prompt again (case and spaces ignored) counts as failed', () => {
    expect(checkEssayPrompt({ prompt: '  Some  PEOPLE think that cities should ban cars from their centres. To what extent do you agree or disagree?' }, listed)).not.toBeNull();
    expect(checkEssayPrompt({ prompt: NEW_PROMPT }, listed)).toBeNull();
  });
});

describe('essayPromptInput', () => {
  test('carries the current prompt, the recent prompts and the week topic', () => {
    const text = essayPromptInput('current one', ['current one', 'older one'], 'Articles');
    expect(text).toContain('current one');
    expect(text).toContain('older one');
    expect(text).toContain('Articles');
  });
});

describe('newEssayPrompt', () => {
  test('stores the new prompt on that block only, and the prompt sent lists the current one and the week topic', async () => {
    const { db, llm, deps } = await setup([ok({ prompt: `  ${NEW_PROMPT}  ` })]);
    await addEssays(db, '2026-10-10', 'graded', [{ instruction: 'an older prompt about towns' }]);
    const [current, other] = [
      (await addEssays(db, '2026-10-20', 'generated', [{ instruction: CANNED }]))[0]!,
      (await addEssays(db, '2026-10-21', 'generated', [{ instruction: 'another open prompt' }]))[0]!,
    ];
    const res = await newEssayPrompt(deps, current);
    expect(res).toEqual({ ok: true, prompt: NEW_PROMPT });
    const rows = await db.select<{ id: number; instruction: string }>('SELECT id, instruction FROM block WHERE id IN (?, ?) ORDER BY id', [current, other]);
    expect(rows).toEqual([{ id: current, instruction: NEW_PROMPT }, { id: other, instruction: 'another open prompt' }]);
    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0]!.kind).toBe('essay_prompt');
    expect(llm.calls[0]!.userPrompt).toContain(CANNED);
    expect(llm.calls[0]!.userPrompt).toContain('an older prompt about towns');
    expect(llm.calls[0]!.userPrompt).toContain('Articles');
  });

  test('refuses a rewrite block without calling the model', async () => {
    const { db, llm, deps } = await setup([ok({ prompt: NEW_PROMPT })]);
    const [id] = await addEssays(db, '2026-10-20', 'generated', [{ format: 'rewrite', instruction: 'Rewrite the text.' }]);
    expect((await newEssayPrompt(deps, id!)).ok).toBe(false);
    expect(llm.calls).toHaveLength(0);
  });

  test('refuses an essay that already has a text, without calling the model', async () => {
    const { db, llm, deps } = await setup([ok({ prompt: NEW_PROMPT })]);
    const [id] = await addEssays(db, '2026-10-20', 'graded', [{ instruction: CANNED }]);
    await db.execute("INSERT INTO writing_text (block_id, text, words, created_at) VALUES (?, 'my essay', 2, 'x')", [id]);
    expect((await newEssayPrompt(deps, id!)).ok).toBe(false);
    expect(llm.calls).toHaveLength(0);
  });

  test('refuses a missing block', async () => {
    const { llm, deps } = await setup([ok({ prompt: NEW_PROMPT })]);
    expect((await newEssayPrompt(deps, 9999)).ok).toBe(false);
    expect(llm.calls).toHaveLength(0);
  });

  test('a failing model call keeps the old prompt', async () => {
    const { db, deps } = await setup([fail('boom'), fail('boom')]);
    const [id] = await addEssays(db, '2026-10-20', 'generated', [{ instruction: CANNED }]);
    const res = await newEssayPrompt(deps, id!);
    expect(res.ok).toBe(false);
    expect((await db.select<{ instruction: string }>('SELECT instruction FROM block WHERE id = ?', [id]))[0]!.instruction).toBe(CANNED);
  });

  test('a text saved while the model answers: the new prompt is not stored', async () => {
    const { db, deps } = await setup();
    const [id] = await addEssays(db, '2026-10-20', 'graded', [{ instruction: CANNED }]);
    deps.llm = {
      async call() {
        await db.execute("INSERT INTO writing_text (block_id, text, words, created_at) VALUES (?, 'my essay', 2, 'x')", [id]);
        return ok({ prompt: NEW_PROMPT });
      },
    };
    expect((await newEssayPrompt(deps, id!)).ok).toBe(false);
    expect((await db.select<{ instruction: string }>('SELECT instruction FROM block WHERE id = ?', [id]))[0]!.instruction).toBe(CANNED);
  });

  test('the same prompt again on every attempt is a failure and keeps the old prompt', async () => {
    const { db, deps } = await setup([ok({ prompt: CANNED.toUpperCase() }), ok({ prompt: CANNED })]);
    const [id] = await addEssays(db, '2026-10-20', 'generated', [{ instruction: CANNED }]);
    const res = await newEssayPrompt(deps, id!);
    expect(res.ok).toBe(false);
    expect((await db.select<{ instruction: string }>('SELECT instruction FROM block WHERE id = ?', [id]))[0]!.instruction).toBe(CANNED);
  });
});

test('setBlockInstruction changes only the given block', async () => {
  const db = await createTestDb();
  const [a, b] = await addEssays(db, '2026-10-10', 'graded', [{ instruction: 'a' }, { instruction: 'b' }]);
  await setBlockInstruction(db, a!, 'changed');
  expect((await db.select<{ instruction: string }>('SELECT instruction FROM block WHERE id = ?', [b]))[0]!.instruction).toBe('b');
  expect((await db.select<{ instruction: string }>('SELECT instruction FROM block WHERE id = ?', [a]))[0]!.instruction).toBe('changed');
});
