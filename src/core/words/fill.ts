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
  | { ok: false; busy: true; emptied: number[] }
  | { ok: false; busy: false; message: string; emptied: number[] };

/** Consecutive throwing lookups that stop the dictionary step (offline, or the service is down). */
const DICT_FAILURES_TO_STOP = 3;

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
 * unchecked, and the run carries on; three in a row stop the step, and the message of the last one is reported (it wins over
 * the others). A yes from `yieldTo` also stops the dictionary step, quietly: the words it did not reach stay unchecked.
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
  const dict = await runDictStep(deps, plan.dict, (n) => onProgress(plan.phonetics.length + n, total), yieldTo);
  if (dict.error !== null) return { ok: false, busy: false, message: dict.error, emptied };
  if (busy || dict.yielded) return { ok: false, busy: true, emptied };
  return message === null ? { ok: true, emptied } : { ok: false, busy: false, message, emptied };
}

/**
 * Looks up each word and stores the result, unless the word was renamed meanwhile (`setDict` checks the spelling looked up).
 * A throwing lookup leaves its word unchecked. `yielded` is set when `yieldTo` asked the step to stop before a word.
 */
async function runDictStep(
  deps: Deps,
  ids: number[],
  onWord: (done: number) => void,
  yieldTo?: () => boolean,
): Promise<{ error: string | null; yielded: boolean }> {
  if (ids.length === 0 || deps.net === undefined) return { error: null, yielded: false };
  const net = deps.net;
  const rows = new Map((await listWords(deps.db)).map((w) => [w.id, w]));
  let error: string | null = null;
  let failures = 0;
  let done = 0;
  for (const id of ids) {
    if (yieldTo?.()) return { error, yielded: true };
    const word = rows.get(id);
    if (word !== undefined) {
      try {
        const res = await lookupDict(net, word.word);
        await setDict(deps.db, id, res.translations, res.checked, word.word);
        failures = 0;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        failures += 1;
        if (failures === DICT_FAILURES_TO_STOP) return { error, yielded: false };
      }
    }
    done += 1;
    onWord(done);
  }
  return { error, yielded: false };
}
