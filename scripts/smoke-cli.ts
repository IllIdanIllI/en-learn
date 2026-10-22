/**
 * Real-CLI smoke test: generate_session, validate_session and grade against the seed programme with the real
 * `claude` binary from PATH. Run with `yarn smoke`. Spends a few cents with claude-haiku-5-5.
 */
import { FixedClock } from '@/adapters/test/fixedClock';
import type { Db, Deps } from '@/core/ports';
import { listGradingItems } from '@/core/db/repos/sessions';
import { buildGenerationContext } from '@/core/session/context';
import { checkContext } from '@/core/session/validation';
import { checkGenerated } from '@/core/validate/taskChecks';
import type { GeneratedSession } from '@/core/llm/types';
import { generateSession } from '@/core/session/generate';
import { gradeSession } from '@/core/grading/grade';
import { diskPrompts, NodeClaudeCli, RecordingLlm, seededDb, tempCwd } from './lib/nodeHarness';

const MODEL = 'claude-haiku-5-5';
const SEED_TODAY = '2026-10-26'; // Monday: programme week 1 starts here
const DATE = '2026-10-27'; // Tuesday of week 1: slot "topic"

async function main(): Promise<void> {
  const clock = new FixedClock(DATE);
  const db = await seededDb({ model: MODEL, clock, seedToday: SEED_TODAY });
  const llm = new RecordingLlm(new NodeClaudeCli(tempCwd('enlearn-smoke')));
  const deps: Deps = { db, llm, clock, prompts: diskPrompts };

  const gen = await generateSession(deps, { light: false });
  console.log('generate_session + validate_session ok:', gen.ok, gen.ok ? `sessionId=${gen.sessionId}` : gen.message);
  if (!gen.ok) { await report(db, false, false); return; }

  let violations: string[] = [];
  const generated = llm.lastData<GeneratedSession>('generate_session');
  if (generated) {
    const ctx = await buildGenerationContext(deps, DATE, false);
    violations = checkGenerated(generated, checkContext(ctx));
    console.log('checkGenerated:', JSON.stringify(violations));
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
  await report(db, out.kind === 'graded', violations.length === 0);
}

async function report(db: Db, graded: boolean, clean: boolean): Promise<void> {
  const calls = await db.select<{ kind: string; ok: number; error: string | null; cost_usd: number }>('SELECT kind, ok, error, cost_usd FROM llm_call ORDER BY id');
  for (const c of calls) console.log(`llm_call ${c.kind}: ok=${c.ok === 1}${c.error ? ` error=${c.error}` : ''} cost=${c.cost_usd}`);
  const verdicts = await db.select<{ verdict: string | null; n: number }>('SELECT verdict, COUNT(*) AS n FROM answer GROUP BY verdict');
  console.log('grade verdicts:', verdicts.map((v) => `${v.verdict}=${v.n}`).join(', ') || 'none');
  console.log('total cost USD:', calls.reduce((s, c) => s + c.cost_usd, 0).toFixed(5));
  process.exitCode = graded && clean ? 0 : 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
