import type { GeneratedWord, PhoneticsReply, WordCheckReply, WordsReply } from '@/core/llm/types';
import { revealsWord } from './check';
import type { Word, WordExercise } from './types';

const GAP = '___';
const gaps = (s: string) => s.split(GAP).length - 1;

function checkRequested(names: string[], requested: string[]): string | null {
  const seen = new Map<string, number>();
  for (const name of names) {
    const k = name.trim().toLowerCase();
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  for (const r of requested) {
    const n = seen.get(r.trim().toLowerCase()) ?? 0;
    if (n === 0) return `word "${r}" is missing from the reply`;
    if (n > 1) return `word "${r}" appears ${n} times in the reply`;
  }
  return null;
}

/** A batch problem (a requested word missing or duplicated, matched case-insensitively); the call is retried. */
export function checkWordsReply(reply: WordsReply, requested: string[]): string | null {
  return checkRequested(reply.words.map((w) => w.word), requested);
}

/** Same rule as checkWordsReply, for the phonetics call. */
export function checkPhoneticsReply(reply: PhoneticsReply, requested: string[]): string | null {
  return checkRequested(reply.words.map((w) => w.word), requested);
}

const outside = (n: number, lo: number, hi: number) => n < lo || n > hi;

/** What is wrong with one generated word's exercises; empty when it is fine. */
export function wordProblems(g: GeneratedWord, word: string): string[] {
  const p: string[] = [];
  const range = (what: string, n: number, lo: number, hi: number) => {
    if (outside(n, lo, hi)) p.push(`${word}: ${n} ${what}, expected ${lo}-${hi}`);
  };
  range('gaps', g.gaps.length, 3, 5);
  range('collocations', g.collocations.length, 2, 3);
  range('forms', g.forms.length, 0, 3);
  range('confusables', g.confusables.length, 0, 2);
  if (g.translations.length !== 2) p.push(`${word}: ${g.translations.length} translations, expected 2`);

  const once = (what: string, text: string) => {
    if (gaps(text) !== 1) p.push(`${word}: ${what} "${text}" must contain ___ exactly once`);
  };
  const answer = (what: string, a: string) => {
    if (a.trim() === '') p.push(`${word}: empty answer in ${what}`);
    else if (a.includes(GAP)) p.push(`${word}: answer "${a}" in ${what} contains ___`);
  };
  for (const x of g.gaps) { once('gap sentence', x.sentence); answer('gap', x.answer); }
  for (const x of g.collocations) { once('collocation', x.phrase); answer('collocation', x.answer); }
  for (const x of g.forms) { once('form sentence', x.sentence); answer('form', x.answer); }
  for (const x of g.confusables) {
    answer('confusable', x.answer);
    range('options', x.options.length, 2, 3);
    if (!x.options.includes(x.answer)) p.push(`${word}: confusable answer "${x.answer}" is not among the options`);
  }
  for (const x of g.translations) {
    range('translation answers', x.answers.length, 2, 4);
    for (const a of x.answers) answer('translation', a);
  }
  return p;
}

/** The gaps, collocations and forms that do not reveal the word (their text, with ___ taken out, shows neither the word nor the answer). */
export function withoutRevealing(g: GeneratedWord, word: string): GeneratedWord {
  const clean = (text: string, answer: string) => !revealsWord(text, [answer], word);
  return {
    ...g,
    gaps: g.gaps.filter((x) => clean(x.sentence, x.answer)),
    collocations: g.collocations.filter((x) => clean(x.phrase, x.answer)),
    forms: g.forms.filter((x) => clean(x.sentence, x.answer)),
  };
}

type Ex = Omit<WordExercise, 'id' | 'wordId'>;
const ex = (type: Ex['type'], prompt: string, answers: string[], more: Partial<Ex> = {}): Ex => ({
  type, prompt, translation: null, cue: null, options: null, answers, note: null, ...more,
});

export function exercisesFrom(g: GeneratedWord): Ex[] {
  return [
    ...g.gaps.map((x) => ex('gap', x.sentence, [x.answer], { translation: x.translation })),
    ...g.collocations.map((x) => ex('collocation', x.phrase, [x.answer])),
    ...g.forms.map((x) => ex('form', x.sentence, [x.answer], { cue: x.cue })),
    ...g.confusables.map((x) => ex('confusable', x.sentence, [x.answer], { options: x.options, note: x.reason })),
    ...g.translations.map((x) => ex('translation', x.text, x.answers)),
  ];
}

/** `check` of the word_check call: every fragment occurs in the sentence, every explanation is non-empty, every topic key is a programme key. */
export function checkWordCheckReply(reply: WordCheckReply, sentence: string, topicKeys: Set<string>): string | null {
  for (const e of reply.errors) {
    if (e.fragment === '' || !sentence.includes(e.fragment)) return `fragment "${e.fragment}" is not in the sentence`;
    if (e.explanation.trim() === '') return `error "${e.fragment}" has no explanation`;
    if (e.topicKey !== '' && !topicKeys.has(e.topicKey)) return `topicKey "${e.topicKey}" is not a programme topic`;
  }
  return null;
}

export function buildWordCheckPrompt(word: Word, sentence: string, topics: { key: string; title: string }[]): string {
  return [
    `Target word: ${word.word}`,
    `Definition: ${word.definition.trim() === '' ? '(missing)' : word.definition}`,
    '',
    'Learner sentence:',
    sentence,
    '',
    'Programme topics:',
    ...topics.map((t) => `${t.key} — ${t.title}`),
  ].join('\n');
}
