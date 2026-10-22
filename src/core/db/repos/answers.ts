import type { Db } from '@/core/ports';
import type {
  BlockFormat,
  BlockKind,
  DisputeDecision,
  GapStatus,
  ISODate,
  ItemStatus,
  Verdict,
} from '@/core/domain';

export interface GradedAnswerRow {
  sessionId: number;
  date: ISODate;
  blockId: number;
  blockKind: BlockKind;
  format: BlockFormat;
  itemId: number;
  topicId: number | null;
  isCheck: boolean;
  itemStatus: ItemStatus;
  prompt: string;
  expected: string;
  text: string;
  verdict: Verdict;
  fix: string | null;
  isInattention: boolean;
  disputeDecision: DisputeDecision | null;
  gapStatus: GapStatus | null;
  supported: boolean;
}

interface RawRow {
  session_id: number;
  date: string;
  block_id: number;
  block_kind: BlockKind;
  format: BlockFormat;
  item_id: number;
  topic_id: number | null;
  is_check: number;
  item_status: ItemStatus;
  prompt: string;
  expected: string;
  text: string;
  verdict: Verdict | null;
  fix: string | null;
  is_inattention: number;
  dispute_decision: DisputeDecision | null;
  gap_status: GapStatus | null;
  supported: number;
}

/** Every answered item of every graded session, oldest first. */
export async function listGradedAnswerRows(db: Db): Promise<GradedAnswerRow[]> {
  const rows = await db.select<RawRow>(
    `SELECT s.id AS session_id, s.date AS date, b.id AS block_id, b.kind AS block_kind, b.format AS format,
            i.id AS item_id, i.topic_id AS topic_id, i.is_check AS is_check, i.status AS item_status,
            i.prompt AS prompt, i.expected AS expected,
            a.text AS text, a.verdict AS verdict, a.fix AS fix, a.is_inattention AS is_inattention,
            a.dispute_decision AS dispute_decision, g.status AS gap_status,
            EXISTS (SELECT 1 FROM session_support ss WHERE ss.session_id = s.id AND ss.topic_id = i.topic_id) AS supported
     FROM session s
     JOIN block b ON b.session_id = s.id
     JOIN item i ON i.block_id = b.id
     JOIN answer a ON a.item_id = i.id
     LEFT JOIN rule_gap g ON g.item_id = i.id
     WHERE s.status = 'graded'
     ORDER BY s.date, s.id, b.ord, i.ord`,
  );
  return rows.map((r) => ({
    sessionId: r.session_id,
    date: r.date,
    blockId: r.block_id,
    blockKind: r.block_kind,
    format: r.format,
    itemId: r.item_id,
    topicId: r.topic_id,
    isCheck: r.is_check === 1,
    itemStatus: r.item_status,
    prompt: r.prompt,
    expected: r.expected,
    text: r.text,
    verdict: r.verdict ?? 'skipped',
    fix: r.fix,
    isInattention: r.is_inattention === 1,
    disputeDecision: r.dispute_decision,
    gapStatus: r.gap_status,
    supported: r.supported === 1,
  }));
}

export async function listGradedSpellingAttempts(
  db: Db,
): Promise<{ wordId: number; sessionId: number; date: ISODate; correct: boolean }[]> {
  const rows = await db.select<{ word_id: number; session_id: number; date: string; correct: number }>(
    `SELECT sa.word_id AS word_id, sa.session_id AS session_id, s.date AS date, sa.correct AS correct
     FROM spelling_attempt sa JOIN session s ON s.id = sa.session_id
     WHERE s.status = 'graded' ORDER BY s.date, s.id`,
  );
  return rows.map((r) => ({ wordId: r.word_id, sessionId: r.session_id, date: r.date, correct: r.correct === 1 }));
}
