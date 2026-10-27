import type { Db } from '@/core/ports';
import type { BlockFormat, BlockKind, ISODate, ItemStatus, SessionStatus } from '@/core/domain';
import { getSettings, setSetting } from './settings';

export interface GradedSession {
  id: number;
  date: ISODate;
  title: string;
  isLight: boolean;
}

export async function listGradedSessions(db: Db): Promise<GradedSession[]> {
  const rows = await db.select<{ id: number; date: string; title: string; is_light: number }>(
    "SELECT id, date, title, is_light FROM session WHERE status = 'graded' ORDER BY date DESC",
  );
  return rows.map((r) => ({ id: r.id, date: r.date, title: r.title, isLight: r.is_light === 1 }));
}

/** Block titles of the given sessions, by block id. */
export async function listBlockTitles(db: Db, sessionIds: number[]): Promise<Map<number, string>> {
  if (sessionIds.length === 0) return new Map();
  const rows = await db.select<{ id: number; title: string }>(
    `SELECT id, title FROM block WHERE session_id IN (${sessionIds.map(() => '?').join(', ')})`,
    sessionIds,
  );
  return new Map(rows.map((r) => [r.id, r.title]));
}

export async function sessionPatterns(db: Db): Promise<Map<number, string[]>> {
  const rows = await db.select<{ session_id: number; patterns: string }>('SELECT session_id, patterns FROM session_feedback');
  return new Map(rows.map((r) => [r.session_id, JSON.parse(r.patterns) as string[]]));
}

export async function sessionCounts(
  db: Db,
): Promise<Map<number, { disputes: number; defects: number; costUsd: number }>> {
  const out = new Map<number, { disputes: number; defects: number; costUsd: number }>();
  const get = (id: number) => {
    let v = out.get(id);
    if (!v) {
      v = { disputes: 0, defects: 0, costUsd: 0 };
      out.set(id, v);
    }
    return v;
  };
  const disputes = await db.select<{ session_id: number; n: number }>(
    `SELECT b.session_id AS session_id, COUNT(*) AS n FROM answer a
     JOIN item i ON i.id = a.item_id JOIN block b ON b.id = i.block_id
     WHERE a.dispute_text IS NOT NULL GROUP BY b.session_id`,
  );
  for (const r of disputes) get(r.session_id).disputes = r.n;
  const defects = await db.select<{ session_id: number; n: number }>(
    `SELECT b.session_id AS session_id, COUNT(*) AS n FROM item i
     JOIN block b ON b.id = i.block_id WHERE i.status = 'defect' GROUP BY b.session_id`,
  );
  for (const r of defects) get(r.session_id).defects = r.n;
  const costs = await db.select<{ session_id: number; cost: number }>(
    'SELECT session_id, SUM(cost_usd) AS cost FROM llm_call WHERE session_id IS NOT NULL GROUP BY session_id',
  );
  for (const r of costs) get(r.session_id).costUsd = r.cost;
  return out;
}

export interface NewBlock {
  kind: BlockKind;
  format: BlockFormat;
  title: string;
  instruction: string;
  formatExample: string | null;
  passage: string | null;
  minutes: number;
}

export interface NewItem {
  prompt: string;
  expected: string;
  paragraph: number | null;
  topicId: number | null;
  ruleId: number | null;
  ruleVersion: number | null;
  ruleSection: string | null;
  spellingWordId: number | null;
  isCheck: boolean;
  status: ItemStatus;
  note: string | null;
  wrong: string | null;
}

export async function getSessionByDate(db: Db, date: ISODate): Promise<{ id: number; status: SessionStatus } | null> {
  const rows = await db.select<{ id: number; status: SessionStatus }>('SELECT id, status FROM session WHERE date = ?', [date]);
  return rows[0] ?? null;
}

/** The most recent generated (ungraded) session dated before `date`. */
export async function getLatestGeneratedBefore(db: Db, date: ISODate): Promise<{ id: number; date: ISODate } | null> {
  const rows = await db.select<{ id: number; date: string }>(
    "SELECT id, date FROM session WHERE status = 'generated' AND date < ? ORDER BY date DESC LIMIT 1",
    [date],
  );
  return rows[0] ?? null;
}

export async function insertDraftSession(
  db: Db,
  s: { date: ISODate; title: string; isLight: boolean; createdAt: string },
): Promise<number> {
  const res = await db.execute(
    "INSERT INTO session (date, title, is_light, status, created_at) VALUES (?, ?, ?, 'draft', ?)",
    [s.date, s.title, s.isLight ? 1 : 0, s.createdAt],
  );
  return res.lastInsertId;
}

export async function insertBlock(db: Db, sessionId: number, ord: number, b: NewBlock, round = 1): Promise<number> {
  const res = await db.execute(
    'INSERT INTO block (session_id, ord, kind, format, title, instruction, format_example, passage, minutes, round) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [sessionId, ord, b.kind, b.format, b.title, b.instruction, b.formatExample, b.passage, b.minutes, round],
  );
  return res.lastInsertId;
}

export async function insertItem(db: Db, blockId: number, ord: number, i: NewItem): Promise<void> {
  await db.execute(
    `INSERT INTO item (block_id, ord, prompt, expected, paragraph, topic_id, rule_id, rule_version, rule_section,
                       spelling_word_id, is_check, status, note, wrong)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [blockId, ord, i.prompt, i.expected, i.paragraph, i.topicId, i.ruleId, i.ruleVersion, i.ruleSection,
      i.spellingWordId, i.isCheck ? 1 : 0, i.status, i.note, i.wrong],
  );
}

export async function setSessionStatus(db: Db, id: number, status: SessionStatus): Promise<void> {
  await db.execute('UPDATE session SET status = ? WHERE id = ?', [status, id]);
}

export async function deleteSession(db: Db, id: number): Promise<void> {
  await db.execute('DELETE FROM session WHERE id = ?', [id]);
}

export async function cleanupDrafts(db: Db): Promise<void> {
  await db.execute("DELETE FROM session WHERE status = 'draft'");
}

export async function markSessionGraded(db: Db, id: number, gradedAt: string): Promise<void> {
  await db.execute("UPDATE session SET status = 'graded', graded_at = ? WHERE id = ?", [gradedAt, id]);
}

export async function getSession(db: Db, id: number): Promise<{ id: number; date: ISODate; status: SessionStatus } | null> {
  const rows = await db.select<{ id: number; date: string; status: SessionStatus }>('SELECT id, date, status FROM session WHERE id = ?', [id]);
  return rows[0] ?? null;
}

export interface GradingItem {
  id: number;
  blockId: number;
  blockOrd: number;
  format: BlockFormat;
  passage: string[] | null;
  ord: number;
  prompt: string;
  expected: string;
  paragraph: number | null;
  topicId: number | null;
  topicKey: string | null;
  ruleId: number | null;
  ruleVersion: number | null;
  ruleSection: string | null;
  ruleBody: string | null;
  spellingWordId: number | null;
  status: ItemStatus;
  wrong: string | null;
  /** The item already has an answer row (an earlier round of a graded session). */
  answered: boolean;
}

/** Every item of a session in display order, with its topic key and the rule body of its stored version. */
export async function listGradingItems(db: Db, sessionId: number): Promise<GradingItem[]> {
  const rows = await db.select<{
    id: number; block_id: number; block_ord: number; format: BlockFormat; passage: string | null; ord: number;
    prompt: string; expected: string; paragraph: number | null; topic_id: number | null; topic_key: string | null;
    rule_id: number | null; rule_version: number | null; rule_section: string | null; rule_body: string | null;
    spelling_word_id: number | null; status: ItemStatus; wrong: string | null; answered: number;
  }>(
    `SELECT i.id AS id, i.block_id AS block_id, b.ord AS block_ord, b.format AS format, b.passage AS passage, i.ord AS ord,
            i.prompt AS prompt, i.expected AS expected, i.paragraph AS paragraph, i.topic_id AS topic_id, t.key AS topic_key,
            i.rule_id AS rule_id, i.rule_version AS rule_version, i.rule_section AS rule_section, rv.body AS rule_body,
            i.spelling_word_id AS spelling_word_id, i.status AS status, i.wrong AS wrong,
            EXISTS (SELECT 1 FROM answer a WHERE a.item_id = i.id) AS answered
     FROM item i JOIN block b ON b.id = i.block_id
     LEFT JOIN topic t ON t.id = i.topic_id
     LEFT JOIN rule_version rv ON rv.rule_id = i.rule_id AND rv.version = i.rule_version
     WHERE b.session_id = ? ORDER BY b.ord, i.ord`,
    [sessionId],
  );
  return rows.map((r) => ({
    id: r.id, blockId: r.block_id, blockOrd: r.block_ord, format: r.format,
    passage: r.passage === null || r.format !== 'spot' ? null : (JSON.parse(r.passage) as string[]), ord: r.ord, prompt: r.prompt,
    expected: r.expected, paragraph: r.paragraph, topicId: r.topic_id, topicKey: r.topic_key, ruleId: r.rule_id,
    ruleVersion: r.rule_version, ruleSection: r.rule_section, ruleBody: r.rule_body, spellingWordId: r.spelling_word_id,
    status: r.status, wrong: r.wrong, answered: r.answered === 1,
  }));
}

const CLOSED_KEPT = 30;

export async function closeSession(db: Db, id: number): Promise<void> {
  const { closedSessions } = await getSettings(db);
  await setSetting(db, 'closedSessions', [...closedSessions.filter((x) => x !== id), id].slice(-CLOSED_KEPT));
}

export async function reopenSession(db: Db, id: number): Promise<void> {
  const { closedSessions } = await getSettings(db);
  if (closedSessions.includes(id)) await setSetting(db, 'closedSessions', closedSessions.filter((x) => x !== id));
}

/** True when an active item of the session (a speaking question aside) has no answer row yet. */
export async function hasOpenItems(db: Db, sessionId: number): Promise<boolean> {
  const rows = await db.select<{ n: number }>(
    `SELECT COUNT(*) AS n FROM item i JOIN block b ON b.id = i.block_id
     WHERE b.session_id = ? AND i.status = 'active' AND b.format != 'question'
       AND NOT EXISTS (SELECT 1 FROM answer a WHERE a.item_id = i.id)`,
    [sessionId],
  );
  return (rows[0]?.n ?? 0) > 0;
}

/** Removes the blocks of one round (items cascade); used to undo a failed extension. */
export async function deleteRound(db: Db, sessionId: number, round: number): Promise<void> {
  await db.execute('DELETE FROM block WHERE session_id = ? AND round = ?', [sessionId, round]);
}
