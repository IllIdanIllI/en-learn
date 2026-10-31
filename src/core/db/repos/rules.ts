import type { Db } from '@/core/ports';
import type { ISODate, Topic, TopicKind } from '@/core/domain';
import type { Source } from '@/core/llm/types';

export interface RuleListRow {
  ruleId: number;
  topic: Topic;
  version: number;
  updatedAt: string;
}

export async function listRules(db: Db): Promise<RuleListRow[]> {
  const rows = await db.select<{
    rule_id: number;
    version: number;
    updated_at: string;
    topic_id: number;
    key: string;
    title: string;
    kind: TopicKind;
    week_no: number | null;
    archived: number;
  }>(
    `SELECT r.id AS rule_id, r.current_version AS version, v.created_at AS updated_at,
            t.id AS topic_id, t.key AS key, t.title AS title, t.kind AS kind, t.week_no AS week_no, t.archived AS archived
     FROM rule r
     JOIN rule_version v ON v.rule_id = r.id AND v.version = r.current_version
     JOIN topic t ON t.id = r.topic_id
     ORDER BY t.week_no IS NULL, t.week_no, t.title`,
  );
  return rows.map((r) => ({
    ruleId: r.rule_id,
    topic: { id: r.topic_id, key: r.key, title: r.title, kind: r.kind, weekNo: r.week_no, archived: r.archived === 1 },
    version: r.version,
    updatedAt: r.updated_at,
  }));
}

/** Current version when `version` is omitted. Throws `Rule not found` for an unknown rule or version. */
export async function getRule(
  db: Db,
  ruleId: number,
  version?: number,
): Promise<{ body: string; sources: Source[]; version: number }> {
  const rows = await db.select<{ body: string; sources: string; version: number }>(
    version === undefined
      ? `SELECT v.body AS body, v.sources AS sources, v.version AS version
         FROM rule r JOIN rule_version v ON v.rule_id = r.id AND v.version = r.current_version
         WHERE r.id = ?`
      : `SELECT v.body AS body, v.sources AS sources, v.version AS version
         FROM rule r JOIN rule_version v ON v.rule_id = r.id
         WHERE r.id = ? AND v.version = ?`,
    version === undefined ? [ruleId] : [ruleId, version],
  );
  const r = rows[0];
  if (!r) throw new Error('Rule not found');
  return { body: r.body, sources: JSON.parse(r.sources) as Source[], version: r.version };
}

/** Title of the topic a rule belongs to; empty for an unknown rule. */
export async function getRuleTopicTitle(db: Db, ruleId: number): Promise<string> {
  const rows = await db.select<{ title: string }>(
    'SELECT t.title AS title FROM rule r JOIN topic t ON t.id = r.topic_id WHERE r.id = ?',
    [ruleId],
  );
  return rows[0]?.title ?? '';
}

export async function ruleHistory(db: Db, ruleId: number): Promise<{ version: number; reason: string; createdAt: string }[]> {
  const rows = await db.select<{ version: number; reason: string; created_at: string }>(
    'SELECT version, reason, created_at FROM rule_version WHERE rule_id = ? ORDER BY version DESC',
    [ruleId],
  );
  return rows.map((r) => ({ version: r.version, reason: r.reason, createdAt: r.created_at }));
}

/** Appends a version (current + 1, or 1 for a new rule) and makes it current. Creates the rule on first save. */
export async function saveRuleVersion(
  db: Db,
  target: { topicId: number } | { ruleId: number },
  body: string,
  sources: Source[],
  reason: string,
  now: ISODate,
): Promise<{ ruleId: number; version: number }> {
  let ruleId: number;
  let current: number;
  if ('ruleId' in target) {
    const rows = await db.select<{ id: number; current_version: number }>(
      'SELECT id, current_version FROM rule WHERE id = ?',
      [target.ruleId],
    );
    if (!rows[0]) throw new Error('Rule not found');
    ruleId = rows[0].id;
    current = rows[0].current_version;
  } else {
    const rows = await db.select<{ id: number; current_version: number }>(
      'SELECT id, current_version FROM rule WHERE topic_id = ?',
      [target.topicId],
    );
    if (rows[0]) {
      ruleId = rows[0].id;
      current = rows[0].current_version;
    } else {
      ruleId = (await db.execute('INSERT INTO rule (topic_id, current_version) VALUES (?, 0)', [target.topicId])).lastInsertId;
      current = 0;
    }
  }
  const version = current + 1;
  await db.execute(
    'INSERT INTO rule_version (rule_id, version, body, sources, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [ruleId, version, body, JSON.stringify(sources), reason, now],
  );
  await db.execute('UPDATE rule SET current_version = ? WHERE id = ?', [version, ruleId]);
  return { ruleId, version };
}
