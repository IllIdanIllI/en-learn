import type { Db } from '@/core/ports';
import type { BlockFormat, BlockKind, ISODate, ItemStatus, SessionStatus } from '@/core/domain';

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
}

export async function getSessionByDate(db: Db, date: ISODate): Promise<{ id: number; status: SessionStatus } | null> {
  const rows = await db.select<{ id: number; status: SessionStatus }>('SELECT id, status FROM session WHERE date = ?', [date]);
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

export async function insertBlock(db: Db, sessionId: number, ord: number, b: NewBlock): Promise<number> {
  const res = await db.execute(
    'INSERT INTO block (session_id, ord, kind, format, title, instruction, format_example, passage, minutes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [sessionId, ord, b.kind, b.format, b.title, b.instruction, b.formatExample, b.passage, b.minutes],
  );
  return res.lastInsertId;
}

export async function insertItem(db: Db, blockId: number, ord: number, i: NewItem): Promise<void> {
  await db.execute(
    `INSERT INTO item (block_id, ord, prompt, expected, paragraph, topic_id, rule_id, rule_version, rule_section,
                       spelling_word_id, is_check, status, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [blockId, ord, i.prompt, i.expected, i.paragraph, i.topicId, i.ruleId, i.ruleVersion, i.ruleSection,
      i.spellingWordId, i.isCheck ? 1 : 0, i.status, i.note],
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
}

/** Every item of a session in display order, with its topic key and the rule body of its stored version. */
export async function listGradingItems(db: Db, sessionId: number): Promise<GradingItem[]> {
  const rows = await db.select<{
    id: number; block_id: number; block_ord: number; format: BlockFormat; passage: string | null; ord: number;
    prompt: string; expected: string; paragraph: number | null; topic_id: number | null; topic_key: string | null;
    rule_id: number | null; rule_version: number | null; rule_section: string | null; rule_body: string | null;
    spelling_word_id: number | null; status: ItemStatus;
  }>(
    `SELECT i.id AS id, i.block_id AS block_id, b.ord AS block_ord, b.format AS format, b.passage AS passage, i.ord AS ord,
            i.prompt AS prompt, i.expected AS expected, i.paragraph AS paragraph, i.topic_id AS topic_id, t.key AS topic_key,
            i.rule_id AS rule_id, i.rule_version AS rule_version, i.rule_section AS rule_section, rv.body AS rule_body,
            i.spelling_word_id AS spelling_word_id, i.status AS status
     FROM item i JOIN block b ON b.id = i.block_id
     LEFT JOIN topic t ON t.id = i.topic_id
     LEFT JOIN rule_version rv ON rv.rule_id = i.rule_id AND rv.version = i.rule_version
     WHERE b.session_id = ? ORDER BY b.ord, i.ord`,
    [sessionId],
  );
  return rows.map((r) => ({
    id: r.id, blockId: r.block_id, blockOrd: r.block_ord, format: r.format,
    passage: r.passage === null ? null : (JSON.parse(r.passage) as string[]), ord: r.ord, prompt: r.prompt,
    expected: r.expected, paragraph: r.paragraph, topicId: r.topic_id, topicKey: r.topic_key, ruleId: r.rule_id,
    ruleVersion: r.rule_version, ruleSection: r.rule_section, ruleBody: r.rule_body, spellingWordId: r.spelling_word_id,
    status: r.status,
  }));
}
