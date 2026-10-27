import type { Deps } from '@/core/ports';
import { effectiveVerdict } from '@/core/verdict';
import { getSettings } from '@/core/db/repos/settings';
import { deleteRound, getSession, hasOpenItems, reopenSession } from '@/core/db/repos/sessions';
import { listGradedAnswerRows } from '@/core/db/repos/answers';
import { buildGenerationContext, type GenerationContext, type RuleRef } from './context';
import { produce, type GenerateResult, type GenStage } from './generate';
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

/**
 * "Add more questions": one more task block (6 to 8 gap or fix items) for today's graded session, as round max + 1.
 * The session stays graded; the new block is open until it is answered.
 */
export async function extendSession(deps: Deps, sessionId: number, onStage?: (s: GenStage) => void): Promise<GenerateResult> {
  const d = deps.clock.today();
  const session = await getSession(deps.db, sessionId);
  if (!session) return { ok: false, message: 'Session not found' };
  if (session.status !== 'graded' || session.date !== d) return { ok: false, message: "Only today's graded session can get more questions" };
  if (await hasOpenItems(deps.db, sessionId)) return { ok: false, message: 'The session has questions to answer first' };

  let ctx: GenerationContext;
  try {
    ctx = await buildGenerationContext(deps, d, false);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }

  const blocks = await deps.db.select<{ ord: number; kind: string; format: string; round: number }>(
    'SELECT ord, kind, format, round FROM block WHERE session_id = ? ORDER BY ord', [sessionId],
  );
  const first = blocks.find((b) => b.kind === 'task' && b.round === 1);
  const format = first?.format === 'gap' || first?.format === 'fix' ? first.format : 'fix';
  const taskRef = ctx.taskTopic ?? (await wrongTopic(deps, sessionId, d)) ?? ctx.allowed[0] ?? null;
  if (!taskRef) return { ok: false, message: 'No topic to ask about' };
  const prompts = await deps.db.select<{ prompt: string }>(
    'SELECT i.prompt AS prompt FROM item i JOIN block b ON b.id = i.block_id WHERE b.session_id = ? ORDER BY b.ord, i.ord', [sessionId],
  );
  const extended: GenerationContext = {
    ...ctx,
    blocks: [{ kind: 'task', format }],
    taskTopic: taskRef,
    spotTopics: [],
    reviewInputs: [],
    inattention: [],
    dueTopics: [],
    allowed: ctx.allowed.some((r) => r.topic.key === taskRef.topic.key) ? ctx.allowed : [...ctx.allowed, taskRef],
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
