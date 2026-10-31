import type { Db } from '@/core/ports';

export interface Migration {
  version: number;
  sql: string;
}

/** Split on `;` at end of line; drop `--` comment lines and blank statements. */
export function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let cur: string[] = [];
  for (const line of sql.split('\n')) {
    if (line.trim().startsWith('--')) continue;
    if (line.trimEnd().endsWith(';')) {
      cur.push(line.trimEnd().slice(0, -1));
      const stmt = cur.join('\n').trim();
      if (stmt) out.push(stmt);
      cur = [];
    } else {
      cur.push(line);
    }
  }
  const rest = cur.join('\n').trim();
  if (rest) out.push(rest);
  return out;
}

export async function runMigrations(db: Db, list: Migration[]): Promise<number> {
  await db.execute('CREATE TABLE IF NOT EXISTS meta (schema_version INTEGER NOT NULL)');
  const rows = await db.select<{ schema_version: number }>('SELECT schema_version FROM meta');
  let current = rows[0]?.schema_version ?? 0;
  if (rows.length === 0) await db.execute('INSERT INTO meta (schema_version) VALUES (0)');
  for (const m of [...list].sort((a, b) => a.version - b.version)) {
    if (m.version <= current) continue;
    for (const stmt of splitStatements(m.sql)) await db.execute(stmt);
    await db.execute('UPDATE meta SET schema_version = ?', [m.version]);
    current = m.version;
  }
  return current;
}
