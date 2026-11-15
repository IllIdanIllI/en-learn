import { BUILD_ATTEMPTS } from './constants';
import type { ReviewResult, Word } from './types';

export function normalise(s: string): string {
  return s
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

// Optimal string alignment distance: insert, delete, substitute, or swap two neighbouring letters, each one edit.
function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min((d[i - 1]![j] ?? 0) + 1, (d[i]![j - 1] ?? 0) + 1, (d[i - 1]![j - 1] ?? 0) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, (d[i - 2]![j - 2] ?? 0) + 1);
      }
      d[i]![j] = best;
    }
  }
  return d[a.length]![b.length] ?? 0;
}

export function checkTyped(answer: string, accepted: string[]): 'correct' | 'almost' | 'wrong' {
  const given = normalise(answer);
  if (given === '') return 'wrong';
  const targets = accepted.map(normalise);
  if (targets.includes(given)) return 'correct';
  const almost = targets.some(
    (t) => Math.abs(t.length - given.length) <= 1 && editDistance(given, t) === 1,
  );
  return almost ? 'almost' : 'wrong';
}

// A spelled word is accepted as written and without spaces, because the letters shown have no spaces.
export function spellingsOf(word: string): string[] {
  return [...new Set([word, word.replace(/ /g, '')])];
}

export function checkTranslation(answer: string, accepted: string[]): boolean {
  const strip = (s: string) => normalise(s).replace(/\s*[.!?]+$/, '');
  const given = strip(answer);
  if (given === '') return false;
  return accepted.some((a) => strip(a) === given);
}

export function resultFor(o: { correct: boolean; hinted: boolean; retried: boolean }): ReviewResult {
  if (!o.correct) return 'wrong';
  return o.hinted || o.retried ? 'hard' : 'correct';
}

export function shuffle<T>(items: T[], rand: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [items[i], items[j]] = [items[j] as T, items[i] as T];
  }
  return items;
}

const ANAGRAM_ATTEMPTS = 20;

// The letters of each word of a phrase, shuffled within that word; the words stay apart by one space.
export function anagram(word: string, rand: () => number): string {
  const parts = word.split(' ').filter((p) => p !== '').map((p) => Array.from(p));
  const original = parts.map((p) => p.join('')).join(' ');
  const canDiffer = parts.some((p) => new Set(p).size > 1);
  if (!canDiffer) return original;
  for (let attempt = 0; attempt < ANAGRAM_ATTEMPTS; attempt++) {
    const shuffled = parts.map((p) => shuffle([...p], rand).join('')).join(' ');
    if (shuffled !== original) return shuffled;
  }
  // Shuffling kept the order: rotate the first word that can differ by one letter, never across words.
  const i = parts.findIndex((p) => new Set(p).size > 1);
  return parts.map((p, j) => (j === i ? [...p.slice(1), p[0] as string] : p).join('')).join(' ');
}

// Puts the spaces of the word back into its letters, at the same positions; never a leading or trailing space.
export function withSpaces(letters: string, word: string): string {
  const before = new Set<number>();
  let index = 0;
  for (const ch of Array.from(word)) {
    if (ch === ' ') before.add(index);
    else index++;
  }
  return Array.from(letters)
    .map((ch, i) => (i > 0 && before.has(i) ? ` ${ch}` : ch))
    .join('');
}

// The result of a build card: no mistake is correct, a few are hard, too many are wrong.
export function buildResult(mistakes: number): ReviewResult {
  if (mistakes >= BUILD_ATTEMPTS) return 'wrong';
  return mistakes === 0 ? 'correct' : 'hard';
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const plainQuotes = (s: string) => s.replace(/[‘’ʼ]/g, "'");

// True when the text, with each ___ taken out, shows the word or an answer as a whole word or phrase, in any case.
export function revealsWord(text: string, answers: string[], word: string): boolean {
  const target = plainQuotes(word).trim();
  if (target === '') return false;
  const body = plainQuotes(text).replace(/___/g, ' ');
  return [target, ...answers].some((candidate) => {
    const c = plainQuotes(candidate).trim();
    if (c === '') return false;
    const pattern = c.split(/\s+/).map(escapeRegex).join('\\s+');
    return new RegExp(`(?<![\\p{L}\\p{N}'])${pattern}(?![\\p{L}\\p{N}'])`, 'iu').test(body);
  });
}

// The clue line of a fill-the-word card: the translation with the app in Russian, the definition in English; the other one when it is empty.
export function clueOf(word: Word, lang: 'ru' | 'en'): string {
  const [first, second] = lang === 'ru' ? [word.translation, word.definition] : [word.definition, word.translation];
  return first.trim() !== '' ? first.trim() : second.trim();
}

export function choiceOptions(word: Word, others: Word[], rand: () => number): string[] {
  const seen = new Set([normalise(word.word)]);
  const pool: string[] = [];
  for (const other of others) {
    const key = normalise(other.word);
    if (!seen.has(key)) {
      seen.add(key);
      pool.push(other.word);
    }
  }
  const picked = shuffle(pool, rand).slice(0, 3);
  return shuffle([word.word, ...picked], rand);
}
