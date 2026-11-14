import { describe, expect, test } from 'vitest';
import {
  buildWordCheckPrompt, checkPhoneticsReply, checkWordCheckReply, checkWordsReply, exercisesFrom, withoutRevealing, wordProblems,
} from '@/core/words/generated';
import type { GeneratedWord, PhoneticsReply, WordCheckReply, WordsReply } from '@/core/llm/types';
import { gen } from './helpers';
import type { Word } from '@/core/words/types';

const reply = (...words: string[]): WordsReply => ({ words: words.map((w) => gen({ word: w })) });

describe('checkWordsReply', () => {
  test('accepts all requested words, case-insensitively', () => {
    expect(checkWordsReply(reply('Alpha', 'beta'), ['alpha', 'Beta'])).toBeNull();
  });
  test('a missing word is a problem', () => {
    expect(checkWordsReply(reply('alpha'), ['alpha', 'beta'])).toMatch(/beta/);
  });
  test('a duplicated word is a problem', () => {
    expect(checkWordsReply(reply('alpha', 'ALPHA', 'beta'), ['alpha', 'beta'])).toMatch(/alpha/i);
  });
});

describe('checkPhoneticsReply', () => {
  const pr = (...words: string[]): PhoneticsReply => ({ words: words.map((w) => ({ word: w, transcription: '/x/', partOfSpeech: 'noun' })) });
  test('accepts all requested words, case-insensitively', () => {
    expect(checkPhoneticsReply(pr('Alpha', 'beta'), ['alpha', 'Beta'])).toBeNull();
  });
  test('a missing word is a problem', () => {
    expect(checkPhoneticsReply(pr('alpha'), ['alpha', 'beta'])).toBe('word "beta" is missing from the reply');
  });
  test('a duplicated word is a problem', () => {
    expect(checkPhoneticsReply(pr('alpha', 'ALPHA', 'beta'), ['alpha', 'beta'])).toBe('word "alpha" appears 2 times in the reply');
  });
});

describe('wordProblems', () => {
  test('a valid word has none', () => expect(wordProblems(gen(), 'supersede')).toEqual([]));
  test.each([
    ['2 gaps', { gaps: gen().gaps.slice(0, 2) }],
    ['6 gaps', { gaps: [...gen().gaps, ...gen().gaps] }],
    ['1 collocation', { collocations: gen().collocations.slice(0, 1) }],
    ['4 collocations', { collocations: [...gen().collocations, ...gen().collocations] }],
    ['4 forms', { forms: Array(4).fill({ sentence: 'x ___', cue: 'c', answer: 'a' }) }],
    ['3 confusables', { confusables: Array(3).fill({ sentence: 'x ___', options: ['a', 'b'], answer: 'a', reason: 'r' }) }],
    ['1 translation', { translations: gen().translations.slice(0, 1) }],
    ['3 translations', { translations: [...gen().translations, gen().translations[0]!] }],
    ['1 translation answer', { translations: [{ text: 'a', answers: ['x'] }, gen().translations[1]!] }],
    ['5 translation answers', { translations: [{ text: 'a', answers: ['1', '2', '3', '4', '5'] }, gen().translations[1]!] }],
  ] as [string, Partial<GeneratedWord>][])('count rule: %s', (_n, over) => {
    expect(wordProblems(gen(over), 'supersede')).not.toEqual([]);
  });
  test('boundaries pass: 5 gaps, 3 collocations, 3 forms, 2 confusables, 4 answers', () => {
    const g = gen({
      gaps: [...gen().gaps, ...gen().gaps.slice(0, 2)],
      collocations: [...gen().collocations, gen().collocations[0]!],
      forms: Array(3).fill({ sentence: 'x ___', cue: 'c', answer: 'went' }),
      confusables: Array(2).fill({ sentence: 'x ___', options: ['a', 'b', 'c'], answer: 'c', reason: 'r' }),
      translations: [{ text: 'a', answers: ['1', '2', '3', '4'] }, gen().translations[1]!],
    });
    expect(wordProblems(g, 'w')).toEqual([]);
  });
  test('a gap without ___ or with two is a problem', () => {
    expect(wordProblems(gen({ gaps: [{ sentence: 'none', answer: 'a', translation: '' }, ...gen().gaps.slice(1)] }), 'w')).not.toEqual([]);
    expect(wordProblems(gen({ gaps: [{ sentence: '___ and ___', answer: 'a', translation: '' }, ...gen().gaps.slice(1)] }), 'w')).not.toEqual([]);
  });
  test('a collocation phrase and a form sentence need exactly one ___', () => {
    expect(wordProblems(gen({ collocations: [{ phrase: 'no gap', answer: 'a' }, gen().collocations[1]!] }), 'w')).not.toEqual([]);
    expect(wordProblems(gen({ forms: [{ sentence: 'no gap', cue: 'c', answer: 'a' }] }), 'w')).not.toEqual([]);
  });
  test('empty answers and answers containing ___ are problems', () => {
    expect(wordProblems(gen({ gaps: [{ sentence: 'a ___', answer: ' ', translation: '' }, ...gen().gaps.slice(1)] }), 'w')).not.toEqual([]);
    expect(wordProblems(gen({ gaps: [{ sentence: 'a ___', answer: '___', translation: '' }, ...gen().gaps.slice(1)] }), 'w')).not.toEqual([]);
    expect(wordProblems(gen({ collocations: [{ phrase: 'a ___', answer: '' }, gen().collocations[1]!] }), 'w')).not.toEqual([]);
    expect(wordProblems(gen({ translations: [{ text: 'a', answers: ['x', ''] }, gen().translations[1]!] }), 'w')).not.toEqual([]);
  });
  test('confusable: 2-3 options and the answer among them', () => {
    const c = (options: string[], answer: string) => gen({ confusables: [{ sentence: 'x ___', options, answer, reason: 'r' }] });
    expect(wordProblems(c(['a'], 'a'), 'w')).not.toEqual([]);
    expect(wordProblems(c(['a', 'b', 'c', 'd'], 'a'), 'w')).not.toEqual([]);
    expect(wordProblems(c(['a', 'b'], 'z'), 'w')).not.toEqual([]);
    expect(wordProblems(c(['a', 'b'], 'b'), 'w')).toEqual([]);
  });
  test('irregular and phrasal answers pass (no stem check)', () => {
    const g = gen({ forms: [{ sentence: 'She ___ on more work.', cue: 'take on', answer: 'took on' }] });
    expect(wordProblems(g, 'take on')).toEqual([]);
  });
});

describe('withoutRevealing', () => {
  test('keeps the gaps, collocations and forms that do not reveal the word', () => {
    const g = gen({ forms: [{ sentence: 'She ___ on.', cue: 'c', answer: 'went' }] });
    expect(withoutRevealing(g, 'supersede')).toEqual(g);
  });

  test('drops a gap, collocation or form whose text or answer shows the word', () => {
    const g = gen({
      gaps: [{ sentence: 'Supersede ___ here.', answer: 'x', translation: '' }, ...gen().gaps],
      collocations: [{ phrase: 'a ___ b', answer: 'supersede' }, { phrase: 'Supersede the ___', answer: 'x' }],
      forms: [{ sentence: 'It was ___ and superseded later.', cue: 'c', answer: 'superseded' }, { sentence: 'It ___ ok.', cue: 'c', answer: 'superseded' }],
    });
    const kept = withoutRevealing(g, 'supersede');
    expect(kept.gaps.map((x) => x.sentence)).toEqual(['Gap 1 ___ here.', 'Gap 2 ___ here.', 'Gap 3 ___ here.']);
    expect(kept.collocations.map((x) => x.phrase)).toEqual(['a ___ b']);
    expect(kept.forms.map((x) => x.sentence)).toEqual(['It ___ ok.']);
  });

  test('the other fields are kept as they are', () => {
    const g = gen({ gaps: [{ sentence: 'Supersede ___.', answer: 'x', translation: '' }, ...gen().gaps] });
    expect(withoutRevealing(g, 'supersede')).toMatchObject({ word: g.word, definition: g.definition, translations: g.translations });
  });
});

describe('exercisesFrom', () => {
  test('maps every kind with unused fields null', () => {
    const g = gen({
      forms: [{ sentence: 'f ___', cue: 'cue', answer: 'fa' }],
      confusables: [{ sentence: 'c ___', options: ['a', 'b'], answer: 'a', reason: 'because' }],
    });
    const ex = exercisesFrom(g);
    expect(ex.filter((e) => e.type === 'gap')).toHaveLength(3);
    expect(ex[0]).toEqual({ type: 'gap', prompt: 'Gap 1 ___ here.', translation: 'п1', cue: null, options: null, answers: ['superseded'], note: null });
    expect(ex.find((e) => e.type === 'collocation')).toEqual({ type: 'collocation', prompt: 'a ___ b', translation: null, cue: null, options: null, answers: ['supersede'], note: null });
    expect(ex.find((e) => e.type === 'form')).toEqual({ type: 'form', prompt: 'f ___', translation: null, cue: 'cue', options: null, answers: ['fa'], note: null });
    expect(ex.find((e) => e.type === 'confusable')).toEqual({ type: 'confusable', prompt: 'c ___', translation: null, cue: null, options: ['a', 'b'], answers: ['a'], note: 'because' });
    expect(ex.filter((e) => e.type === 'translation')[0]).toEqual({ type: 'translation', prompt: 'один', translation: null, cue: null, options: null, answers: ['one', 'uno'], note: null });
    expect(ex).toHaveLength(3 + 2 + 1 + 1 + 2);
  });
});

describe('word_check', () => {
  const ok = (over: Partial<WordCheckReply['errors'][0]> = {}): WordCheckReply => ({
    wordOk: true, wordNote: 'n',
    errors: [{ fragment: 'She go', fix: 'She goes', topicKey: 'third-person-s', suggestedTopic: '', ruleSection: '', explanation: 'x', ...over }],
  });
  const keys = new Set(['third-person-s']);
  const s = 'She go home.';
  test('a valid reply passes; empty topicKey is allowed', () => {
    expect(checkWordCheckReply(ok(), s, keys)).toBeNull();
    expect(checkWordCheckReply(ok({ topicKey: '' }), s, keys)).toBeNull();
    expect(checkWordCheckReply({ wordOk: false, wordNote: '', errors: [] }, s, keys)).toBeNull();
  });
  test('rejects an unknown topic key, a fragment not in the sentence, an empty fragment or explanation', () => {
    expect(checkWordCheckReply(ok({ topicKey: 'nope' }), s, keys)).toMatch(/nope/);
    expect(checkWordCheckReply(ok({ fragment: 'He go' }), s, keys)).toMatch(/He go/);
    expect(checkWordCheckReply(ok({ fragment: '' }), s, keys)).not.toBeNull();
    expect(checkWordCheckReply(ok({ explanation: ' ' }), s, keys)).not.toBeNull();
  });
  test('prompt carries the word, definition, sentence and topic lines', () => {
    const w: Word = { id: 1, word: 'supersede', definition: 'replace', translation: '', example: '', synonyms: [], transcription: '', partOfSpeech: '', link: '', added: '2026-11-04', generation: 'ready' };
    const p = buildWordCheckPrompt(w, 'My sentence.', [{ key: 'articles', title: 'Articles' }]);
    expect(buildWordCheckPrompt({ ...w, definition: '  ' }, 's', [])).toContain('Definition: (missing)');
    expect(p).toContain('supersede');
    expect(p).toContain('replace');
    expect(p).toContain('My sentence.');
    expect(p).toContain('articles — Articles');
  });
});
