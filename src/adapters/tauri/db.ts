import Database from '@tauri-apps/plugin-sql';
import type { Db } from '@/core/ports';
import { bindParams } from '@/adapters/bind';

export async function openTauriDb(): Promise<Db> {
  const sqlite = await Database.load('sqlite:enlearn.db');
  return {
    async execute(sql, params) {
      const res = await sqlite.execute(sql, bindParams(params));
      return { lastInsertId: res.lastInsertId ?? 0, rowsAffected: res.rowsAffected };
    },
    select<T>(sql: string, params?: unknown[]) {
      return sqlite.select<T[]>(sql, bindParams(params));
    },
  };
}
