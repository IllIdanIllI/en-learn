import type { ISODate } from '@/core/domain';
import type { Deps } from '@/core/ports';
import { getSession } from '@/core/db/repos/sessions';
import { latestWritingSource } from '@/core/db/repos/writing';
import { buildGenerationContext, reviewSources, todayMistakes } from './context';
import { extensionTopic, firstRoundFormat, roundSpelling } from './extend';
import { loadDayInfo, spottingTopics } from './plan';

export type TaskFormat = 'gap' | 'fix' | 'spot';
export interface LessonChoice { review: boolean; formats: TaskFormat[]; spelling: boolean; speaking: boolean; writing: boolean; rewrite: boolean }
export type RowReason = 'no_week_topic' | 'no_rule' | 'no_topics' | 'no_text' | 'no_mistakes' | 'no_words';
/** Per task format: why its row is disabled, or null when it is available. */
export interface LessonOptions { reviewAvailable: boolean; formats: Record<TaskFormat, RowReason | null>; rewriteReason: RowReason | null; defaults: LessonChoice }

const FORMAT_ORDER: TaskFormat[] = ['gap', 'fix', 'spot'];

export function normaliseChoice(c: LessonChoice): LessonChoice {
  return { ...c, formats: FORMAT_ORDER.filter((f) => c.formats.includes(f)) };
}

/** What the learner ticks for an added round. */
export interface AddRound { review: boolean; formats: TaskFormat[]; spelling: boolean; writing: boolean; rewrite: boolean }

/** `writing` is whether writing and rewrite are allowed at all: false on a light session. */
export interface ExtendOptions {
  formats: Record<TaskFormat, RowReason | null>;
  defaults: TaskFormat[];
  writing: boolean;
  reviewReason: RowReason | null;
  spellingReason: RowReason | null;
  rewriteReason: RowReason | null;
}

/** The picker rows and default ticks for the added round of today's graded session; writing and rewrite are unavailable on a light session. */
export async function extendOptions(deps: Deps, sessionId: number): Promise<ExtendOptions> {
  const d = deps.clock.today();
  const info = await loadDayInfo(deps, d);
  if (!info) throw new Error('No programme');
  const ctx = await buildGenerationContext(deps, d, false);
  const topicReason: RowReason | null = (await extensionTopic(deps, sessionId, d, ctx)) ? null : 'no_topics';
  const formats: Record<TaskFormat, RowReason | null> = { gap: topicReason, fix: topicReason, spot: ctx.spotTopics.length > 0 ? null : 'no_topics' };
  const preferred = await firstRoundFormat(deps, sessionId);
  return {
    formats,
    defaults: [preferred].filter((f) => formats[f] === null),
    writing: !(await getSession(deps.db, sessionId))?.isLight,
    reviewReason: todayMistakes(info, d).length > 0 ? null : 'no_mistakes',
    spellingReason: (await roundSpelling(deps, sessionId, d)).length > 0 ? null : 'no_words',
    rewriteReason: (await latestWritingSource(deps.db, d, true)) ? null : 'no_text',
  };
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
