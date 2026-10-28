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

/** The snippet as plain text for a prompt: an empty differing part ("__") is dropped with its doubled space. */
export const plainText = (s: Snippet): string => (s.changed === '__' ? `${s.before}${s.after}`.replace(/ {2,}/g, ' ').trim() : snippetText(s));

const isTick = (s: string): boolean => ['', '✓', '+'].includes(s.trim());
const plain = (changed: string): Snippet => ({ before: '', changed, after: '' });

/** The text around a changed part, at most SIDE words kept on each side. */
function windowed(beforeText: string, changed: string, afterText: string): Snippet {
  const before = beforeText.match(/\S+\s*/g) ?? [];
  const after = afterText.match(/\s*\S+/g) ?? [];
  return {
    before: `${before.length > SIDE ? '… ' : ''}${before.slice(-SIDE).join('')}`,
    changed,
    after: after.length > SIDE ? `${after.slice(0, SIDE).join('')} …` : afterText.replace(/\s+$/, ''),
  };
}

const wordsOf = (s: string) => [...s.matchAll(/\S+/g)].map((m) => ({ key: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length }));

/**
 * The same sentence with `part` replaced by `was` and by `shouldBe`, or null when `part` is not in it (once, or first when `first`).
 * Words shared at the start and end of the two replacements move into the context; an empty differing part shows "__".
 */
function place(text: string, part: string | null, was: string, shouldBe: string, first = false): [Snippet, Snippet] | null {
  if (!part) return null;
  const at = text.indexOf(part);
  if (at < 0 || (!first && text.indexOf(part, at + 1) >= 0)) return null;
  const head = text.slice(0, at);
  const tail = text.slice(at + part.length);
  const wa = wordsOf(was);
  const wb = wordsOf(shouldBe);
  const max = Math.min(wa.length, wb.length);
  let lead = 0;
  while (lead < max && wa[lead]!.key === wb[lead]!.key) lead++;
  let trail = 0;
  while (trail < max - lead && wa[wa.length - 1 - trail]!.key === wb[wb.length - 1 - trail]!.key) trail++;
  const identical = lead === wa.length && lead === wb.length;
  const side = (by: string, w: typeof wa): Snippet => {
    if (identical || lead + trail === 0) return windowed(head, by, tail);
    const mid = w.slice(lead, w.length - trail);
    return windowed(
      lead > 0 ? `${head}${by.slice(0, w[lead - 1]!.end)} ` : head,
      mid.length > 0 ? by.slice(mid[0]!.start, mid[mid.length - 1]!.end) : '__',
      trail > 0 ? ` ${by.slice(w[w.length - trail]!.start)}${tail}` : tail,
    );
  };
  return [side(was, wa), side(shouldBe, wb)];
}

/** One snippet with `changed` in place of `part`, with no comparison to another. */
function placeOne(text: string, part: string | null, by: string): Snippet | null {
  const placed = place(text, part, by, by);
  return placed === null ? null : placed[0];
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
  const fixed = !isTick(r.fix) ? r.fix : '';
  // A spot item whose stored correction is a tick has nothing better than its own text to show.
  const correction = r.format === 'spot' ? (!isTick(r.expected) ? r.expected : fixed !== '' ? fixed : r.prompt) : fixed !== '' ? fixed : r.expected;
  const hint = r.format === 'spelling' ? r.prompt : null;

  if (r.format === 'spelling') {
    return { was: plain(isTick(r.text) ? r.prompt : r.text), shouldBe: plain(correction), sentence: '', hint };
  }
  if (r.format === 'spot') {
    const placed = place(r.paragraph ?? '', r.prompt, r.prompt, correction, true);
    return {
      was: placed?.[0] ?? plain(r.prompt),
      shouldBe: placed?.[1] ?? plain(correction),
      sentence: r.paragraph ?? '',
      hint,
    };
  }

  const ticked = isTick(r.text);
  const fragment = r.format === 'gap' ? '___' : r.wrong;
  const sentence = r.prompt;
  if (r.format === 'fix' && isTick(r.expected)) {
    // Nothing to fix in the sentence: the learner's change against the sentence itself.
    return { was: plain(ticked ? r.prompt : r.text), shouldBe: aroundMiddle(r.prompt), sentence, hint };
  }
  if (ticked && r.format !== 'fix') {
    return { was: plain(r.prompt), shouldBe: placeOne(r.prompt, fragment, correction) ?? plain(correction), sentence, hint };
  }
  const placed = place(r.prompt, fragment, ticked ? (fragment ?? '') : r.text, correction);
  if (placed === null) return { was: plain(ticked ? r.prompt : r.text), shouldBe: plain(correction), sentence, hint };
  return { was: placed[0], shouldBe: placed[1], sentence, hint };
}
