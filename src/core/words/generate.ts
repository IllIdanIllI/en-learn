import type { Deps, LlmErrorCode } from '@/core/ports';
import type { Word } from './types';
import type { WordsReply } from '@/core/llm/types';
import { callStructured } from '@/core/llm/call';
import { listWords, replaceExercises, setGeneration, updateWord } from '@/core/db/repos/words';
import { withJobLock } from '@/core/session/jobLock';
import { BATCH_SIZE } from './constants';
import { checkWordsReply, exercisesFrom, wordProblems } from './generated';

export type GenerateResult = { ok: true; failed: number } | { ok: false; message: string; code?: 'busy' | LlmErrorCode };

const or = (s: string) => (s.trim() === '' ? '(missing)' : s);

function userPrompt(words: Word[]): string {
  return words
    .map((w) =>
      [
        `### ${w.word}`,
        `Definition: ${or(w.definition)}`,
        `Translation: ${or(w.translation)}`,
        `Example: ${or(w.example)}`,
        `Synonyms: ${w.synonyms.length === 0 ? '(missing)' : w.synonyms.join(', ')}`,
      ].join('\n'),
    )
    .join('\n\n');
}

type BatchOutcome = { failed: number } | { error: Extract<GenerateResult, { ok: false }> };

async function runBatch(deps: Deps, ids: number[]): Promise<BatchOutcome> {
  const all = await listWords(deps.db);
  const words = ids.map((id) => all.find((w) => w.id === id)).filter((w): w is Word => w !== undefined);
  if (words.length === 0) return { failed: 0 };
  for (const w of words) await setGeneration(deps.db, w.id, 'pending');
  const names = words.map((w) => w.word);
  const res = await callStructured<WordsReply>(deps, 'words', userPrompt(words), { check: (r) => checkWordsReply(r, names) });
  if (!res.ok) {
    for (const w of words) await setGeneration(deps.db, w.id, 'failed');
    return { error: { ok: false, message: res.message, code: res.code } };
  }
  let failed = 0;
  for (const w of words) {
    const g = res.data.words.find((x) => x.word.trim().toLowerCase() === w.word.trim().toLowerCase())!;
    if (wordProblems(g, w.word).length > 0) {
      await setGeneration(deps.db, w.id, 'failed');
      failed++;
      continue;
    }
    await updateWord(deps.db, w.id, {
      word: w.word,
      definition: w.definition.trim() === '' ? g.definition : w.definition,
      translation: w.translation.trim() === '' ? g.translation : w.translation,
      example: w.example.trim() === '' ? g.example : w.example,
      synonyms: w.synonyms.length === 0 ? g.synonyms : w.synonyms,
      link: w.link,
      added: w.added,
    });
    await replaceExercises(deps.db, w.id, exercisesFrom(g));
    await setGeneration(deps.db, w.id, 'ready');
  }
  return { failed };
}

/** Generates exercises in batches of BATCH_SIZE, each under its own job lock; a busy lock stops the run and leaves the rest pending. */
export async function generateWords(deps: Deps, wordIds: number[], onProgress?: (done: number, total: number) => void): Promise<GenerateResult> {
  const busy: BatchOutcome = { error: { ok: false, message: 'Another job is running', code: 'busy' } };
  let failed = 0;
  let done = 0;
  for (let i = 0; i < wordIds.length; i += BATCH_SIZE) {
    const ids = wordIds.slice(i, i + BATCH_SIZE);
    const out = await withJobLock(deps.db, () => runBatch(deps, ids), busy);
    if ('error' in out) return out.error;
    failed += out.failed;
    done += ids.length;
    onProgress?.(done, wordIds.length);
  }
  return { ok: true, failed };
}
