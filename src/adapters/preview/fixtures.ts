import type { Deps, ProcessRunner } from '@/core/ports';
import type { PrereqResult } from '@/core/prereq';
import { CLAUDE_LOCATIONS } from '@/core/llm/claude';
import { bundledPrompts } from '@/core/llm/bundledPrompts';
import { startApp } from '@/core/startup';
import { insertSeedRules, saveProgramme, type SeedRule } from '@/core/programme/setup';
import { generateSession } from '@/core/session/generate';
import { gradeSession } from '@/core/grading/grade';
import { listGradingItems, getSessionByDate } from '@/core/db/repos/sessions';
import { FixedClock } from '@/adapters/test/fixedClock';
import { createSqlJsDb } from './sqljsDb';
import { previewLlm } from './previewLlm';
import { MINI_PROGRAMME, MINI_RULES } from './miniSeed';

export const PREVIEW_STATES = [
  'empty', 'no_session', 'generated', 'questions', 'graded', 'rest', 'rule_missing', 'prereq_missing',
] as const;
export type PreviewState = (typeof PREVIEW_STATES)[number];

const TUESDAY = '2026-10-20';
const WEDNESDAY = '2026-10-21';

export function parsePreviewState(search: string): PreviewState {
  const value = new URLSearchParams(search).get('state');
  return PREVIEW_STATES.find((s) => s === value) ?? 'no_session';
}

/** Preview has no real `claude`: every probe reports "not found". */
const previewRunner: ProcessRunner = {
  async run() {
    return { code: 127, stdout: '', stderr: 'preview mode', timedOut: false };
  },
};

export interface PreviewCore { deps: Deps; runner: ProcessRunner; prereq: PrereqResult | null }

function requireOk(result: { ok: boolean; message?: string }, what: string): void {
  if (!result.ok) throw new Error(`Preview fixture: ${what} failed: ${result.message ?? ''}`);
}

export async function buildPreview(state: PreviewState): Promise<PreviewCore> {
  const clock = new FixedClock(state === 'rest' ? WEDNESDAY : TUESDAY);
  const deps: Deps = {
    db: await createSqlJsDb(),
    llm: previewLlm,
    clock,
    prompts: { load: async (kind) => bundledPrompts[kind] },
  };
  await startApp(deps);

  const prereq: PrereqResult | null =
    state === 'prereq_missing'
      ? { ok: false, checked: CLAUDE_LOCATIONS.map(({ loc, path }) => ({ location: loc, path, result: 'missing' as const })) }
      : null;
  const core = (): PreviewCore => ({ deps, runner: previewRunner, prereq });
  if (state === 'empty') return core();

  await saveProgramme(deps.db, MINI_PROGRAMME);
  const rules: SeedRule[] = state === 'rule_missing' ? MINI_RULES.filter((r) => r.topicKey !== 'articles') : MINI_RULES;
  await insertSeedRules(deps.db, rules, clock.now());

  if (state === 'generated' || state === 'questions' || state === 'graded') {
    requireOk(await generateSession(deps, { light: false }), 'generateSession');
  }
  if (state === 'questions' || state === 'graded') {
    const session = await getSessionByDate(deps.db, clock.today());
    if (!session) throw new Error('Preview fixture: no session');
    const items = await listGradingItems(deps.db, session.id);
    const answers: Record<number, string> = {};
    const spot: Record<string, string> = {};
    if (state === 'graded') {
      // Every second answer is right, the rest are wrong, so the page shows both verdicts.
      items.forEach((it, i) => {
        if (it.format === 'spot' && it.paragraph !== null) {
          const key = `${it.blockId}:${it.paragraph}`;
          spot[key] = `${spot[key] ?? ''}${i % 2 === 0 ? `${it.prompt} → ${it.expected}` : ''}\n`;
        } else if (it.format !== 'question') answers[it.id] = i % 2 === 0 ? it.expected : 'wrong answer';
      });
    }
    const outcome = await gradeSession(deps, session.id, { items: answers, spot }, []);
    if (state === 'graded' && outcome.kind !== 'graded') throw new Error(`Preview fixture: grading gave ${outcome.kind}`);
    if (state === 'questions' && outcome.kind !== 'questions') throw new Error(`Preview fixture: expected questions, got ${outcome.kind}`);
  }
  return core();
}
