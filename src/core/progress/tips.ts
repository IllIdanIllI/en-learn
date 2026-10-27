import type { Db } from '@/core/ports';
import { listSpellingMnemonics } from '@/core/db/repos/spelling';
import { errorBank } from './derive';
import { loadGradedFacts } from './history';

export type WaitTip = { was: string; should: string };

/** Up to `limit` random tips to read while waiting: error-bank answers with a fix, and spelling words with a mnemonic. */
export async function waitTips(db: Db, limit = 10): Promise<WaitTip[]> {
  const bank = errorBank((await loadGradedFacts(db)).errorRows)
    .filter((r) => r.was.trim() !== '' && r.shouldBe.trim() !== '')
    .map((r) => ({ was: r.was, should: r.shouldBe }));
  const words = (await listSpellingMnemonics(db)).map((w) => ({ was: w.word, should: w.mnemonic }));
  const all = [...bank, ...words];
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j]!, all[i]!];
  }
  return all.slice(0, limit);
}
