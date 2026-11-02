import type { Deps } from '@/core/ports';
import { effectiveVerdict } from '@/core/verdict';
import { getSettings } from '@/core/db/repos/settings';
import { deleteRound, getSession, hasOpenItems, reopenSession } from '@/core/db/repos/sessions';
import { listGradedAnswerRows } from '@/core/db/repos/answers';
import { buildGenerationContext, type BlockSpec, type GenerationContext, type RuleRef } from './context';
import type { TaskFormat } from './choice';
import { produce, type GenerateResult, type OnStage } from './generate';
import { loadDayInfo } from './plan';
import { writeBlocks } from './store';

/** Topic of the most counted wrong items of the session (ties: the first one met) that has a rule. */
async function wrongTopic(deps: Deps, sessionId: number, d: GenerationContext['date']): Promise<RuleRef | null> {
  const info = await loadDayInfo(deps, d);
  if (!info) return null;
  const counts = new Map<number, number>();
  for (const r of await listGradedAnswerRows(deps.db)) {
    if (r.sessionId !== sessionId || r.topicId === null) continue;
    const verdict = effectiveVerdict({ itemStatus: r.itemStatus, verdict: r.verdict, disputeDecision: r.disputeDecision, gapStatus: r.gapStatus });
    if (verdict === 'wrong') counts.set(r.topicId, (counts.get(r.topicId) ?? 0) + 1);
  }
  const ranked = [...counts].sort((a, b) => b[1] - a[1]);
  for (const [topicId] of ranked) {
    const topic = info.topics.find((t) => t.id === topicId);
    const rule = info.rules.get(topicId);
    if (topic && rule) return { topic, ruleId: rule.ruleId, version: rule.version, body: rule.body };
  }
  return null;
}

const FORMAT_ORDER: TaskFormat[] = ['gap', 'fix', 'spot'];

/** The topic the gap and fix blocks of an added round ask about: today's task topic, else the counted wrong topic, else any topic with a rule. */
export async function extensionTopic(deps: Deps, sessionId: number, d: GenerationContext['date'], ctx: GenerationContext): Promise<RuleRef | null> {
  return ctx.taskTopic ?? (await wrongTopic(deps, sessionId, d)) ?? ctx.allowed[0] ?? null;
}

/** The format of the session's first round task when it is gap or fix, else fix. */
export async function firstRoundFormat(deps: Deps, sessionId: number): Promise<TaskFormat> {
  const first = await deps.db.select<{ format: string }>(
    "SELECT format FROM block WHERE session_id = ? AND kind = 'task' AND round = 1 ORDER BY ord LIMIT 1", [sessionId],
  );
  return first[0]?.format === 'gap' || first[0]?.format === 'fix' ? first[0].format : 'fix';
}

/**
 * "Add more questions": one added round for today's graded session, as round max + 1, with one task block per chosen format
 * (gap and fix on the task topic, spot on the error-spotting topics). The session stays graded; the new round is open until it is answered.
 */
export async function extendSession(deps: Deps, sessionId: number, formats: TaskFormat[], onStage?: OnStage): Promise<GenerateResult> {
  const d = deps.clock.today();
  const session = await getSession(deps.db, sessionId);
  if (!session) return { ok: false, message: 'Session not found' };
  if (session.status !== 'graded' || session.date !== d) return { ok: false, message: "Only today's graded session can get more questions" };
  if (await hasOpenItems(deps.db, sessionId)) return { ok: false, message: 'The session has questions to answer first' };

  const chosen = FORMAT_ORDER.filter((f) => formats.includes(f));
  if (chosen.length === 0) return { ok: false, message: 'Choose at least one task' };

  let ctx: GenerationContext;
  try {
    ctx = await buildGenerationContext(deps, d, false);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }

  const needsTask = chosen.some((f) => f !== 'spot');
  const taskRef = needsTask ? await extensionTopic(deps, sessionId, d, ctx) : null;
  if (needsTask && !taskRef) return { ok: false, message: 'No topic to ask about' };
  if (chosen.includes('spot') && ctx.spotTopics.length === 0) return { ok: false, message: 'No topics to spot errors in' };

  const blocks = await deps.db.select<{ ord: number; kind: string; format: string; round: number }>(
    'SELECT ord, kind, format, round FROM block WHERE session_id = ? ORDER BY ord', [sessionId],
  );
  const prompts = await deps.db.select<{ prompt: string }>(
    'SELECT i.prompt AS prompt FROM item i JOIN block b ON b.id = i.block_id WHERE b.session_id = ? ORDER BY b.ord, i.ord', [sessionId],
  );
  const specs: BlockSpec[] = chosen.map((format) =>
    format === 'spot' || !taskRef ? { kind: 'task', format } : { kind: 'task', format, topicKey: taskRef.topic.key },
  );
  const extended: GenerationContext = {
    ...ctx,
    blocks: specs,
    taskTopic: taskRef,
    spotTopics: chosen.includes('spot') ? ctx.spotTopics : [],
    reviewInputs: [],
    inattention: [],
    dueTopics: [],
    allowed: taskRef && !ctx.allowed.some((r) => r.topic.key === taskRef.topic.key) ? [...ctx.allowed, taskRef] : ctx.allowed,
    extra: { prompts: prompts.map((p) => p.prompt).filter((p) => p !== '') },
  };

  const made = await produce(deps, sessionId, extended, onStage);
  if (!made.ok) return made.code === undefined ? { ok: false, message: made.message } : { ok: false, message: made.message, code: made.code };
  const { nativeLanguage } = await getSettings(deps.db);
  const last = blocks.at(-1);
  const round = Math.max(1, ...blocks.map((b) => b.round)) + 1;
  try {
    await writeBlocks(deps.db, sessionId, nativeLanguage, extended, made.gen, made.defects, [], { ord: (last?.ord ?? -1) + 1, round });
  } catch (e) {
    await deleteRound(deps.db, sessionId, round);
    throw e;
  }
  await reopenSession(deps.db, sessionId);
  return { ok: true, sessionId };
}
