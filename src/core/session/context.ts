import type { DayPlan, ISODate, Slot, Topic } from '@/core/domain';
import type { Deps } from '@/core/ports';
import { addDays, formatTitleDate } from '@/core/dates';
import { dueTopicIds, replayTopics } from '@/core/schedule/topics';
import { listGradedSessions } from '@/core/db/repos/sessions';
import { listSkippedItems } from '@/core/db/repos/answers';
import type { LessonChoice } from './choice';
import { loadDayInfo, spottingTopics, taskTopic, type DayInfo } from './plan';

export interface RuleRef { topic: Topic; ruleId: number; version: number; body: string }
export interface ReviewEntry { prompt: string; answer: string; fix: string; topicKey: string | null; skipped: boolean }
export interface BlockSpec { kind: 'review' | 'task' | 'speaking'; format: string; topicKey?: string }

export interface GenerationContext {
  date: ISODate;
  weekNo: number | null;
  slot: Slot | null;
  light: boolean;
  secondSet: boolean;
  plan: DayPlan;
  blocks: BlockSpec[];
  taskTopic: RuleRef | null;
  spotTopics: RuleRef[];
  reviewDate: ISODate | null;
  reviewInputs: ReviewEntry[];
  inattention: ReviewEntry[];
  dueTopics: RuleRef[];
  /** Every topic whose rule is part of the context, once each. */
  allowed: RuleRef[];
  /** An extra set for a lesson already done: the prompts of that lesson, not to be repeated. */
  extra?: { prompts: string[] };
}

const INATTENTION_DAYS = 14;

/** Headings (`## Name`) of a rule body, without the leading ##. */
export function ruleSections(body: string): string[] {
  return [...body.matchAll(/^##[ \t]+(.*\S)[ \t]*$/gm)].map((m) => m[1] as string);
}

function ref(info: DayInfo, topic: Topic): RuleRef | null {
  const r = info.rules.get(topic.id);
  return r ? { topic, ruleId: r.ruleId, version: r.version, body: r.body } : null;
}

export interface ReviewSources {
  reviewDate: ISODate | null;
  reviewInputs: ReviewEntry[];
  inattention: ReviewEntry[];
  dueTopics: RuleRef[];
}

/** Review input (last graded session's counted wrong answers and skipped items), inattention errors and due re-checks for day d. */
export async function reviewSources(deps: Deps, info: DayInfo, d: ISODate): Promise<ReviewSources> {
  const { facts } = info;
  const byId = new Map(info.topics.map((t) => [t.id, t]));

  const due = dueTopicIds(replayTopics(facts.topicFacts), d);
  const dueTopics = due.flatMap((id) => {
    const t = byId.get(id);
    return t && !t.archived ? (ref(info, t) ?? []) : [];
  });

  const last = (await listGradedSessions(deps.db)).find((s) => s.date < d) ?? null;
  const entry = (r: (typeof facts.errorRows)[number]): ReviewEntry => ({
    prompt: r.prompt,
    answer: r.text,
    fix: r.fix,
    topicKey: r.topicId === null ? null : (byId.get(r.topicId)?.key ?? null),
    skipped: false,
  });
  const skipped: ReviewEntry[] = last
    ? (await listSkippedItems(deps.db, last.id)).map((r) => ({
        prompt: r.prompt,
        answer: '',
        fix: r.expected,
        topicKey: r.topicId === null ? null : (byId.get(r.topicId)?.key ?? null),
        skipped: true,
      }))
    : [];
  const reviewInputs = last
    ? [
        ...facts.errorRows.filter((r) => r.format !== 'spelling' && r.date === last.date && r.effective === 'wrong' && !r.isInattention).map(entry),
        ...skipped,
      ]
    : [];
  const since = addDays(d, -INATTENTION_DAYS);
  const inattention = facts.errorRows
    .filter((r) => r.format !== 'spelling' && r.effective === 'wrong' && r.isInattention && r.date >= since && r.date < d)
    .map(entry);
  return { reviewDate: last?.date ?? null, reviewInputs, inattention, dueTopics };
}

/** Without a choice the blocks are the day's programme; with one, exactly what it ticks (review only when there is something to review). */
export async function buildGenerationContext(deps: Deps, d: ISODate, light: boolean, choice?: LessonChoice): Promise<GenerationContext> {
  const info = await loadDayInfo(deps, d);
  if (!info) throw new Error('No programme');
  const { plan } = info;

  const weekT = plan.weekNo === null ? undefined : info.topics.find((t) => t.weekNo === plan.weekNo);
  const gapOrFix = choice?.formats.some((f) => f === 'gap' || f === 'fix') ?? false;
  const taskT = choice ? (gapOrFix ? (weekT ?? null) : choice.formats.includes('spot') ? taskTopic(info) : null) : light ? null : taskTopic(info);
  const taskRef = taskT ? ref(info, taskT) : null;
  if (taskT && !taskRef) throw new Error(`Rule for ${taskT.key} is missing`);
  // A spot block has a topic of its own only on a notice-topic day (plan.task is spot with a topic).
  const noticeT = plan.task?.format === 'spot' && plan.task.topicId != null ? info.topics.find((t) => t.id === plan.task?.topicId) : undefined;
  const noticeRef = noticeT && (!choice || choice.formats.includes('spot')) ? ref(info, noticeT) : null;
  const spotTopics = choice && !choice.formats.includes('spot') ? [] : spottingTopics(info, d).included.flatMap((t) => ref(info, t) ?? []);

  const { reviewDate, reviewInputs, inattention, dueTopics } = await reviewSources(deps, info, d);

  const allowed = new Map<string, RuleRef>();
  for (const r of [taskRef, noticeRef, ...spotTopics, ...dueTopics]) if (r) allowed.set(r.topic.key, r);
  for (const e of [...reviewInputs, ...inattention]) {
    const t = info.topics.find((x) => x.key === e.topicKey);
    const r = t ? ref(info, t) : null;
    if (r && !allowed.has(r.topic.key)) allowed.set(r.topic.key, r);
  }

  const blocks: BlockSpec[] = [];
  if ((!choice || choice.review) && (reviewInputs.length > 0 || dueTopics.length > 0)) blocks.push({ kind: 'review', format: 'gap or fix' });
  if (choice) {
    for (const f of choice.formats) {
      const key = f === 'spot' ? noticeRef?.topic.key : taskRef?.topic.key;
      blocks.push(key ? { kind: 'task', format: f, topicKey: key } : { kind: 'task', format: f });
    }
  } else if (!light && plan.task) {
    blocks.push(taskRef ? { kind: 'task', format: plan.task.format, topicKey: taskRef.topic.key } : { kind: 'task', format: plan.task.format });
  }
  if (!choice || choice.speaking) blocks.push({ kind: 'speaking', format: 'question' });

  return {
    date: d,
    weekNo: plan.weekNo,
    slot: plan.slot,
    light,
    secondSet: plan.slot === 'second_set' && plan.task?.topicId != null,
    plan,
    blocks,
    taskTopic: taskRef,
    spotTopics,
    reviewDate,
    reviewInputs,
    inattention,
    dueTopics,
    allowed: [...allowed.values()],
  };
}

const allowedSections = (r: RuleRef): string => `Allowed rule sections (copy one verbatim): ${ruleSections(r.body).map((h) => `"${h}"`).join(', ')}`;

function ruleText(r: RuleRef): string {
  return `### ${r.topic.key} (${r.topic.title}, ${r.topic.kind}, rule version ${r.version})\n\n${allowedSections(r)}\n\n~~~~markdown\n${r.body}\n~~~~`;
}

function renderRules(refs: RuleRef[], printed: Set<string>): string {
  if (refs.length === 0) return 'None.';
  return refs
    .map((r) => {
      if (printed.has(r.topic.key)) return `### ${r.topic.key} (${r.topic.title})\n\nRule printed above.\n\n${allowedSections(r)}`;
      printed.add(r.topic.key);
      return ruleText(r);
    })
    .join('\n\n');
}

function renderEntries(entries: ReviewEntry[]): string {
  if (entries.length === 0) return 'None.';
  return entries
    .map((e) => `- prompt: ${e.prompt} | learner answer: ${e.answer} | fix: ${e.fix || '(none)'} | topic: ${e.topicKey ?? '(none)'}${e.skipped ? ' | skipped' : ''}`)
    .join('\n');
}

export function renderContext(ctx: GenerationContext): string {
  const printed = new Set<string>();
  const blocks = ctx.blocks
    .map((b, i) => {
      const topic = b.topicKey ? `, topic ${b.topicKey}` : '';
      return `${i + 1}. ${b.kind} (format ${b.format}${topic})`;
    })
    .join('\n');
  const reviewHeading = ctx.reviewDate
    ? `## Review input (counted wrong answers of the last graded session, ${ctx.reviewDate})`
    : '## Review input (no graded session yet)';
  const dueKeys = ctx.dueTopics.map((r) => r.topic.key);
  const taskSection = ctx.taskTopic ? renderRules([ctx.taskTopic], printed) : 'None: no task topic today.';
  const spotSection = renderRules(ctx.spotTopics, printed);
  const dueSection = renderRules(ctx.dueTopics, printed);
  const otherRefs = ctx.allowed.filter((r) => !printed.has(r.topic.key));
  const other = otherRefs.length > 0 ? `\n\n## Other topics with rules (from the review input)\n\n${renderRules(otherRefs, printed)}` : '';

  return [
    '# Session context',
    '',
    `- Date: ${ctx.date} (${formatTitleDate(ctx.date, 'en')})`,
    `- Week: ${ctx.weekNo ?? 'outside the programme'}`,
    `- Slot: ${ctx.slot ?? 'none'}`,
    `- Light day: ${ctx.light ? 'yes' : 'no'}`,
    `- Second set: ${ctx.secondSet ? 'yes' : 'no'}`,
    '',
    '## Blocks to produce',
    '',
    blocks,
    '',
    ...(ctx.extra
      ? [
          '## Extra set',
          '',
          `This is an extra set for today's finished lesson: 6 to 8 items, do not repeat these prompts:\n${ctx.extra.prompts.map((p) => `- ${p}`).join('\n')}`,
          '',
        ]
      : []),
    '## Task topic',
    '',
    taskSection,
    '',
    '## Error-spotting topics',
    '',
    spotSection,
    '',
    reviewHeading,
    '',
    renderEntries(ctx.reviewInputs),
    '',
    `## Inattention errors (last ${INATTENTION_DAYS} days)`,
    '',
    renderEntries(ctx.inattention),
    '',
    '## Due re-checks',
    '',
    dueKeys.length > 0 ? `Each of these topics needs one check item (isCheck = true) in the review block: ${dueKeys.join(', ')}.\n\n${dueSection}` : 'None.',
    other,
    '',
    '## Topic keys allowed',
    '',
    ctx.allowed.map((r) => `- ${r.topic.key}`).join('\n') || 'None.',
    '',
  ].join('\n');
}
