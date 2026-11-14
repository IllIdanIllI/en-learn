import type { Deps } from '@/core/ports';
import type { Lang } from '@/core/i18n';
import { listWords, setDict } from '@/core/db/repos/words';
import type { Word } from './types';
import { wordsMissingPhonetics } from './phonetics';
import { generatePhonetics } from './generate';
import { lookupDict } from './dictionary';
import { PHONETICS_BATCH } from './constants';

/** What a Words page visit fills: `phonetics` are ready words with an empty transcription; `dict` are ready words the dictionary has not checked. */
export interface FillPlan { phonetics: number[]; dict: number[] }

export type FillResult =
  | { ok: true; emptied: number[] }
  | { ok: false; busy: true }
  | { ok: false; busy: false; message: string; emptied: number[] };

/** `lang` and `net` drive the dictionary step: it runs for Russian only, and only where the app has a network adapter. */
export interface FillOptions { lang?: Lang; net?: boolean }

/** Words the fill has to visit, minus the skipped ones for the transcription step. */
export function planFill(words: Word[], skip: ReadonlySet<number>, opts: FillOptions = {}): FillPlan {
  const dict = opts.lang === 'ru' && opts.net === true
    ? words.filter((w) => w.generation === 'ready' && w.dict.checked === '' && w.word.trim() !== '').map((w) => w.id)
    : [];
  return { phonetics: wordsMissingPhonetics(words).filter((id) => !skip.has(id)), dict };
}

/**
 * Runs the plan: the transcription step one batch at a time, each under the job lock, then the dictionary step without it.
 * `onProgress` gets 0 first, then the count after each batch or word, over both steps. A busy lock (or a yes from `yieldTo`,
 * asked before each batch) skips the rest of the transcription step; the dictionary step still runs, since it does not
 * need the lock. `emptied` holds the words of the batches whose call succeeded and that still have no transcription; the
 * words of a failed batch are not in it, so a later run tries them again. A dictionary lookup that throws leaves its word
 * unchecked, and the run carries on; its message wins over the others.
 */
export async function runFill(
  deps: Deps,
  plan: FillPlan,
  onProgress: (done: number, total: number) => void,
  yieldTo?: () => boolean,
): Promise<FillResult> {
  const total = plan.phonetics.length + plan.dict.length;
  const emptied: number[] = [];
  let message: string | null = null;
  let busy = false;
  let done = 0;
  onProgress(0, total);
  for (let i = 0; i < plan.phonetics.length; i += PHONETICS_BATCH) {
    if (yieldTo?.()) {
      busy = true;
      break;
    }
    const ids = plan.phonetics.slice(i, i + PHONETICS_BATCH);
    const res = await generatePhonetics(deps, ids);
    if (!res.ok && res.code === 'busy') {
      busy = true;
      break;
    }
    if (res.ok) {
      const rows = new Map((await listWords(deps.db)).map((w) => [w.id, w]));
      for (const id of ids) if (rows.get(id)?.transcription.trim() === '') emptied.push(id);
    } else {
      message = res.message;
    }
    done += ids.length;
    onProgress(done, total);
  }
  const dictError = await runDictStep(deps, plan.dict, (n) => onProgress(plan.phonetics.length + n, total));
  if (dictError !== null) return { ok: false, busy: false, message: dictError, emptied };
  if (busy) return { ok: false, busy: true };
  return message === null ? { ok: true, emptied } : { ok: false, busy: false, message, emptied };
}

/** Looks up each word and stores the result; a throwing lookup leaves its word unchecked. Returns the last such message. */
async function runDictStep(deps: Deps, ids: number[], onWord: (done: number) => void): Promise<string | null> {
  if (ids.length === 0 || deps.net === undefined) return null;
  const net = deps.net;
  const rows = new Map((await listWords(deps.db)).map((w) => [w.id, w]));
  let error: string | null = null;
  let done = 0;
  for (const id of ids) {
    const word = rows.get(id);
    if (word !== undefined) {
      try {
        const res = await lookupDict(net, word.word);
        await setDict(deps.db, id, res.translations, res.checked);
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
    }
    done += 1;
    onWord(done);
  }
  return error;
}
