import type { Deps } from '@/core/ports';
import { effectiveVerdict } from '@/core/verdict';
import { getSettings } from '@/core/db/repos/settings';
import { deleteRound, getSession, hasOpenItems, reopenSession } from '@/core/db/repos/sessions';
import { listGradedAnswerRows } from '@/core/db/repos/answers';
import { listSessionSpellingWordIds, listSpellingWords, type SpellingWord } from '@/core/db/repos/spelling';
import { latestWritingSource, recentEssayPrompts, RECENT_ESSAY_PROMPTS } from '@/core/db/repos/writing';
import { getSpellingStates } from '@/core/progress/history';
import { selectSpellingWords } from '@/core/schedule/spelling';
import { buildGenerationContext, todayMistakes, type BlockSpec, type GenerationContext, type RuleRef } from './context';
import type { AddRound, TaskFormat } from './choice';
import { BUSY, produce, type GenerateResult, type OnStage } from './generate';
import { withJobLock } from './jobLock';
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

/** The spelling words of an added round: words today's session has not used, picked like a lesson's. */
export async function roundSpelling(deps: Deps, sessionId: number, d: GenerationContext['date']): Promise<SpellingWord[]> {
  const used = await listSessionSpellingWordIds(deps.db, sessionId);
  const words = (await listSpellingWords(deps.db)).filter((w) => !used.has(w.id));
  const ids = selectSpellingWords(await getSpellingStates(deps.db), words.map((w) => w.id), d, false);
  return ids.flatMap((id) => words.find((w) => w.id === id) ?? []);
}

/**
 * "Add more questions": one added round for today's graded session, as round max + 1. Its blocks, in order: spelling (written by the app),
 * a review of today's mistakes, one task block per chosen format (gap and fix on the task topic, spot on the error-spotting topics),
 * an essay, and a rewrite of the latest checked text (written by the app). The model is called only for review, tasks and the essay.
 * The session stays graded; the new round is open until it is answered.
 */
export function extendSession(deps: Deps, sessionId: number, choice: AddRound, onStage?: OnStage): Promise<GenerateResult> {
  return withJobLock(deps.db, () => extendUnlocked(deps, sessionId, choice, onStage), BUSY);
}

async function extendUnlocked(deps: Deps, sessionId: number, choice: AddRound, onStage?: OnStage): Promise<GenerateResult> {
  const d = deps.clock.today();
  const session = await getSession(deps.db, sessionId);
  if (!session) return { ok: false, message: 'Session not found' };
  if (session.status !== 'graded' || session.date !== d) return { ok: false, message: "Only today's graded session can get more questions" };
  if (await hasOpenItems(deps.db, sessionId)) return { ok: false, message: 'The session has questions to answer first' };

  const chosen = FORMAT_ORDER.filter((f) => choice.formats.includes(f));
  // A light session never gets an essay or a rewrite, even in an added round.
  const withWriting = choice.writing && !session.isLight;
  const withRewrite = choice.rewrite && !session.isLight;
  if (!choice.review && chosen.length === 0 && !choice.spelling && !withWriting && !withRewrite) return { ok: false, message: 'Choose at least one block' };

  const info = await loadDayInfo(deps, d);
  if (!info) return { ok: false, message: 'No programme' };
  const mistakes = choice.review ? todayMistakes(info, d) : [];
  if (choice.review && mistakes.length === 0) return { ok: false, message: 'No mistakes to review' };
  const words = choice.spelling ? await roundSpelling(deps, sessionId, d) : [];
  if (choice.spelling && words.length === 0) return { ok: false, message: 'No spelling words left' };
  const source = withRewrite ? await latestWritingSource(deps.db, d, true) : null;
  if (withRewrite && !source) return { ok: false, message: 'No text to rewrite' };

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
  if (choice.review) specs.unshift({ kind: 'review', format: 'gap or fix' });
  if (withWriting) specs.push({ kind: 'writing', format: 'essay' });
  // The topics of today's mistakes that have a rule may be asked about in the review block.
  const allowed = [...ctx.allowed];
  const allow = (r: RuleRef | null) => {
    if (r && !allowed.some((a) => a.topic.key === r.topic.key)) allowed.push(r);
  };
  allow(taskRef);
  for (const e of mistakes) {
    const topic = info.topics.find((t) => t.key === e.topicKey);
    const rule = topic ? info.rules.get(topic.id) : undefined;
    if (topic && rule) allow({ topic, ruleId: rule.ruleId, version: rule.version, body: rule.body });
  }
  const extended: GenerationContext = {
    ...ctx,
    blocks: specs,
    taskTopic: taskRef,
    spotTopics: chosen.includes('spot') ? ctx.spotTopics : [],
    reviewDate: choice.review ? d : ctx.reviewDate,
    reviewInputs: mistakes,
    inattention: [],
    dueTopics: [],
    allowed,
    recentEssays: withWriting ? await recentEssayPrompts(deps.db, RECENT_ESSAY_PROMPTS) : [],
    extra: { prompts: prompts.map((p) => p.prompt).filter((p) => p !== '') },
  };

  // Nothing for the model to write (only spelling and rewrite): no call.
  const made = specs.length === 0 ? { ok: true as const, gen: { blocks: [] }, defects: new Map<string, string>() } : await produce(deps, sessionId, extended, onStage);
  if (!made.ok) return made.code === undefined ? { ok: false, message: made.message } : { ok: false, message: made.message, code: made.code };
  const { nativeLanguage } = await getSettings(deps.db);
  const last = blocks.at(-1);
  const round = Math.max(1, ...blocks.map((b) => b.round)) + 1;
  try {
    await writeBlocks(
      deps.db, sessionId, nativeLanguage, extended, made.gen, made.defects, words, { ord: (last?.ord ?? -1) + 1, round },
      source ? { sourceBlockId: source.blockId, text: source.text } : null,
    );
  } catch (e) {
    await deleteRound(deps.db, sessionId, round);
    throw e;
  }
  await reopenSession(deps.db, sessionId);
  return { ok: true, sessionId };
}
