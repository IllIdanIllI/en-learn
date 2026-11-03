import type { Db } from '@/core/ports';
import type { ISODate } from '@/core/domain';
import { MIN_WORDS } from '@/core/writing/text';

/** The newest writing text of a graded session dated before `before` that has at least MIN_WORDS words. */
export async function latestWritingSource(db: Db, before: ISODate): Promise<{ blockId: number; text: string } | null> {
  const rows = await db.select<{ block_id: number; text: string }>(
    `SELECT wt.block_id AS block_id, wt.text AS text FROM writing_text wt
     JOIN block b ON b.id = wt.block_id JOIN session s ON s.id = b.session_id
     WHERE s.status = 'graded' AND s.date < ? AND wt.words >= ?
     ORDER BY s.date DESC, wt.block_id DESC LIMIT 1`,
    [before, MIN_WORDS],
  );
  const row = rows[0];
  return row ? { blockId: row.block_id, text: row.text } : null;
}
