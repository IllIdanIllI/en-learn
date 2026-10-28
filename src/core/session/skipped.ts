import type { ISODate } from '@/core/domain';
import type { Db, Deps } from '@/core/ports';
import { addDays } from '@/core/dates';
import { countSkippedBySession, deleteSkippedAnswers } from '@/core/db/repos/answers';

/** The graded session of yesterday (first) or today with skipped gap, fix or spelling items, if any. */
export async function skippedToSolve(deps: Deps): Promise<{ sessionId: number; date: ISODate; count: number } | null> {
  const today = deps.clock.today();
  const found = await countSkippedBySession(deps.db, addDays(today, -1), today);
  return found[0] ?? null;
}

/** Makes the skipped items of a session unanswered again; returns how many were cleared. */
export function reopenSkipped(db: Db, sessionId: number): Promise<number> {
  return deleteSkippedAnswers(db, sessionId);
}
