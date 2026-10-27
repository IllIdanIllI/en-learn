import { copyFile, exists, mkdir, readDir, readTextFile, remove, stat, writeTextFile } from '@tauri-apps/plugin-fs';
import { MoveRefused, planMove } from '@/core/dataFolder';

const DB_FILES = ['enlearn.db', 'enlearn.db-wal', 'enlearn.db-shm'];

/** Where the files live now. With no custom folder the DB is in appConfigDir (plugin-sql's base) and prompts in appDataDir. */
export interface DataLocation {
  appDataDir: string;
  appConfigDir: string;
  custom: string | null;
}

export async function readDataDir(appDataDir: string): Promise<string | null> {
  const file = `${appDataDir}/location.json`;
  if (!(await exists(file))) return null;
  const parsed = JSON.parse(await readTextFile(file)) as { dataDir?: unknown };
  return typeof parsed.dataDir === 'string' && parsed.dataDir !== '' ? parsed.dataDir : null;
}

async function listFiles(dir: string, rel: string): Promise<string[]> {
  if (!(await exists(dir))) return [];
  const out: string[] = [];
  for (const e of await readDir(dir)) {
    if (e.isDirectory) out.push(...(await listFiles(`${dir}/${e.name}`, `${rel}/${e.name}`)));
    else if (e.isFile) out.push(`${rel}/${e.name}`);
  }
  return out;
}

/** Copy, verify sizes, write location.json, remove the old files. The caller reloads on success; on failure the old folder is still in use. */
export async function moveDataDir(cur: DataLocation, target: string, closeDb: () => Promise<void>): Promise<void> {
  const dbBase = cur.custom ?? cur.appConfigDir;
  const promptsBase = cur.custom ?? cur.appDataDir;
  const present: string[] = [];
  for (const f of DB_FILES) if (await exists(`${dbBase}/${f}`)) present.push(f);
  present.push(...(await listFiles(`${promptsBase}/prompts`, 'prompts')));

  const plan = planMove(promptsBase, target, present, await exists(`${target}/enlearn.db`));
  if (!plan.ok) throw new MoveRefused(plan.reason);

  await closeDb();
  const made: string[] = [];
  try {
    await mkdir(target, { recursive: true });
    for (const c of plan.copies) {
      const rel = c.from.slice(promptsBase.length + 1);
      const from = `${rel.startsWith('prompts/') ? promptsBase : dbBase}/${rel}`;
      await mkdir(c.to.replace(/\/[^/]*$/, ''), { recursive: true });
      await copyFile(from, c.to);
      made.push(c.to);
      if ((await stat(from)).size !== (await stat(c.to)).size) throw new Error(`size mismatch: ${rel}`);
    }
    await writeTextFile(`${cur.appDataDir}/location.json`, JSON.stringify({ dataDir: target }));
  } catch (e) {
    for (const p of made) await remove(p).catch(() => undefined);
    throw e;
  }

  // The move is done; leftovers in the old folder are not an error.
  for (const f of DB_FILES) if (await exists(`${dbBase}/${f}`)) await remove(`${dbBase}/${f}`).catch(() => undefined);
  if (await exists(`${promptsBase}/prompts`)) await remove(`${promptsBase}/prompts`, { recursive: true }).catch(() => undefined);
}
