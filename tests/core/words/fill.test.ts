import { describe, expect, test } from 'vitest';
import { createTestDb } from '@/adapters/test/sqliteDb';
import { FixedClock } from '@/adapters/test/fixedClock';
import { FakeLlm } from '@/adapters/test/fakeLlm';
import { bundledPrompts } from '@/core/llm/bundledPrompts';
import { insertWord, listWords, setGeneration } from '@/core/db/repos/words';
import { withJobLock } from '@/core/session/jobLock';
import { planFill, runFill } from '@/core/words/fill';
import type { Deps, LlmResult } from '@/core/ports';
import type { PhoneticsReply } from '@/core/llm/types';
import type { Word, WordFields } from '@/core/words/types';

const good = (data: unknown): LlmResult<unknown> => ({ ok: true, data, costUsd: 0, durationMs: 1, raw: '{}' });
const fail: LlmResult<unknown> = { ok: false, code: 'not_signed_in', message: 'sign in', costUsd: 0, durationMs: 1, raw: '' };
const fields = (word: string): WordFields => ({
  word, definition: '', translation: '', example: '', synonyms: [], link: '', added: '2026-11-04', transcription: '', partOfSpeech: '',
});
const word = (over: Partial<Word>): Word => ({ ...fields('alpha'), id: 1, generation: 'ready', dict: { translations: [], checked: '' }, ...over });

/** Every requested word gets the same transcription, or the one `transcription` picks. */
const phon = (transcription: (w: string) => string = () => '/ˈsuːpəsiːd/') => (req: { userPrompt: string }): LlmResult<unknown> => {
  const words = [...req.userPrompt.matchAll(/^### (.+)$/gm)].map((m) => m[1]!);
  return good({ words: words.map((w) => ({ word: w, transcription: transcription(w), partOfSpeech: 'verb' })) } satisfies PhoneticsReply);
};

async function setup(llm: FakeLlm): Promise<Deps> {
  return {
    db: await createTestDb(), llm, clock: new FixedClock('2026-11-04'),
    prompts: { load: async (kind) => bundledPrompts[kind] },
  };
}

/** Inserts ready words with no transcription; returns their ids. */
async function readyWords(deps: Deps, ...ws: string[]): Promise<number[]> {
  const ids: number[] = [];
  for (const w of ws) {
    const id = await insertWord(deps.db, fields(w), '2026-11-04T00:00:00');
    await setGeneration(deps.db, id, 'ready');
    ids.push(id);
  }
  return ids;
}

describe('planFill', () => {
  test('picks ready words with an empty transcription, minus the skipped ones', () => {
    const words = [
      word({ id: 1 }),
      word({ id: 2, transcription: '/x/' }),
      word({ id: 3, generation: 'pending' }),
      word({ id: 4, generation: 'failed' }),
      word({ id: 5 }),
      word({ id: 6, transcription: '  ' }),
    ];
    expect(planFill(words, new Set([5]))).toEqual({ phonetics: [1, 6], dict: [] });
  });
});

describe('runFill', () => {
  test('reports progress from 0 to the total, and fills the transcriptions', async () => {
    const llm = new FakeLlm({ phonetics: [phon()] });
    const deps = await setup(llm);
    const ids = await readyWords(deps, 'alpha', 'beta', 'gamma');
    const progress: [number, number][] = [];
    const res = await runFill(deps, planFill(await listWords(deps.db), new Set()), (d, t) => progress.push([d, t]));
    expect(res).toEqual({ ok: true, emptied: [] });
    expect(progress).toEqual([[0, 3], [3, 3]]);
    const rows = await listWords(deps.db);
    expect(rows.filter((w) => ids.includes(w.id)).every((w) => w.transcription === '/ˈsuːpəsiːd/')).toBe(true);
  });

  test('a word the reply left without a transcription is returned as emptied', async () => {
    const llm = new FakeLlm({ phonetics: [phon((w) => (w === 'beta' ? '' : '/x/'))] });
    const deps = await setup(llm);
    const [alpha, beta] = await readyWords(deps, 'alpha', 'beta');
    const res = await runFill(deps, { phonetics: [alpha!, beta!], dict: [] }, () => {});
    expect(res).toEqual({ ok: true, emptied: [beta] });
  });

  test('a failed call returns its message and leaves the words empty', async () => {
    const llm = new FakeLlm({ phonetics: [fail] });
    const deps = await setup(llm);
    const [id] = await readyWords(deps, 'alpha');
    const res = await runFill(deps, { phonetics: [id!], dict: [] }, () => {});
    expect(res).toEqual({ ok: false, busy: false, message: 'sign in', emptied: [] });
    expect((await listWords(deps.db))[0]!.transcription).toBe('');
  });

  test('a failed batch is not emptied, so the next run retries it; the batches before it are', async () => {
    const llm = new FakeLlm({ phonetics: [phon(() => ''), fail] });
    const deps = await setup(llm);
    const ids = await readyWords(deps, ...Array.from({ length: 25 }, (_, i) => `w${i}`));
    const res = await runFill(deps, { phonetics: ids, dict: [] }, () => {});
    expect(res).toEqual({ ok: false, busy: false, message: 'sign in', emptied: ids.slice(0, 20) });
  });

  test('yieldTo is asked before each batch; a yes stops the run there and leaves the rest empty', async () => {
    const llm = new FakeLlm({ phonetics: [phon(), phon()] });
    const deps = await setup(llm);
    const ids = await readyWords(deps, ...Array.from({ length: 25 }, (_, i) => `w${i}`));
    let asked = 0;
    const res = await runFill(deps, { phonetics: ids, dict: [] }, () => {}, () => ++asked > 1);
    expect(res).toEqual({ ok: false, busy: true });
    expect(llm.calls).toHaveLength(1);
    const rows = await listWords(deps.db);
    expect(rows.filter((w) => ids.includes(w.id)).slice(20).every((w) => w.transcription === '')).toBe(true);
  });

  test('a held job lock returns busy and writes nothing', async () => {
    const llm = new FakeLlm({ phonetics: [phon()] });
    const deps = await setup(llm);
    const [id] = await readyWords(deps, 'alpha');
    let release!: () => void;
    const held = withJobLock(deps.db, () => new Promise<void>((r) => (release = r)), undefined);
    const res = await runFill(deps, { phonetics: [id!], dict: [] }, () => {});
    expect(res).toEqual({ ok: false, busy: true });
    expect(llm.calls).toHaveLength(0);
    expect((await listWords(deps.db))[0]!.transcription).toBe('');
    release();
    await held;
  });
});
