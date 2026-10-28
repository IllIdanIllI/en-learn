import { describe, expect, test } from 'vitest';
import { createTestDb } from '@/adapters/test/sqliteDb';
import type { Db } from '@/core/ports';
import { listBlockTitles } from '@/core/db/repos/sessions';
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

  test('error rows carry the wrong fragment and the spot paragraph text', async () => {
    const db = await createTestDb();
    await seed(db);
    await db.execute("UPDATE block SET passage = '[\"first\",\"Say frag now.\"]' WHERE id = 2");
    await db.execute('UPDATE item SET paragraph = 1 WHERE id = 6');
    await db.execute("UPDATE item SET wrong = 'p2 bit' WHERE id = 2");
    const rows = (await loadGradedFacts(db)).errorRows;
    expect(rows.find((r) => r.itemId === 6)).toMatchObject({ paragraph: 'Say frag now.', wrong: null });
    expect(rows.find((r) => r.itemId === 2)).toMatchObject({ paragraph: null, wrong: 'p2 bit' });
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
    expect(log[0]?.usage).toEqual({ models: ['m'], calls: 2, failedCalls: 0, tokens: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 } });
    expect(log[0]?.scores).toEqual([
      { blockId: 1, correct: 1, counted: 3 },
      { blockId: 2, correct: 0, counted: 1 },
    ]);
  });
});

describe('loadProgressLog usage', () => {
  test('models in first-use order, failed calls and tokens come from the stored envelopes', async () => {
    const db = await createTestDb();
    await seed(db);
    const env = JSON.stringify({ usage: { input_tokens: 3, cache_read_input_tokens: 4, cache_creation_input_tokens: 5, output_tokens: 6 } });
    await db.execute(
      "INSERT INTO llm_call (session_id, kind, model, cost_usd, duration_ms, ok, error, response, created_at) VALUES (1,'grade','claude-b',0,1,0,'x','', 'x'),(1,'grade','claude-b',0,1,1,NULL,?, 'x')",
      [env],
    );
    const log = await loadProgressLog(db);
    expect(log[0]?.usage).toEqual({ models: ['m', 'claude-b'], calls: 4, failedCalls: 1, tokens: { input: 3, cacheRead: 4, cacheWrite: 5, output: 6 } });
  });
});

describe('spelling facts use effective verdicts', () => {
  async function spellingSession() {
    const db = await createTestDb();
    await db.execute("INSERT INTO session (date, title, is_light, status, created_at) VALUES ('2026-10-20','S',0,'graded','x')");
    await db.execute("INSERT INTO block (session_id, ord, kind, format, title, instruction, minutes) VALUES (1,0,'spelling','spelling','Sp','i',2),(1,1,'task','gap','G','i',2)");
    await db.execute("INSERT INTO spelling_word (word, created_at) VALUES ('w1','x'),('w2','x'),('w3','x'),('w4','x'),('w5','x'),('w6','x')");
    await db.execute(
      `INSERT INTO item (block_id, ord, prompt, expected, spelling_word_id, status) VALUES
       (1,0,'p','w1',1,'active'),(1,1,'p','w2',2,'active'),(1,2,'p','w3',3,'active'),(1,3,'p','w4',4,'dropped'),(1,4,'p','w5',5,'active')`,
    );
    await db.execute(
      `INSERT INTO answer (item_id, text, verdict, dispute_text, dispute_decision) VALUES
       (1,'x','wrong',NULL,NULL),
       (2,'x','wrong','it is fine','correct'),
       (3,'x','wrong','not a word','drop'),
       (4,'x','wrong',NULL,NULL),
       (5,'w5','correct',NULL,NULL)`,
    );
    // w6 was reported by the grader inside a gap answer: no spelling item, the stored attempt stands.
    await db.execute(
      'INSERT INTO spelling_attempt (word_id, session_id, correct) VALUES (1,1,0),(2,1,0),(3,1,0),(4,1,0),(5,1,1),(6,1,0)',
    );
    return db;
  }

  test('a won dispute counts as correct; dropped items and disputes are skipped; reported words keep their stored result', async () => {
    const db = await spellingSession();
    const { spellingFacts } = await loadGradedFacts(db);
    expect(spellingFacts.map((f) => [f.wordId, f.correct])).toEqual([[1, false], [2, true], [5, true], [6, false]]);
  });

  test('the word state follows the disputed outcome', async () => {
    const db = await spellingSession();
    const states = await getSpellingStates(db);
    expect([...states.keys()].sort()).toEqual([1, 2, 5, 6]);
    expect(states.get(2)).not.toEqual(states.get(1));
  });
});

describe('listBlockTitles', () => {
  test('titles of the blocks of the given sessions only', async () => {
    const db = await createTestDb();
    await seed(db);
    expect([...(await listBlockTitles(db, [1]))]).toEqual([[1, 'B'], [2, 'C']]);
    expect([...(await listBlockTitles(db, [1, 2]))]).toEqual([[1, 'B'], [2, 'C'], [3, 'D']]);
    expect((await listBlockTitles(db, [])).size).toBe(0);
  });
});
