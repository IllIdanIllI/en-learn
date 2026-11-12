import type { Deps, LlmErrorCode } from '@/core/ports';
import type { Word } from './types';
import type { WordsReply } from '@/core/llm/types';
import { callStructured } from '@/core/llm/call';
import { listWords, replaceExercises, setGeneration, updateWord } from '@/core/db/repos/words';
import { withJobLock } from '@/core/session/jobLock';
import { BATCH_SIZE } from './constants';
import { checkWordsReply, exercisesFrom, withoutRevealing, wordProblems } from './generated';

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
        `Transcription: ${or(w.transcription)}`,
        `Part of speech: ${or(w.partOfSpeech)}`,
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
  const present = new Set((await listWords(deps.db)).map((x) => x.id));
  for (const w of words) {
    if (!present.has(w.id)) continue;
    const g = res.data.words.find((x) => x.word.trim().toLowerCase() === w.word.trim().toLowerCase())!;
    if (wordProblems(g, w.word).length > 0) {
      await setGeneration(deps.db, w.id, 'failed');
      failed++;
      continue;
    }
    const kept = withoutRevealing(g, w.word);
    if (kept.gaps.length === 0) {
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
      transcription: w.transcription.trim() === '' ? g.transcription : w.transcription,
      partOfSpeech: w.partOfSpeech.trim() === '' ? g.partOfSpeech : w.partOfSpeech,
    });
    await replaceExercises(deps.db, w.id, exercisesFrom(kept));
    await setGeneration(deps.db, w.id, 'ready');
  }
  return { failed };
}

/**
 * Writes transcription and part of speech of ready words whose stored value is empty. Exercises, generation and the
 * word's other fields are left as they are; a failed call or a bad reply changes nothing.
 */
async function runPhoneticsBatch(deps: Deps, ids: number[]): Promise<BatchOutcome> {
  const all = await listWords(deps.db);
  const words = ids.map((id) => all.find((w) => w.id === id)).filter((w): w is Word => w !== undefined);
  if (words.length === 0) return { failed: 0 };
  const names = words.map((w) => w.word);
  const res = await callStructured<WordsReply>(deps, 'words', userPrompt(words), { check: (r) => checkWordsReply(r, names) });
  if (!res.ok) return { error: { ok: false, message: res.message, code: res.code } };
  // Read after the call: the learner may have edited a word meanwhile, so only the two fields are written.
  const fresh = new Map((await listWords(deps.db)).map((x) => [x.id, x]));
  for (const sent of words) {
    const w = fresh.get(sent.id);
    const g = res.data.words.find((x) => x.word.trim().toLowerCase() === sent.word.trim().toLowerCase());
    if (w === undefined || g === undefined) continue;
    const transcription = w.transcription.trim() === '' ? g.transcription.trim() : w.transcription;
    const partOfSpeech = w.partOfSpeech.trim() === '' ? g.partOfSpeech.trim() : w.partOfSpeech;
    if (transcription === w.transcription && partOfSpeech === w.partOfSpeech) continue;
    await updateWord(deps.db, w.id, {
      word: w.word,
      definition: w.definition,
      translation: w.translation,
      example: w.example,
      synonyms: w.synonyms,
      link: w.link,
      added: w.added,
      transcription,
      partOfSpeech,
    });
  }
  return { failed: 0 };
}

/** Runs `batch` over wordIds in batches of BATCH_SIZE, each under its own job lock; a busy lock stops the run and leaves the rest as they are; a failed batch call is kept as the result and the run goes on. */
async function inBatches(
  deps: Deps,
  wordIds: number[],
  onProgress: ((done: number, total: number) => void) | undefined,
  batch: (ids: number[]) => Promise<BatchOutcome>,
): Promise<GenerateResult> {
  const busy: BatchOutcome = { error: { ok: false, message: 'Another job is running', code: 'busy' } };
  let failed = 0;
  let done = 0;
  let lastError: Extract<GenerateResult, { ok: false }> | null = null;
  for (let i = 0; i < wordIds.length; i += BATCH_SIZE) {
    const ids = wordIds.slice(i, i + BATCH_SIZE);
    const out = await withJobLock(deps.db, () => batch(ids), busy);
    if ('error' in out) {
      if (out.error.code === 'busy') return out.error;
      lastError = out.error;
      done += ids.length;
      onProgress?.(done, wordIds.length);
      continue;
    }
    failed += out.failed;
    done += ids.length;
    onProgress?.(done, wordIds.length);
  }
  return lastError ?? { ok: true, failed };
}

/** Generates exercises in batches of BATCH_SIZE, each under its own job lock; a busy lock stops the run and leaves the rest pending; a failed batch call marks its words failed and the run goes on. */
export function generateWords(deps: Deps, wordIds: number[], onProgress?: (done: number, total: number) => void): Promise<GenerateResult> {
  return inBatches(deps, wordIds, onProgress, (ids) => runBatch(deps, ids));
}

/** Fills empty transcription and part of speech of ready words (start-up run); see runPhoneticsBatch. */
export function generatePhonetics(deps: Deps, wordIds: number[], onProgress?: (done: number, total: number) => void): Promise<GenerateResult> {
  return inBatches(deps, wordIds, onProgress, (ids) => runPhoneticsBatch(deps, ids));
}
