import { describe, expect, test } from 'vitest';
import { createTestDb } from '@/adapters/test/sqliteDb';
import type { Db } from '@/core/ports';
import { getSpellingStates, getTopicStates, loadGradedFacts, loadProgressLog } from '@/core/progress/history';

async function seed(db: Db) {
  await db.execute("INSERT INTO programme (title, start_date, end_date) VALUES ('P','2026-10-01','2026-12-01')");
  await db.execute("INSERT INTO topic (programme_id, key, title, kind) VALUES (1,'a','A','learn'),(1,'b','B','learn')");
  await db.execute('INSERT INTO rule (topic_id, current_version) VALUES (1,1)');
  await db.execute(
    "INSERT INTO session (date, title, is_light, status, created_at) VALUES ('2026-10-20','S1',0,'graded','x'),('2026-10-21','S2',0,'generated','x')",
  );
  await db.execute('INSERT INTO session_support (session_id, topic_id) VALUES (1,1)');
  await db.execute(
    "INSERT INTO block (session_id, ord, kind, format, title, instruction, minutes) VALUES (1,1,'task','gap','B','i',5),(1,2,'task','spot','C','i',5),(2,1,'task','gap','D','i',5)",
  );
  await db.execute(
    `INSERT INTO item (block_id, ord, prompt, expected, topic_id, is_check, status) VALUES
     (1,1,'p1','e1',1,1,'active'),
     (1,2,'p2','e2',2,0,'active'),
     (1,3,'p3','e3',NULL,0,'active'),
     (1,4,'p4','e4',1,0,'defect'),
     (1,5,'p5','e5',1,0,'active'),
     (2,1,'frag','right',1,0,'active'),
     (3,1,'p7','e7',1,0,'active')`,
  );
  // item 5 has no answer; item 7 belongs to an ungraded session
  await db.execute(
    `INSERT INTO answer (item_id, text, verdict, fix, is_inattention, dispute_text, dispute_decision) VALUES
     (1,'a1','correct',NULL,0,NULL,NULL),
     (2,'a2','wrong','f2',0,'but why','keep'),
     (3,'a3','wrong',NULL,1,NULL,NULL),
     (4,'a4','wrong',NULL,0,NULL,NULL),
     (6,'zz','wrong',NULL,0,NULL,NULL),
     (7,'a7','wrong',NULL,0,NULL,NULL)`,
  );
  await db.execute("INSERT INTO spelling_word (word, created_at) VALUES ('receive','x')");
  await db.execute('INSERT INTO spelling_attempt (word_id, session_id, correct) VALUES (1,1,0)');
  await db.execute("INSERT INTO session_feedback (session_id, patterns, tomorrow) VALUES (1,'[\"p\",\"q\"]','[]')");
  await db.execute(
    "INSERT INTO llm_call (session_id, kind, model, cost_usd, duration_ms, ok, created_at) VALUES (1,'grade','m',0.25,1,1,'x'),(1,'dispute','m',0.5,1,1,'x'),(2,'grade','m',9,1,1,'x')",
  );
}

describe('loadGradedFacts', () => {
  test('returns facts for graded sessions only', async () => {
    const db = await createTestDb();
    await seed(db);
    const f = await loadGradedFacts(db);
    expect(f.topicFacts).toEqual([
      { sessionId: 1, date: '2026-10-20', topicId: 1, isCheck: true, verdict: 'correct', isInattention: false, supported: true },
      { sessionId: 1, date: '2026-10-20', topicId: 2, isCheck: false, verdict: 'wrong', isInattention: false, supported: false },
      { sessionId: 1, date: '2026-10-20', topicId: 1, isCheck: false, verdict: null, isInattention: false, supported: true },
      { sessionId: 1, date: '2026-10-20', topicId: 1, isCheck: false, verdict: 'wrong', isInattention: false, supported: true },
    ]);
    expect(f.spellingFacts).toEqual([{ wordId: 1, sessionId: 1, date: '2026-10-20', correct: false }]);
    expect(f.scored).toHaveLength(5);
    expect(f.scored[0]).toEqual({ sessionId: 1, blockId: 1, blockKind: 'task', format: 'gap', verdict: 'correct' });
    const rows = f.errorRows;
    expect(rows.map((r) => r.itemId)).toEqual([1, 2, 3, 4, 6]);
    expect(rows.find((r) => r.itemId === 3)).toMatchObject({ isInattention: true, topicId: null, effective: 'wrong' });
    expect(rows.find((r) => r.itemId === 4)?.effective).toBeNull();
    expect(rows.find((r) => r.itemId === 6)).toMatchObject({ format: 'spot', prompt: 'frag', expected: 'right' });
  });

  test('state wrappers replay the facts', async () => {
    const db = await createTestDb();
    await seed(db);
    const topics = await getTopicStates(db);
    expect(topics.get(2)?.status).toBe('open');
    const words = await getSpellingStates(db);
    expect(words.get(1)?.pending).toEqual(['2026-10-21', '2026-10-23', '2026-10-27']);
  });
});

describe('loadProgressLog', () => {
  test('one row per graded session with patterns, disputes, defects and cost', async () => {
    const db = await createTestDb();
    await seed(db);
    const log = await loadProgressLog(db);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      sessionId: 1,
      date: '2026-10-20',
      title: 'S1',
      isLight: false,
      patterns: ['p', 'q'],
      disputes: 1,
      defects: 1,
      costUsd: 0.75,
      errorCount: 3,
    });
    expect(log[0]?.scores).toEqual([
      { blockId: 1, correct: 1, counted: 3 },
      { blockId: 2, correct: 0, counted: 1 },
    ]);
  });
});
