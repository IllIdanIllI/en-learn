import { describe, expect, test } from 'vitest';
import { dueTopicIds, replayTopics, type TopicFact } from '@/core/schedule/topics';

let sid = 0;
function fact(date: string, o: Partial<TopicFact> = {}): TopicFact {
  return {
    sessionId: o.sessionId ?? ++sid,
    date,
    topicId: 1,
    isCheck: false,
    verdict: 'wrong',
    isInattention: false,
    supported: false,
    ...o,
  };
}
const err = (d: string) => fact(d);
const check = (d: string, o: Partial<TopicFact> = {}) => fact(d, { isCheck: true, verdict: 'correct', ...o });

describe('replayTopics', () => {
  test('error opens the topic with pending 1/3/7', () => {
    const s = replayTopics([err('2026-10-01')]).get(1)!;
    expect(s.status).toBe('open');
    expect(s.pending).toEqual(['2026-10-02', '2026-10-04', '2026-10-08']);
    expect(s.successes).toEqual([]);
    expect(s.history).toEqual([{ date: '2026-10-01', event: 'error' }]);
  });

  test('three unsupported correct checks close on 10-08', () => {
    const s = replayTopics([
      err('2026-10-01'),
      check('2026-10-02'),
      check('2026-10-04'),
      check('2026-10-08'),
    ]).get(1)!;
    expect(s.status).toBe('closed');
    expect(s.pending).toEqual([]);
    expect(s.successes).toEqual(['2026-10-02', '2026-10-04', '2026-10-08']);
    expect(s.history.at(-1)).toEqual({ date: '2026-10-08', event: 'closed' });
  });

  test('supported check does not add a success but still closes', () => {
    const s = replayTopics([
      err('2026-10-01'),
      check('2026-10-02'),
      check('2026-10-04', { supported: true }),
      check('2026-10-08'),
    ]).get(1)!;
    expect(s.successes).toEqual(['2026-10-02', '2026-10-08']);
    expect(s.status).toBe('closed');
    expect(s.history.map((h) => h.event)).toEqual([
      'error',
      'check_correct',
      'check_correct_supported',
      'check_correct',
      'closed',
    ]);
  });

  test('two wrong and one correct answer in one session give one error event', () => {
    const s = replayTopics([
      fact('2026-10-01', { sessionId: 50 }),
      fact('2026-10-01', { sessionId: 50 }),
      fact('2026-10-01', { sessionId: 50, verdict: 'correct' }),
    ]).get(1)!;
    expect(s.history).toEqual([{ date: '2026-10-01', event: 'error' }]);
  });

  test('error on a closed topic reopens it', () => {
    const s = replayTopics([
      err('2026-10-01'),
      check('2026-10-02'),
      check('2026-10-04'),
      check('2026-10-08'),
      err('2026-10-20'),
    ]).get(1)!;
    expect(s.status).toBe('open');
    expect(s.pending).toEqual(['2026-10-21', '2026-10-23', '2026-10-27']);
    expect(s.successes).toEqual([]);
  });

  test('overdue collapse: one check clears all overdue pending, then d+3', () => {
    const s = replayTopics([err('2026-10-01'), check('2026-10-09')]).get(1)!;
    expect(s.successes).toEqual(['2026-10-09']);
    expect(s.pending).toEqual(['2026-10-12']);
    expect(s.status).toBe('open');
  });

  test('correct answer without isCheck gives no event', () => {
    const s = replayTopics([err('2026-10-01'), fact('2026-10-02', { verdict: 'correct' })]).get(1)!;
    expect(s.history).toEqual([{ date: '2026-10-01', event: 'error' }]);
    expect(s.pending).toEqual(['2026-10-02', '2026-10-04', '2026-10-08']);
  });

  test('correct check with no pending <= date gives no event', () => {
    const s = replayTopics([err('2026-10-01'), check('2026-10-01', { sessionId: 99 })]).get(1)!;
    expect(s.history).toHaveLength(1);
    const t = replayTopics([check('2026-10-05')]).get(1)!;
    expect(t.status).toBe('none');
    expect(t.history).toEqual([]);
  });

  test('inattention wrong and null verdict are ignored', () => {
    const s = replayTopics([
      fact('2026-10-01', { isInattention: true }),
      fact('2026-10-01', { verdict: null }),
    ]).get(1)!;
    expect(s.status).toBe('none');
    expect(s.history).toEqual([]);
  });

  test('input order does not matter', () => {
    const s = replayTopics([check('2026-10-02'), err('2026-10-01')]).get(1)!;
    expect(s.history.map((h) => h.event)).toEqual(['error', 'check_correct']);
  });
});

describe('dueTopicIds', () => {
  test('overdue pending is due', () => {
    const states = new Map([
      [1, { status: 'open' as const, pending: ['2026-10-02'], successes: [], history: [] }],
      [2, { status: 'open' as const, pending: ['2026-10-09'], successes: [], history: [] }],
      [3, { status: 'closed' as const, pending: [], successes: [], history: [] }],
    ]);
    expect(dueTopicIds(states, '2026-10-05')).toEqual([1]);
  });
});
