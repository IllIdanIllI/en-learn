import type { DayPlan, ISODate, Programme, SessionStatus, Slot, Topic } from '@/core/domain';
import type { Deps } from '@/core/ports';
import { addDays, isoWeekday } from '@/core/dates';
import { dayPlan, errorSpottingTopics, weekNo } from '@/core/programme/calendar';
import { getCurrentRules, getProgramme, getSlots, getTopics, type RuleRecord } from '@/core/db/repos/programme';
import { getSessionByDate } from '@/core/db/repos/sessions';
import { loadGradedFacts, type GradedFacts } from '@/core/progress/history';

export type TodayState =
  | { kind: 'no_programme' }
  | { kind: 'rest' }
  | { kind: 'rule_missing'; topics: Topic[] }
  | { kind: 'no_session'; plan: DayPlan; missingRuleTopics: Topic[] }
  | { kind: 'session'; sessionId: number; status: Extract<SessionStatus, 'generated' | 'graded'> };

export interface DayInfo {
  programme: Programme;
  topics: Topic[];
  plan: DayPlan;
  rules: Map<number, RuleRecord>;
  facts: GradedFacts;
}

/** Week number used to pick error-spotting topics; outside the programme: none before it, all after it. */
function spotWeek(p: Programme, d: ISODate, plan: DayPlan): number {
  return plan.weekNo ?? (d < p.startDate ? 0 : Number.MAX_SAFE_INTEGER);
}

export async function loadDayInfo(deps: Deps, d: ISODate): Promise<DayInfo | null> {
  const programme = await getProgramme(deps.db);
  if (!programme) return null;
  const [topics, slots, rules, facts] = await Promise.all([
    getTopics(deps.db),
    getSlots(deps.db) as Promise<Record<number, Slot>>,
    getCurrentRules(deps.db),
    loadGradedFacts(deps.db),
  ]);
  const week = weekNo(programme, d);
  const weekTopic = week === null ? undefined : topics.find((t) => t.weekNo === week);
  const monday = addDays(d, 1 - isoWeekday(d));
  const weekTopicHadWrongThisWeek =
    weekTopic !== undefined &&
    facts.topicFacts.some(
      (f) => f.topicId === weekTopic.id && f.verdict === 'wrong' && !f.isInattention && f.date >= monday && f.date < d,
    );
  const plan = dayPlan(programme, topics, slots, d, { weekTopicHadWrongThisWeek });
  return { programme, topics, plan, rules, facts };
}

export function spottingTopics(info: DayInfo, d: ISODate): { included: Topic[]; missingRule: Topic[] } {
  return errorSpottingTopics(info.topics, spotWeek(info.programme, d, info.plan), (id) => info.rules.has(id));
}

/** Topic the task block needs a rule for (gap/fix, or spot on a notice topic), if any. */
export function taskTopic(info: DayInfo): Topic | null {
  const id = info.plan.task?.topicId ?? null;
  return id === null ? null : (info.topics.find((t) => t.id === id) ?? null);
}

export async function getTodayState(deps: Deps): Promise<TodayState> {
  const d = deps.clock.today();
  const info = await loadDayInfo(deps, d);
  if (!info) return { kind: 'no_programme' };
  const existing = await getSessionByDate(deps.db, d);
  if (existing && existing.status !== 'draft') return { kind: 'session', sessionId: existing.id, status: existing.status };
  if (info.plan.kind === 'rest') return { kind: 'rest' };
  const topic = taskTopic(info);
  if (topic && !info.rules.has(topic.id)) return { kind: 'rule_missing', topics: [topic] };
  return { kind: 'no_session', plan: info.plan, missingRuleTopics: spottingTopics(info, d).missingRule };
}
