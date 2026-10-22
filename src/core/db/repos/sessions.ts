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
