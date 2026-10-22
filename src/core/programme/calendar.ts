import type { DayPlan, ISODate, Programme, Slot, Topic } from '@/core/domain';
import { daysBetween, isoWeekday } from '@/core/dates';

export function weekNo(p: Programme, d: ISODate): number | null {
  if (d < p.startDate || d > p.endDate) return null;
  return Math.floor(daysBetween(p.startDate, d) / 7) + 1;
}

export function dayPlan(
  p: Programme,
  topics: Topic[],
  slots: Record<number, Slot>,
  d: ISODate,
  ctx: { weekTopicHadWrongThisWeek: boolean },
): DayPlan {
  const week = weekNo(p, d);
  if (week === null) return { kind: 'review_only', weekNo: null, slot: null, task: null };
  const weekday = isoWeekday(d);
  const slot = slots[weekday];
  if (slot === undefined) throw new Error(`No slot for weekday ${weekday}`);
  if (slot === 'rest') return { kind: 'rest', weekNo: week, slot, task: null };

  const spot = (topicId: number | null): DayPlan => ({
    kind: 'normal', weekNo: week, slot, task: { format: 'spot', topicId },
  });
  const weekTopic = topics.find((t) => t.weekNo === week);
  const wantsTopic = slot === 'topic' || (slot === 'second_set' && ctx.weekTopicHadWrongThisWeek);
  if (!weekTopic) return spot(null);
  if (!wantsTopic) return spot(null);
  if (weekTopic.kind === 'notice') return spot(weekTopic.id);
  return {
    kind: 'normal', weekNo: week, slot,
    task: { format: weekday % 2 === 0 ? 'fix' : 'gap', topicId: weekTopic.id },
  };
}

export function errorSpottingTopics(
  topics: Topic[],
  week: number,
  hasRule: (id: number) => boolean,
): { included: Topic[]; missingRule: Topic[] } {
  const included: Topic[] = [];
  const missingRule: Topic[] = [];
  for (const t of topics) {
    if (t.archived) continue;
    if (t.weekNo !== null && t.weekNo > week) continue;
    (hasRule(t.id) ? included : missingRule).push(t);
  }
  return { included, missingRule };
}
