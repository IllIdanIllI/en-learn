import { describe, expect, test } from 'vitest';
import { createTestDb } from '@/adapters/test/sqliteDb';
import { withJobLock } from '@/core/session/jobLock';

describe('withJobLock', () => {
  test('a second job on the same db gets the busy value while the first runs; the lock is released afterwards', async () => {
    const db = await createTestDb();
    let release!: () => void;
    const first = withJobLock(db, () => new Promise<string>((r) => (release = () => r('first'))), 'busy');
    expect(await withJobLock(db, async () => 'second', 'busy')).toBe('busy');
    release();
    expect(await first).toBe('first');
    expect(await withJobLock(db, async () => 'third', 'busy')).toBe('third');
  });

  test('the lock is released when the job throws; another db is independent', async () => {
    const db = await createTestDb();
    await expect(withJobLock(db, async () => { throw new Error('boom'); }, 'busy')).rejects.toThrow('boom');
    expect(await withJobLock(db, async () => 'after', 'busy')).toBe('after');
    let release!: () => void;
    const held = withJobLock(db, () => new Promise<string>((r) => (release = () => r('x'))), 'busy');
    expect(await withJobLock(await createTestDb(), async () => 'other', 'busy')).toBe('other');
    release();
    await held;
  });
});
