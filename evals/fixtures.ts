/** Rows the evals write straight into the temp database: graded history for the generation contexts, items for the grading cases. */
import type { Clock, Db } from '@/core/ports';
import type { BlockFormat, BlockKind } from '@/core/domain';
import { insertBlock, insertDraftSession, insertItem, markSessionGraded } from '@/core/db/repos/sessions';
import { upsertAnswer } from '@/core/db/repos/answers';

export interface HistorySession {
  date: string;
  topic: string;
  format: 'gap' | 'fix';
  items: { prompt: string; expected: string; answer: string; verdict: 'correct' | 'wrong'; ruleSection: string; inattention?: boolean }[];
}

export async function ruleRef(db: Db, topicKey: string): Promise<{ topicId: number; ruleId: number; version: number }> {
  const rows = await db.select<{ topic_id: number; rule_id: number; version: number }>(
    'SELECT t.id AS topic_id, r.id AS rule_id, r.current_version AS version FROM topic t JOIN rule r ON r.topic_id = t.id WHERE t.key = ?',
    [topicKey],
  );
  const r = rows[0];
  if (!r) throw new Error(`No rule for topic ${topicKey}`);
  return { topicId: r.topic_id, ruleId: r.rule_id, version: r.version };
}

/** Inserts an active item and returns its id. */
export async function addItem(
  db: Db, blockId: number, ord: number,
  i: { prompt: string; expected: string; ruleSection: string | null; topic: string | null },
): Promise<number> {
  const ref = i.topic === null ? null : await ruleRef(db, i.topic);
  await insertItem(db, blockId, ord, {
    prompt: i.prompt, expected: i.expected, paragraph: null, topicId: ref?.topicId ?? null, ruleId: ref?.ruleId ?? null,
    ruleVersion: ref?.version ?? null, ruleSection: i.ruleSection, spellingWordId: null, isCheck: false, status: 'active', note: null, wrong: null,
  });
  const rows = await db.select<{ id: number }>('SELECT id FROM item WHERE block_id = ? AND ord = ?', [blockId, ord]);
  return rows[0]!.id;
}

export async function addBlock(db: Db, sessionId: number, ord: number, kind: BlockKind, format: BlockFormat): Promise<number> {
  return insertBlock(db, sessionId, ord, { kind, format, title: format, instruction: '', formatExample: null, passage: null, minutes: 5 });
}

/** Graded sessions with answers, so the app's own replay produces due re-checks and review input. */
export async function seedHistory(db: Db, clock: Clock, sessions: HistorySession[]): Promise<void> {
  for (const s of sessions) {
    const sessionId = await insertDraftSession(db, { date: s.date, title: `History ${s.date}`, isLight: false, createdAt: clock.now() });
    const blockId = await addBlock(db, sessionId, 0, 'task', s.format);
    for (const [ord, it] of s.items.entries()) {
      const itemId = await addItem(db, blockId, ord, { prompt: it.prompt, expected: it.expected, ruleSection: it.ruleSection, topic: s.topic });
      await upsertAnswer(db, {
        itemId, text: it.answer, verdict: it.verdict, fix: it.expected, ruleSection: it.ruleSection, explanation: null, vocabularyNote: null,
      });
      if (it.inattention) await db.execute('UPDATE answer SET is_inattention = 1 WHERE item_id = ?', [itemId]);
    }
    await markSessionGraded(db, sessionId, clock.now());
  }
}
