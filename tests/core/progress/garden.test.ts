import { describe, expect, test } from 'vitest';
import { createTestDb } from '@/adapters/test/sqliteDb';
import type { Db } from '@/core/ports';
import { loadGardenState } from '@/core/progress/garden';
import { setSetting } from '@/core/db/repos/settings';

async function seedGradedSession(db: Db, date: string, correct: number, status = 'graded') {
  await db.execute(
    'INSERT INTO session (date, title, is_light, status, created_at) VALUES (?,?,0,?,?)',
    [date, 'S', status, 'x'],
  );
  const sid = (await db.select<{ id: number }>('SELECT id FROM session WHERE date = ?', [date]))[0]!.id;
  await db.execute(
    "INSERT INTO block (session_id, ord, kind, format, title, instruction, minutes) VALUES (?,1,'task','gap','B','i',5)",
    [sid],
  );
  const bid = (await db.select<{ id: number }>('SELECT id FROM block WHERE session_id = ?', [sid]))[0]!.id;
  for (let i = 1; i <= correct; i++) {
    await db.execute(
      "INSERT INTO item (block_id, ord, prompt, expected, is_check, status) VALUES (?,?,'p','e',0,'active')",
      [bid, i],
    );
    await db.execute("INSERT INTO answer (item_id, text, verdict, is_inattention) VALUES ((SELECT MAX(id) FROM item),'a','correct',0)");
  }
  return sid;
}

describe('loadGardenState', () => {
  test('empty db has no fireflies and no closed lesson', async () => {
    const db = await createTestDb();
    expect(await loadGardenState(db, '2026-10-21')).toEqual({ fireflies: 0, todayClosed: false });
  });

  test("yesterday's correct answers become fireflies", async () => {
    const db = await createTestDb();
    await seedGradedSession(db, '2026-10-20', 1);
    expect(await loadGardenState(db, '2026-10-21')).toEqual({ fireflies: 1, todayClosed: false });
  });

  test('no fireflies when the graded session is not yesterday', async () => {
    const db = await createTestDb();
    await seedGradedSession(db, '2026-10-20', 1);
    expect(await loadGardenState(db, '2026-10-22')).toEqual({ fireflies: 0, todayClosed: false });
  });

  test('fireflies are capped at 12', async () => {
    const db = await createTestDb();
    await seedGradedSession(db, '2026-10-20', 15);
    expect((await loadGardenState(db, '2026-10-21')).fireflies).toBe(12);
  });

  test("today's lesson is closed when its graded session id is in closedSessions", async () => {
    const db = await createTestDb();
    const sid = await seedGradedSession(db, '2026-10-21', 0);
    await setSetting(db, 'closedSessions', [sid]);
    expect(await loadGardenState(db, '2026-10-21')).toEqual({ fireflies: 0, todayClosed: true });
  });

  test("today's lesson is open when its id is not in closedSessions", async () => {
    const db = await createTestDb();
    const sid = await seedGradedSession(db, '2026-10-21', 0);
    await setSetting(db, 'closedSessions', [sid + 1]);
    expect(await loadGardenState(db, '2026-10-21')).toEqual({ fireflies: 0, todayClosed: false });
  });

  test('an ungraded session of today is not closed even if listed', async () => {
    const db = await createTestDb();
    const sid = await seedGradedSession(db, '2026-10-21', 0, 'generated');
    await setSetting(db, 'closedSessions', [sid]);
    expect((await loadGardenState(db, '2026-10-21')).todayClosed).toBe(false);
  });
});
