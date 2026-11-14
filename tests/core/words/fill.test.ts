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
import type { Net } from '@/core/ports';

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

  test('ru with a net: dict is the ready words not checked yet, skipped ones included, blank ones left out', () => {
    const words = [
      word({ id: 1 }),
      word({ id: 2, transcription: '/x/', dict: { translations: [], checked: 'none' } }),
      word({ id: 3, generation: 'pending' }),
      word({ id: 4, word: '   ', transcription: '/x/' }),
      word({ id: 5, transcription: '/x/', dict: { translations: ['a'], checked: 'found' } }),
      word({ id: 6, transcription: '/y/' }),
    ];
    expect(planFill(words, new Set([1]), { lang: 'ru', net: true })).toEqual({ phonetics: [], dict: [1, 6] });
  });

  test('en, or no net: dict stays empty', () => {
    const words = [word({ id: 1 })];
    expect(planFill(words, new Set(), { lang: 'en', net: true }).dict).toEqual([]);
    expect(planFill(words, new Set(), { lang: 'ru', net: false }).dict).toEqual([]);
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
    expect(res).toEqual({ ok: false, busy: true, emptied: [] });
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
    expect(res).toEqual({ ok: false, busy: true, emptied: [] });
    expect(llm.calls).toHaveLength(0);
    expect((await listWords(deps.db))[0]!.transcription).toBe('');
    release();
    await held;
  });

  describe('dictionary step', () => {
    const entry = (ru: string) => JSON.stringify({ translations: [{ code: 'ru', word: ru }] });
    /** Replies by the last path segment of the URL; a value that is an Error is thrown, a missing one is 404. */
    const netOf = (replies: Record<string, string | Error>, seen: string[] = []): Net => ({
      getText: async (url) => {
        const key = decodeURIComponent(url.split('/').pop()!.replace(/\.jsonl$/, ''));
        seen.push(key);
        const r = replies[key];
        if (r instanceof Error) throw r;
        return r === undefined ? { status: 404, text: '' } : { status: 200, text: r };
      },
    });
    const ruOpts = { lang: 'ru' as const, net: true };

    test('ru: the dict words are looked up after the phonetics, and progress counts both steps', async () => {
      const llm = new FakeLlm({ phonetics: [phon()] });
      const seenTranscriptions: string[] = [];
      const deps = await setup(llm);
      const [a, b] = await readyWords(deps, 'alpha', 'beta');
      deps.net = {
        getText: async () => {
          seenTranscriptions.push((await listWords(deps.db)).find((w) => w.id === a)!.transcription);
          return { status: 404, text: '' };
        },
      };
      const progress: [number, number][] = [];
      const plan = planFill(await listWords(deps.db), new Set(), ruOpts);
      const res = await runFill(deps, plan, (d, t) => progress.push([d, t]));
      expect(res).toEqual({ ok: true, emptied: [] });
      expect(seenTranscriptions).toEqual(['/ˈsuːpəsiːd/', '/ˈsuːpəsiːd/']);
      expect(progress).toEqual([[0, 4], [2, 4], [3, 4], [4, 4]]);
      expect(plan.dict).toEqual([a, b]);
    });

    test('a 404 sets none, a found reply sets its translations', async () => {
      const deps = await setup(new FakeLlm({ phonetics: [phon()] }));
      const [a, b] = await readyWords(deps, 'alpha', 'give up');
      deps.net = netOf({ 'give up': entry('сдаваться') });
      const res = await runFill(deps, planFill(await listWords(deps.db), new Set(), ruOpts), () => {});
      expect(res).toEqual({ ok: true, emptied: [] });
      const rows = await listWords(deps.db);
      expect(rows.find((w) => w.id === a)!.dict).toEqual({ translations: [], checked: 'none' });
      expect(rows.find((w) => w.id === b)!.dict).toEqual({ translations: ['сдаваться'], checked: 'found' });
    });

    test('a thrown lookup leaves the word unchecked, reports its message, and the other words are still written', async () => {
      const deps = await setup(new FakeLlm({ phonetics: [phon()] }));
      const [a, b] = await readyWords(deps, 'alpha', 'beta');
      deps.net = netOf({ alpha: new Error('network down') });
      const res = await runFill(deps, planFill(await listWords(deps.db), new Set(), ruOpts), () => {});
      expect(res).toEqual({ ok: false, busy: false, message: 'network down', emptied: [] });
      const rows = await listWords(deps.db);
      expect(rows.find((w) => w.id === a)!.dict.checked).toBe('');
      expect(rows.find((w) => w.id === b)!.dict.checked).toBe('none');
    });

    test('a malformed reply is a thrown error too: the word stays unchecked', async () => {
      const deps = await setup(new FakeLlm({ phonetics: [phon()] }));
      const [a] = await readyWords(deps, 'alpha');
      deps.net = netOf({ alpha: '{not json' });
      const res = await runFill(deps, planFill(await listWords(deps.db), new Set(), ruOpts), () => {});
      expect(res.ok).toBe(false);
      expect((await listWords(deps.db)).find((w) => w.id === a)!.dict.checked).toBe('');
    });

    test('the dict step runs while another job holds the lock: only the phonetics step is busy', async () => {
      const llm = new FakeLlm({ phonetics: [phon()] });
      const deps = await setup(llm);
      const [a] = await readyWords(deps, 'alpha');
      deps.net = netOf({ alpha: entry('альфа') });
      let release!: () => void;
      const held = withJobLock(deps.db, () => new Promise<void>((r) => (release = r)), undefined);
      const res = await runFill(deps, planFill(await listWords(deps.db), new Set(), ruOpts), () => {});
      expect(res).toEqual({ ok: false, busy: true, emptied: [] });
      expect(llm.calls).toHaveLength(0);
      const row = (await listWords(deps.db)).find((w) => w.id === a)!;
      expect(row.transcription).toBe('');
      expect(row.dict).toEqual({ translations: ['альфа'], checked: 'found' });
      release();
      await held;
    });

    test('a dict error wins over a busy phonetics step', async () => {
      const deps = await setup(new FakeLlm({ phonetics: [phon()] }));
      await readyWords(deps, 'alpha');
      deps.net = netOf({ alpha: new Error('offline') });
      let release!: () => void;
      const held = withJobLock(deps.db, () => new Promise<void>((r) => (release = r)), undefined);
      const res = await runFill(deps, planFill(await listWords(deps.db), new Set(), ruOpts), () => {});
      expect(res).toEqual({ ok: false, busy: false, message: 'offline', emptied: [] });
      release();
      await held;
    });

    test('yieldTo is asked before each lookup; a yes stops the step quietly and the rest stay unchecked', async () => {
      const deps = await setup(new FakeLlm({ phonetics: [phon()] }));
      const ids = await readyWords(deps, 'alpha', 'beta', 'gamma', 'delta');
      const seen: string[] = [];
      deps.net = netOf({}, seen);
      let asked = 0;
      const res = await runFill(deps, { phonetics: [], dict: ids }, () => {}, () => ++asked > 2);
      expect(res).toEqual({ ok: false, busy: true, emptied: [] });
      expect(seen).toEqual(['alpha', 'beta']);
      const rows = await listWords(deps.db);
      expect(rows.filter((w) => ids.includes(w.id)).map((w) => w.dict.checked)).toEqual(['none', 'none', '', '']);
    });

    test('three lookups in a row that throw stop the step with the error; the words after them stay unchecked', async () => {
      const deps = await setup(new FakeLlm({ phonetics: [phon()] }));
      await readyWords(deps, 'alpha', 'beta', 'gamma', 'delta', 'epsilon');
      const seen: string[] = [];
      deps.net = netOf({ alpha: new Error('offline'), beta: new Error('offline'), gamma: new Error('offline') }, seen);
      const res = await runFill(deps, planFill(await listWords(deps.db), new Set(), ruOpts), () => {});
      expect(res).toEqual({ ok: false, busy: false, message: 'offline', emptied: [] });
      expect(seen).toEqual(['alpha', 'beta', 'gamma']);
      const rows = await listWords(deps.db);
      expect(rows.map((w) => w.dict.checked)).toEqual(['', '', '', '', '']);
    });

    test('a lookup that succeeds resets the count of throwing lookups', async () => {
      const deps = await setup(new FakeLlm({ phonetics: [phon()] }));
      await readyWords(deps, 'alpha', 'beta', 'gamma', 'delta', 'epsilon');
      deps.net = netOf({ alpha: new Error('offline'), beta: new Error('offline'), gamma: entry('гамма'), delta: new Error('offline') });
      const res = await runFill(deps, planFill(await listWords(deps.db), new Set(), ruOpts), () => {});
      expect(res).toEqual({ ok: false, busy: false, message: 'offline', emptied: [] });
      const rows = await listWords(deps.db);
      expect(rows.map((w) => w.dict.checked)).toEqual(['', '', 'found', '', 'none']);
    });

    test('a word renamed between its lookup and the write keeps an empty dict', async () => {
      const deps = await setup(new FakeLlm({ phonetics: [phon()] }));
      const [a] = await readyWords(deps, 'alpha');
      deps.net = {
        getText: async () => {
          await deps.db.execute('UPDATE word SET word = ? WHERE id = ?', ['omega', a]);
          return { status: 200, text: entry('альфа') };
        },
      };
      const res = await runFill(deps, planFill(await listWords(deps.db), new Set(), ruOpts), () => {});
      expect(res).toEqual({ ok: true, emptied: [] });
      const row = (await listWords(deps.db)).find((w) => w.id === a)!;
      expect(row.word).toBe('omega');
      expect(row.dict).toEqual({ translations: [], checked: '' });
    });

    test('en: no lookups and dict stays empty', async () => {
      const deps = await setup(new FakeLlm({ phonetics: [phon()] }));
      await readyWords(deps, 'alpha');
      const seen: string[] = [];
      deps.net = netOf({}, seen);
      const plan = planFill(await listWords(deps.db), new Set(), { lang: 'en', net: true });
      expect(plan.dict).toEqual([]);
      expect(await runFill(deps, plan, () => {})).toEqual({ ok: true, emptied: [] });
      expect(seen).toEqual([]);
    });

    test('no net: no lookups', async () => {
      const deps = await setup(new FakeLlm({ phonetics: [phon()] }));
      await readyWords(deps, 'alpha');
      const plan = planFill(await listWords(deps.db), new Set(), { lang: 'ru', net: false });
      expect(plan.dict).toEqual([]);
      expect(await runFill(deps, plan, () => {})).toEqual({ ok: true, emptied: [] });
    });
  });
});
