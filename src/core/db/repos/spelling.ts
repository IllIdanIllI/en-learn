import type { Db } from '@/core/ports';

export interface SpellingWord { id: number; word: string; hint: string | null }

/** The spelling words that any block of the session asks. */
export async function listSessionSpellingWordIds(db: Db, sessionId: number): Promise<Set<number>> {
  const rows = await db.select<{ id: number }>(
    'SELECT DISTINCT i.spelling_word_id AS id FROM item i JOIN block b ON b.id = i.block_id WHERE b.session_id = ? AND i.spelling_word_id IS NOT NULL',
    [sessionId],
  );
  return new Set(rows.map((r) => r.id));
}

export async function listSpellingWords(db: Db): Promise<SpellingWord[]> {
  return db.select<SpellingWord>('SELECT id, word, hint FROM spelling_word ORDER BY id');
}

/** Id of the word (matched case-insensitively), inserting it with the hint when it is new. */
export async function findOrCreateSpellingWord(db: Db, word: string, hint: string, createdAt: string): Promise<number> {
  const find = () => db.select<{ id: number }>('SELECT id FROM spelling_word WHERE lower(word) = lower(?)', [word]);
  const existing = (await find())[0];
  if (existing) return existing.id;
  await db.execute('INSERT INTO spelling_word (word, hint, created_at) VALUES (?, ?, ?) ON CONFLICT(word) DO NOTHING', [word, hint, createdAt]);
  return (await find())[0]!.id;
}

/** Words with a learner's mnemonic. */
export async function listSpellingMnemonics(db: Db): Promise<{ word: string; mnemonic: string }[]> {
  return db.select<{ word: string; mnemonic: string }>(
    "SELECT word, mnemonic FROM spelling_word WHERE mnemonic IS NOT NULL AND trim(mnemonic) <> '' ORDER BY id",
  );
}
