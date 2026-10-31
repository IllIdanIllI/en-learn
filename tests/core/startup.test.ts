import { describe, expect, test } from 'vitest';
import { createTestDb } from '@/adapters/test/sqliteDb';
import { startApp } from '@/core/startup';
import { insertDraftSession } from '@/core/db/repos/sessions';

describe('startApp', () => {
  test('removes leftover draft sessions', async () => {
    const db = await createTestDb();
    await insertDraftSession(db, { date: '2026-10-21', title: 'draft', isLight: false, createdAt: 'x' });
    await insertDraftSession(db, { date: '2026-10-22', title: 'other', isLight: false, createdAt: 'x' });
    await db.execute("UPDATE session SET status = 'generated' WHERE title = 'other'");

    await startApp({ db });

    const rows = await db.select<{ title: string }>('SELECT title FROM session');
    expect(rows.map((r) => r.title)).toEqual(['other']);
  });
});
