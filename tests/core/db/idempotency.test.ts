import { describe, expect, test } from 'vitest';
import { createTestDb } from '@/adapters/test/sqliteDb';
import type { Db } from '@/core/ports';

async function seed(db: Db) {
  await db.execute("INSERT INTO programme (title, start_date, end_date) VALUES ('P','2026-10-01','2026-12-01')");
  await db.execute("INSERT INTO topic (programme_id, key, title, kind) VALUES (1,'t','T','learn')");
  await db.execute('INSERT INTO rule (topic_id, current_version) VALUES (1,1)');
  await db.execute("INSERT INTO session (date, title, is_light, status, created_at) VALUES ('2026-10-22','S',0,'graded','x')");
  await db.execute("INSERT INTO block (session_id, ord, kind, format, title, instruction, minutes) VALUES (1,1,'task','spot','B','i',5)");
  await db.execute("INSERT INTO item (block_id, ord, prompt, expected) VALUES (1,1,'p','e')");
}

const cases: [string, string, unknown[]][] = [
  ['rule_gap', "INSERT INTO rule_gap (item_id, rule_id, proposal, explanation, sources) VALUES (1,1,'p','e','[]')", []],
  ['spot_answer', "INSERT INTO spot_answer (block_id, paragraph, text) VALUES (1,1,'x')", []],
  ['extra_finding', "INSERT INTO extra_finding (block_id, paragraph, text, explanation) VALUES (1,1,'x','e')", []],
];

describe('grading tables are idempotent', () => {
  for (const [table, sql] of cases) {
    test(table, async () => {
      const db = await createTestDb();
      await seed(db);
      await db.execute(sql);
      await expect(db.execute(sql)).rejects.toThrow();
      await db.execute(`${sql} ON CONFLICT DO NOTHING`);
      expect(await db.select(`SELECT * FROM ${table}`)).toHaveLength(1);
    });
  }
});
