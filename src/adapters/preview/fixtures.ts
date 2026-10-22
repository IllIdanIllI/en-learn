import type { Clock, Deps, Llm, LlmErrorCode, ProcessRunner } from '@/core/ports';
import type { ISODate } from '@/core/domain';
import type { PrereqResult } from '@/core/prereq';
import { CLAUDE_LOCATIONS } from '@/core/llm/claude';
import { bundledPrompts } from '@/core/llm/bundledPrompts';
import { startApp } from '@/core/startup';
import { insertSeedRules, saveProgramme, type SeedRule } from '@/core/programme/setup';
import { generateSession } from '@/core/session/generate';
import { gradeSession } from '@/core/grading/grade';
import { listGradingItems, getSessionByDate } from '@/core/db/repos/sessions';
import { findOrCreateSpellingWord } from '@/core/db/repos/spelling';
import { createSqlJsDb } from './sqljsDb';
import { previewLlm } from './previewLlm';
import { MINI_PROGRAMME, MINI_RULES } from './miniSeed';

export const PREVIEW_STATES = [
  'empty', 'no_session', 'generated', 'questions', 'graded', 'progress', 'rest', 'rule_missing', 'spot_rule_missing', 'prereq_missing',
  'earlier_session', 'progress_archived',
] as const;
export type PreviewState = (typeof PREVIEW_STATES)[number];

/** Words the spelling block is built from: hints never contain the word. */
const SPELLING_WORDS: [word: string, hint: string][] = [
  ['necessary', 'Not optional'],
  ['definitely', 'Without any doubt'],
  ['accommodation', 'A place to stay'],
  ['separate', 'Apart from the others'],
];

/**
 * Canned answers of the graded fixture: one wrong, one right, and one the rulebook does not cover (a rule gap),
 * matched by prompt. Other items alternate right and wrong.
 */
const ANSWERS: Record<string, string> = {
  'She is an teacher at a local school.': 'the teacher',
  'The sun rises in the east.': '✓',
  'I saw a elephant at the zoo.': 'one elephant',
};

const TUESDAY = '2026-10-20';
const WEDNESDAY = '2026-10-21';
const THURSDAY = '2026-10-22';

/**
 * Earlier days of the `progress` fixture, played through the core on that day's date: five more graded sessions, the
 * 18th a light day. With today's session they make 6 practised days of the 10 since the first one, 1 of them light.
 */
const EARLIER_DAYS: { date: ISODate; light: boolean }[] = [
  { date: '2026-10-11', light: false },
  { date: '2026-10-13', light: false },
  { date: '2026-10-15', light: false },
  { date: '2026-10-17', light: false },
  { date: '2026-10-18', light: true },
];

/** A clock the fixture can move between days; the app gets it at the final date. */
class SteppedClock implements Clock {
  constructor(private date: ISODate) {}
  set(date: ISODate): void {
    this.date = date;
  }
  today(): ISODate {
    return this.date;
  }
  now(): string {
    return `${this.date}T12:00:00.000Z`;
  }
}

export function parsePreviewState(search: string): PreviewState {
  const value = new URLSearchParams(search).get('state');
  return PREVIEW_STATES.find((s) => s === value) ?? 'no_session';
}

/** `?delay=ms` slows every LLM call so the "generating" state can be seen and screenshotted. */
export function parsePreviewDelay(search: string): number {
  const ms = Number(new URLSearchParams(search).get('delay'));
  return Number.isFinite(ms) && ms > 0 ? Math.min(ms, 60_000) : 0;
}

/** `?fail=` makes every LLM call fail with that code, to see the messages the app gives for it. */
export function parsePreviewFail(search: string): LlmErrorCode | null {
  const value = new URLSearchParams(search).get('fail');
  const codes: LlmErrorCode[] = ['not_signed_in', 'budget', 'timeout', 'cli_error'];
  return codes.find((c) => c === value) ?? null;
}

export function withFailure(llm: Llm, code: LlmErrorCode | null): Llm {
  if (code === null) return llm;
  return {
    async call() {
      return { ok: false, code, message: `Preview failure: ${code}`, costUsd: 0, durationMs: 1, raw: '' };
    },
  };
}

export function withDelay(llm: Llm, ms: number): Llm {
  if (ms === 0) return llm;
  return {
    async call(req) {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return llm.call(req);
    },
  };
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

/** Answers today's session: `graded` answers every second item right; `questions` leaves blanks that raise questions. */
async function answerToday(deps: Deps, state: 'questions' | 'graded'): Promise<void> {
  const session = await getSessionByDate(deps.db, deps.clock.today());
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
      } else if (it.format !== 'question') answers[it.id] = ANSWERS[it.prompt] ?? (i % 2 === 0 ? it.expected : 'wrong answer');
    });
  }
  const outcome = await gradeSession(deps, session.id, { items: answers, spot }, []);
  if (state === 'graded' && outcome.kind !== 'graded') throw new Error(`Preview fixture: grading gave ${outcome.kind}`);
  if (state === 'questions' && outcome.kind !== 'questions') throw new Error(`Preview fixture: expected questions, got ${outcome.kind}`);
}

/** Generates and grades one earlier day's session. */
async function playDay(deps: Deps, light: boolean): Promise<void> {
  requireOk(await generateSession(deps, { light }), 'generateSession');
  await answerToday(deps, 'graded');
}

export async function buildPreview(state: PreviewState): Promise<PreviewCore> {
  const clock = new SteppedClock(state === 'rest' ? WEDNESDAY : TUESDAY);
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
  const without = state === 'rule_missing' ? 'articles' : state === 'spot_rule_missing' ? 'third-person-s' : null;
  const rules: SeedRule[] = MINI_RULES.filter((r) => r.topicKey !== without);
  await insertSeedRules(deps.db, rules, clock.now());
  for (const [word, hint] of SPELLING_WORDS) await findOrCreateSpellingWord(deps.db, word, hint, clock.now());

  const today = clock.today();
  const progressLike = state === 'progress' || state === 'progress_archived';
  if (progressLike) {
    for (const day of EARLIER_DAYS) {
      clock.set(day.date);
      await playDay(deps, day.light);
    }
    clock.set(today);
  }
  if (state === 'earlier_session') {
    // Yesterday's session was built and left unanswered; today has none yet.
    requireOk(await generateSession(deps, { light: false }), 'generateSession');
    clock.set(THURSDAY);
  }
  if (state === 'generated' || state === 'questions' || state === 'graded' || progressLike) {
    requireOk(await generateSession(deps, { light: false }), 'generateSession');
  }
  if (state === 'questions' || state === 'graded' || progressLike) {
    await answerToday(deps, state === 'questions' ? 'questions' : 'graded');
  }
  // A topic dropped from the programme while it still has history is kept, archived.
  if (state === 'progress_archived') await deps.db.execute("UPDATE topic SET archived = 1 WHERE key = 'articles'");
  return core();
}
