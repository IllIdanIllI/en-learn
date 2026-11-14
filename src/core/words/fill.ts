import type { Deps } from '@/core/ports';
import type { Lang } from '@/core/i18n';
import { listWords } from '@/core/db/repos/words';
import type { Word } from './types';
import { wordsMissingPhonetics } from './phonetics';
import { generatePhonetics } from './generate';
import { PHONETICS_BATCH } from './constants';

/** What a Words page visit fills: `phonetics` are ready words with an empty transcription; `dict` stays empty until the dictionary step. */
export interface FillPlan { phonetics: number[]; dict: number[] }

export type FillResult =
  | { ok: true; emptied: number[] }
  | { ok: false; busy: true }
  | { ok: false; busy: false; message: string; emptied: number[] };

/** `lang` and `net` are for the dictionary step; the transcription step ignores them. */
export interface FillOptions { lang?: Lang; net?: boolean }

/** Words the fill has to visit: ready words without a transcription, minus the skipped ones. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- opts is read by the dictionary step (the next task); the transcription step ignores it.
export function planFill(words: Word[], skip: ReadonlySet<number>, _opts?: FillOptions): FillPlan {
  return { phonetics: wordsMissingPhonetics(words).filter((id) => !skip.has(id)), dict: [] };
}

/**
 * Runs the plan one phonetics batch at a time, each under the job lock. `onProgress` gets 0 first, then the count after each
 * batch. A busy lock stops the run before anything is written. `emptied` holds the words of the batches whose call succeeded
 * and that still have no transcription; the words of a failed batch are not in it, so a later run tries them again.
 * `yieldTo` is asked before each batch; a yes ends the run there as busy, so a generation waits for one batch at most.
 */
export async function runFill(
  deps: Deps,
  plan: FillPlan,
  onProgress: (done: number, total: number) => void,
  yieldTo?: () => boolean,
): Promise<FillResult> {
  const total = plan.phonetics.length;
  const emptied: number[] = [];
  let message: string | null = null;
  let done = 0;
  onProgress(0, total);
  for (let i = 0; i < total; i += PHONETICS_BATCH) {
    if (yieldTo?.()) return { ok: false, busy: true };
    const ids = plan.phonetics.slice(i, i + PHONETICS_BATCH);
    const res = await generatePhonetics(deps, ids);
    if (!res.ok && res.code === 'busy') return { ok: false, busy: true };
    if (res.ok) {
      const rows = new Map((await listWords(deps.db)).map((w) => [w.id, w]));
      for (const id of ids) if (rows.get(id)?.transcription.trim() === '') emptied.push(id);
    } else {
      message = res.message;
    }
    done += ids.length;
    onProgress(done, total);
  }
  return message === null ? { ok: true, emptied } : { ok: false, busy: false, message, emptied };
}
