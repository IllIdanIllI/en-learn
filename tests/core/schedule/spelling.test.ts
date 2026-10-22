import { describe, expect, test } from 'vitest';
import { replaySpelling, selectSpellingWords, type WordState } from '@/core/schedule/spelling';

let sid = 0;
const f = (wordId: number, date: string, correct: boolean) => ({ wordId, sessionId: ++sid, date, correct });

describe('replaySpelling', () => {
  test('first wrong schedules 1/3/7', () => {
    const w = replaySpelling([f(1, '2026-10-01', false)]).get(1)!;
    expect(w.retired).toBe(false);
    expect(w.pending).toEqual(['2026-10-02', '2026-10-04', '2026-10-08']);
    expect(w.lastTested).toBe('2026-10-01');
  });

  test('correct on 10-02 and 10-08 retires', () => {
    const w = replaySpelling([
      f(1, '2026-10-01', false),
      f(1, '2026-10-02', true),
      f(1, '2026-10-08', true),
    ]).get(1)!;
    expect(w.retired).toBe(true);
    expect(w.pending).toEqual([]);
    expect(w.successes).toEqual(['2026-10-02', '2026-10-08']);
    expect(w.lastTested).toBe('2026-10-08');
  });

  test('wrong on a retired word reactivates it', () => {
    const w = replaySpelling([
      f(1, '2026-10-01', false),
      f(1, '2026-10-02', true),
      f(1, '2026-10-08', true),
      f(1, '2026-10-20', false),
    ]).get(1)!;
    expect(w.retired).toBe(false);
    expect(w.successes).toEqual([]);
    expect(w.pending).toEqual(['2026-10-21', '2026-10-23', '2026-10-27']);
  });

  test('correct with no pending due is no event, but lastTested updates', () => {
    const w = replaySpelling([f(1, '2026-10-01', false), f(1, '2026-10-01', true)]).get(1)!;
    expect(w.pending).toEqual(['2026-10-02', '2026-10-04', '2026-10-08']);
    const v = replaySpelling([f(2, '2026-10-01', false), f(2, '2026-10-01', false), f(2, '2026-10-01', true)]);
    expect(v.get(2)!.pending).toHaveLength(3);
  });

  test('overdue correct collapses pending and schedules d+3', () => {
    const w = replaySpelling([f(1, '2026-10-01', false), f(1, '2026-10-09', true)]).get(1)!;
    expect(w.successes).toEqual(['2026-10-09']);
    expect(w.pending).toEqual(['2026-10-12']);
  });

  test('wrong wins over correct within one session', () => {
    const w = replaySpelling([
      { wordId: 1, sessionId: 5, date: '2026-10-01', correct: true },
      { wordId: 1, sessionId: 5, date: '2026-10-01', correct: false },
    ]).get(1)!;
    expect(w.pending).toEqual(['2026-10-02', '2026-10-04', '2026-10-08']);
  });
});

describe('selectSpellingWords', () => {
  const day = (n: number) => `2026-09-${String(n).padStart(2, '0')}`;
  const st = (o: Partial<WordState>): WordState => ({
    retired: false,
    pending: [],
    successes: [],
    lastTested: null,
    ...o,
  });

  test('20 due words give the 15 earliest due', () => {
    const states = new Map<number, WordState>();
    const ids: number[] = [];
    for (let i = 1; i <= 20; i++) {
      ids.push(i);
      states.set(i, st({ pending: [day(21 - i)], lastTested: day(1) }));
    }
    const out = selectSpellingWords(states, ids, '2026-10-01', false);
    expect(out).toHaveLength(15);
    expect(out[0]).toBe(20);
    expect(out).toEqual([20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6]);
  });

  test('3 due and 12 others fill to 10, due first', () => {
    const states = new Map<number, WordState>();
    const ids: number[] = [];
    for (let i = 1; i <= 15; i++) {
      ids.push(i);
      states.set(i, i <= 3 ? st({ pending: [day(i)], lastTested: day(20) }) : st({ lastTested: day(i) }));
    }
    const out = selectSpellingWords(states, ids, '2026-10-01', false);
    expect(out).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  test('light returns the first 5', () => {
    const states = new Map<number, WordState>();
    const ids = Array.from({ length: 15 }, (_, i) => i + 1);
    for (const i of ids) states.set(i, st({ pending: [day(i)] }));
    expect(selectSpellingWords(states, ids, '2026-10-01', true)).toEqual([1, 2, 3, 4, 5]);
  });

  test('retired words are skipped and stateless words count as untested', () => {
    const states = new Map<number, WordState>([
      [1, st({ retired: true, pending: [], lastTested: day(1) })],
      [2, st({ lastTested: day(5) })],
    ]);
    expect(selectSpellingWords(states, [1, 2, 3], '2026-10-01', false)).toEqual([3, 2]);
  });
});
