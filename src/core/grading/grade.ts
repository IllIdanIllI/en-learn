import type { Deps } from '@/core/ports';
import type { LlmErrorCode } from '@/core/ports';
import type { GradeResult } from '@/core/llm/types';
import { toneViolations } from '@/core/validate/tone';
import { callStructured } from '@/core/llm/call';
import { getSettings, setSetting } from '@/core/db/repos/settings';
import { getSession, hasOpenItems, listGradingItems, type GradingItem } from '@/core/db/repos/sessions';
import { applyGraded, type Graded } from './apply';
import { buildRefs, missingRefs, proseOf, renderGradeInput, spotParagraphs, type GradeBatch } from './input';
import { autoCorrect, autoSpot } from './autocheck';
import { BUILTIN_SHORTHANDS, precheckAnswers, type Question, type Submission } from './precheck';

export type { Question, Submission } from './precheck';
export interface ClarificationAnswer { itemId: number; skip?: boolean; shorthandMeansCorrect?: boolean; text?: string }
/** `code` lets the UI show its own text: the LLM codes, or a problem with the session itself. */
export type GradeErrorCode = LlmErrorCode | 'session_not_found' | 'session_not_ready';
export type GradeOutcome =
  | { kind: 'questions'; questions: Question[] }
  | { kind: 'graded' }
  | { kind: 'error'; message: string; code?: GradeErrorCode; retry: () => Promise<GradeOutcome> };

/**
 * Partial result waiting for answers to `needs_clarification` questions, with the submission it was made from.
 * Lost on reload: the learner re-submits. A different submission (edited answers) discards it.
 */
interface Awaiting { graded: Graded; questions: Map<number, string>; snapshot: string }
const awaiting = new Map<number, Awaiting>();

export const forgetAwaiting = (sessionId: number): void => void awaiting.delete(sessionId);
export const hasAwaiting = (sessionId: number): boolean => awaiting.has(sessionId);

const byKey = ([a]: [string, string], [b]: [string, string]) => (a < b ? -1 : a > b ? 1 : 0);
const snapshotOf = (sub: Submission): string =>
  JSON.stringify([Object.entries(sub.items).sort(byKey), Object.entries(sub.spot).sort(byKey)]);

const emptyResult = (): GradeResult => ({ items: [], spot: [], patterns: [], tomorrow: [], spellingErrors: [], ruleGaps: [] });
const union = (a: string[], b: string[]) => [...new Set([...a, ...b])];

function merge(a: GradeResult, b: GradeResult): GradeResult {
  return {
    items: [...a.items, ...b.items],
    spot: [...a.spot, ...b.spot],
    patterns: union(a.patterns, b.patterns),
    tomorrow: union(a.tomorrow, b.tomorrow),
    spellingErrors: [...a.spellingErrors, ...b.spellingErrors.filter((w) => !a.spellingErrors.some((x) => x.word === w.word))],
    ruleGaps: [...a.ruleGaps, ...b.ruleGaps],
  };
}

const errorOutcome = (message: string, retry: () => Promise<GradeOutcome>, code?: GradeErrorCode): GradeOutcome =>
  code === undefined ? { kind: 'error', message, retry } : { kind: 'error', message, code, retry };

/** Spec 8.2 and 8.3: pre-check, spelling by code, one `grade` call, apply. */
export async function gradeSession(
  deps: Deps,
  sessionId: number,
  sub: Submission,
  clarifications: ClarificationAnswer[],
  opts: { finish?: boolean } = {},
): Promise<GradeOutcome> {
  const again = () => gradeSession(deps, sessionId, sub, clarifications, opts);
  try {
    return await run(deps, sessionId, sub, clarifications, again, opts.finish === true);
  } catch (e) {
    return errorOutcome(e instanceof Error ? e.message : String(e), again);
  }
}

async function run(
  deps: Deps, sessionId: number, sub: Submission, clarifications: ClarificationAnswer[], again: () => Promise<GradeOutcome>, finish: boolean,
): Promise<GradeOutcome> {
  const session = await getSession(deps.db, sessionId);
  if (!session) {
    forgetAwaiting(sessionId);
    return errorOutcome('Session not found', again, 'session_not_found');
  }
  // A graded session with an open round is graded again, for the items without an answer only.
  if (session.status === 'graded' && !(await hasOpenItems(deps.db, sessionId))) {
    forgetAwaiting(sessionId);
    return { kind: 'graded' };
  }
  if (session.status !== 'generated' && session.status !== 'graded') return errorOutcome('Session not ready', again, 'session_not_ready');

  // Answered items are left alone only in an open round; a generated session is graded in full again (a crash mid-apply is repaired that way).
  const all = (await listGradingItems(deps.db, sessionId)).map((i) => (session.status === 'graded' ? i : { ...i, answered: false }));
  const items = all.filter((i) => i.status === 'active' && !i.answered);
  const settings = await getSettings(deps.db);
  const snapshot = snapshotOf(sub);
  let prior = awaiting.get(sessionId);
  if (prior && prior.snapshot !== snapshot) {
    // The answers were edited after the partial result was made: they have to be graded as they are now.
    forgetAwaiting(sessionId);
    prior = undefined;
  }
  const clarFor = (id: number) => clarifications.find((c) => c.itemId === id);

  let graded: Graded;
  let batch: GradeBatch;
  const refs = buildRefs(all);

  if (prior) {
    graded = { ...prior.graded, texts: new Map(prior.graded.texts), skipped: new Set(prior.graded.skipped) };
    const questions: Question[] = [];
    const regrade: GradeBatch['items'] = [];
    for (const [id, text] of prior.questions) {
      const c = clarFor(id);
      const answer = c?.text?.trim() ?? '';
      if (c?.skip) graded.skipped.add(id);
      else if (answer !== '') {
        graded.texts.set(id, answer);
        regrade.push({ item: items.find((i) => i.id === id)!, answer });
      } else questions.push({ itemId: id, kind: 'llm', text });
    }
    if (questions.length > 0) return { kind: 'questions', questions };
    batch = { items: regrade, spots: [] };
  } else {
    const shorthands = [...settings.acceptedShorthands];
    const texts = new Map<number, string>();
    const skipped = new Set<number>();
    const answers: Record<number, string> = { ...sub.items };
    for (const c of clarifications) {
      const symbol = (sub.items[c.itemId] ?? '').trim();
      if (c.skip) skipped.add(c.itemId);
      else if (c.shorthandMeansCorrect === true) {
        if (symbol !== '' && !shorthands.includes(symbol)) {
          shorthands.push(symbol);
          await setSetting(deps.db, 'acceptedShorthands', shorthands);
        }
        answers[c.itemId] = '✓';
      } else if (c.text !== undefined && c.text.trim() !== '') answers[c.itemId] = c.text;
    }
    if (finish) {
      for (const i of items) {
        if (i.format !== 'spot' && i.format !== 'question' && (answers[i.id] ?? '').trim() === '') skipped.add(i.id);
      }
    }
    const open = items.filter((i) => !skipped.has(i.id));
    const questions = precheckAnswers({ items: answers, spot: sub.spot }, open, shorthands);
    if (questions.length > 0) return { kind: 'questions', questions };

    for (const it of open) {
      if (it.format === 'spot' || it.format === 'question') continue;
      const a = (answers[it.id] ?? '').trim();
      texts.set(it.id, shorthands.includes(a) || BUILTIN_SHORTHANDS.includes(a) ? '✓' : a);
    }
    const spots = spotParagraphs(items, sub.spot);
    const result = emptyResult();
    const gradable = open.filter((i): i is typeof i & { format: 'gap' | 'fix' } => i.format === 'gap' || i.format === 'fix');
    const auto = new Set(gradable.filter((i) => autoCorrect(i, texts.get(i.id) ?? '')).map((i) => i.id));
    for (const it of gradable) {
      if (auto.has(it.id)) {
        result.items.push({ ref: refs.refOf.get(it.id)!, verdict: 'correct', fix: '', ruleSection: it.ruleSection ?? '', explanation: '', vocabularyNote: '', question: '' });
      }
    }
    const llmSpots = spots.filter((s) => {
      const code = autoSpot(s.passageText, s.errors, s.learnerText);
      if (!code) return true;
      result.spot.push({ blockRef: `b${s.blockOrd}`, paragraph: s.paragraph, found: code.found.map((id) => refs.refOf.get(id)!), extra: [] });
      return false;
    });
    graded = {
      sessionId, texts, skipped,
      spot: new Map(spots.map((s) => [`${s.blockId}:${s.paragraph}`, s.learnerText])),
      result,
    };
    batch = {
      items: gradable.filter((i) => !auto.has(i.id)).map((item) => ({ item, answer: texts.get(item.id) ?? '' })),
      spots: llmSpots,
    };
  }

  let fresh = emptyResult();
  if (batch.items.length > 0 || batch.spots.length > 0) {
    const res = await callStructured<GradeResult>(deps, 'grade', renderGradeInput(batch, refs, settings), {
      sessionId,
      check: (r) => {
        const missing = missingRefs(batch, refs, r);
        if (missing.length > 0) return `missing refs: ${missing.join(', ')}`;
        const noProposal = r.items.filter((i) => i.verdict === 'rule_gap' && !r.ruleGaps.some((g) => g.ref === i.ref));
        if (noProposal.length > 0) return `rule_gap without ruleGaps entry: ${noProposal.map((i) => i.ref).join(', ')}`;
        return toneViolations(proseOf(r)).join('; ') || null;
      },
    });
    if (!res.ok) return errorOutcome(res.message, again, res.code);
    fresh = res.data;
  }

  const open = batch.items.flatMap(({ item }) => {
    const e = fresh.items.find((x) => refs.byRef.get(x.ref)?.id === item.id);
    return e?.verdict === 'needs_clarification' ? [{ id: item.id, question: e.question }] : [];
  });
  const openIds = new Set(open.map((o) => o.id));
  const kept: GradeResult = { ...fresh, items: fresh.items.filter((x) => !openIds.has(refs.byRef.get(x.ref)?.id ?? -1)) };
  graded = { ...graded, result: merge(graded.result, kept) };

  if (open.length > 0) {
    awaiting.set(sessionId, { graded, questions: new Map(open.map((o) => [o.id, o.question])), snapshot });
    return { kind: 'questions', questions: open.map((o) => ({ itemId: o.id, kind: 'llm', text: o.question })) };
  }
  forgetAwaiting(sessionId);
  return applyKept(deps, all, graded);
}

async function applyKept(deps: Deps, items: GradingItem[], graded: Graded): Promise<GradeOutcome> {
  try {
    await applyGraded(deps.db, deps.clock, items, graded);
    return { kind: 'graded' };
  } catch (e) {
    return errorOutcome(e instanceof Error ? e.message : String(e), () => applyKept(deps, items, graded));
  }
}
