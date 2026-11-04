import { describe, expect, test } from 'vitest';
import { createTestDb } from '@/adapters/test/sqliteDb';
import {
  DuplicateWord,
  deleteWord,
  insertReview,
  insertWord,
  insertWordErrors,
  listExercises,
  listReviews,
  listWordErrors,
  listWords,
  replaceExercises,
  updateExercise,
  updateWord,
} from '@/core/db/repos/words';
import type { WordFields } from '@/core/words/types';

const fields = (word: string, over: Partial<WordFields> = {}): WordFields => ({
  word,
  definition: 'the quality of being logical and consistent',
  translation: 'связность',
  example: 'The plot lacked coherence.',
  synonyms: ['consistency', 'unity'],
  link: 'https://example.com/coherence',
  added: '2026-11-04',
  ...over,
});

describe('words repo', () => {
  test("insert and list round-trips synonyms and generation 'pending'", async () => {
    const db = await createTestDb();
    const id = await insertWord(db, fields('coherence'), '2026-11-04T09:00:00Z');
    expect(await listWords(db)).toEqual([{ id, ...fields('coherence'), generation: 'pending' }]);
  });

  test('duplicate word case-insensitive', async () => {
    const db = await createTestDb();
    await insertWord(db, fields('coherence'), '2026-11-04T09:00:00Z');
    await expect(insertWord(db, fields('Coherence'), '2026-11-04T09:01:00Z')).rejects.toBeInstanceOf(DuplicateWord);

    const other = await insertWord(db, fields('cohesion'), '2026-11-04T09:02:00Z');
    await expect(updateWord(db, other, fields('COHERENCE'))).rejects.toBeInstanceOf(DuplicateWord);
    await expect(updateWord(db, other, fields('Cohesion'))).resolves.toBeUndefined();
  });

  test('replaceExercises replaces and keeps reviews', async () => {
    const db = await createTestDb();
    const wordId = await insertWord(db, fields('coherence'), '2026-11-04T09:00:00Z');
    await replaceExercises(db, wordId, [
      { type: 'gap', prompt: 'The plot lacked ___.', translation: 'связность', cue: null, options: null, answers: ['coherence'], note: null },
    ]);
    const [first] = await listExercises(db);
    const reviewId = await insertReview(db, {
      wordId,
      cardType: 'gap',
      exerciseId: first!.id,
      answeredAt: '2026-11-04T10:00:00Z',
      date: '2026-11-04',
      result: 'correct',
      counted: true,
      text: 'The plot lacked coherence.',
    });

    await replaceExercises(db, wordId, [
      { type: 'collocation', prompt: 'a ___ argument', translation: null, cue: null, options: null, answers: ['strong'], note: null },
    ]);
    const [second] = await listExercises(db);
    expect(second).toEqual({ id: expect.any(Number), wordId, type: 'collocation', prompt: 'a ___ argument', translation: null, cue: null, options: null, answers: ['strong'], note: null });

    await updateExercise(db, { ...second!, answers: ['strong', 'compelling'] });
    expect((await listExercises(db))[0]!.answers).toEqual(['strong', 'compelling']);

    expect(await listReviews(db)).toEqual([
      {
        id: reviewId,
        wordId,
        cardType: 'gap',
        exerciseId: null,
        answeredAt: '2026-11-04T10:00:00Z',
        date: '2026-11-04',
        result: 'correct',
        counted: true,
        text: 'The plot lacked coherence.',
      },
    ]);
  });

  test('deleteWord cascades to exercises, reviews and word_error', async () => {
    const db = await createTestDb();
    const wordId = await insertWord(db, fields('coherence'), '2026-11-04T09:00:00Z');
    await replaceExercises(db, wordId, [
      { type: 'form', prompt: 'coherent', translation: null, cue: 'adjective', options: null, answers: ['coherent'], note: null },
    ]);
    const exerciseId = (await listExercises(db))[0]!.id;
    const reviewId = await insertReview(db, {
      wordId,
      cardType: 'use',
      exerciseId,
      answeredAt: '2026-11-04T10:00:00Z',
      date: '2026-11-04',
      result: 'wrong',
      counted: true,
      text: 'The essay had coherent.',
    });
    await insertWordErrors(db, reviewId, [
      { fragment: 'had coherent', fix: 'had coherence', topicId: null, suggestedTopic: 'Word forms', ruleSection: null, explanation: 'noun needed' },
    ]);

    await deleteWord(db, wordId);

    expect(await listWords(db)).toEqual([]);
    expect(await listExercises(db)).toEqual([]);
    expect(await listReviews(db)).toEqual([]);
    expect(await db.select('SELECT COUNT(*) AS n FROM word_error')).toEqual([{ n: 0 }]);
  });

  test('listWordErrors returns the review date and text as sentence', async () => {
    const db = await createTestDb();
    const wordId = await insertWord(db, fields('coherence'), '2026-11-04T09:00:00Z');
    const reviewId = await insertReview(db, {
      wordId,
      cardType: 'use',
      exerciseId: null,
      answeredAt: '2026-11-03T18:00:00Z',
      date: '2026-11-03',
      result: 'hard',
      counted: false,
      text: 'She made a coherence of the plan.',
    });
    await insertWordErrors(db, reviewId, [
      { fragment: 'made a coherence of', fix: 'gave coherence to', topicId: null, suggestedTopic: 'Collocations', ruleSection: null, explanation: 'set phrase' },
    ]);

    expect(await listWordErrors(db)).toEqual([
      {
        id: expect.any(Number),
        fragment: 'made a coherence of',
        fix: 'gave coherence to',
        topicId: null,
        suggestedTopic: 'Collocations',
        ruleSection: null,
        explanation: 'set phrase',
        date: '2026-11-03',
        sentence: 'She made a coherence of the plan.',
      },
    ]);
  });
});
