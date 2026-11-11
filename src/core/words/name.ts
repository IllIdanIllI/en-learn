import type { Db } from '@/core/ports';
import { DuplicateWord, listWords, updateWord } from '@/core/db/repos/words';

const TRAILING_TAIL = /\s*\([^)]*\)\s*$/;

/** Drops one bracketed part at the end of a word ("incentive (for)" → "incentive"), then trims. */
export function cleanWordName(s: string): string {
  return s.replace(TRAILING_TAIL, '').trim();
}

/**
 * Renames saved words that end with a bracketed part. A word whose cleaned name is empty, or that clashes with
 * another word (including one renamed earlier in this run), is left as it is. Returns the ids of the renamed words.
 */
export async function fixSavedWordNames(db: Db): Promise<number[]> {
  const words = await listWords(db);
  const taken = new Set(words.map((w) => w.word.trim().toLowerCase()));
  const renamed: number[] = [];
  for (const w of words) {
    const name = cleanWordName(w.word);
    if (name === w.word || name === '' || taken.has(name.toLowerCase())) continue;
    try {
      await updateWord(db, w.id, {
        word: name,
        definition: w.definition,
        translation: w.translation,
        example: w.example,
        synonyms: w.synonyms,
        link: w.link,
        added: w.added,
      });
    } catch (e) {
      if (e instanceof DuplicateWord) continue;
      throw e;
    }
    taken.add(name.toLowerCase());
    renamed.push(w.id);
  }
  return renamed;
}
