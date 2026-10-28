import type { BlockFormat } from '@/core/domain';

/** `before + changed + after` reads as the text; `before`/`after` carry their spacing and "…" where cut. */
export type Snippet = { before: string; changed: string; after: string };

export type ErrorContextInput = {
  format: BlockFormat;
  prompt: string;
  expected: string;
  /** Fix items only: the wrong fragment as it appears in the prompt; null for items built before it was stored. */
  wrong: string | null;
  text: string;
  fix: string;
  /** Spot items: the paragraph the wrong text sits in. */
  paragraph: string | null;
};

export type ErrorContext = { was: Snippet; shouldBe: Snippet; sentence: string; hint: string | null };

const SIDE = 4;

export const snippetText = (s: Snippet): string => `${s.before}${s.changed}${s.after}`;

const isTick = (s: string): boolean => ['', '✓', '+'].includes(s.trim());
const plain = (changed: string): Snippet => ({ before: '', changed, after: '' });

/** `text` with [start, end) as the changed part and at most SIDE words kept on each side. */
function windowed(text: string, start: number, end: number, changed: string): Snippet {
  const before = (text.slice(0, start).match(/\S+\s*/g) ?? []);
  const rest = text.slice(end);
  const after = rest.match(/\s*\S+/g) ?? [];
  const cutAfter = after.length > SIDE;
  return {
    before: `${before.length > SIDE ? '… ' : ''}${before.slice(-SIDE).join('')}`,
    changed,
    after: cutAfter ? `${after.slice(0, SIDE).join('')} …` : rest.replace(/\s+$/, ''),
  };
}

/** The sentence is placed when `part` occurs in it (once, or first when `first`); then both sides are windowed. */
function place(text: string, part: string | null, by: string, first = false): Snippet | null {
  if (!part) return null;
  const at = text.indexOf(part);
  if (at < 0 || (!first && text.indexOf(part, at + 1) >= 0)) return null;
  return windowed(text, at, at + part.length, by);
}

/** A sentence kept whole, cut to the words around its middle when long. */
function aroundMiddle(sentence: string): Snippet {
  const words = sentence.trim().split(/\s+/);
  if (words.length <= 2 * SIDE + 1) return plain(words.join(' '));
  const mid = Math.floor(words.length / 2);
  const start = mid - SIDE;
  const end = mid + SIDE + 1;
  return { before: start > 0 ? '… ' : '', changed: words.slice(start, end).join(' '), after: end < words.length ? ' …' : '' };
}

/** What the error bank shows for one wrong answer, computed from stored data (spec H7). */
export function errorContext(r: ErrorContextInput): ErrorContext {
  const correction = r.format === 'spot' ? r.expected : r.fix !== '' && !isTick(r.fix) ? r.fix : r.expected;
  const hint = r.format === 'spelling' ? r.prompt : null;

  if (r.format === 'spelling') {
    return { was: plain(isTick(r.text) ? r.prompt : r.text), shouldBe: plain(correction), sentence: '', hint };
  }
  if (r.format === 'spot') {
    const was = place(r.paragraph ?? '', r.prompt, r.prompt, true);
    const shouldBe = place(r.paragraph ?? '', r.prompt, correction, true);
    return {
      was: was ?? plain(r.prompt),
      shouldBe: shouldBe ?? plain(correction),
      sentence: r.paragraph ?? '',
      hint,
    };
  }

  const ticked = isTick(r.text);
  const fragment = r.format === 'gap' ? '___' : r.wrong;
  const original = place(r.prompt, fragment, fragment ?? '');
  const sentence = r.prompt;
  if (r.format === 'fix' && isTick(r.expected)) {
    // Nothing to fix in the sentence: the learner's change against the sentence itself.
    return { was: plain(ticked ? r.prompt : r.text), shouldBe: aroundMiddle(r.prompt), sentence, hint };
  }
  if (original === null) {
    return { was: plain(ticked ? r.prompt : r.text), shouldBe: plain(correction), sentence, hint };
  }
  const swap = (by: string) => place(r.prompt, fragment, by)!;
  const was = ticked && r.format === 'fix' ? swap(fragment ?? '') : ticked ? plain(r.prompt) : swap(r.text);
  return { was, shouldBe: swap(correction), sentence, hint };
}
