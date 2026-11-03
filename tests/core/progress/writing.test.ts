import { describe, expect, test } from 'vitest';
import { createTestDb } from '@/adapters/test/sqliteDb';
import { loadWritingTexts } from '@/core/progress/writing';

async function seed() {
  const db = await createTestDb();
  await db.execute("INSERT INTO programme (title, start_date, end_date) VALUES ('P','2026-10-01','2026-12-01')");
  await db.execute(
    `INSERT INTO session (date, title, is_light, status, created_at) VALUES
     ('2026-10-20','S1',0,'graded','x'),('2026-10-21','S2',0,'generated','x'),('2026-10-22','S3',0,'graded','x')`,
  );
  await db.execute(
    `INSERT INTO block (session_id, ord, kind, format, title, instruction, passage, minutes) VALUES
     (1,1,'writing','essay','Essay','Describe your weekend',NULL,10),
     (1,2,'writing','rewrite','Rewrite','Rewrite in past tense','{"sourceBlockId":1}',10),
     (2,1,'writing','essay','Essay','Ungraded prompt',NULL,10),
     (3,1,'writing','essay','Essay','Short prompt',NULL,10)`,
  );
  await db.execute(
    `INSERT INTO writing_text (block_id, text, words, source_block_id, created_at) VALUES
     (1,'my weekend text',60,NULL,'x'),
     (2,'rewritten text',55,1,'x'),
     (3,'ungraded text',100,NULL,'x'),
     (4,'short text',30,NULL,'x')`,
  );
  await db.execute(
    `INSERT INTO item (block_id, ord, prompt, expected, status) VALUES
     (1,1,'p1','e1','active'),(1,2,'p2','e2','active'),(1,3,'p3','e3','active'),(3,1,'p4','e4','active')`,
  );
  await db.execute(
    `INSERT INTO answer (item_id, text, verdict, dispute_decision) VALUES
     (1,'a1','wrong',NULL),(2,'a2','wrong',NULL),(3,'a3','wrong','correct'),(4,'a4','wrong',NULL)`,
  );
  return db;
}

describe('loadWritingTexts', () => {
  test('lists checked texts of graded sessions, newest session first, then display order within a session, with errors counted after disputes', async () => {
    const rows = await loadWritingTexts(await seed());
    expect(rows).toEqual([
      {
        blockId: 4,
        sessionId: 3,
        date: '2026-10-22',
        format: 'essay',
        prompt: 'Short prompt',
        text: 'short text',
        words: 30,
        errors: 0,
        rate: null,
        sourceBlockId: null,
      },
      {
        blockId: 1,
        sessionId: 1,
        date: '2026-10-20',
        format: 'essay',
        prompt: 'Describe your weekend',
        text: 'my weekend text',
        words: 60,
        errors: 2,
        rate: 3.3,
        sourceBlockId: null,
      },
      {
        blockId: 2,
        sessionId: 1,
        date: '2026-10-20',
        format: 'rewrite',
        prompt: 'Rewrite in past tense',
        text: 'rewritten text',
        words: 55,
        errors: 0,
        rate: 0,
        sourceBlockId: 1,
      },
    ]);
  });
});
