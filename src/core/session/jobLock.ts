import type { Db } from '@/core/ports';

const running = new WeakSet<Db>();

/** Runs `job` unless another job holds the lock of this database; then `busy` is returned and the job is not started. */
export async function withJobLock<T>(db: Db, job: () => Promise<T>, busy: T): Promise<T> {
  if (running.has(db)) return busy;
  running.add(db);
  try {
    return await job();
  } finally {
    running.delete(db);
  }
}
