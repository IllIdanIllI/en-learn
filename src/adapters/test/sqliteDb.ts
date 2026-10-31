import Database from 'better-sqlite3';
import type { Db } from '@/core/ports';
import { runMigrations } from '@/core/db/migrate';
import { migrations } from '@/core/db/migrations';

function bind(params: unknown[] = []): unknown[] {
  return params.map((p) => (typeof p === 'boolean' ? (p ? 1 : 0) : p === undefined ? null : p));
}

export async function createTestDb(): Promise<Db> {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db: Db = {
    async execute(sql, params) {
      const info = sqlite.prepare(sql).run(...bind(params));
      return { lastInsertId: Number(info.lastInsertRowid), rowsAffected: info.changes };
    },
    async select<T>(sql: string, params?: unknown[]) {
      return sqlite.prepare(sql).all(...bind(params)) as T[];
    },
  };
  await runMigrations(db, migrations);
  return db;
}
