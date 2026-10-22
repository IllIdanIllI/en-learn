import type { ISODate } from '@/core/domain';
import { addDays } from '@/core/dates';
import { closesWith } from '@/core/schedule/topics';

export type SpellingFact = { wordId: number; sessionId: number; date: ISODate; correct: boolean };

export type WordState = { retired: boolean; pending: ISODate[]; successes: ISODate[]; lastTested: ISODate | null };

export function replaySpelling(facts: SpellingFact[]): Map<number, WordState> {
  const states = new Map<number, WordState>();
  const attempts = new Map<string, SpellingFact>();
  const sorted = [...facts].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.sessionId - b.sessionId));
  for (const f of sorted) {
    const state = states.get(f.wordId) ?? { retired: false, pending: [], successes: [], lastTested: null };
    states.set(f.wordId, state);
    state.lastTested = f.date;
    const key = `${f.sessionId}:${f.wordId}`;
    const prev = attempts.get(key);
    // one attempt per word per session; wrong wins
    attempts.set(key, prev ? { ...prev, correct: prev.correct && f.correct } : f);
  }

  const done = new Set<string>();
  for (const f of sorted) {
    const key = `${f.sessionId}:${f.wordId}`;
    if (done.has(key)) continue;
    done.add(key);
    const attempt = attempts.get(key);
    const state = states.get(f.wordId);
    if (!attempt || !state) continue;
    const d = attempt.date;
    if (!attempt.correct) {
      state.retired = false;
      state.pending = [addDays(d, 1), addDays(d, 3), addDays(d, 7)];
      state.successes = [];
      continue;
    }
    if (!state.pending.some((p) => p <= d)) continue;
    state.pending = state.pending.filter((p) => p > d);
    state.successes.push(d);
    if (closesWith(state.successes)) {
      state.retired = true;
      state.pending = [];
    } else if (state.pending.length === 0) {
      state.pending = [addDays(d, 3)];
    }
  }
  return states;
}

const MAX_DUE = 15;
const MIN_WORDS = 10;
const LIGHT_WORDS = 5;

function earliestPending(s: WordState): ISODate | undefined {
  return s.pending.reduce<ISODate | undefined>((m, p) => (m === undefined || p < m ? p : m), undefined);
}

export function selectSpellingWords(
  states: Map<number, WordState>,
  wordIds: number[],
  today: ISODate,
  light: boolean,
): number[] {
  const empty: WordState = { retired: false, pending: [], successes: [], lastTested: null };
  const get = (id: number): WordState => states.get(id) ?? empty;

  const due = wordIds
    .filter((id) => {
      const s = get(id);
      return !s.retired && s.pending.some((p) => p <= today);
    })
    .sort((a, b) => {
      const pa = earliestPending(get(a)) ?? '';
      const pb = earliestPending(get(b)) ?? '';
      return pa < pb ? -1 : pa > pb ? 1 : a - b;
    })
    .slice(0, MAX_DUE);

  const result = [...due];
  if (result.length < MIN_WORDS) {
    const taken = new Set(result);
    const fill = wordIds
      .filter((id) => !taken.has(id) && !get(id).retired)
      .sort((a, b) => {
        const la = get(a).lastTested;
        const lb = get(b).lastTested;
        if (la === lb) return a - b;
        if (la === null) return -1;
        if (lb === null) return 1;
        return la < lb ? -1 : 1;
      });
    result.push(...fill.slice(0, MIN_WORDS - result.length));
  }
  return light ? result.slice(0, LIGHT_WORDS) : result;
}
