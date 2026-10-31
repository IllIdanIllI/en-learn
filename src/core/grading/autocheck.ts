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

/** Spec F2: found ids when every learner line pairs with one hidden error and is right; null sends the paragraph to the LLM. */
export function autoSpot(
  paragraphText: string,
  errors: { id: number; prompt: string; expected: string }[],
  learnerText: string,
): { found: number[] } | null {
  const found = new Set<number>();
  for (const line of parseSpotLines(learnerText)) {
    const lw = line.wrong.toLowerCase();
    if (lw === '' || line.right === '') return null;
    const paired = errors.filter((e) => {
      const w = e.prompt.trim().toLowerCase();
      return lw.includes(w) || w.includes(lw);
    });
    if (paired.length !== 1 || found.has(paired[0]!.id)) return null;
    const e = paired[0]!;
    if (!autoCorrect({ format: 'fix', prompt: paragraphText, expected: e.expected, wrong: e.prompt }, line.right)) return null;
    found.add(e.id);
  }
  return { found: [...found] };
}
