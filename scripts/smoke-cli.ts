/**
 * Real-CLI smoke test: generate_session, validate_session and grade against the seed programme with the real
 * `claude` binary from PATH. Run with `yarn smoke`. Spends a few cents with claude-haiku-5-5.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { FixedClock } from '@/adapters/test/fixedClock';
import type { Db, Deps, Llm, LlmRequest, LlmResult, ProcessRunner, PromptStore } from '@/core/ports';
import type { LlmKind } from '@/core/domain';
import { buildClaudeArgs } from '@/core/llm/claude';
import { parseEnvelope } from '@/core/llm/envelope';
import { runMigrations } from '@/core/db/migrate';
import { setSetting } from '@/core/db/repos/settings';
import { listGradingItems } from '@/core/db/repos/sessions';
import { insertSeedRules, parseSeed, saveProgramme } from '@/core/programme/setup';
import { buildGenerationContext } from '@/core/session/context';
import { checkContext } from '@/core/session/validation';
import { checkGenerated } from '@/core/validate/taskChecks';
import type { GeneratedSession } from '@/core/llm/types';
import { generateSession } from '@/core/session/generate';
import { gradeSession } from '@/core/grading/grade';

const ROOT = path.resolve(import.meta.dirname, '..');
const MODEL = 'claude-haiku-5-5';
const SEED_TODAY = '2026-10-26'; // Monday: programme week 1 starts here
const DATE = '2026-10-27'; // Tuesday of week 1: slot "topic"

const runner: ProcessRunner = {
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

class NodeClaudeCli implements Llm {
  constructor(private readonly cwd: string) {}
  async call(req: LlmRequest): Promise<LlmResult<unknown>> {
    const started = Date.now();
    const res = await runner.run('claude', buildClaudeArgs(req), { cwd: this.cwd, timeoutMs: req.timeoutMs });
    const durationMs = Date.now() - started;
    if (res.timedOut) return { ok: false, code: 'timeout', message: `Timed out after ${req.timeoutMs} ms`, costUsd: 0, durationMs, raw: res.stdout };
    if (res.stdout.trim() === '' && res.code !== 0) {
      return { ok: false, code: 'cli_error', message: res.stderr || `exit ${res.code}`, costUsd: 0, durationMs, raw: res.stdout };
    }
    const p = parseEnvelope(res.stdout);
    return p.ok
      ? { ok: true, data: p.data, costUsd: p.costUsd, durationMs, raw: res.stdout }
      : { ok: false, code: p.code, message: p.message, costUsd: p.costUsd, durationMs, raw: res.stdout };
  }
}

const prompts: PromptStore = {
  async load(kind: LlmKind) {
    const base = path.join(ROOT, 'prompts', kind);
    return { system: readFileSync(`${base}.md`, 'utf8'), schema: JSON.parse(readFileSync(`${base}.schema.json`, 'utf8')) as object };
  },
};

/** Same as src/adapters/test/sqliteDb.ts, but reads the SQL files from disk: `import.meta.glob` does not exist under tsx. */
async function openDb(): Promise<Db> {
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

/** Remembers the last generate_session payload so the code checks can be re-run on it for the report. */
class Recording implements Llm {
  lastGenerated: GeneratedSession | null = null;
  constructor(private readonly inner: Llm) {}
  async call(req: LlmRequest): Promise<LlmResult<unknown>> {
    const res = await this.inner.call(req);
    if (res.ok && req.kind === 'generate_session') this.lastGenerated = res.data as GeneratedSession;
    return res;
  }
}

async function main(): Promise<void> {
  const db = await openDb();
  const clock = new FixedClock(DATE);
  const rules: Record<string, string> = {};
  const rulesDir = path.join(ROOT, 'seed/rules');
  for (const f of readdirSync(rulesDir)) rules[f] = readFileSync(path.join(rulesDir, f), 'utf8');
  const seed = parseSeed({ programme: readFileSync(path.join(ROOT, 'seed/programme.json'), 'utf8'), rules }, SEED_TODAY);
  await saveProgramme(db, seed.programme);
  await insertSeedRules(db, seed.rules, clock.now());
  await setSetting(db, 'models', { rule_draft: MODEL, generate_session: MODEL, validate_session: MODEL, grade: MODEL, dispute: MODEL });
  const llm = new Recording(new NodeClaudeCli(mkdtempSync(path.join(tmpdir(), 'enlearn-smoke-'))));
  const deps: Deps = { db, llm, clock, prompts };

  const gen = await generateSession(deps, { light: false });
  console.log('generate_session + validate_session ok:', gen.ok, gen.ok ? `sessionId=${gen.sessionId}` : gen.message);
  if (!gen.ok) { await report(db, false); return; }

  if (llm.lastGenerated) {
    const ctx = await buildGenerationContext(deps, DATE, false);
    console.log('checkGenerated:', JSON.stringify(checkGenerated(llm.lastGenerated, checkContext(ctx))));
  }
  const items = await listGradingItems(db, gen.sessionId);
  const counts: Record<string, number> = {};
  for (const i of items) counts[`${i.format}/${i.status}`] = (counts[`${i.format}/${i.status}`] ?? 0) + 1;
  console.log('item counts:', JSON.stringify(counts), 'total', items.length);

  // Half the items get the expected answer (a "✓" key is typed as "✓"), the rest a wrong one.
  const answers: Record<number, string> = {};
  items.filter((i) => i.status === 'active' && i.format !== 'spot' && i.format !== 'question')
    .forEach((it, n) => { answers[it.id] = n % 2 === 0 ? it.expected : 'wrongword'; });
  const out = await gradeSession(deps, gen.sessionId, { items: answers, spot: {} }, []);
  console.log('grade ok:', out.kind === 'graded', out.kind === 'error' ? out.message : out.kind === 'questions' ? JSON.stringify(out.questions) : '');
  await report(db, out.kind === 'graded');
}

async function report(db: Db, graded: boolean): Promise<void> {
  const calls = await db.select<{ kind: string; ok: number; error: string | null; cost_usd: number }>('SELECT kind, ok, error, cost_usd FROM llm_call ORDER BY id');
  for (const c of calls) console.log(`llm_call ${c.kind}: ok=${c.ok === 1}${c.error ? ` error=${c.error}` : ''} cost=${c.cost_usd}`);
  const verdicts = await db.select<{ verdict: string | null; n: number }>('SELECT verdict, COUNT(*) AS n FROM answer GROUP BY verdict');
  console.log('grade verdicts:', verdicts.map((v) => `${v.verdict}=${v.n}`).join(', ') || 'none');
  console.log('total cost USD:', calls.reduce((s, c) => s + c.cost_usd, 0).toFixed(5));
  process.exitCode = graded ? 0 : 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
