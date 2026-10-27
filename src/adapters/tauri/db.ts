import Database from '@tauri-apps/plugin-sql';
import type { Db } from '@/core/ports';
import { bindParams } from '@/adapters/bind';

export type TauriDb = Db & { close(): Promise<void> };

/** Without `dataDir` the file is `enlearn.db` in the plugin's base folder; with it, `<dataDir>/enlearn.db`. */
export async function openTauriDb(dataDir?: string | null): Promise<TauriDb> {
  const sqlite = await Database.load(dataDir ? `sqlite:${dataDir}/enlearn.db` : 'sqlite:enlearn.db');
  return {
    async close() {
      await sqlite.close();
    },
    async execute(sql, params) {
      const res = await sqlite.execute(sql, bindParams(params));
      return { lastInsertId: res.lastInsertId ?? 0, rowsAffected: res.rowsAffected };
    },
    select<T>(sql: string, params?: unknown[]) {
      return sqlite.select<T[]>(sql, bindParams(params));
    },
  };
}
