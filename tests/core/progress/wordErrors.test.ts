import { describe, expect, test } from 'vitest';
import { createTestDb } from '@/adapters/test/sqliteDb';
import { insertReview, insertWord, insertWordErrors } from '@/core/db/repos/words';
import { wordErrorRows } from '@/core/progress/wordErrors';

describe('wordErrorRows', () => {
  test('wordErrorRows maps a stored word error', async () => {
    const db = await createTestDb();
    const wordId = await insertWord(db, { word: 'if', definition: '', translation: '', example: '', synonyms: [], transcription: '', partOfSpeech: '', link: '', added: '2026-10-19' }, 'NOW');
    const reviewId = await insertReview(db, {
      wordId, cardType: 'use', exerciseId: null, answeredAt: 'NOW', date: '2026-11-04', result: 'wrong', counted: true, text: 'If I would know.',
    });
    await insertWordErrors(db, reviewId, [
      { fragment: 'would know', fix: 'knew', topicId: null, suggestedTopic: 'Conditionals', ruleSection: null, explanation: 'type 2' },
    ]);
    expect(await wordErrorRows(db)).toEqual([
      {
        date: '2026-11-04',
        was: { before: '', changed: 'would know', after: '' },
        shouldBe: { before: '', changed: 'knew', after: '' },
        sentence: 'If I would know.',
        hint: null,
        kind: 'grammar',
        topicId: null,
        itemId: 1,
        suggestedTopic: 'Conditionals',
        source: 'words',
      },
    ]);
  });
});
