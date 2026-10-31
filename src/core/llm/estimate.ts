import type { Db } from '@/core/ports';
import type { LlmKind } from '@/core/domain';
import { recentOkDurations } from '@/core/db/repos/llmCalls';

const SAMPLE = 5;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Expected wait of a job made of these calls: per kind, the median of its last successful calls, summed. Null if a kind has no history. */
export async function estimateMs(db: Db, kinds: LlmKind[]): Promise<number | null> {
  let total = 0;
  for (const kind of kinds) {
    const durations = await recentOkDurations(db, kind, SAMPLE);
    if (durations.length === 0) return null;
    total += median(durations);
  }
  return total;
}
