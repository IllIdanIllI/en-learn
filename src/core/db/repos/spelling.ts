import type { Db } from '@/core/ports';

export interface SpellingWord { id: number; word: string; hint: string | null }

export async function listSpellingWords(db: Db): Promise<SpellingWord[]> {
  return db.select<SpellingWord>('SELECT id, word, hint FROM spelling_word ORDER BY id');
}
