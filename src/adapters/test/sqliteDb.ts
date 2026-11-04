import Database from 'better-sqlite3';
import type { Db } from '@/core/ports';
import { runMigrations } from '@/core/db/migrate';
import { migrations } from '@/core/db/migrations';

function bind(params: unknown[] = []): unknown[] {
  return params.map((p) => (typeof p === 'boolean' ? (p ? 1 : 0) : p === undefined ? null : p));
}

/** Wraps a better-sqlite3 connection in the Db port. Multi-statement SQL without params runs via exec. */
export function wrapSqlite(sqlite: Database.Database): Db {
  return {
    async execute(sql, params) {
      if (!params?.length && sql.replace(/;\s*$/, '').includes(';')) {
        sqlite.exec(sql);
        return { lastInsertId: 0, rowsAffected: 0 };
      }
      const info = sqlite.prepare(sql).run(...bind(params));
      return { lastInsertId: Number(info.lastInsertRowid), rowsAffected: info.changes };
    },
    async select<T>(sql: string, params?: unknown[]) {
      return sqlite.prepare(sql).all(...bind(params)) as T[];
    },
  };
}

export async function createTestDb(): Promise<Db> {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = wrapSqlite(sqlite);
  await runMigrations(db, migrations);
  return db;
}
