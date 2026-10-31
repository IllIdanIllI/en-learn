/**
 * Node harness shared by `yarn smoke` and `yarn eval`: the real `claude` binary behind the app's `Llm` port, a
 * temp better-sqlite3 database with the app's migrations, prompts read from disk and the seed programme.
 * Disk reads replace `import.meta.glob`, which does not exist under tsx.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { Clock, Db, Llm, LlmRequest, LlmResult, ProcessRunner, PromptStore } from '@/core/ports';
import type { LlmKind } from '@/core/domain';
import { buildClaudeArgs } from '@/core/llm/claude';
import { failedRun, parseEnvelope } from '@/core/llm/envelope';
import { runMigrations } from '@/core/db/migrate';
import { setSetting } from '@/core/db/repos/settings';
import { insertSeedRules, parseSeed, saveProgramme } from '@/core/programme/setup';

export const ROOT = path.resolve(import.meta.dirname, '../..');

export const processRunner: ProcessRunner = {
  run(_scope, args, opts) {
    return new Promise((resolve, reject) => {
      const child = spawn('claude', args, { cwd: opts.cwd, env: { ...process.env, ...opts.env }, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, opts.timeoutMs);
      child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      child.on('error', (e) => { clearTimeout(timer); reject(e); });
      child.on('close', (code) => { clearTimeout(timer); resolve({ code, stdout, stderr, timedOut }); });
    });
  },
};

export class NodeClaudeCli implements Llm {
  constructor(private readonly cwd: string) {}
  async call(req: LlmRequest): Promise<LlmResult<unknown>> {
    const started = Date.now();
    const res = await processRunner.run('claude', buildClaudeArgs(req), { cwd: this.cwd, timeoutMs: req.timeoutMs });
    const durationMs = Date.now() - started;
    if (res.timedOut) return { ok: false, code: 'timeout', message: `Timed out after ${req.timeoutMs} ms`, costUsd: 0, durationMs, raw: res.stdout };
    const failed = failedRun(res);
    if (failed) {
      return { ok: false, code: failed.code, message: failed.message, costUsd: 0, durationMs, raw: res.stdout };
    }
    const p = parseEnvelope(res.stdout);
    return p.ok
      ? { ok: true, data: p.data, costUsd: p.costUsd, durationMs, raw: res.stdout }
      : { ok: false, code: p.code, message: p.message, costUsd: p.costUsd, durationMs, raw: res.stdout };
  }
}

/** A fresh empty working directory for one run: `claude` must not pick up this repository's CLAUDE.md. */
export function tempCwd(prefix: string): string {
  return mkdtempSync(path.join(tmpdir(), `${prefix}-`));
}

export const diskPrompts: PromptStore = {
  async load(kind: LlmKind) {
    const base = path.join(ROOT, 'prompts', kind);
    return { system: readFileSync(`${base}.md`, 'utf8'), schema: JSON.parse(readFileSync(`${base}.schema.json`, 'utf8')) as object };
  },
};

/** Same as src/adapters/test/sqliteDb.ts, but reads the SQL files from disk. */
export async function openDb(): Promise<Db> {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const bind = (params: unknown[] = []) => params.map((p) => (typeof p === 'boolean' ? (p ? 1 : 0) : p === undefined ? null : p));
  const db: Db = {
    async execute(sql, params) {
      const info = sqlite.prepare(sql).run(...bind(params));
      return { lastInsertId: Number(info.lastInsertRowid), rowsAffected: info.changes };
    },
    async select<T>(sql: string, params?: unknown[]) {
      return sqlite.prepare(sql).all(...bind(params)) as T[];
    },
  };
  const dir = path.join(ROOT, 'src/db/migrations');
  const list = readdirSync(dir).filter((f) => f.endsWith('.sql')).map((f) => ({
    version: Number(/^(\d+)/.exec(f)?.[1]), sql: readFileSync(path.join(dir, f), 'utf8'),
  }));
  await runMigrations(db, list);
  return db;
}

/**
 * A database with the seed programme and rules, every LLM kind set to `model`. Programme week 1 starts on the
 * first Monday on or after `seedToday`. `noticeWeek` turns that programme week into a "notice" topic.
 */
export async function seededDb(opts: { model: string; clock: Clock; seedToday: string; noticeWeek?: number }): Promise<Db> {
  const db = await openDb();
  const rules: Record<string, string> = {};
  const rulesDir = path.join(ROOT, 'seed/rules');
  for (const f of readdirSync(rulesDir)) rules[f] = readFileSync(path.join(rulesDir, f), 'utf8');
  const programme = JSON.parse(readFileSync(path.join(ROOT, 'seed/programme.json'), 'utf8')) as { weeks: { kind: string }[] };
  if (opts.noticeWeek !== undefined) {
    const week = programme.weeks[opts.noticeWeek - 1];
    if (!week) throw new Error(`No programme week ${opts.noticeWeek}`);
    week.kind = 'notice';
  }
  const seed = parseSeed({ programme: JSON.stringify(programme), rules }, opts.seedToday);
  await saveProgramme(db, seed.programme);
  await insertSeedRules(db, seed.rules, opts.clock.now());
  const m = opts.model;
  await setSetting(db, 'models', { rule_draft: m, rule_chat: m, generate_session: m, validate_session: m, grade: m, dispute: m });
  return db;
}

export interface RecordedCall { kind: LlmKind; res: LlmResult<unknown> }

/** Remembers every response, in order, next to the call that produced it. */
export class RecordingLlm implements Llm {
  calls: RecordedCall[] = [];
  constructor(private readonly inner: Llm) {}
  async call(req: LlmRequest): Promise<LlmResult<unknown>> {
    const res = await this.inner.call(req);
    this.calls.push({ kind: req.kind, res });
    return res;
  }
  /** The data of the latest successful call of a kind, if any. */
  lastData<T>(kind: LlmKind): T | null {
    for (let i = this.calls.length - 1; i >= 0; i--) {
      const c = this.calls[i]!;
      if (c.kind === kind && c.res.ok) return c.res.data as T;
    }
    return null;
  }
}
