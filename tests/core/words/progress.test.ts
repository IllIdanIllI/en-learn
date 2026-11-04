import { describe, expect, it } from 'vitest';
import { replayWord } from '@/core/words/progress';
import type { ReviewResult, WordReview } from '@/core/words/types';

let nextId = 1;
function rev(date: string, result: ReviewResult, counted = true): WordReview {
  return { id: nextId++, wordId: 1, cardType: 'gap', exerciseId: null, answeredAt: `${date}T10:00:00Z`, date, result, counted, text: '' };
}
function day(n: number): string {
  return new Date(Date.UTC(2026, 0, 1 + n)).toISOString().slice(0, 10);
}
const correct = (n: number) => Array.from({ length: n }, (_, i) => rev(day(i), 'correct'));

describe('replayWord', () => {
  it('no reviews → stage 1, due null, reviewed false', () => {
    expect(replayWord([])).toEqual({ stage: 1, passedUse: false, stageCorrect: 0, due: null, intervalDays: 0, reviewed: false });
  });

  it('two correct on different days → stage 2, four → stage 3', () => {
    expect(replayWord(correct(1))).toMatchObject({ stage: 1, stageCorrect: 1, reviewed: true });
    expect(replayWord(correct(2))).toMatchObject({ stage: 2, stageCorrect: 0 });
    expect(replayWord(correct(4))).toMatchObject({ stage: 3, passedUse: false, stageCorrect: 0 });
  });

  it('hard counts as correct for the stage', () => {
    expect(replayWord([rev(day(0), 'hard'), rev(day(1), 'correct')]).stage).toBe(2);
  });

  it('wrong moves down one stage and resets stageCorrect', () => {
    const s = replayWord([...correct(3), rev(day(3), 'wrong')]);
    expect(s).toMatchObject({ stage: 1, stageCorrect: 0 });
    const t = replayWord([...correct(2), rev(day(2), 'correct'), rev(day(3), 'wrong')]);
    expect(t).toMatchObject({ stage: 1, stageCorrect: 0 });
  });

  it('stage 1 stays 1 on wrong', () => {
    expect(replayWord([rev(day(0), 'wrong')]).stage).toBe(1);
  });

  it('not-counted reviews are ignored', () => {
    const s = replayWord([rev(day(0), 'correct'), rev(day(0), 'correct', false), rev(day(0), 'wrong', false)]);
    expect(s).toMatchObject({ stage: 1, stageCorrect: 1 });
    const none = replayWord([rev(day(0), 'correct', false)]);
    expect(none).toMatchObject({ reviewed: false, due: null });
  });

  it('due is after the review date', () => {
    const s = replayWord([rev('2026-03-10', 'wrong')]);
    expect(s.due! > '2026-03-10').toBe(true);
    expect(s.intervalDays).toBeGreaterThanOrEqual(1);
    const g = replayWord([rev('2026-03-10', 'correct')]);
    expect(g.due! > '2026-03-10').toBe(true);
  });

  function toLearned(): { reviews: WordReview[]; state: ReturnType<typeof replayWord> } {
    const reviews = correct(6);
    let state = replayWord(reviews);
    for (let i = 0; i < 40 && state.stage !== 4; i++) {
      expect(state.stage).toBe(3);
      expect(state.intervalDays).toBeLessThan(21);
      reviews.push(rev(state.due!, 'correct'));
      state = replayWord(reviews);
    }
    return { reviews, state };
  }

  it('learned: stage 4 exactly when intervalDays >= 21', () => {
    const { state } = toLearned();
    expect(state.stage).toBe(4);
    expect(state.intervalDays).toBeGreaterThanOrEqual(21);
  });

  it('wrong on learned → stage 3, passedUse false', () => {
    const { reviews, state } = toLearned();
    const s = replayWord([...reviews, rev(state.due!, 'wrong')]);
    expect(s).toMatchObject({ stage: 3, passedUse: false, stageCorrect: 0 });
  });

  it('correct or hard on learned stays learned', () => {
    const { reviews, state } = toLearned();
    expect(replayWord([...reviews, rev(state.due!, 'correct')]).stage).toBe(4);
    const hard = replayWord([...reviews, rev(state.due!, 'hard')]);
    expect(hard.stage).toBe(4);
  });

  it('replay is stable', () => {
    const reviews = [...correct(4), rev(day(10), 'hard'), rev(day(30), 'wrong'), rev(day(32), 'correct')];
    expect(replayWord(reviews)).toEqual(replayWord(reviews));
  });
});
