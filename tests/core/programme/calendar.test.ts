import { describe, expect, test } from 'vitest';
import type { Programme, Slot, Topic } from '@/core/domain';
import { dayPlan, errorSpottingTopics, weekNo } from '@/core/programme/calendar';

const p: Programme = { id: 1, title: 'P', startDate: '2026-10-19', endDate: '2026-11-08' };
const topics: Topic[] = [
  { id: 1, key: 'a', title: 'A', kind: 'learn', weekNo: 1 },
  { id: 2, key: 'b', title: 'B', kind: 'notice', weekNo: 2 },
  { id: 3, key: 'c', title: 'C', kind: 'learn', weekNo: 3 },
  { id: 4, key: 'bg', title: 'BG', kind: 'notice', weekNo: null },
];
const slots: Record<number, Slot> = {
  1: 'error_spotting', 2: 'topic', 3: 'rest', 4: 'second_set', 5: 'speaking', 6: 'writing', 7: 'review_rewrite',
};
const ctx = (w: boolean) => ({ weekTopicHadWrongThisWeek: w });

describe('weekNo', () => {
  test('maps dates to weeks and null outside range', () => {
    expect(weekNo(p, '2026-10-19')).toBe(1);
    expect(weekNo(p, '2026-10-26')).toBe(2);
    expect(weekNo(p, '2026-11-08')).toBe(3);
    expect(weekNo(p, '2026-11-09')).toBeNull();
    expect(weekNo(p, '2026-10-18')).toBeNull();
  });
});

describe('dayPlan', () => {
  test('Tue week 1 learn topic gives gap or fix on the week topic', () => {
    const plan = dayPlan(p, topics, slots, '2026-10-20', ctx(false));
    expect(plan.kind).toBe('normal');
    expect(plan.slot).toBe('topic');
    expect(plan.weekNo).toBe(1);
    expect(['gap', 'fix']).toContain(plan.task?.format);
    expect(plan.task?.topicId).toBe(1);
  });
  test('Wed is rest', () => {
    const plan = dayPlan(p, topics, slots, '2026-10-21', ctx(false));
    expect(plan.kind).toBe('rest');
    expect(plan.task).toBeNull();
  });
  test('Thu second_set: spot without wrong, topic task with wrong', () => {
    expect(dayPlan(p, topics, slots, '2026-10-22', ctx(false)).task?.format).toBe('spot');
    const t = dayPlan(p, topics, slots, '2026-10-22', ctx(true)).task;
    expect(t?.topicId).toBe(1);
    expect(['gap', 'fix']).toContain(t?.format);
  });
  test('Fri speaking is spot', () => {
    expect(dayPlan(p, topics, slots, '2026-10-23', ctx(false)).task?.format).toBe('spot');
  });
  test('outside range is review_only', () => {
    const plan = dayPlan(p, topics, slots, '2026-11-09', ctx(false));
    expect(plan).toEqual({ kind: 'review_only', weekNo: null, slot: null, task: null });
  });
  test('Tue in a notice week is spot', () => {
    expect(dayPlan(p, topics, slots, '2026-10-27', ctx(false)).task?.format).toBe('spot');
  });
  test('alternates fix on even weekday, gap on odd', () => {
    expect(dayPlan(p, topics, slots, '2026-10-20', ctx(false)).task?.format).toBe('fix');
    expect(dayPlan(p, topics, slots, '2026-10-22', ctx(true)).task?.format).toBe('fix');
  });
  test('in range without week topic gives spot with null topic', () => {
    const plan = dayPlan(p, topics.filter((t) => t.weekNo !== 1), slots, '2026-10-20', ctx(false));
    expect(plan.task).toEqual({ format: 'spot', topicId: null });
  });
});

describe('errorSpottingTopics', () => {
  test('includes weeks up to N plus background, splits by rule', () => {
    const r = errorSpottingTopics(topics, 2, (id) => id !== 2);
    expect(r.included.map((t) => t.id)).toEqual([1, 4]);
    expect(r.missingRule.map((t) => t.id)).toEqual([2]);
  });
});
