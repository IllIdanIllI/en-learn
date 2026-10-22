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

export interface AnswerWrite {
  itemId: number;
  text: string;
  verdict: Verdict;
  fix: string | null;
  ruleSection: string | null;
  explanation: string | null;
  vocabularyNote: string | null;
}

/** Idempotent per item; dispute and inattention columns are left alone. */
export async function upsertAnswer(db: Db, a: AnswerWrite): Promise<void> {
  await db.execute(
    `INSERT INTO answer (item_id, text, verdict, fix, rule_section, explanation, vocabulary_note)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(item_id) DO UPDATE SET text = excluded.text, verdict = excluded.verdict, fix = excluded.fix,
       rule_section = excluded.rule_section, explanation = excluded.explanation, vocabulary_note = excluded.vocabulary_note`,
    [a.itemId, a.text, a.verdict, a.fix, a.ruleSection, a.explanation, a.vocabularyNote],
  );
}

export async function upsertSpotAnswer(db: Db, blockId: number, paragraph: number, text: string): Promise<void> {
  await db.execute(
    'INSERT INTO spot_answer (block_id, paragraph, text) VALUES (?, ?, ?) ON CONFLICT(block_id, paragraph) DO UPDATE SET text = excluded.text',
    [blockId, paragraph, text],
  );
}

export async function upsertExtraFinding(db: Db, blockId: number, paragraph: number, text: string, explanation: string): Promise<void> {
  await db.execute(
    `INSERT INTO extra_finding (block_id, paragraph, text, explanation) VALUES (?, ?, ?, ?)
     ON CONFLICT(block_id, paragraph, text) DO UPDATE SET explanation = excluded.explanation`,
    [blockId, paragraph, text, explanation],
  );
}

/** A pending proposal; the status of an existing row is kept. */
export async function upsertRuleGap(
  db: Db,
  g: { itemId: number; ruleId: number; proposal: string; explanation: string; sources: string },
): Promise<void> {
  await db.execute(
    `INSERT INTO rule_gap (item_id, rule_id, proposal, explanation, sources) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(item_id) DO UPDATE SET proposal = excluded.proposal, explanation = excluded.explanation, sources = excluded.sources`,
    [g.itemId, g.ruleId, g.proposal, g.explanation, g.sources],
  );
}

/** One attempt per word per session; wrong wins. */
export async function upsertSpellingAttempt(db: Db, wordId: number, sessionId: number, correct: boolean): Promise<void> {
  await db.execute(
    `INSERT INTO spelling_attempt (word_id, session_id, correct) VALUES (?, ?, ?)
     ON CONFLICT(word_id, session_id) DO UPDATE SET correct = MIN(spelling_attempt.correct, excluded.correct)`,
    [wordId, sessionId, correct ? 1 : 0],
  );
}

export async function upsertSessionFeedback(db: Db, sessionId: number, patterns: string[], tomorrow: string[]): Promise<void> {
  await db.execute(
    `INSERT INTO session_feedback (session_id, patterns, tomorrow) VALUES (?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET patterns = excluded.patterns, tomorrow = excluded.tomorrow`,
    [sessionId, JSON.stringify(patterns), JSON.stringify(tomorrow)],
  );
}

export async function markItemDefect(db: Db, itemId: number, note: string): Promise<void> {
  await db.execute("UPDATE item SET status = 'defect', note = CASE WHEN ? = '' THEN note ELSE ? END WHERE id = ?", [note, note, itemId]);
}
