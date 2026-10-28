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
import { effectiveVerdict } from '@/core/verdict';

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
  wrong: string | null;
  paragraph: number | null;
  passage: string | null;
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
  wrong: string | null;
  paragraph: number | null;
  passage: string | null;
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
            i.prompt AS prompt, i.expected AS expected, i.wrong AS wrong, i.paragraph AS paragraph, b.passage AS passage,
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
    wrong: r.wrong,
    paragraph: r.paragraph,
    passage: r.passage,
    text: r.text,
    verdict: r.verdict ?? 'skipped',
    fix: r.fix,
    isInattention: r.is_inattention === 1,
    disputeDecision: r.dispute_decision,
    gapStatus: r.gap_status,
    supported: r.supported === 1,
  }));
}

/** Gap and fix items the learner left unanswered in a session: active, skipped, not dropped by a dispute. */
export async function listSkippedItems(
  db: Db,
  sessionId: number,
): Promise<{ prompt: string; expected: string; topicId: number | null }[]> {
  const rows = await db.select<{ prompt: string; expected: string; topic_id: number | null }>(
    `SELECT i.prompt AS prompt, i.expected AS expected, i.topic_id AS topic_id
     FROM block b
     JOIN item i ON i.block_id = b.id
     JOIN answer a ON a.item_id = i.id
     WHERE b.session_id = ? AND b.format IN ('gap', 'fix') AND i.status = 'active'
       AND a.verdict = 'skipped' AND (a.dispute_decision IS NULL OR a.dispute_decision != 'drop')
     ORDER BY b.ord, i.ord`,
    [sessionId],
  );
  return rows.map((r) => ({ prompt: r.prompt, expected: r.expected, topicId: r.topic_id }));
}

/**
 * Active, solvable (gap, fix, spelling) items in any round: answered `skipped` and not dropped, or never answered.
 * Needs `s` (session) joined, and the date of today as its only parameter: while today's session has a fresh added
 * round (round 2 and up, no active non-question item answered yet) the round is answered first, so the session
 * has no solvable items.
 */
const SOLVABLE = `b.format IN ('gap', 'fix', 'spelling') AND i.status = 'active'
       AND ((a.item_id IS NOT NULL AND a.verdict = 'skipped' AND (a.dispute_decision IS NULL OR a.dispute_decision != 'drop'))
         OR a.item_id IS NULL)
       AND NOT (s.date = ? AND EXISTS (
         SELECT 1 FROM block rb JOIN item ri ON ri.block_id = rb.id
         WHERE rb.session_id = s.id AND rb.round > 1 AND rb.format != 'question' AND ri.status = 'active'
           AND NOT EXISTS (
             SELECT 1 FROM block xb JOIN item xi ON xi.block_id = xb.id JOIN answer xa ON xa.item_id = xi.id
             WHERE xb.session_id = rb.session_id AND xb.round = rb.round AND xb.format != 'question' AND xi.status = 'active')))`;

/** Graded sessions of a date range with solvable items, and how many; `today` is the date for the fresh-round exception. */
export async function countSkippedBySession(db: Db, from: ISODate, to: ISODate, today: ISODate): Promise<{ sessionId: number; date: ISODate; count: number }[]> {
  const rows = await db.select<{ session_id: number; date: string; n: number }>(
    `SELECT s.id AS session_id, s.date AS date, COUNT(*) AS n
     FROM session s JOIN block b ON b.session_id = s.id JOIN item i ON i.block_id = b.id LEFT JOIN answer a ON a.item_id = i.id
     WHERE s.status = 'graded' AND s.date BETWEEN ? AND ? AND ${SOLVABLE}
     GROUP BY s.id ORDER BY s.date`,
    [from, to, today],
  );
  return rows.map((r) => ({ sessionId: r.session_id, date: r.date, count: r.n }));
}

/** Deletes the `skipped` answers of a session's solvable items, so those items are unanswered again; returns how many. */
export async function deleteSkippedAnswers(db: Db, sessionId: number, today: ISODate): Promise<number> {
  const res = await db.execute(
    `DELETE FROM answer WHERE item_id IN (
       SELECT i.id FROM session s JOIN block b ON b.session_id = s.id JOIN item i ON i.block_id = b.id JOIN answer a ON a.item_id = i.id
       WHERE s.id = ? AND ${SOLVABLE})`,
    [sessionId, today],
  );
  return res.rowsAffected;
}

/**
 * One fact per stored attempt. An attempt that comes from a spelling-block item of its session takes the item's
 * effective verdict (so a won dispute counts as correct, a dropped item or a lost dispute is skipped); a word the
 * grader reported inside another answer has no such item and keeps the stored result.
 */
export async function listGradedSpellingAttempts(
  db: Db,
): Promise<{ wordId: number; sessionId: number; date: ISODate; correct: boolean }[]> {
  const rows = await db.select<{
    word_id: number; session_id: number; date: string; correct: number;
    item_status: ItemStatus | null; verdict: Verdict | null; dispute_decision: DisputeDecision | null; gap_status: GapStatus | null;
  }>(
    `SELECT sa.word_id AS word_id, sa.session_id AS session_id, s.date AS date, sa.correct AS correct,
            i.status AS item_status, a.verdict AS verdict, a.dispute_decision AS dispute_decision, g.status AS gap_status
     FROM spelling_attempt sa
     JOIN session s ON s.id = sa.session_id
     LEFT JOIN block b ON b.session_id = sa.session_id AND b.format = 'spelling'
     LEFT JOIN item i ON i.block_id = b.id AND i.spelling_word_id = sa.word_id
     LEFT JOIN answer a ON a.item_id = i.id
     LEFT JOIN rule_gap g ON g.item_id = i.id
     WHERE s.status = 'graded' ORDER BY s.date, s.id`,
  );
  return rows.flatMap((r) => {
    const fact = (correct: boolean) => [{ wordId: r.word_id, sessionId: r.session_id, date: r.date, correct }];
    if (r.item_status === null || (r.verdict === null && r.item_status === 'active')) return fact(r.correct === 1);
    const effective = effectiveVerdict({
      itemStatus: r.item_status, verdict: r.verdict ?? 'skipped', disputeDecision: r.dispute_decision, gapStatus: r.gap_status,
    });
    return effective === null ? [] : fact(effective === 'correct');
  });
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

/** Adds the patterns and "tomorrow" lines of a later round to the stored ones, without duplicates. */
export async function appendSessionFeedback(db: Db, sessionId: number, patterns: string[], tomorrow: string[]): Promise<void> {
  const rows = await db.select<{ patterns: string; tomorrow: string }>('SELECT patterns, tomorrow FROM session_feedback WHERE session_id = ?', [sessionId]);
  const union = (old: string | undefined, add: string[]) => [...new Set([...(old === undefined ? [] : (JSON.parse(old) as string[])), ...add])];
  await upsertSessionFeedback(db, sessionId, union(rows[0]?.patterns, patterns), union(rows[0]?.tomorrow, tomorrow));
}

export async function markItemDefect(db: Db, itemId: number, note: string): Promise<void> {
  await db.execute("UPDATE item SET status = 'defect', note = CASE WHEN ? = '' THEN note ELSE ? END WHERE id = ?", [note, note, itemId]);
}
