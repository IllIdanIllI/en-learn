import type { ISODate } from '@/core/domain';
import type { Deps } from '@/core/ports';
import { getSession } from '@/core/db/repos/sessions';
import { latestWritingSource } from '@/core/db/repos/writing';
import { buildGenerationContext, reviewSources } from './context';
import { extensionTopic, firstRoundFormat } from './extend';
import { loadDayInfo, spottingTopics } from './plan';

export type TaskFormat = 'gap' | 'fix' | 'spot';
export interface LessonChoice { review: boolean; formats: TaskFormat[]; spelling: boolean; speaking: boolean; writing: boolean; rewrite: boolean }
export type RowReason = 'no_week_topic' | 'no_rule' | 'no_topics' | 'no_text';
/** Per task format: why its row is disabled, or null when it is available. */
export interface LessonOptions { reviewAvailable: boolean; formats: Record<TaskFormat, RowReason | null>; rewriteReason: RowReason | null; defaults: LessonChoice }

const FORMAT_ORDER: TaskFormat[] = ['gap', 'fix', 'spot'];

export function normaliseChoice(c: LessonChoice): LessonChoice {
  return { ...c, formats: FORMAT_ORDER.filter((f) => c.formats.includes(f)) };
}

export interface ExtendOptions { formats: Record<TaskFormat, RowReason | null>; defaults: TaskFormat[]; writing: boolean }

/** The picker rows and default ticks for the added round of today's graded session; writing is unavailable on a light session. */
export async function extendOptions(deps: Deps, sessionId: number): Promise<ExtendOptions> {
  const d = deps.clock.today();
  const ctx = await buildGenerationContext(deps, d, false);
  const topicReason: RowReason | null = (await extensionTopic(deps, sessionId, d, ctx)) ? null : 'no_topics';
  const formats: Record<TaskFormat, RowReason | null> = { gap: topicReason, fix: topicReason, spot: ctx.spotTopics.length > 0 ? null : 'no_topics' };
  const preferred = await firstRoundFormat(deps, sessionId);
  return { formats, defaults: [preferred].filter((f) => formats[f] === null), writing: !(await getSession(deps.db, sessionId))?.isLight };
}

/**
 * The picker rows and default ticks for day d. `rest` is a light lesson (a rest day, or the light toggle):
 * defaults are review and spelling only.
 */
export async function lessonOptions(deps: Deps, d: ISODate, rest: boolean): Promise<LessonOptions> {
  const info = await loadDayInfo(deps, d);
  if (!info) throw new Error('No programme');
  const { plan, topics, rules } = info;
  const { reviewInputs, dueTopics } = await reviewSources(deps, info, d);
  const reviewAvailable = reviewInputs.length > 0 || dueTopics.length > 0;

  const weekTopic = plan.weekNo === null ? undefined : topics.find((t) => t.weekNo === plan.weekNo);
  const weekReason: RowReason | null = !weekTopic ? 'no_week_topic' : rules.has(weekTopic.id) ? null : 'no_rule';
  const spotReason: RowReason | null = spottingTopics(info, d).included.length > 0 ? null : 'no_topics';
  const formats: Record<TaskFormat, RowReason | null> = { gap: weekReason, fix: weekReason, spot: spotReason };

  const source = await latestWritingSource(deps.db, d);
  const rewriteReason: RowReason | null = source ? null : 'no_text';

  const programmeFormat = rest || !plan.task ? [] : [plan.task.format];
  return {
    reviewAvailable,
    formats,
    rewriteReason,
    defaults: {
      review: reviewAvailable,
      formats: programmeFormat.filter((f) => formats[f] === null),
      spelling: true,
      speaking: !rest,
      writing: !rest && plan.slot === 'writing',
      rewrite: !rest && plan.slot === 'review_rewrite' && rewriteReason === null,
    },
  };
}
