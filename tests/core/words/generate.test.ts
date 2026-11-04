import { describe, expect, test } from 'vitest';
import { createTestDb } from '@/adapters/test/sqliteDb';
import { FixedClock } from '@/adapters/test/fixedClock';
import { FakeLlm } from '@/adapters/test/fakeLlm';
import { bundledPrompts } from '@/core/llm/bundledPrompts';
import { insertWord, listExercises, listWords } from '@/core/db/repos/words';
import { withJobLock } from '@/core/session/jobLock';
import { generateWords } from '@/core/words/generate';
import type { Deps, LlmResult } from '@/core/ports';
import type { GeneratedWord, WordsReply } from '@/core/llm/types';
import type { WordFields } from '@/core/words/types';
import { previewLlm } from '@/adapters/preview/previewLlm';
import { gen } from './helpers';

const good = (data: unknown): LlmResult<unknown> => ({ ok: true, data, costUsd: 0, durationMs: 1, raw: '{}' });
const fail: LlmResult<unknown> = { ok: false, code: 'not_signed_in', message: 'sign in', costUsd: 0, durationMs: 1, raw: '' };
const fields = (word: string, over: Partial<WordFields> = {}): WordFields => ({
  word, definition: '', translation: '', example: '', synonyms: [], link: '', added: '2026-11-04', ...over,
});
const echo = (over: (w: string) => Partial<GeneratedWord> = () => ({})) => (req: { userPrompt: string }): LlmResult<unknown> => {
  const words = [...req.userPrompt.matchAll(/^### (.+)$/gm)].map((m) => m[1]!);
  return good({ words: words.map((w) => gen({ word: w, ...over(w) })) } satisfies WordsReply);
};

async function setup(llm: FakeLlm) {
  const db = await createTestDb();
  const deps: Deps = {
    db, llm, clock: new FixedClock('2026-11-04'),
    prompts: { load: async (kind) => bundledPrompts[kind] },
  };
  return deps;
}
const add = async (deps: Deps, ...ws: string[]) => {
  const ids: number[] = [];
  for (const w of ws) ids.push(await insertWord(deps.db, fields(w), '2026-11-04T00:00:00'));
  return ids;
};

describe('generateWords', () => {
  test('fills only empty fields', async () => {
    const llm = new FakeLlm({ words: [echo()] });
    const deps = await setup(llm);
    const id = await insertWord(deps.db, fields('alpha', { definition: 'mine', synonyms: ['own'] }), 't');
    const res = await generateWords(deps, [id]);
    expect(res).toEqual({ ok: true, failed: 0 });
    const w = (await listWords(deps.db))[0]!;
    expect(w.definition).toBe('mine');
    expect(w.synonyms).toEqual(['own']);
    expect(w.translation).toBe('t');
    expect(w.example).toBe('e');
    expect(llm.calls[0]!.userPrompt).toContain('Definition: mine');
    expect(llm.calls[0]!.userPrompt).toContain('Translation: (missing)');
  });

  test('writes exercises and sets ready', async () => {
    const llm = new FakeLlm({ words: [echo()] });
    const deps = await setup(llm);
    const [id] = await add(deps, 'alpha');
    const progress: [number, number][] = [];
    await generateWords(deps, [id!], (d, t) => progress.push([d, t]));
    expect((await listWords(deps.db))[0]!.generation).toBe('ready');
    expect((await listExercises(deps.db)).filter((e) => e.wordId === id)).toHaveLength(7);
    expect(progress.at(-1)).toEqual([1, 1]);
  });

  test('a word with problems -> failed, the others ready', async () => {
    const llm = new FakeLlm({ words: [echo((w) => (w === 'bad' ? { gaps: [] } : {}))] });
    const deps = await setup(llm);
    const ids = await add(deps, 'good', 'bad');
    const res = await generateWords(deps, ids);
    expect(res).toEqual({ ok: true, failed: 1 });
    const gens = Object.fromEntries((await listWords(deps.db)).map((w) => [w.word, w.generation]));
    expect(gens).toEqual({ good: 'ready', bad: 'failed' });
    expect((await listExercises(deps.db)).every((e) => e.wordId === ids[0])).toBe(true);
  });

  test('12 words -> 3 calls', async () => {
    const llm = new FakeLlm({ words: [echo(), echo(), echo()] });
    const deps = await setup(llm);
    const ids = await add(deps, ...Array.from({ length: 12 }, (_, i) => `w${i}`));
    const res = await generateWords(deps, ids);
    expect(res).toEqual({ ok: true, failed: 0 });
    expect(llm.calls).toHaveLength(3);
    expect(llm.calls.map((c) => [...c.userPrompt.matchAll(/^### /gm)].length)).toEqual([5, 5, 2]);
  });

  test('call failure -> batch failed, ok false', async () => {
    const llm = new FakeLlm({ words: [fail] });
    const deps = await setup(llm);
    const ids = await add(deps, 'a', 'b');
    const res = await generateWords(deps, ids);
    expect(res).toMatchObject({ ok: false, code: 'not_signed_in' });
    expect((await listWords(deps.db)).map((w) => w.generation)).toEqual(['failed', 'failed']);
  });

  test('a failed batch does not stop the run: later batches still run', async () => {
    const llm = new FakeLlm({ words: [fail, echo()] });
    const deps = await setup(llm);
    const ids = await add(deps, ...Array.from({ length: 7 }, (_, i) => `w${i}`));
    const res = await generateWords(deps, ids);
    expect(res).toMatchObject({ ok: false, code: 'not_signed_in' });
    expect(llm.calls).toHaveLength(2);
    expect((await listWords(deps.db)).map((w) => w.generation)).toEqual([...Array(5).fill('failed'), 'ready', 'ready']);
  });

  test('busy leaves pending', async () => {
    const llm = new FakeLlm({ words: [] });
    const deps = await setup(llm);
    const ids = await add(deps, 'a');
    const res = await withJobLock(deps.db, () => generateWords(deps, ids), null);
    expect(res).toEqual({ ok: false, message: expect.any(String), code: 'busy' });
    expect((await listWords(deps.db))[0]!.generation).toBe('pending');
    expect(llm.calls).toHaveLength(0);
  });

  test('a deleted word id is skipped', async () => {
    const llm = new FakeLlm({ words: [echo()] });
    const deps = await setup(llm);
    const [id] = await add(deps, 'a');
    expect(await generateWords(deps, [id!, 999])).toEqual({ ok: true, failed: 0 });
    expect(llm.calls[0]!.userPrompt).not.toContain('999');
  });
});

test('previewLlm words reply passes generation; word_check errors only for 3+ words', async () => {
  const deps = await setup(new FakeLlm({}));
  deps.llm = previewLlm;
  const ids = await add(deps, 'alpha', 'beta');
  expect(await generateWords(deps, ids)).toEqual({ ok: true, failed: 0 });
  const mk = (sentence: string) => previewLlm.call({ kind: 'word_check', userPrompt: `Target word: x\n\nLearner sentence:\n${sentence}\n` } as never);
  const long = (await mk('I goes to school')) as { ok: true; data: { wordOk: boolean; errors: { fragment: string }[] } };
  expect(long.data.wordOk).toBe(true);
  expect(long.data.errors.map((e) => e.fragment)).toEqual(['I']);
  expect(((await mk('Too short')) as typeof long).data.errors).toEqual([]);
});
