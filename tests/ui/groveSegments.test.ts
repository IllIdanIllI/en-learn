import { describe, expect, it } from 'vitest';
import type { SessionView, ViewBlock, ViewItem } from '../../src/core/session/view';
import { answerSegments, scoreSegments } from '../../src/ui/grove/segments';
import { stalkMeter } from '../../src/ui/grove/sprites';

const item = (id: number, effective?: ViewItem['effective']): ViewItem => ({
  id, ord: id, number: id, prompt: '', format: 'gap', topicId: null, ruleId: null, ruleSection: null, status: 'active',
  ...(effective === undefined ? {} : { effective }),
});
const block = (id: number, over: Partial<ViewBlock>): ViewBlock => ({
  id, ord: id, kind: 'task', format: 'gap', title: '', instruction: '', formatExample: null, minutes: 5, round: 1,
  graded: false, items: [], itemCount: 0, paragraphs: [], ...over,
});
const view = (blocks: ViewBlock[]): SessionView => ({
  id: 1, date: '2026-10-31', title: '', isLight: false, status: 'generated', totalMinutes: 0, readFirst: null, blocks, open: false,
});

describe('answerSegments', () => {
  it('one entry per gap item and spot paragraph, in block order; questions add nothing', () => {
    const v = view([
      block(1, { items: [item(10), item(11)] }),
      block(2, { format: 'spot', paragraphs: [{ index: 0, text: 'a' }] }),
      block(3, { kind: 'speaking', format: 'question', question: 'q' }),
    ]);
    expect(answerSegments(v, { 10: ' hi ', 11: '  ' }, { '2:0': 'x' })).toEqual([true, false, true]);
  });

  it('skips graded blocks', () => {
    const v = view([block(1, { graded: true, items: [item(10)] })]);
    expect(answerSegments(v, {}, {})).toEqual([]);
  });

  it('60 fields still fit in 300 columns', () => {
    const v = view([block(1, { items: Array.from({ length: 60 }, (_, i) => item(i + 1)) })]);
    const states = answerSegments(v, {}, {}).map((f) => (f ? 'ok' : 'empty') as 'ok' | 'empty');
    expect(states).toHaveLength(60);
    expect(Math.max(...stalkMeter(states).map((r) => r.length))).toBeLessThanOrEqual(300);
  });
});

describe('scoreSegments', () => {
  it('graded items in order; null effective is skipped, correct is ok, the rest bad', () => {
    const v = view([block(1, { graded: true, items: [item(1, 'correct'), item(2, 'wrong'), item(3, null)] })]);
    expect(scoreSegments(v)).toEqual(['ok', 'bad']);
  });

  it('spot errors count, speaking blocks do not', () => {
    const v = view([
      block(1, { graded: true, format: 'spot', paragraphs: [{ index: 0, text: 'a', errors: [item(1, 'wrong')] }] }),
      block(2, { graded: true, kind: 'speaking', format: 'question', items: [item(2, 'correct')] }),
    ]);
    expect(scoreSegments(v)).toEqual(['bad']);
  });
});
