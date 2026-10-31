const WORD_START = '(?<![\\p{L}\\p{N}])';
const WORD_END = '(?![\\p{L}\\p{N}])';

const BANNED = [
  `${WORD_START}(?:again|missed|spoiled|once more|снова|опять|ещё раз|еще раз|упустил)${WORD_END}`,
  `${WORD_START}испорт\\p{L}*`,
  `${WORD_START}\\d+\\s*(?:times|time|раза|раз)${WORD_END}`,
].join('|');

const BANNED_RE = new RegExp(BANNED, 'giu');

/** Returns one message per banned match, naming the text index; empty = pass. */
export function toneViolations(texts: string[]): string[] {
  const out: string[] = [];
  texts.forEach((t, i) => {
    for (const m of t.matchAll(BANNED_RE)) out.push(`text ${i}: "${m[0]}"`);
  });
  return out;
}
