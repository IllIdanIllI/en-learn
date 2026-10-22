import type { Db } from '@/core/ports';
import type { ISODate, Programme, Slot, Topic, TopicKind } from '@/core/domain';

export async function getProgramme(db: Db): Promise<Programme | null> {
  const rows = await db.select<{ id: number; title: string; start_date: ISODate; end_date: ISODate }>(
    'SELECT id, title, start_date, end_date FROM programme ORDER BY id LIMIT 1',
  );
  const r = rows[0];
  return r ? { id: r.id, title: r.title, startDate: r.start_date, endDate: r.end_date } : null;
}

export async function getTopics(db: Db): Promise<Topic[]> {
  const rows = await db.select<{ id: number; key: string; title: string; kind: TopicKind; week_no: number | null; archived: number }>(
    'SELECT id, key, title, kind, week_no, archived FROM topic ORDER BY id',
  );
  return rows.map((r) => ({ id: r.id, key: r.key, title: r.title, kind: r.kind, weekNo: r.week_no, archived: r.archived === 1 }));
}

export async function getSlots(db: Db): Promise<Record<number, Slot>> {
  const rows = await db.select<{ weekday: number; slot: Slot }>('SELECT weekday, slot FROM weekday_slot');
  const out: Record<number, Slot> = {};
  for (const r of rows) out[r.weekday] = r.slot;
  return out;
}

export async function topicHasRule(db: Db, topicId: number): Promise<boolean> {
  const rows = await db.select<{ id: number }>('SELECT id FROM rule WHERE topic_id = ?', [topicId]);
  return rows.length > 0;
}

export interface RuleRecord { ruleId: number; topicId: number; version: number; body: string }

/** Current version of every rule, keyed by topic id. */
export async function getCurrentRules(db: Db): Promise<Map<number, RuleRecord>> {
  const rows = await db.select<{ rule_id: number; topic_id: number; version: number; body: string }>(
    `SELECT r.id AS rule_id, r.topic_id AS topic_id, r.current_version AS version, v.body AS body
     FROM rule r JOIN rule_version v ON v.rule_id = r.id AND v.version = r.current_version`,
  );
  return new Map(rows.map((r) => [r.topic_id, { ruleId: r.rule_id, topicId: r.topic_id, version: r.version, body: r.body }]));
}
