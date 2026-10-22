/**
 * Model evals through the app's real path (buildClaudeArgs, parseEnvelope, callStructured, generateSession, gradeSession)
 * with the real `claude` binary. Run: `yarn eval [--model claude-haiku-5-5] [--suite generate|grade|all]`.
 * Spends real money: see evals/README.md.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { FixedClock } from '@/adapters/test/fixedClock';
import type { Deps } from '@/core/ports';
import type { GradeResult } from '@/core/llm/types';
import { addDays } from '@/core/dates';
import { insertDraftSession, setSessionStatus } from '@/core/db/repos/sessions';
import { generateSession } from '@/core/session/generate';
import { gradeSession } from '@/core/grading/grade';
import { proseOf } from '@/core/grading/input';
import { toneViolations } from '@/core/validate/tone';
import { diskPrompts, NodeClaudeCli, RecordingLlm, ROOT, seededDb, tempCwd } from '../scripts/lib/nodeHarness';
import { addBlock, addItem, seedHistory, type HistorySession } from './fixtures';
import { EXPECTED_VERDICTS, scoreEval, type CaseResult, type EvalScore, type GradeCase } from './score';

const SEED_TODAY = '2026-10-26'; // Monday: programme week 1 starts here
const GRADE_DATE = '2026-12-01';

interface GenContext { id: string; description: string; date: string; light?: boolean; noticeWeek?: number; history?: HistorySession[] }
interface GenResult {
  id: string; description: string; ok: boolean; message: string; attempts: number; firstAttempt: string[];
  defects: number | null; costUsd: number; durationMs: number;
}
interface BatchInfo { name: string; items: number; gradeCalls: number; firstResponseToneViolations: number; costUsd: number; durationMs: number; note: string }
interface GradeRun {
  cases: GradeCase[]; results: CaseResult[]; score: EvalScore; batches: BatchInfo[];
  details: Map<string, { explanation: string; ruleSection: string }>;
}

function parseArgs(argv: string[]): { model: string; suite: 'generate' | 'grade' | 'all' } {
  let model = 'claude-haiku-5-5';
  let suite = 'all';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--model' || a === '--suite') {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      if (a === '--model') model = v;
      else suite = v;
    } else throw new Error(`Unknown argument ${a}. Usage: yarn eval [--model <id>] [--suite generate|grade|all]`);
  }
  if (!model.startsWith('claude-')) throw new Error(`Model must be a claude-* id, got ${model}`);
  if (suite !== 'generate' && suite !== 'grade' && suite !== 'all') throw new Error(`Unknown suite ${suite}`);
  return { model, suite };
}

const readJson = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8')) as T;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

// ---------------------------------------------------------------- generation

async function runGenerate(model: string): Promise<GenResult[]> {
  const dir = path.join(ROOT, 'evals/cases/generate');
  const contexts = readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => readJson<GenContext>(path.join(dir, f)));
  const out: GenResult[] = [];
  for (const c of contexts) {
    const clock = new FixedClock(c.date);
    const db = await seededDb({ model, clock, seedToday: SEED_TODAY, noticeWeek: c.noticeWeek });
    await seedHistory(db, clock, c.history ?? []);
    const deps: Deps = { db, llm: new NodeClaudeCli(tempCwd('enlearn-eval')), clock, prompts: diskPrompts };
    const started = Date.now();
    let res: Awaited<ReturnType<typeof generateSession>>;
    try {
      res = await generateSession(deps, { light: c.light === true });
    } catch (e) {
      res = { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
    const durationMs = Date.now() - started;
    const calls = await db.select<{ kind: string; ok: number; error: string | null; cost_usd: number }>('SELECT kind, ok, error, cost_usd FROM llm_call ORDER BY id');
    const gens = calls.filter((x) => x.kind === 'generate_session');
    const first = gens[0];
    // The error of a failed call is "check: <violations joined by newlines>", the app's own check on that attempt.
    const firstAttempt = !first || first.ok === 1 ? [] : (first.error ?? 'unknown').replace(/^check: /, '').split('\n');
    let defects: number | null = null;
    if (res.ok) {
      const rows = await db.select<{ n: number }>(
        "SELECT COUNT(*) AS n FROM item i JOIN block b ON b.id = i.block_id WHERE b.session_id = ? AND i.status = 'defect'", [res.sessionId],
      );
      defects = rows[0]?.n ?? 0;
    }
    const r: GenResult = {
      id: c.id, description: c.description, ok: res.ok, message: res.ok ? '' : res.message, attempts: gens.length, firstAttempt, defects,
      costUsd: sum(calls.map((x) => x.cost_usd)), durationMs,
    };
    out.push(r);
    console.error(`[generate] ${c.id}: ${r.ok ? 'ok' : 'FAILED'} attempts=${r.attempts} violations=${firstAttempt.length} defects=${defects ?? '-'} $${r.costUsd.toFixed(4)} ${(durationMs / 1000).toFixed(0)}s`);
  }
  return out;
}

// ------------------------------------------------------------------- grading

const spellingKey = '(spelling, graded by code)';

async function runGrade(model: string): Promise<GradeRun> {
  const cases = readJson<{ cases: GradeCase[] }>(path.join(ROOT, 'evals/cases/grade.json')).cases;
  const clock = new FixedClock(GRADE_DATE);
  // One database for the whole suite: gradeSession keeps its clarification state per session id in memory.
  const db = await seededDb({ model, clock, seedToday: SEED_TODAY });
  const llm = new RecordingLlm(new NodeClaudeCli(tempCwd('enlearn-eval')));
  const deps: Deps = { db, llm, clock, prompts: diskPrompts };

  const groups = new Map<string, GradeCase[]>();
  for (const c of cases) groups.set(c.topic ?? spellingKey, [...(groups.get(c.topic ?? spellingKey) ?? []), c]);

  const results: CaseResult[] = [];
  const batches: BatchInfo[] = [];
  const details = new Map<string, { explanation: string; ruleSection: string }>();
  const norm = (s: string) => s.trim().toLowerCase();

  for (const [g, [name, group]] of [...groups].entries()) {
    const sessionId = await insertDraftSession(db, { date: addDays(GRADE_DATE, g), title: `Eval ${name}`, isLight: false, createdAt: clock.now() });
    const itemOf = new Map<string, { itemId: number; ref: string }>();
    let blockOrd = 0;
    for (const format of ['gap', 'fix', 'spelling'] as const) {
      const inBlock = group.filter((c) => c.format === format);
      if (inBlock.length === 0) continue;
      const blockId = await addBlock(db, sessionId, blockOrd, format === 'spelling' ? 'spelling' : 'task', format);
      for (const [ord, c] of inBlock.entries()) {
        const itemId = await addItem(db, blockId, ord, { prompt: c.prompt, expected: c.expected, ruleSection: c.ruleSection === '' ? null : c.ruleSection, topic: c.topic });
        itemOf.set(c.id, { itemId, ref: `b${blockOrd}.i${ord}` });
      }
      blockOrd++;
    }
    await setSessionStatus(db, sessionId, 'generated');

    const answers: Record<number, string> = {};
    for (const c of group) answers[itemOf.get(c.id)!.itemId] = c.answer;
    llm.calls = [];
    const outcome = await gradeSession(deps, sessionId, { items: answers, spot: {} }, []);
    const calls = llm.calls.filter((x) => x.kind === 'grade');
    const final = [...calls].reverse().find((x) => x.res.ok)?.res;
    const finalData = final?.ok ? (final.data as GradeResult) : null;
    const firstRes = calls[0]?.res;
    const firstData = firstRes?.ok && Array.isArray((firstRes.data as GradeResult).items) ? (firstRes.data as GradeResult) : null;
    const prose = (x: string | undefined) => (x ?? '').trim();

    for (const c of group) {
      const { itemId, ref } = itemOf.get(c.id)!;
      let verdict: CaseResult['verdict'] = 'error';
      let fix = '';
      let explanation = '';
      let ruleSection = '';
      let tone = 0;
      if (c.format === 'spelling') {
        const rows = await db.select<{ verdict: string | null }>('SELECT verdict FROM answer WHERE item_id = ?', [itemId]);
        if (rows[0]?.verdict === 'correct' || rows[0]?.verdict === 'wrong') verdict = rows[0].verdict;
      } else if (outcome.kind !== 'error' && finalData) {
        const e = finalData.items.find((x) => x.ref === ref);
        if (e) { verdict = e.verdict; fix = e.fix; explanation = e.explanation; ruleSection = e.ruleSection; }
      } else if (outcome.kind === 'error') explanation = outcome.message;
      const first = firstData?.items.find((x) => x.ref === ref);
      if (first) tone = toneViolations([prose(first.explanation), prose(first.vocabularyNote)].filter((t) => t !== '')).length;
      const wanted = c.label.spellingErrors;
      const flagged = wanted === undefined ? undefined
        : (finalData?.spellingErrors ?? []).some((w) => wanted.some((x) => norm(x) === norm(w.word)));
      results.push({ id: c.id, verdict, fix, toneViolations: tone, ...(flagged === undefined ? {} : { spellingFlagged: flagged }) });
      details.set(c.id, { explanation, ruleSection });
    }

    const llmItems = group.filter((c) => c.format !== 'spelling').length;
    batches.push({
      name, items: group.length, gradeCalls: calls.length,
      firstResponseToneViolations: firstData ? toneViolations(proseOf(firstData)).length : 0,
      costUsd: sum(calls.map((x) => x.res.costUsd)), durationMs: sum(calls.map((x) => x.res.durationMs)),
      note: outcome.kind === 'error' ? `grade failed: ${outcome.message}` : llmItems > 0 && calls.length === 0 ? 'no grade call (pre-check asked a question)' : '',
    });
    const b = batches[batches.length - 1]!;
    console.error(`[grade] ${name}: ${group.length} items, ${b.gradeCalls} grade call(s), $${b.costUsd.toFixed(4)}${b.note ? ` (${b.note})` : ''}`);
  }
  return { cases, results, score: scoreEval(results, cases), batches, details };
}

// -------------------------------------------------------------------- report

const esc = (s: string) => s.replaceAll('|', '\\|').replace(/\s*\n\s*/g, ' ').trim();
const pct = (x: number | null) => (x === null ? 'n/a' : `${(x * 100).toFixed(0)}%`);
const usd = (x: number) => `$${x.toFixed(4)}`;
const secs = (ms: number) => `${(ms / 1000).toFixed(0)}s`;

function generateSection(rs: GenResult[]): string[] {
  const passed = rs.filter((r) => r.ok).length;
  const clean = rs.filter((r) => r.ok && r.attempts === 1).length;
  const out = [
    '## Generation suite', '',
    `Each context runs the app's \`generateSession\` (generate_session, code checks, validate_session, one retry) against a fresh temp database.`, '',
    `- Pass rate: **${passed}/${rs.length}** (${pct(passed / rs.length)}) sessions stored`,
    `- Stored on the first attempt (no retry): ${clean}/${rs.length}`,
    `- validate_session defects across stored sessions: ${sum(rs.map((r) => r.defects ?? 0))}`,
    `- Cost ${usd(sum(rs.map((r) => r.costUsd)))}, mean ${secs(sum(rs.map((r) => r.durationMs)) / Math.max(rs.length, 1))} per context`, '',
    '| context | stored | attempts | first-call check violations | defects | cost | time |', '| --- | --- | --- | --- | --- | --- | --- |',
    ...rs.map((r) => `| ${r.id} | ${r.ok ? 'yes' : 'NO'} | ${r.attempts} | ${r.firstAttempt.length} | ${r.defects ?? '-'} | ${usd(r.costUsd)} | ${secs(r.durationMs)} |`),
  ];
  const detail = rs.filter((r) => r.firstAttempt.length > 0 || !r.ok);
  if (detail.length > 0) {
    out.push('', '### Violations and failures', '');
    for (const r of detail) {
      out.push(`- **${r.id}** (${esc(r.description)})`);
      for (const v of r.firstAttempt) out.push(`  - first attempt: ${esc(v)}`);
      if (!r.ok) out.push(`  - final failure: ${esc(r.message)}`);
    }
  }
  return out;
}

function gradeSection(run: GradeRun): string[] {
  const s = run.score;
  const byId = new Map(run.cases.map((c) => [c.id, c]));
  const out = [
    '## Grading suite', '',
    `${s.total} labelled cases, batched per topic through the app's \`gradeSession\`. **Labels are unreviewed by the learner: treat the scores as provisional.**`, '',
    `- Verdict accuracy: **${s.correct}/${s.total}** (${pct(s.accuracy)})`,
    `- Fix matches the label (items graded wrong that have a labelled fix): ${s.fix.matched}/${s.fix.checked} (${pct(s.fix.accuracy)})`,
    `- Tone: ${s.tone.violations} violation(s) in the first response, on ${s.tone.itemsWithViolations}/${s.tone.items} items; ${run.batches.filter((b) => b.firstResponseToneViolations > 0).length}/${run.batches.length} batches had a violation anywhere in the first response (the app retries those)`,
    `- Misspelled correct fixes listed in spellingErrors: ${s.spelling.flagged}/${s.spelling.checked}`,
    `- Errors (call failed or item missing): ${s.errors}`,
    `- Cost ${usd(sum(run.batches.map((b) => b.costUsd)))}`, '',
    '| expected | cases | correct | accuracy | got |', '| --- | --- | --- | --- | --- |',
    ...EXPECTED_VERDICTS.map((v) => {
      const p = s.perVerdict[v];
      return `| ${v} | ${p.total} | ${p.correct} | ${pct(p.accuracy)} | ${Object.entries(p.got).map(([k, n]) => `${k} ${n}`).join(', ') || '-'} |`;
    }), '',
    '| batch | items | grade calls | first-response tone violations | cost | time | note |', '| --- | --- | --- | --- | --- | --- | --- |',
    ...run.batches.map((b) => `| ${b.name} | ${b.items} | ${b.gradeCalls} | ${b.firstResponseToneViolations} | ${usd(b.costUsd)} | ${secs(b.durationMs)} | ${esc(b.note)} |`),
  ];
  if (s.mismatches.length > 0) {
    out.push('', '### Mismatches', '', '| case | category | expected | got | learner answer | label fix | model fix | rule section | model explanation |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const m of s.mismatches) {
      const c = byId.get(m.id)!;
      const d = run.details.get(m.id);
      out.push(`| ${m.id} | ${c.category} | ${m.expected} | ${m.got} | ${esc(c.answer)} | ${esc((m.expectedFix ?? []).join(' / '))} | ${esc(m.gotFix ?? '')} | ${esc(d?.ruleSection ?? '')} | ${esc(d?.explanation ?? '')} |`);
    }
    out.push('', 'Why each mismatched case is labelled as it is:', '');
    for (const m of s.mismatches) out.push(`- ${m.id}: ${esc(byId.get(m.id)!.why)}`);
  }
  return out;
}

async function main(): Promise<void> {
  const { model, suite } = parseArgs(process.argv.slice(2));
  const date = new Date().toLocaleDateString('sv');
  const gen = suite === 'grade' ? null : await runGenerate(model);
  const grade = suite === 'generate' ? null : await runGrade(model);
  const total = sum([...(gen ?? []).map((r) => r.costUsd), ...(grade?.batches ?? []).map((b) => b.costUsd)]);
  const md = [
    `# Model eval: ${model}`, '',
    `Date ${date}. Suite: ${suite}. Total cost: **${usd(total)}**.`, '',
    ...(gen ? [...generateSection(gen), ''] : []),
    ...(grade ? gradeSection(grade) : []),
  ].join('\n') + '\n';
  const dir = path.join(ROOT, 'evals/results');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${date}-${model}.md`);
  writeFileSync(file, md);
  console.log(md);
  console.error(`Written to ${path.relative(ROOT, file)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
