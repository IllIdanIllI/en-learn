import { describe, expect, test } from 'vitest';
import { createTestDb } from '@/adapters/test/sqliteDb';
import {
  deleteDraftAnswers, draftsToAnswers, itemDraftKey, loadDraftAnswers, saveDraftAnswer, spotDraftKey,
} from '@/core/db/repos/drafts';
import { insertDraftSession } from '@/core/db/repos/sessions';
import type { Db } from '@/core/ports';

async function twoSessions(db: Db) {
  const a = await insertDraftSession(db, { date: '2026-10-20', title: 'a', isLight: false, createdAt: 'x' });
  const b = await insertDraftSession(db, { date: '2026-10-21', title: 'b', isLight: false, createdAt: 'x' });
  return { a, b };
}

describe('draft answers', () => {
  test('keys follow the stored format', () => {
    expect(itemDraftKey(7)).toBe('i:7');
    expect(spotDraftKey(3, 1)).toBe('p:3:1');
  });

  test('save then load returns the text per key; saving again overwrites', async () => {
    const db = await createTestDb();
    const { a, b } = await twoSessions(db);
    await saveDraftAnswer(db, a, 'i:1', 'an');
    await saveDraftAnswer(db, a, 'p:2:0', 'a apple → an apple');
    await saveDraftAnswer(db, b, 'i:1', 'other session');
    await saveDraftAnswer(db, a, 'i:1', 'a');
    expect([...(await loadDraftAnswers(db, a))]).toEqual([['i:1', 'a'], ['p:2:0', 'a apple → an apple']]);
    expect([...(await loadDraftAnswers(db, b))]).toEqual([['i:1', 'other session']]);
  });

  test('stored drafts come back in the shape of a submission', async () => {
    const db = await createTestDb();
    const { a } = await twoSessions(db);
    await saveDraftAnswer(db, a, itemDraftKey(4), 'an');
    await saveDraftAnswer(db, a, spotDraftKey(3, 1), 'a apple → an apple\na hour → an hour');
    expect(draftsToAnswers(await loadDraftAnswers(db, a))).toEqual({
      items: { 4: 'an' },
      spot: { '3:1': 'a apple → an apple\na hour → an hour' },
    });
  });

  test('an empty text removes the draft', async () => {
    const db = await createTestDb();
    const { a } = await twoSessions(db);
    await saveDraftAnswer(db, a, 'i:1', 'an');
    await saveDraftAnswer(db, a, 'i:1', '');
    expect((await loadDraftAnswers(db, a)).size).toBe(0);
  });

  test('deleteDraftAnswers clears one session only; deleting the session cascades', async () => {
    const db = await createTestDb();
    const { a, b } = await twoSessions(db);
    await saveDraftAnswer(db, a, 'i:1', 'x');
    await saveDraftAnswer(db, b, 'i:1', 'y');
    await deleteDraftAnswers(db, a);
    expect((await loadDraftAnswers(db, a)).size).toBe(0);
    expect((await loadDraftAnswers(db, b)).size).toBe(1);
    await db.execute('DELETE FROM session WHERE id = ?', [b]);
    expect((await db.select('SELECT 1 FROM draft_answer')).length).toBe(0);
  });
});
