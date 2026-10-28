import type { Db } from '@/core/ports';
import { effectiveVerdict } from '@/core/verdict';
import { replayTopics, type TopicFact, type TopicState } from '@/core/schedule/topics';
import { replaySpelling, type SpellingFact, type WordState } from '@/core/schedule/spelling';
import { listGradedAnswerRows, listGradedSpellingAttempts } from '@/core/db/repos/answers';
import { listGradedSessions, sessionCounts, sessionPatterns } from '@/core/db/repos/sessions';
import { summarizeCalls } from './usage';
import { progressLog, type ErrorBankInput, type ProgressLogRow, type ScoredItem } from './derive';

export type GradedFacts = {
  topicFacts: TopicFact[];
  spellingFacts: SpellingFact[];
  scored: (ScoredItem & { sessionId: number })[];
  errorRows: ErrorBankInput[];
};

function paragraphText(passage: string | null, index: number | null): string | null {
  if (passage === null || index === null) return null;
  try {
    const paragraphs: unknown = JSON.parse(passage);
    const text = Array.isArray(paragraphs) ? (paragraphs[index] as unknown) : null;
    return typeof text === 'string' ? text : null;
  } catch {
    return null;
  }
}

export async function loadGradedFacts(db: Db): Promise<GradedFacts> {
  const rows = await listGradedAnswerRows(db);
  const topicFacts: TopicFact[] = [];
  const scored: GradedFacts['scored'] = [];
  const errorRows: ErrorBankInput[] = [];
  for (const r of rows) {
    const verdict = effectiveVerdict({
      itemStatus: r.itemStatus,
      verdict: r.verdict,
      disputeDecision: r.disputeDecision,
      gapStatus: r.gapStatus,
    });
    scored.push({ sessionId: r.sessionId, blockId: r.blockId, blockKind: r.blockKind, format: r.format, verdict });
    errorRows.push({
      date: r.date,
      text: r.text,
      fix: r.fix ?? '',
      format: r.format,
      prompt: r.prompt,
      expected: r.expected,
      wrong: r.wrong,
      paragraph: paragraphText(r.passage, r.paragraph),
      topicId: r.topicId,
      itemId: r.itemId,
      effective: verdict,
      isInattention: r.isInattention,
      verdict: r.verdict,
    });
    if (r.topicId !== null) {
      topicFacts.push({
        sessionId: r.sessionId,
        date: r.date,
        topicId: r.topicId,
        isCheck: r.isCheck,
        verdict,
        isInattention: r.isInattention,
        supported: r.supported,
      });
    }
  }
  const spellingFacts = await listGradedSpellingAttempts(db);
  return { topicFacts, spellingFacts, scored, errorRows };
}

export async function getTopicStates(db: Db): Promise<Map<number, TopicState>> {
  return replayTopics((await loadGradedFacts(db)).topicFacts);
}

export async function getSpellingStates(db: Db): Promise<Map<number, WordState>> {
  return replaySpelling((await loadGradedFacts(db)).spellingFacts);
}

export async function loadProgressLog(db: Db): Promise<ProgressLogRow[]> {
  const [sessions, facts, patterns, counts] = await Promise.all([
    listGradedSessions(db),
    loadGradedFacts(db),
    sessionPatterns(db),
    sessionCounts(db),
  ]);
  return progressLog(
    sessions.map((s) => ({
      sessionId: s.id,
      date: s.date,
      title: s.title,
      isLight: s.isLight,
      items: facts.scored.filter((i) => i.sessionId === s.id),
      patterns: patterns.get(s.id) ?? [],
      disputes: counts.get(s.id)?.disputes ?? 0,
      defects: counts.get(s.id)?.defects ?? 0,
      costUsd: counts.get(s.id)?.costUsd ?? 0,
      usage: summarizeCalls(counts.get(s.id)?.calls ?? []),
    })),
  );
}
