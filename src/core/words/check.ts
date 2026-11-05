import type { ReviewResult, Word } from './types';

export function normalise(s: string): string {
  return s
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min((prev[j] ?? 0) + 1, (curr[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    prev = curr;
  }
  return prev[b.length] ?? 0;
}

export function checkTyped(answer: string, accepted: string[]): 'correct' | 'almost' | 'wrong' {
  const given = normalise(answer);
  if (given === '') return 'wrong';
  const targets = accepted.map(normalise);
  if (targets.includes(given)) return 'correct';
  const almost = targets.some(
    (t) => Math.abs(t.length - given.length) <= 1 && levenshtein(given, t) === 1,
  );
  return almost ? 'almost' : 'wrong';
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

function shuffle<T>(items: T[], rand: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [items[i], items[j]] = [items[j] as T, items[i] as T];
  }
  return items;
}

const ANAGRAM_ATTEMPTS = 20;

export function anagram(word: string, rand: () => number): string {
  const letters = Array.from(word.replace(/ /g, ''));
  const original = letters.join('');
  const allSame = letters.every((c) => c === letters[0]);
  if (letters.length <= 1 || allSame) return original;
  for (let attempt = 0; attempt < ANAGRAM_ATTEMPTS; attempt++) {
    const shuffled = shuffle([...letters], rand).join('');
    if (shuffled !== original) return shuffled;
  }
  return [...letters.slice(1), letters[0] as string].join('');
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
