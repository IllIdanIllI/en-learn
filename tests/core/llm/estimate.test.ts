import { describe, expect, test } from 'vitest';
import { createTestDb } from '@/adapters/test/sqliteDb';
import type { Db } from '@/core/ports';
import type { LlmKind } from '@/core/domain';
import { insertLlmCall } from '@/core/db/repos/llmCalls';
import { estimateMs } from '@/core/llm/estimate';

/** Calls are stored oldest first; `created_at` is zero-padded so the order is the call order. */
async function calls(db: Db, kind: LlmKind, durations: [number, boolean?][]) {
  for (const [i, [durationMs, ok = true]] of durations.entries()) {
    await insertLlmCall(db, {
      sessionId: null, kind, model: 'm', costUsd: 0, durationMs, ok, error: null, response: null,
      createdAt: `2026-10-27T10:00:${String(i).padStart(2, '0')}.000Z`,
    });
  }
}

describe('estimateMs', () => {
  test('is the median of the successful durations of a kind', async () => {
    const db = await createTestDb();
    await calls(db, 'grade', [[10], [30], [20]]);
    expect(await estimateMs(db, ['grade'])).toBe(20);
  });

  test('uses only the last five successful calls of a kind', async () => {
    const db = await createTestDb();
    await calls(db, 'grade', [[1000], [10], [20], [30], [40], [50]]);
    expect(await estimateMs(db, ['grade'])).toBe(30);
  });

  test('ignores failed calls', async () => {
    const db = await createTestDb();
    await calls(db, 'grade', [[10], [20], [30], [99999, false]]);
    expect(await estimateMs(db, ['grade'])).toBe(20);
  });

  test('sums the medians of the kinds of a job', async () => {
    const db = await createTestDb();
    await calls(db, 'generate_session', [[100], [300], [200]]);
    await calls(db, 'validate_session', [[5], [15]]);
    expect(await estimateMs(db, ['generate_session', 'validate_session'])).toBe(210);
  });

  test('is null without history for a kind, even when the other kind has some', async () => {
    const db = await createTestDb();
    await calls(db, 'generate_session', [[100]]);
    await calls(db, 'validate_session', [[5, false]]);
    expect(await estimateMs(db, ['generate_session', 'validate_session'])).toBeNull();
    expect(await estimateMs(db, ['grade'])).toBeNull();
  });
});
