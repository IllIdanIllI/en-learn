import { createEmptyCard, fsrs, generatorParameters, Rating, type Grade } from 'ts-fsrs';
import type { ISODate } from '@/core/domain';
import { CORRECT_DAYS_TO_ADVANCE, LEARNED_INTERVAL_DAYS } from './constants';
import type { ReviewResult, Stage, WordReview } from './types';

export interface WordState {
  stage: Stage;
  passedUse: boolean;
  stageCorrect: number;
  due: ISODate | null;
  intervalDays: number;
  reviewed: boolean;
}

const f = fsrs(generatorParameters({ request_retention: 0.9, enable_fuzz: true, enable_short_term: false }));

const GRADE: Record<ReviewResult, Grade> = { wrong: Rating.Again, hard: Rating.Hard, correct: Rating.Good };

const noon = (date: ISODate) => new Date(`${date}T12:00:00Z`);

// Replays the counted reviews in the given order; stage and FSRS state are derived, never stored.
export function replayWord(reviews: WordReview[]): WordState {
  const counted = reviews.filter((r) => r.counted);
  const first = counted[0];
  if (!first) {
    return { stage: 1, passedUse: false, stageCorrect: 0, due: null, intervalDays: 0, reviewed: false };
  }
  let card = createEmptyCard(noon(first.date));
  let stage: Stage = 1;
  let stageCorrect = 0;
  let passedUse = false;
  for (const r of counted) {
    card = f.next(card, noon(r.date), GRADE[r.result]).card;
    if (r.result === 'wrong') {
      stage = Math.max(1, stage - 1) as Stage;
      stageCorrect = 0;
      passedUse = false;
    } else if (stage < 4) {
      stageCorrect++;
      if (stageCorrect >= CORRECT_DAYS_TO_ADVANCE) {
        if (stage === 3) passedUse = true;
        else stage = (stage + 1) as Stage;
        stageCorrect = 0;
      }
    }
    if (stage === 3 && passedUse && card.scheduled_days >= LEARNED_INTERVAL_DAYS) stage = 4;
  }
  return { stage, passedUse, stageCorrect, due: card.due.toISOString().slice(0, 10), intervalDays: card.scheduled_days, reviewed: true };
}
