import type { Clock, Db } from '@/core/ports';
import type { GradeResult } from '@/core/llm/types';
import type { GradingItem } from '@/core/db/repos/sessions';
import { markSessionGraded } from '@/core/db/repos/sessions';
import {
  markItemDefect, upsertAnswer, upsertExtraFinding, upsertRuleGap, upsertSessionFeedback, upsertSpellingAttempt,
  upsertSpotAnswer,
} from '@/core/db/repos/answers';
import { findOrCreateSpellingWord } from '@/core/db/repos/spelling';
import { buildRefs, matchingLine } from './input';

/** Everything graded so far for a session; kept in memory until applied. */
export interface Graded {
  sessionId: number;
  /** Effective answer text per non-spot item (shorthands already normalised to ✓). */
  texts: Map<number, string>;
  skipped: Set<number>;
  /** Learner text per `${blockId}:${paragraph}` for every spot paragraph with hidden errors. */
  spot: Map<string, string>;
  result: GradeResult;
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Spec 3.1: idempotent upserts first, `status = 'graded'` last. A defect item gets status 'defect' and no
 * answer row, so it stays out of scores and the error bank.
 */
export async function applyGraded(db: Db, clock: Clock, items: GradingItem[], g: Graded): Promise<void> {
  const refs = buildRefs(items);
  const entries = new Map<number, GradeResult['items'][number]>();
  for (const e of g.result.items) {
    const it = refs.byRef.get(e.ref);
    if (it) entries.set(it.id, e);
  }
  const found = new Set(g.result.spot.flatMap((s) => s.found));

  for (const it of items) {
    if (it.status !== 'active' || it.format === 'question') continue;
    const e = entries.get(it.id);
    if (it.format === 'spot') {
      const text = g.spot.get(`${it.blockId}:${it.paragraph}`) ?? '';
      if (e?.verdict === 'defect') {
        await markItemDefect(db, it.id, e.explanation);
        continue;
      }
      const isFound = found.has(refs.refOf.get(it.id)!);
      await upsertAnswer(db, {
        itemId: it.id, text: matchingLine(text, it.prompt), verdict: isFound ? 'correct' : 'wrong', fix: it.expected,
        ruleSection: e?.ruleSection || it.ruleSection, explanation: e?.explanation ?? null, vocabularyNote: e?.vocabularyNote ?? null,
      });
      continue;
    }
    const text = g.texts.get(it.id) ?? '';
    if (g.skipped.has(it.id)) {
      await upsertAnswer(db, { itemId: it.id, text: '', verdict: 'skipped', fix: null, ruleSection: null, explanation: null, vocabularyNote: null });
    } else if (it.format === 'spelling') {
      const correct = norm(text) === norm(it.expected);
      await upsertAnswer(db, {
        itemId: it.id, text, verdict: correct ? 'correct' : 'wrong', fix: it.expected, ruleSection: null, explanation: null, vocabularyNote: null,
      });
      if (it.spellingWordId !== null) await upsertSpellingAttempt(db, it.spellingWordId, g.sessionId, correct);
    } else if (e?.verdict === 'defect') {
      await markItemDefect(db, it.id, e.explanation);
    } else if (e && (e.verdict === 'correct' || e.verdict === 'wrong' || e.verdict === 'rule_gap')) {
      await upsertAnswer(db, {
        itemId: it.id, text, verdict: e.verdict, fix: e.fix, ruleSection: e.ruleSection || it.ruleSection,
        explanation: e.explanation, vocabularyNote: e.vocabularyNote,
      });
    }
  }

  for (const [key, text] of g.spot) {
    const [blockId, paragraph] = key.split(':').map(Number) as [number, number];
    await upsertSpotAnswer(db, blockId, paragraph, text);
  }
  for (const s of g.result.spot) {
    const blockId = refs.blockByOrd.get(Number(s.blockRef.slice(1)));
    if (blockId === undefined) continue;
    for (const x of s.extra) await upsertExtraFinding(db, blockId, s.paragraph, x.text, x.explanation);
  }
  for (const gap of g.result.ruleGaps) {
    const it = refs.byRef.get(gap.ref);
    if (!it || it.ruleId === null) continue;
    await upsertRuleGap(db, {
      itemId: it.id, ruleId: it.ruleId, proposal: gap.proposal, explanation: gap.explanation, sources: JSON.stringify(gap.sources),
    });
  }
  for (const w of g.result.spellingErrors) {
    const id = await findOrCreateSpellingWord(db, w.word, w.hint, clock.now());
    await upsertSpellingAttempt(db, id, g.sessionId, false);
  }
  await upsertSessionFeedback(db, g.sessionId, g.result.patterns, g.result.tomorrow);
  await markSessionGraded(db, g.sessionId, clock.now());
}
