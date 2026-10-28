import { describe, expect, test } from 'vitest';
import { addDays } from '@/core/dates';
import { blockScores, consistency, errorBank, progressLog, type ScoredItem } from '@/core/progress/derive';

const item = (blockId: number, verdict: ScoredItem['verdict'], over: Partial<ScoredItem> = {}): ScoredItem => ({
  blockId,
  blockKind: 'task',
  format: 'gap',
  verdict,
  ...over,
});

describe('blockScores', () => {
  test('ignores null verdicts and question/speaking blocks', () => {
    const out = blockScores([
      item(1, 'correct'),
      item(1, 'wrong'),
      item(1, null),
      item(2, 'correct', { format: 'question' }),
      item(3, 'correct', { blockKind: 'speaking' }),
    ]);
    expect(out).toEqual([{ blockId: 1, correct: 1, counted: 2 }]);
  });
});

const row = (over: Partial<Parameters<typeof errorBank>[0][number]> = {}): Parameters<typeof errorBank>[0][number] => ({
  date: '2026-10-20',
  text: 'went',
  fix: '',
  format: 'gap',
  prompt: 'He ___ home',
  expected: 'goes',
  wrong: null,
  paragraph: null,
  topicId: 1,
  itemId: 1,
  effective: 'wrong',
  isInattention: false,
  verdict: 'wrong',
  ...over,
});

describe('errorBank', () => {
  test('inattention rows are tagged, dispute-corrected rows excluded, newest first', () => {
    const out = errorBank([
      row({ itemId: 2, date: '2026-10-19' }),
      row({ itemId: 3, isInattention: true }),
      row({ itemId: 4, effective: 'correct' }),
      row({ itemId: 5, effective: null }),
      row({ itemId: 6, format: 'spelling', text: 'recieve', expected: 'receive' }),
      row({ itemId: 1 }),
      row({ itemId: 7, isInattention: true, effective: 'correct' }),
    ]);
    expect(out.map((r) => [r.itemId, r.kind])).toEqual([
      [1, 'grammar'],
      [3, 'inattention'],
      [6, 'spelling'],
      [2, 'grammar'],
    ]);
  });

  test('fix replaces expected for non-spot, falls back to expected when empty', () => {
    const out = errorBank([row({ itemId: 1, fix: 'goes!' }), row({ itemId: 2 })]);
    expect(out[0]).toMatchObject({ was: { changed: 'went' }, shouldBe: { before: 'He ', changed: 'goes!', after: ' home' } });
    expect(out[1]).toMatchObject({ was: { changed: 'went' }, shouldBe: { changed: 'goes' } });
  });

  test('spot rows use prompt as was and expected as shouldBe', () => {
    const out = errorBank([row({ format: 'spot', prompt: 'He go', expected: 'He goes', text: 'x', fix: 'y', paragraph: 'Then He go home.' })]);
    expect(out[0]).toMatchObject({
      was: { before: 'Then ', changed: 'He go', after: ' home.' },
      shouldBe: { before: 'Then ', changed: 'He goes', after: ' home.' },
      sentence: 'Then He go home.',
      kind: 'grammar',
    });
  });
});

describe('consistency', () => {
  const today = '2026-10-22';
  const s = (daysAgo: number, isLight = false, status: 'draft' | 'generated' | 'graded' = 'graded') => ({
    date: addDays(today, -daysAgo),
    isLight,
    status,
  });

  test('first session 10 days inclusive, 6 graded (1 light)', () => {
    const r = consistency([s(9), s(8), s(6, true), s(4), s(2), s(0), s(5, false, 'generated')], today);
    expect(r).toMatchObject({ n: 10, practised: 6, light: 1 });
    expect(r.days).toHaveLength(100);
    expect(r.days.filter((d) => d.state === 'before_start')).toHaveLength(90);
    expect(r.days[99]).toEqual({ date: today, state: 'practised' });
    expect(r.days.find((d) => d.date === addDays(today, -5))?.state).toBe('none');
    expect(r.days.find((d) => d.date === addDays(today, -6))?.state).toBe('light');
  });

  test('ungraded sessions do not start the window; none graded gives n 0', () => {
    const r = consistency([s(3, false, 'generated')], today);
    expect(r).toMatchObject({ n: 0, practised: 0, light: 0 });
    expect(r.days.every((d) => d.state === 'before_start')).toBe(true);
  });

  test('n caps at 100', () => {
    const r = consistency([s(300)], today);
    expect(r.n).toBe(100);
    expect(r.days[0]?.state).toBe('none');
  });
});

const USAGE = { models: ['claude-m'], calls: 2, failedCalls: 1, tokens: { input: 1, cacheRead: 2, cacheWrite: 3, output: 4 } };

describe('progressLog', () => {
  test('counts errors, scores and passes through extras', () => {
    const out = progressLog([
      {
        sessionId: 1,
        date: '2026-10-20',
        title: 'S',
        isLight: false,
        items: [item(1, 'wrong'), item(1, 'correct'), item(1, null), item(2, 'wrong')],
        patterns: ['a'],
        disputes: 1,
        defects: 2,
        costUsd: 0.5,
        usage: USAGE,
      },
    ]);
    expect(out).toEqual([
      {
        sessionId: 1,
        date: '2026-10-20',
        title: 'S',
        isLight: false,
        scores: [
          { blockId: 1, correct: 1, counted: 2 },
          { blockId: 2, correct: 0, counted: 1 },
        ],
        errorCount: 2,
        patterns: ['a'],
        disputes: 1,
        defects: 2,
        costUsd: 0.5,
        usage: USAGE,
      },
    ]);
  });

  test('newest first', () => {
    const base = { title: 'S', isLight: false, items: [], patterns: [], disputes: 0, defects: 0, costUsd: 0, usage: USAGE };
    const out = progressLog([
      { ...base, sessionId: 1, date: '2026-10-01' },
      { ...base, sessionId: 2, date: '2026-10-02' },
    ]);
    expect(out.map((r) => r.sessionId)).toEqual([2, 1]);
  });
});
