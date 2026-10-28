import type { Db } from '@/core/ports';
import { listSpellingMnemonics } from '@/core/db/repos/spelling';
import { errorBank } from './derive';
import { snippetText, type Snippet } from './errorContext';
import { loadGradedFacts } from './history';

export type WaitTip = { kind: 'error'; was: Snippet; should: Snippet } | { kind: 'spelling'; word: string; mnemonic: string };

/** Up to `limit` random tips to read while waiting: error-bank answers with a fix, and spelling words with a mnemonic. */
export async function waitTips(db: Db, limit = 10): Promise<WaitTip[]> {
  const bank = errorBank((await loadGradedFacts(db)).errorRows)
    .map((r) => ({ kind: 'error' as const, was: r.was, should: r.shouldBe }))
    .filter((r) => {
      const was = snippetText(r.was).trim();
      const should = snippetText(r.should).trim();
      return was !== '' && should !== '' && was !== should;
    });
  const words = (await listSpellingMnemonics(db)).map((w) => ({ kind: 'spelling' as const, word: w.word, mnemonic: w.mnemonic }));
  const all: WaitTip[] = [...bank, ...words];
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j]!, all[i]!];
  }
  return all.slice(0, limit);
}
