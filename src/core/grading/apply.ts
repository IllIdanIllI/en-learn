import type { Clock, Db } from '@/core/ports';
import type { GradeResult } from '@/core/llm/types';
import type { GradingItem } from '@/core/db/repos/sessions';
import { insertItem, markSessionGraded } from '@/core/db/repos/sessions';
import {
  appendSessionFeedback, markItemDefect, upsertAnswer, upsertExtraFinding, upsertRuleGap, upsertSpellingAttempt,
  upsertSpotAnswer,
} from '@/core/db/repos/answers';
import { deleteDraftAnswers } from '@/core/db/repos/drafts';
import { findTopicRule, insertWritingText, type OpenWritingBlock } from '@/core/db/repos/writing';
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
  /** Writing texts to store: every non-empty one, checked (errors in `result.texts`) or too short (no errors). */
  writing: (OpenWritingBlock & { text: string; words: number })[];
  result: GradeResult;
}

const SENTENCE_END = /[.!?\n]/;

/** The text between the nearest sentence end before the fragment and the next one, trimmed. */
function sentenceOf(text: string, fragment: string): string {
  const at = text.indexOf(fragment);
  let start = at;
  while (start > 0 && !SENTENCE_END.test(text[start - 1]!)) start--;
  let end = at + fragment.length;
  while (end < text.length && !SENTENCE_END.test(text[end]!)) end++;
  return text.slice(start, end).trim();
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Spec 3.1: idempotent upserts first, `status = 'graded'` last. Items that already have an answer (earlier rounds) are left alone. A defect item gets status 'defect' and no
 * answer row, so it stays out of scores and the error bank.
 */
export async function applyGraded(db: Db, clock: Clock, items: GradingItem[], g: Graded): Promise<void> {
  const refs = buildRefs(items);
  const entries = new Map<number, GradeResult['items'][number]>();
  for (const e of g.result.items) {
    const it = refs.byRef.get(e.ref);
    if (it) entries.set(it.id, e);
  }
  const defects: [number, string][] = [];
  const found = new Set(g.result.spot.flatMap((s) => s.found));

  for (const it of items) {
    if (it.status !== 'active' || it.format === 'question' || it.answered) continue;
    const e = entries.get(it.id);
    if (it.format === 'spot') {
      const text = g.spot.get(`${it.blockId}:${it.paragraph}`) ?? '';
      if (e?.verdict === 'defect') {
        defects.push([it.id, e.explanation]);
        continue;
      }
      if (g.skipped.has(it.id)) {
        await upsertAnswer(db, { itemId: it.id, text: '', verdict: 'skipped', fix: null, ruleSection: null, explanation: null, vocabularyNote: null });
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
      defects.push([it.id, e.explanation]);
    } else if (e && (e.verdict === 'correct' || e.verdict === 'wrong' || e.verdict === 'rule_gap')) {
      await upsertAnswer(db, {
        itemId: it.id, text, verdict: e.verdict, fix: e.fix, ruleSection: e.ruleSection || it.ruleSection,
        explanation: e.explanation, vocabularyNote: e.vocabularyNote,
      });
    }
  }

  // Writing: the errors of a block are rewritten whole, and the text goes last, so a crash in between is repaired by grading again.
  for (const w of g.writing) {
    await db.execute('DELETE FROM item WHERE block_id = ?', [w.blockId]);
    const errors = g.result.texts.find((t) => t.blockRef === `b${w.blockOrd}`)?.errors ?? [];
    for (const [ord, e] of errors.entries()) {
      const rule = e.topicKey === '' ? null : await findTopicRule(db, e.topicKey);
      await insertItem(db, w.blockId, ord, {
        prompt: sentenceOf(w.text, e.fragment), expected: e.fix, paragraph: null, topicId: rule?.topicId ?? null,
        ruleId: rule?.ruleId ?? null, ruleVersion: rule?.ruleVersion ?? null, ruleSection: e.ruleSection || null,
        spellingWordId: null, isCheck: false, status: 'active', note: null, wrong: null,
      });
      const [item] = await db.select<{ id: number }>('SELECT id FROM item WHERE block_id = ? AND ord = ?', [w.blockId, ord]);
      await upsertAnswer(db, {
        itemId: item!.id, text: e.fragment, verdict: 'wrong', fix: e.fix, ruleSection: e.ruleSection || null,
        explanation: e.explanation, vocabularyNote: null, suggestedTopic: rule ? null : e.suggestedTopic || null,
      });
    }
    await insertWritingText(db, { blockId: w.blockId, text: w.text, words: w.words, sourceBlockId: w.sourceBlockId, createdAt: clock.now() });
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
    // The grader saw the rule version pinned on the item, so that is the version the proposal is written against.
    if (!it || it.ruleId === null || it.ruleVersion === null) continue;
    await upsertRuleGap(db, {
      itemId: it.id, ruleId: it.ruleId, proposal: gap.proposal, explanation: gap.explanation, sources: JSON.stringify(gap.sources),
      baseVersion: it.ruleVersion,
    });
  }
  for (const w of g.result.spellingErrors) {
    const id = await findOrCreateSpellingWord(db, w.word, w.hint, clock.now());
    await upsertSpellingAttempt(db, id, g.sessionId, false);
  }
  // A later round adds to the feedback of the earlier ones.
  await appendSessionFeedback(db, g.sessionId, g.result.patterns, g.result.tomorrow);
  // Defect marks change item.status, which gates re-grading, so they are written last, right before 'graded'.
  for (const [id, note] of defects) await markItemDefect(db, id, note);
  await markSessionGraded(db, g.sessionId, clock.now());
  await deleteDraftAnswers(db, g.sessionId);
}
