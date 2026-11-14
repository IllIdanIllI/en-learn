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
  setDict,
  setGeneration,
  updateExercise,
  updateWord,
} from '@/core/db/repos/words';
import { generatePhonetics } from '@/core/words/generate';
import { FixedClock } from '@/adapters/test/fixedClock';
import { FakeLlm } from '@/adapters/test/fakeLlm';
import { bundledPrompts } from '@/core/llm/bundledPrompts';
import type { Deps } from '@/core/ports';
import type { PhoneticsReply } from '@/core/llm/types';
import type { WordFields } from '@/core/words/types';

const fields = (word: string, over: Partial<WordFields> = {}): WordFields => ({
  word,
  definition: 'the quality of being logical and consistent',
  translation: 'связность',
  example: 'The plot lacked coherence.',
  synonyms: ['consistency', 'unity'],
  link: 'https://example.com/coherence',
  added: '2026-11-04',
  transcription: '',
  partOfSpeech: '',
  ...over,
});

describe('words repo', () => {
  test("insert and list round-trips synonyms and generation 'pending'", async () => {
    const db = await createTestDb();
    const id = await insertWord(db, fields('coherence'), '2026-11-04T09:00:00Z');
    expect(await listWords(db)).toEqual([{ id, ...fields('coherence'), generation: 'pending', dict: { translations: [], checked: '' } }]);
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

  test('insertWordErrors keeps a non-null topicId', async () => {
    const db = await createTestDb();
    const { lastInsertId: programmeId } = await db.execute("INSERT INTO programme (title, start_date, end_date) VALUES ('P', '2026-10-19', '2026-11-08')");
    const { lastInsertId: topicId } = await db.execute(
      "INSERT INTO topic (programme_id, key, title, kind, week_no, archived) VALUES (?, 'conditionals', 'Conditionals', 'learn', 2, 0)",
      [programmeId],
    );
    const wordId = await insertWord(db, fields('coherence'), '2026-11-04T09:00:00Z');
    const reviewId = await insertReview(db, {
      wordId, cardType: 'use', exerciseId: null, answeredAt: '2026-11-04T10:00:00Z', date: '2026-11-04', result: 'wrong', counted: true, text: 'x',
    });
    await insertWordErrors(db, reviewId, [
      { fragment: 'f', fix: 'g', topicId, suggestedTopic: null, ruleSection: null, explanation: 'e' },
    ]);
    expect(await listWordErrors(db)).toMatchObject([{ topicId }]);
  });
});

describe('words repo: transcription and part of speech', () => {
  test('insert, update and list round-trip the two fields', async () => {
    const db = await createTestDb();
    const id = await insertWord(db, fields('coherence', { transcription: '/ˌkoʊhɪərəns/', partOfSpeech: 'noun' }), '2026-11-04T09:00:00Z');
    expect(await listWords(db)).toEqual([expect.objectContaining({ id, transcription: '/ˌkoʊhɪərəns/', partOfSpeech: 'noun' })]);
    await updateWord(db, id, fields('coherence', { transcription: '/kəˈhɪərəns/', partOfSpeech: 'phrasal verb' }));
    expect(await listWords(db)).toEqual([expect.objectContaining({ transcription: '/kəˈhɪərəns/', partOfSpeech: 'phrasal verb' })]);
  });

  test("a row inserted without the two columns reads ''", async () => {
    const db = await createTestDb();
    await db.execute(
      "INSERT INTO word (word, definition, translation, example, synonyms, link, added, generation, created_at) VALUES ('old', '', '', '', '[]', '', '2026-11-04', 'ready', 'x')",
    );
    expect(await listWords(db)).toEqual([expect.objectContaining({ word: 'old', transcription: '', partOfSpeech: '' })]);
  });
});

describe('words repo: dictionary fields', () => {
  test('a new word reads an empty dict', async () => {
    const db = await createTestDb();
    await insertWord(db, fields('coherence'), '2026-11-04T09:00:00Z');
    expect((await listWords(db))[0]!.dict).toEqual({ translations: [], checked: '' });
  });

  test('setDict writes both fields', async () => {
    const db = await createTestDb();
    const id = await insertWord(db, fields('assertion'), '2026-11-04T09:00:00Z');
    await setDict(db, id, ['утверждение'], 'found', 'assertion');
    expect((await listWords(db))[0]!.dict).toEqual({ translations: ['утверждение'], checked: 'found' });
  });

  test('setDict for a spelling the word no longer has is a no-op', async () => {
    const db = await createTestDb();
    const id = await insertWord(db, fields('assertion'), '2026-11-04T09:00:00Z');
    await updateWord(db, id, fields('assertions'));
    await setDict(db, id, ['утверждение'], 'found', 'assertion');
    expect((await listWords(db))[0]!.dict).toEqual({ translations: [], checked: '' });
  });

  test('updateWord with the same spelling (other case or spacing) keeps dict', async () => {
    const db = await createTestDb();
    const id = await insertWord(db, fields('assertion'), '2026-11-04T09:00:00Z');
    await setDict(db, id, ['утверждение'], 'found', 'assertion');
    await updateWord(db, id, fields(' Assertion ', { definition: 'changed' }));
    expect((await listWords(db))[0]).toMatchObject({ definition: 'changed', dict: { translations: ['утверждение'], checked: 'found' } });
  });

  test('updateWord with a changed spelling resets dict', async () => {
    const db = await createTestDb();
    const id = await insertWord(db, fields('assertion'), '2026-11-04T09:00:00Z');
    await setDict(db, id, ['утверждение'], 'found', 'assertion');
    await updateWord(db, id, fields('assertions'));
    expect((await listWords(db))[0]).toMatchObject({ word: 'assertions', dict: { translations: [], checked: '' } });
  });

  test('generatePhonetics keeps dict when it writes the transcription', async () => {
    const db = await createTestDb();
    const id = await insertWord(db, fields('supersede'), '2026-11-04T09:00:00Z');
    await setGeneration(db, id, 'ready');
    await setDict(db, id, ['заменять'], 'found', 'supersede');
    const reply: PhoneticsReply = { words: [{ word: 'supersede', transcription: '/ˌsuːpəˈsiːd/', partOfSpeech: 'verb' }] };
    const llm = new FakeLlm({ phonetics: [{ ok: true, data: reply, costUsd: 0, durationMs: 1, raw: '{}' }] });
    const deps: Deps = { db, llm, clock: new FixedClock('2026-11-04'), prompts: { load: async (kind) => bundledPrompts[kind] } };
    expect(await generatePhonetics(deps, [id])).toEqual({ ok: true, failed: 0 });
    expect((await listWords(db))[0]).toMatchObject({ transcription: '/ˌsuːpəˈsiːd/', dict: { translations: ['заменять'], checked: 'found' } });
  });
});
