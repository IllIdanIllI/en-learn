import type { DayPlan, ISODate, Slot, Topic } from '@/core/domain';
import type { Deps } from '@/core/ports';
import { addDays, formatTitleDate } from '@/core/dates';
import { dueTopicIds, replayTopics } from '@/core/schedule/topics';
import { listGradedSessions } from '@/core/db/repos/sessions';
import { loadDayInfo, spottingTopics, taskTopic, type DayInfo } from './plan';

export interface RuleRef { topic: Topic; ruleId: number; version: number; body: string }
export interface ReviewEntry { prompt: string; answer: string; fix: string; topicKey: string | null }
export interface BlockSpec { kind: 'review' | 'task' | 'speaking'; format: string }

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

export async function buildGenerationContext(deps: Deps, d: ISODate, light: boolean): Promise<GenerationContext> {
  const info = await loadDayInfo(deps, d);
  if (!info) throw new Error('No programme');
  const { plan, facts } = info;
  const byId = new Map(info.topics.map((t) => [t.id, t]));

  const taskT = light ? null : taskTopic(info);
  const taskRef = taskT ? ref(info, taskT) : null;
  if (taskT && !taskRef) throw new Error(`Rule for ${taskT.key} is missing`);
  const spotTopics = spottingTopics(info, d).included.flatMap((t) => ref(info, t) ?? []);

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
  });
  const reviewInputs = last
    ? facts.errorRows.filter((r) => r.format !== 'spelling' && r.date === last.date && r.effective === 'wrong' && !r.isInattention).map(entry)
    : [];
  const since = addDays(d, -INATTENTION_DAYS);
  const inattention = facts.errorRows
    .filter((r) => r.format !== 'spelling' && r.effective === 'wrong' && r.isInattention && r.date >= since && r.date < d)
    .map(entry);

  const allowed = new Map<string, RuleRef>();
  for (const r of [taskRef, ...spotTopics, ...dueTopics]) if (r) allowed.set(r.topic.key, r);
  for (const e of [...reviewInputs, ...inattention]) {
    const t = info.topics.find((x) => x.key === e.topicKey);
    const r = t ? ref(info, t) : null;
    if (r && !allowed.has(r.topic.key)) allowed.set(r.topic.key, r);
  }

  const blocks: BlockSpec[] = [];
  if (reviewInputs.length > 0 || dueTopics.length > 0) blocks.push({ kind: 'review', format: 'gap or fix' });
  if (!light && plan.task) blocks.push({ kind: 'task', format: plan.task.format });
  blocks.push({ kind: 'speaking', format: 'question' });

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
    reviewDate: last?.date ?? null,
    reviewInputs,
    inattention,
    dueTopics,
    allowed: [...allowed.values()],
  };
}

function ruleText(r: RuleRef): string {
  return `### ${r.topic.key} (${r.topic.title}, ${r.topic.kind}, rule version ${r.version})\n\n~~~~markdown\n${r.body}\n~~~~`;
}

function renderRules(refs: RuleRef[], printed: Set<string>): string {
  if (refs.length === 0) return 'None.';
  return refs
    .map((r) => {
      if (printed.has(r.topic.key)) return `### ${r.topic.key} (${r.topic.title})\n\nRule printed above.`;
      printed.add(r.topic.key);
      return ruleText(r);
    })
    .join('\n\n');
}

function renderEntries(entries: ReviewEntry[]): string {
  if (entries.length === 0) return 'None.';
  return entries
    .map((e) => `- prompt: ${e.prompt} | learner answer: ${e.answer} | fix: ${e.fix || '(none)'} | topic: ${e.topicKey ?? '(none)'}`)
    .join('\n');
}

export function renderContext(ctx: GenerationContext): string {
  const printed = new Set<string>();
  const blocks = ctx.blocks
    .map((b, i) => {
      const topic = b.kind === 'task' && ctx.taskTopic ? `, topic ${ctx.taskTopic.topic.key}` : '';
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
