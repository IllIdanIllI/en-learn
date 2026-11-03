import { describe, expect, test } from 'vitest';
import { createTestDb } from '@/adapters/test/sqliteDb';
import { latestWritingSource } from '@/core/db/repos/writing';
import type { Db } from '@/core/ports';

/** A session on `date` with one writing block whose text has `words` words. Returns the block id. */
async function addText(db: Db, date: string, status: string, words: number): Promise<number> {
  const { lastInsertId: sid } = await db.execute(
    'INSERT INTO session (date, title, status, created_at) VALUES (?, ?, ?, ?)',
    [date, 'Writing', status, `${date}T10:00:00Z`],
  );
  const { lastInsertId: bid } = await db.execute(
    "INSERT INTO block (session_id, ord, kind, format, title, instruction, minutes) VALUES (?, 1, 'writing', 'essay', 'Essay', 'Write.', 20)",
    [sid],
  );
  await db.execute(
    'INSERT INTO writing_text (block_id, text, words, created_at) VALUES (?, ?, ?, ?)',
    [bid, `text of ${words} words`, words, `${date}T10:30:00Z`],
  );
  return bid;
}

describe('latestWritingSource', () => {
  test('null when no graded text exists', async () => {
    const db = await createTestDb();
    expect(await latestWritingSource(db, '2026-10-21')).toBeNull();
  });

  test('skips ungraded sessions, texts on or after the date, and texts under 50 words', async () => {
    const db = await createTestDb();
    const older = await addText(db, '2026-10-10', 'graded', 60);
    await addText(db, '2026-10-12', 'generated', 80);
    await addText(db, '2026-10-15', 'graded', 30);
    const newest = await addText(db, '2026-10-20', 'graded', 55);
    await addText(db, '2026-10-21', 'graded', 90);

    expect(await latestWritingSource(db, '2026-10-21')).toEqual({ blockId: newest, text: 'text of 55 words' });
    expect(await latestWritingSource(db, '2026-10-20')).toEqual({ blockId: older, text: 'text of 60 words' });
    expect(await latestWritingSource(db, '2026-10-10')).toBeNull();
  });

  test('a text of exactly 50 words is usable', async () => {
    const db = await createTestDb();
    const bid = await addText(db, '2026-10-20', 'graded', 50);
    expect(await latestWritingSource(db, '2026-10-21')).toEqual({ blockId: bid, text: 'text of 50 words' });
  });
});
