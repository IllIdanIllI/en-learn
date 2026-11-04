import type { Db } from '@/core/ports';
import type { ISODate } from '@/core/domain';
import { MIN_WORDS } from '@/core/writing/text';

/** The newest writing text of a graded session dated before `before` (on or before it with `inclusive`) that has at least MIN_WORDS words. */
export async function latestWritingSource(db: Db, before: ISODate, inclusive = false): Promise<{ blockId: number; text: string } | null> {
  const rows = await db.select<{ block_id: number; text: string }>(
    `SELECT wt.block_id AS block_id, wt.text AS text FROM writing_text wt
     JOIN block b ON b.id = wt.block_id JOIN session s ON s.id = b.session_id
     WHERE s.status = 'graded' AND s.date ${inclusive ? '<=' : '<'} ? AND wt.words >= ?
     ORDER BY s.date DESC, wt.block_id DESC LIMIT 1`,
    [before, MIN_WORDS],
  );
  const row = rows[0];
  return row ? { blockId: row.block_id, text: row.text } : null;
}

export interface OpenWritingBlock {
  blockId: number;
  blockOrd: number;
  format: 'essay' | 'rewrite';
  /** The essay prompt, or the rewrite instruction. */
  prompt: string;
  sourceBlockId: number | null;
}

/** Writing blocks of a session that have no stored text yet, in display order. */
export async function listOpenWritingBlocks(db: Db, sessionId: number): Promise<OpenWritingBlock[]> {
  const rows = await db.select<{ id: number; ord: number; format: 'essay' | 'rewrite'; instruction: string; passage: string | null }>(
    `SELECT b.id AS id, b.ord AS ord, b.format AS format, b.instruction AS instruction, b.passage AS passage
     FROM block b WHERE b.session_id = ? AND b.kind = 'writing'
       AND NOT EXISTS (SELECT 1 FROM writing_text w WHERE w.block_id = b.id)
     ORDER BY b.ord`,
    [sessionId],
  );
  return rows.map((r) => ({
    blockId: r.id,
    blockOrd: r.ord,
    format: r.format,
    prompt: r.instruction,
    sourceBlockId: r.format === 'rewrite' && r.passage !== null ? (JSON.parse(r.passage) as { sourceBlockId: number }).sourceBlockId : null,
  }));
}

export async function insertWritingText(
  db: Db,
  w: { blockId: number; text: string; words: number; sourceBlockId: number | null; createdAt: string },
): Promise<void> {
  await db.execute(
    'INSERT INTO writing_text (block_id, text, words, source_block_id, created_at) VALUES (?, ?, ?, ?, ?)',
    [w.blockId, w.text, w.words, w.sourceBlockId, w.createdAt],
  );
}

/** The programme topic with its current rule, for a topic key; null when the key is unknown or has no rule. */
export async function findTopicRule(db: Db, key: string): Promise<{ topicId: number; ruleId: number; ruleVersion: number } | null> {
  const rows = await db.select<{ topic_id: number; rule_id: number; version: number }>(
    'SELECT t.id AS topic_id, r.id AS rule_id, r.current_version AS version FROM topic t JOIN rule r ON r.topic_id = t.id WHERE t.key = ?',
    [key],
  );
  const r = rows[0];
  return r ? { topicId: r.topic_id, ruleId: r.rule_id, ruleVersion: r.version } : null;
}
