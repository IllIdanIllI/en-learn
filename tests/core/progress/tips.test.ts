import { describe, expect, test } from 'vitest';
import { createTestDb } from '@/adapters/test/sqliteDb';
import { findOrCreateSpellingWord } from '@/core/db/repos/spelling';
import { waitTips } from '@/core/progress/tips';

describe('waitTips', () => {
  test('is empty for an empty database', async () => {
    const db = await createTestDb();
    expect(await waitTips(db)).toEqual([]);
  });

  test('returns at most limit tips', async () => {
    const db = await createTestDb();
    for (let i = 0; i < 12; i++) {
      const id = await findOrCreateSpellingWord(db, `word${i}`, 'hint', '2026-10-01');
      await db.execute('UPDATE spelling_word SET mnemonic = ? WHERE id = ?', [`mnemonic ${i}`, id]);
    }
    const tips = await waitTips(db);
    expect(tips).toHaveLength(10);
    expect(tips.every((t) => t.was.startsWith('word') && t.should.startsWith('mnemonic'))).toBe(true);
    expect(await waitTips(db, 3)).toHaveLength(3);
  });

  test('skips spelling words without a mnemonic', async () => {
    const db = await createTestDb();
    await findOrCreateSpellingWord(db, 'receive', 'hint', '2026-10-01');
    expect(await waitTips(db)).toEqual([]);
  });
});
