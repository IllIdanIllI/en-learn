import { describe, expect, test } from 'vitest';
import { splitStatements, runMigrations } from '@/core/db/migrate';
import { createTestDb } from '@/adapters/test/sqliteDb';
import type { Db } from '@/core/ports';

describe('splitStatements', () => {
  test('splits 3 statements and ignores comment lines', () => {
    const sql = `-- first
CREATE TABLE a (x INTEGER);
-- second comment
CREATE TABLE b (
  y INTEGER
);

INSERT INTO a (x) VALUES (1);
`;
    const out = splitStatements(sql);
    expect(out).toHaveLength(3);
    expect(out[0]).toBe('CREATE TABLE a (x INTEGER)');
    expect(out.join('\n')).not.toContain('--');
  });
});

function counting(db: Db): { db: Db; executed: string[] } {
  const executed: string[] = [];
  return {
    executed,
    db: {
      select: (sql, params) => db.select(sql, params),
      execute: (sql, params) => {
        executed.push(sql);
        return db.execute(sql, params);
      },
    },
  };
}

describe('runMigrations', () => {
  test('fresh db returns 1; second run returns 1 and executes nothing new', async () => {
    const raw = await createTestDb(); // already migrated once
    const rows = await raw.select<{ schema_version: number }>('SELECT schema_version FROM meta');
    expect(rows).toEqual([{ schema_version: 1 }]);
    const c = counting(raw);
    const list = [{ version: 1, sql: 'CREATE TABLE zzz (x INTEGER);' }];
    expect(await runMigrations(c.db, list)).toBe(1);
    expect(c.executed.some((s) => s.includes('zzz'))).toBe(false);
    expect(await raw.select('SELECT * FROM meta')).toHaveLength(1);
  });

  test('applies only newer migrations, in order', async () => {
    const db = await createTestDb();
    const v = await runMigrations(db, [
      { version: 1, sql: 'CREATE TABLE ignored (x INTEGER);' },
      { version: 2, sql: 'CREATE TABLE t2 (x INTEGER);' },
    ]);
    expect(v).toBe(2);
    expect(await db.select('SELECT * FROM t2')).toEqual([]);
    expect(await db.select('SELECT * FROM meta')).toEqual([{ schema_version: 2 }]);
  });
});

describe('schema', () => {
  test('session.date is unique', async () => {
    const db = await createTestDb();
    const ins = "INSERT INTO session (date, title, is_light, status, created_at) VALUES ('2026-10-22','T',0,'draft','2026-10-22T08:00:00Z')";
    await db.execute(ins);
    await expect(db.execute(ins)).rejects.toThrow();
  });

  test('deleting a session cascades to blocks and items', async () => {
    const db = await createTestDb();
    const s = await db.execute(
      "INSERT INTO session (date, title, is_light, status, created_at) VALUES ('2026-10-22','T',0,'draft','x')",
    );
    const b = await db.execute(
      "INSERT INTO block (session_id, ord, kind, format, title, instruction, minutes) VALUES (?,1,'task','gap','B','do it',10)",
      [s.lastInsertId],
    );
    await db.execute("INSERT INTO item (block_id, ord, prompt, expected, is_check, status) VALUES (?,1,'p','e',false,'active')", [
      b.lastInsertId,
    ]);
    await db.execute('DELETE FROM session WHERE id = ?', [s.lastInsertId]);
    expect(await db.select('SELECT * FROM block')).toEqual([]);
    expect(await db.select('SELECT * FROM item')).toEqual([]);
  });
});
