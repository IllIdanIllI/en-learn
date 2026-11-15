import type { ErrorKind, TextAssessment } from '@/core/llm/types';

export const MIN_WORDS = 50;
export const TARGET_WORDS = 250;
export const RATE_TARGET = 3;

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
}

export function errorRate(errors: number, words: number): number | null {
  if (words < MIN_WORDS) return null;
  return Math.round((errors / words) * 100 * 10) / 10;
}

/** Mean of the four criterion bands rounded to the nearest half band, a quarter rounding up (6.25 -> 6.5, 6.75 -> 7). */
export function overallBand(a: TextAssessment): number {
  const mean = (a.taskResponse.band + a.coherence.band + a.vocabulary.band + a.grammar.band) / 4;
  return Math.round(mean * 2) / 2;
}

export const ERROR_KINDS: ErrorKind[] = ['spelling', 'grammar', 'vocabulary', 'punctuation'];

/** Errors per kind in the fixed display order, only kinds above zero; errors without a kind are not counted. */
export function kindCounts(kinds: (ErrorKind | null)[]): { kind: ErrorKind; count: number }[] {
  return ERROR_KINDS.map((kind) => ({ kind, count: kinds.filter((k) => k === kind).length })).filter((c) => c.count > 0);
}

interface Span {
  start: number;
  end: number;
  idx: number;
  strength: boolean;
}

/**
 * Places one occurrence per fragment entry. Error fragments go first: candidate occurrences are taken in
 * text order; an occurrence is skipped if its fragment is already used or it overlaps an earlier accepted
 * occurrence. Strength fragments then take only occurrences that overlap nothing already accepted.
 * `idx` of a span is the index in `errors`, or in `strengths` for a strength span.
 */
export function placeFragments(text: string, errors: string[], strengths: string[] = []): Span[] {
  const accepted: Span[] = [];
  for (const [list, strength] of [[errors, false], [strengths, true]] as const) {
    const candidates: Span[] = [];
    list.forEach((fragment, idx) => {
      if (fragment === '') return;
      for (let at = text.indexOf(fragment); at !== -1; at = text.indexOf(fragment, at + 1)) {
        candidates.push({ start: at, end: at + fragment.length, idx, strength });
      }
    });
    candidates.sort((a, b) => a.start - b.start || a.idx - b.idx);

    const usedFragments = new Set<number>();
    for (const span of candidates) {
      if (usedFragments.has(span.idx)) continue;
      if (accepted.some((other) => span.start < other.end && other.start < span.end)) continue;
      usedFragments.add(span.idx);
      accepted.push(span);
    }
  }
  return accepted.sort((a, b) => a.start - b.start);
}

/** The text split into runs: errors marked first, then strengths where they overlap no error or earlier strength. */
export function markText(text: string, errors: string[], strengths: string[] = []): { text: string; error: boolean; strength: boolean }[] {
  const runs: { text: string; error: boolean; strength: boolean }[] = [];
  let pos = 0;
  for (const span of placeFragments(text, errors, strengths)) {
    if (span.start > pos) runs.push({ text: text.slice(pos, span.start), error: false, strength: false });
    runs.push({ text: text.slice(span.start, span.end), error: !span.strength, strength: span.strength });
    pos = span.end;
  }
  if (pos < text.length) runs.push({ text: text.slice(pos), error: false, strength: false });
  return runs;
}

/** Marks one occurrence per fragment entry (errors only); see `placeFragments` for the occurrence rule. */
export function markFragments(text: string, fragments: string[]): { text: string; error: boolean }[] {
  return markText(text, fragments).map(({ text: t, error }) => ({ text: t, error }));
}
