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

interface Span {
  start: number;
  end: number;
  idx: number;
}

/**
 * Marks one occurrence per fragment entry. Candidate occurrences are taken in
 * text order; an occurrence is skipped if its fragment is already used or it
 * overlaps an earlier accepted occurrence.
 */
export function markFragments(text: string, fragments: string[]): { text: string; error: boolean }[] {
  const candidates: Span[] = [];
  fragments.forEach((fragment, idx) => {
    if (fragment === '') return;
    for (let at = text.indexOf(fragment); at !== -1; at = text.indexOf(fragment, at + 1)) {
      candidates.push({ start: at, end: at + fragment.length, idx });
    }
  });
  candidates.sort((a, b) => a.start - b.start || a.idx - b.idx);

  const usedFragments = new Set<number>();
  const accepted: Span[] = [];
  for (const span of candidates) {
    if (usedFragments.has(span.idx)) continue;
    if (accepted.some((other) => span.start < other.end && other.start < span.end)) continue;
    usedFragments.add(span.idx);
    accepted.push(span);
  }

  const runs: { text: string; error: boolean }[] = [];
  let pos = 0;
  for (const span of accepted) {
    if (span.start > pos) runs.push({ text: text.slice(pos, span.start), error: false });
    runs.push({ text: text.slice(span.start, span.end), error: true });
    pos = span.end;
  }
  if (pos < text.length) runs.push({ text: text.slice(pos), error: false });
  return runs;
}
