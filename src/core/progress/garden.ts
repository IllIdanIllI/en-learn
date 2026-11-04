import type { Db } from '@/core/ports';
import type { ISODate } from '@/core/domain';
import { addDays } from '@/core/dates';
import { getSessionByDate } from '@/core/db/repos/sessions';
import { getSettings } from '@/core/db/repos/settings';
import { loadProgressLog } from './history';

export const FIREFLY_MAX = 12;

/** Sidebar garden: fireflies from yesterday's correct answers, and whether today's lesson is closed. */
export async function loadGardenState(db: Db, today: ISODate): Promise<{ fireflies: number; todayClosed: boolean }> {
  const yesterday = addDays(today, -1);
  const [log, todaySession, settings] = await Promise.all([loadProgressLog(db), getSessionByDate(db, today), getSettings(db)]);
  const correct = log
    .filter((r) => r.date === yesterday)
    .reduce((sum, r) => sum + r.scores.reduce((n, s) => n + s.correct, 0), 0);
  const todayClosed =
    todaySession !== null && todaySession.status === 'graded' && settings.closedSessions.includes(todaySession.id);
  return { fireflies: Math.min(correct, FIREFLY_MAX), todayClosed };
}
