import { parseSpotLines } from './precheck';

const EDGE = /^[.,!?;:"]+|[.,!?;:"]+$/g;

/** Spec F2: lower case, trimmed, spaces collapsed, curly apostrophes straightened, edge punctuation stripped. */
export function normalizeAnswer(s: string): string {
  return s.toLowerCase().replace(/’/g, "'").replace(/\s+/g, ' ').trim().replace(EDGE, '').trim();
}

const wordsOf = (s: string): string[] =>
  normalizeAnswer(s).split(' ').map((w) => w.replace(EDGE, '')).filter((w) => w !== '');

const containsRun = (hay: string[], run: string[]): boolean => {
  for (let i = 0; i + run.length <= hay.length; i++) if (run.every((w, k) => hay[i + k] === w)) return true;
  return false;
};

/** `text` with the single occurrence of `part` replaced; null when `part` is empty or not found exactly once. */
const replaceOnce = (text: string, part: string | null, by: string): string | null => {
  if (!part) return null;
  const pieces = text.split(part);
  return pieces.length === 2 ? `${pieces[0]}${by}${pieces[1]}` : null;
};

/** Spec F2: only ever decides "correct"; false means "ask the LLM". */
export function autoCorrect(
  item: { format: 'gap' | 'fix'; prompt: string; expected: string; wrong: string | null },
  answer: string,
): boolean {
  const a = normalizeAnswer(answer);
  if (a === '') return false;
  if (a === normalizeAnswer(item.expected)) return true;
  const words = wordsOf(a);
  if (words.length < 2) return false;
  const corrected = replaceOnce(item.prompt, item.format === 'gap' ? '___' : item.wrong, item.expected);
  if (corrected === null) return false;
  return containsRun(wordsOf(corrected), words) && !containsRun(wordsOf(item.prompt), words);
}

/** Keeps only the "wrong → right" lines that change something; the rest are ignored. */
export function dropIgnoredLines(text: string): string {
  const kept: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '') continue;
    const { wrong, right } = parseSpotLines(line)[0]!;
    if (right !== '' && normalizeAnswer(right) !== normalizeAnswer(wrong)) kept.push(line);
  }
  return kept.join('\n');
}

/**
 * Spec F2, per line: a line that pairs with one hidden error and is right finds it; a second line for an
 * error already found is dropped; any other line is returned as `leftover` for the LLM.
 */
export function autoSpot(
  paragraphText: string,
  errors: { id: number; prompt: string; expected: string }[],
  learnerText: string,
): { found: number[]; leftover: string[] } {
  const found = new Set<number>();
  const leftover: string[] = [];
  for (const raw of learnerText.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '') continue;
    const { wrong, right } = parseSpotLines(line)[0]!;
    const lw = wrong.toLowerCase();
    if (lw === '' || right === '') {
      leftover.push(line);
      continue;
    }
    const paired = errors.filter((e) => {
      const w = e.prompt.trim().toLowerCase();
      return lw.includes(w) || w.includes(lw);
    });
    if (paired.length !== 1) {
      leftover.push(line);
      continue;
    }
    const e = paired[0]!;
    if (found.has(e.id)) continue;
    if (autoCorrect({ format: 'fix', prompt: paragraphText, expected: e.expected, wrong: e.prompt }, right)) found.add(e.id);
    else leftover.push(line);
  }
  return { found: [...found], leftover };
}
