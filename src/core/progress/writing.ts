import type { ISODate } from '@/core/domain';
import type { Db } from '@/core/ports';
import { errorRate } from '@/core/writing/text';
import { loadGradedFacts } from './history';

export type WritingTextRow = {
  blockId: number;
  sessionId: number;
  date: ISODate;
  format: 'essay' | 'rewrite';
  prompt: string;
  text: string;
  words: number;
  errors: number;
  rate: number | null;
  sourceBlockId: number | null;
};

/** Checked writing texts of graded sessions, newest first. Errors are the block's items whose effective verdict is wrong. */
export async function loadWritingTexts(db: Db): Promise<WritingTextRow[]> {
  const [texts, facts] = await Promise.all([
    db.select<{
      block_id: number;
      session_id: number;
      date: string;
      format: 'essay' | 'rewrite';
      prompt: string;
      text: string;
      words: number;
      source_block_id: number | null;
    }>(
      `SELECT b.id AS block_id, s.id AS session_id, s.date AS date, b.format AS format, b.instruction AS prompt,
              wt.text AS text, wt.words AS words, wt.source_block_id AS source_block_id
       FROM writing_text wt
       JOIN block b ON b.id = wt.block_id
       JOIN session s ON s.id = b.session_id
       WHERE s.status = 'graded'
       ORDER BY s.date DESC, s.id DESC, b.ord`,
    ),
    loadGradedFacts(db),
  ]);
  const errorsByBlock = new Map<number, number>();
  for (const it of facts.scored) {
    if (it.verdict === 'wrong') errorsByBlock.set(it.blockId, (errorsByBlock.get(it.blockId) ?? 0) + 1);
  }
  return texts.map((t) => {
    const errors = errorsByBlock.get(t.block_id) ?? 0;
    return {
      blockId: t.block_id,
      sessionId: t.session_id,
      date: t.date,
      format: t.format,
      prompt: t.prompt,
      text: t.text,
      words: t.words,
      errors,
      rate: errorRate(errors, t.words),
      sourceBlockId: t.source_block_id,
    };
  });
}
