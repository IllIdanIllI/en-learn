import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import type { Db } from '@/core/ports';
import { bindParams } from '@/adapters/bind';

/** In-memory SQLite in the browser, for preview mode only. */
export async function createSqlJsDb(): Promise<Db> {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const sqlite = new SQL.Database();
  sqlite.run('PRAGMA foreign_keys = ON');
  return {
    async execute(sql, params) {
      // Without params `run` executes every statement (multi-statement migrations); with params it runs one.
      if (params === undefined || params.length === 0) sqlite.run(sql);
      else sqlite.run(sql, bindParams(params) as never);
      const id = sqlite.exec('SELECT last_insert_rowid()')[0]?.values[0]?.[0];
      return { lastInsertId: Number(id ?? 0), rowsAffected: sqlite.getRowsModified() };
    },
    async select<T>(sql: string, params?: unknown[]) {
      const stmt = sqlite.prepare(sql);
      try {
        stmt.bind(bindParams(params) as never);
        const rows: T[] = [];
        while (stmt.step()) rows.push(stmt.getAsObject() as T);
        return rows;
      } finally {
        stmt.free();
      }
    },
  };
}
