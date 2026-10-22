import type { BlockFormat, BlockKind, EffectiveVerdict, ISODate, SessionStatus, Verdict } from '@/core/domain';
import { addDays, daysBetween } from '@/core/dates';

export type ScoredItem = { blockId: number; blockKind: BlockKind; format: BlockFormat; verdict: EffectiveVerdict };
export type BlockScore = { blockId: number; correct: number; counted: number };

export function blockScores(items: ScoredItem[]): BlockScore[] {
  const byBlock = new Map<number, BlockScore>();
  for (const it of items) {
    if (it.blockKind === 'speaking' || it.format === 'question') continue;
    let s = byBlock.get(it.blockId);
    if (!s) {
      s = { blockId: it.blockId, correct: 0, counted: 0 };
      byBlock.set(it.blockId, s);
    }
    if (it.verdict === null) continue;
    s.counted += 1;
    if (it.verdict === 'correct') s.correct += 1;
  }
  return [...byBlock.values()];
}

export type ErrorBankRow = {
  date: ISODate;
  was: string;
  shouldBe: string;
  kind: 'grammar' | 'spelling' | 'inattention';
  topicId: number | null;
  itemId: number;
};

export type ErrorBankInput = {
  date: ISODate;
  text: string;
  fix: string;
  format: BlockFormat;
  prompt: string;
  expected: string;
  topicId: number | null;
  itemId: number;
  effective: EffectiveVerdict;
  isInattention: boolean;
  verdict: Verdict;
};

export function errorBank(rows: ErrorBankInput[]): ErrorBankRow[] {
  const out: ErrorBankRow[] = [];
  for (const r of rows) {
    if (r.effective !== 'wrong') continue;
    const kind = r.isInattention && r.verdict === 'wrong' ? 'inattention' : r.format === 'spelling' ? 'spelling' : 'grammar';
    const was = r.format === 'spot' ? r.prompt : r.text;
    const shouldBe = r.format === 'spot' ? r.expected : r.fix !== '' ? r.fix : r.expected;
    out.push({ date: r.date, was, shouldBe, kind, topicId: r.topicId, itemId: r.itemId });
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.itemId - b.itemId));
}

export type DayState = 'practised' | 'light' | 'none' | 'before_start';
export type Consistency = {
  n: number;
  practised: number;
  light: number;
  days: { date: ISODate; state: DayState }[];
};

const WINDOW = 100;

export function consistency(
  sessions: { date: ISODate; isLight: boolean; status: SessionStatus }[],
  today: ISODate,
): Consistency {
  const graded = sessions.filter((s) => s.status === 'graded');
  const byDate = new Map(graded.map((s) => [s.date, s]));
  const first = graded.reduce<ISODate | undefined>((m, s) => (m === undefined || s.date < m ? s.date : m), undefined);
  const n = first === undefined ? 0 : Math.min(daysBetween(first, today) + 1, WINDOW);
  let practised = 0;
  let light = 0;
  const days: Consistency['days'] = [];
  for (let k = WINDOW - 1; k >= 0; k--) {
    const date = addDays(today, -k);
    let state: DayState = 'before_start';
    if (k < n) {
      const s = byDate.get(date);
      state = s ? (s.isLight ? 'light' : 'practised') : 'none';
      if (s) {
        practised += 1;
        if (s.isLight) light += 1;
      }
    }
    days.push({ date, state });
  }
  return { n, practised, light, days };
}

export type ProgressLogInput = {
  sessionId: number;
  date: ISODate;
  title: string;
  isLight: boolean;
  items: ScoredItem[];
  patterns: string[];
  disputes: number;
  defects: number;
  costUsd: number;
};

export type ProgressLogRow = {
  sessionId: number;
  date: ISODate;
  title: string;
  isLight: boolean;
  scores: BlockScore[];
  errorCount: number;
  patterns: string[];
  disputes: number;
  defects: number;
  costUsd: number;
};

export function progressLog(input: ProgressLogInput[]): ProgressLogRow[] {
  return input
    .map((s) => ({
      sessionId: s.sessionId,
      date: s.date,
      title: s.title,
      isLight: s.isLight,
      scores: blockScores(s.items),
      errorCount: s.items.filter((i) => i.verdict === 'wrong').length,
      patterns: s.patterns,
      disputes: s.disputes,
      defects: s.defects,
      costUsd: s.costUsd,
    }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.sessionId - a.sessionId));
}
