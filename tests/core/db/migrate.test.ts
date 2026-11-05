import { describe, expect, test } from 'vitest';
import { splitStatements, runMigrations } from '@/core/db/migrate';
import { createTestDb, wrapSqlite } from '@/adapters/test/sqliteDb';
import Database from 'better-sqlite3';
import { migrations } from '@/core/db/migrations';
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
  test('fresh db returns 6; second run returns 6 and executes nothing new', async () => {
    const raw = await createTestDb(); // already migrated once
    const rows = await raw.select<{ schema_version: number }>('SELECT schema_version FROM meta');
    expect(rows).toEqual([{ schema_version: 6 }]);
    const c = counting(raw);
    const list = [{ version: 1, sql: 'CREATE TABLE zzz (x INTEGER);' }];
    expect(await runMigrations(c.db, list)).toBe(6);
    expect(c.executed.some((s) => s.includes('zzz'))).toBe(false);
    expect(await raw.select('SELECT * FROM meta')).toHaveLength(1);
  });

  test('applies only newer migrations, in order', async () => {
    const db = await createTestDb();
    const v = await runMigrations(db, [
      { version: 4, sql: 'CREATE TABLE ignored (x INTEGER);' },
      { version: 7, sql: 'CREATE TABLE t2 (x INTEGER);' },
    ]);
    expect(v).toBe(7);
    expect(await db.select('SELECT * FROM t2')).toEqual([]);
    expect(await db.select('SELECT * FROM meta')).toEqual([{ schema_version: 7 }]);
  });

  test('0003 adds rule_gap.base_version to an existing db; old rows get NULL', async () => {
    const raw = new Database(':memory:');
    raw.pragma('foreign_keys = OFF'); // only the column is under test, not the referenced rows
    const db = wrapSqlite(raw);
    expect(await runMigrations(db, migrations.filter((m) => m.version <= 2))).toBe(2);
    await db.execute("INSERT INTO rule_gap (id, item_id, rule_id, proposal, explanation, sources) VALUES (1, 1, 1, 'p', 'e', '[]')");
    expect(await runMigrations(db, migrations)).toBe(6);
    expect(await db.select('SELECT id, base_version FROM rule_gap')).toEqual([{ id: 1, base_version: null }]);
  });
});

describe('migration 5 (writing blocks)', () => {
  test('migration 5 keeps blocks and their children', async () => {
    const raw = new Database(':memory:');
    raw.pragma('foreign_keys = ON');
    const db = wrapSqlite(raw);
    expect(await runMigrations(db, migrations.filter((m) => m.version <= 4))).toBe(4);
    await db.execute(
      "INSERT INTO session (id, date, title, is_light, status, created_at) VALUES (7,'2026-10-22','T',0,'draft','x')",
    );
    await db.execute(
      "INSERT INTO block (id, session_id, ord, kind, format, title, instruction, minutes, round) VALUES (11,7,1,'task','spot','B','do it',10,2)",
    );
    await db.execute("INSERT INTO item (id, block_id, ord, prompt, expected, is_check, status) VALUES (21,11,1,'p','e',0,'active')");
    await db.execute("INSERT INTO answer (item_id, text) VALUES (21,'a')");
    await db.execute("INSERT INTO spot_answer (block_id, paragraph, text) VALUES (11,1,'s')");
    await db.execute("INSERT INTO extra_finding (block_id, paragraph, text, explanation) VALUES (11,1,'x','e')");

    expect(await runMigrations(db, migrations)).toBe(6);

    expect(await db.select('SELECT id, session_id, ord, kind, format, title, instruction, minutes, round FROM block')).toEqual([
      { id: 11, session_id: 7, ord: 1, kind: 'task', format: 'spot', title: 'B', instruction: 'do it', minutes: 10, round: 2 },
    ]);
    expect(await db.select('SELECT id, block_id FROM item')).toEqual([{ id: 21, block_id: 11 }]);
    expect(await db.select('SELECT item_id FROM answer')).toEqual([{ item_id: 21 }]);
    expect(await db.select('SELECT block_id FROM spot_answer')).toEqual([{ block_id: 11 }]);
    expect(await db.select('SELECT block_id FROM extra_finding')).toEqual([{ block_id: 11 }]);
    expect(await db.select('PRAGMA foreign_key_check')).toEqual([]);
  });

  test('migration 5 accepts writing blocks', async () => {
    const db = await createTestDb();
    const s = await db.execute(
      "INSERT INTO session (date, title, is_light, status, created_at) VALUES ('2026-10-22','T',0,'draft','x')",
    );
    const essay = await db.execute(
      "INSERT INTO block (session_id, ord, kind, format, title, instruction, minutes) VALUES (?,1,'writing','essay','W','write',30)",
      [s.lastInsertId],
    );
    const rewrite = await db.execute(
      "INSERT INTO block (session_id, ord, kind, format, title, instruction, minutes) VALUES (?,2,'writing','rewrite','R','rewrite',20)",
      [s.lastInsertId],
    );
    await db.execute("INSERT INTO writing_text (block_id, text, words, source_block_id, created_at) VALUES (?,'hello',1,?,'x')", [
      essay.lastInsertId,
      rewrite.lastInsertId,
    ]);
    const item = await db.execute(
      "INSERT INTO item (block_id, ord, prompt, expected, is_check, status) VALUES (?,1,'p','e',0,'active')",
      [rewrite.lastInsertId],
    );
    await db.execute("INSERT INTO answer (item_id, text, suggested_topic) VALUES (?,'a','topic')", [item.lastInsertId]);
    expect(await db.select('SELECT block_id, text, words FROM writing_text')).toEqual([
      { block_id: essay.lastInsertId, text: 'hello', words: 1 },
    ]);
    expect(await db.select('SELECT suggested_topic FROM answer')).toEqual([{ suggested_topic: 'topic' }]);
  });
});

describe('schema', () => {
  test('session.date is unique', async () => {
    const db = await createTestDb();
    const ins = "INSERT INTO session (date, title, is_light, status, created_at) VALUES ('2026-10-22','T',0,'draft','2026-10-22T08:00:00Z')";
    await db.execute(ins);
    await expect(db.execute(ins)).rejects.toThrow();
  });

  test('item.wrong and block.round default for an S1-style insert', async () => {
    const db = await createTestDb();
    const s = await db.execute(
      "INSERT INTO session (date, title, is_light, status, created_at) VALUES ('2026-10-22','T',0,'draft','x')",
    );
    const b = await db.execute(
      "INSERT INTO block (session_id, ord, kind, format, title, instruction, minutes) VALUES (?,1,'task','fix','B','do it',10)",
      [s.lastInsertId],
    );
    await db.execute("INSERT INTO item (block_id, ord, prompt, expected, is_check, status) VALUES (?,1,'p','e',false,'active')", [
      b.lastInsertId,
    ]);
    expect(await db.select('SELECT wrong FROM item')).toEqual([{ wrong: null }]);
    expect(await db.select('SELECT round FROM block')).toEqual([{ round: 1 }]);
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
