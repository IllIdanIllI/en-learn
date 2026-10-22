import type { EffectiveVerdict, ISODate } from '@/core/domain';
import { addDays, daysBetween } from '@/core/dates';

export type TopicFact = {
  sessionId: number;
  date: ISODate;
  topicId: number;
  isCheck: boolean;
  verdict: EffectiveVerdict;
  isInattention: boolean;
  supported: boolean;
};

export type TopicEvent = 'error' | 'check_correct' | 'check_correct_supported' | 'closed';

export type TopicState = {
  status: 'none' | 'open' | 'closed';
  pending: ISODate[];
  successes: ISODate[];
  history: { date: ISODate; event: TopicEvent }[];
};

export function closesWith(successes: ISODate[]): boolean {
  return successes.some((a) => successes.some((b) => daysBetween(a, b) >= 3));
}

function byDateThenSession(a: { date: ISODate; sessionId: number }, b: { date: ISODate; sessionId: number }): number {
  return a.date < b.date ? -1 : a.date > b.date ? 1 : a.sessionId - b.sessionId;
}

export function replayTopics(facts: TopicFact[]): Map<number, TopicState> {
  const states = new Map<number, TopicState>();
  const groups = new Map<string, TopicFact[]>();
  for (const f of [...facts].sort(byDateThenSession)) {
    if (!states.has(f.topicId)) states.set(f.topicId, { status: 'none', pending: [], successes: [], history: [] });
    const key = `${f.sessionId}:${f.topicId}`;
    const g = groups.get(key);
    if (g) g.push(f);
    else groups.set(key, [f]);
  }

  for (const group of groups.values()) {
    const first = group[0];
    if (!first) continue;
    const d = first.date;
    const state = states.get(first.topicId);
    if (!state) continue;
    const counted = group.filter((f) => f.verdict !== null && !f.isInattention);

    if (counted.some((f) => f.verdict === 'wrong')) {
      state.status = 'open';
      state.pending = [addDays(d, 1), addDays(d, 3), addDays(d, 7)];
      state.successes = [];
      state.history.push({ date: d, event: 'error' });
      continue;
    }

    if (state.status !== 'open' || !state.pending.some((p) => p <= d) || !counted.some((f) => f.isCheck)) continue;

    const supported = group.some((f) => f.supported);
    state.pending = state.pending.filter((p) => p > d);
    if (!supported) state.successes.push(d);
    state.history.push({ date: d, event: supported ? 'check_correct_supported' : 'check_correct' });
    if (closesWith(state.successes)) {
      state.status = 'closed';
      state.pending = [];
      state.history.push({ date: d, event: 'closed' });
    } else if (state.pending.length === 0) {
      state.pending = [addDays(d, 3)];
    }
  }
  return states;
}

export function dueTopicIds(states: Map<number, TopicState>, today: ISODate): number[] {
  const ids: number[] = [];
  for (const [id, s] of states) if (s.pending.some((p) => p <= today)) ids.push(id);
  return ids.sort((a, b) => a - b);
}
