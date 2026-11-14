import { describe, expect, test } from 'vitest';
import { wordsMissingPhonetics } from '@/core/words/phonetics';
import type { Word } from '@/core/words/types';

const word = (over: Partial<Word>): Word => ({
  id: 1, word: 'alpha', definition: '', translation: '', example: '', synonyms: [], link: '', added: '2026-11-04',
  generation: 'ready', transcription: '', partOfSpeech: '', dict: { translations: [], checked: '' }, ...over,
});

describe('wordsMissingPhonetics', () => {
  test('a ready word with an empty transcription is included', () => {
    expect(wordsMissingPhonetics([word({ id: 3 })])).toEqual([3]);
  });

  test('pending and failed words are excluded', () => {
    expect(wordsMissingPhonetics([word({ id: 1, generation: 'pending' }), word({ id: 2, generation: 'failed' })])).toEqual([]);
  });

  test('a word with a transcription is excluded; a blank one counts as empty', () => {
    expect(wordsMissingPhonetics([word({ id: 1, transcription: '/a/' }), word({ id: 2, transcription: '  ' })])).toEqual([2]);
  });
});
