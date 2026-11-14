import { describe, expect, test } from 'vitest';
import { keepUntouchedBlanks } from '@/core/words/keepBlanks';
import type { WordFields } from '@/core/words/types';

const fields = (over: Partial<WordFields>): WordFields => ({
  word: 'alpha', definition: '', translation: '', example: '', synonyms: [], link: '', added: '2026-11-04',
  transcription: '', partOfSpeech: '', ...over,
});
const stored = { transcription: '/ˈælfə/', partOfSpeech: 'noun' };

describe('keepUntouchedBlanks', () => {
  test('an empty, untouched transcription and part of speech keep the stored values', () => {
    const out = keepUntouchedBlanks(fields({}), stored, new Set());
    expect(out).toMatchObject({ transcription: '/ˈælfə/', partOfSpeech: 'noun' });
  });

  test('a touched field saves as typed, even when it is empty', () => {
    const out = keepUntouchedBlanks(fields({}), stored, new Set(['transcription']));
    expect(out.transcription).toBe('');
    expect(out.partOfSpeech).toBe('noun');
  });

  test('a non-empty value is saved as typed', () => {
    const out = keepUntouchedBlanks(fields({ transcription: '/x/', partOfSpeech: 'verb' }), stored, new Set());
    expect(out).toMatchObject({ transcription: '/x/', partOfSpeech: 'verb' });
  });

  test('the other fields are not changed', () => {
    const out = keepUntouchedBlanks(fields({ translation: 'альфа' }), stored, new Set());
    expect(out.translation).toBe('альфа');
    expect(out.word).toBe('alpha');
  });
});
