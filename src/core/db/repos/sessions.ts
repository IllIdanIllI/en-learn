import type { Db } from '@/core/ports';
import type { ISODate } from '@/core/domain';

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
