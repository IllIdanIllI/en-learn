import type { Db } from '@/core/ports';
import type { LlmKind } from '@/core/domain';

export interface LlmCallRecord {
  sessionId: number | null;
  kind: LlmKind;
  model: string;
  costUsd: number;
  durationMs: number;
  ok: boolean;
  error: string | null;
  response: string | null;
  createdAt: string;
}

export async function insertLlmCall(db: Db, r: LlmCallRecord): Promise<number> {
  const res = await db.execute(
    'INSERT INTO llm_call (session_id, kind, model, cost_usd, duration_ms, ok, error, response, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [r.sessionId, r.kind, r.model, r.costUsd, r.durationMs, r.ok ? 1 : 0, r.error, r.response, r.createdAt],
  );
  return res.lastInsertId;
}
