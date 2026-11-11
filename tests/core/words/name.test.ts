import { describe, expect, test } from 'vitest';
import { createTestDb } from '@/adapters/test/sqliteDb';
import { insertWord, listWords, setGeneration } from '@/core/db/repos/words';
import { cleanWordName, fixSavedWordNames } from '@/core/words/name';
import type { WordFields } from '@/core/words/types';

const fields = (word: string): WordFields => ({
  word, definition: 'def', translation: '', example: '', synonyms: [], link: '', added: '2026-11-01',
});

describe('cleanWordName', () => {
  test.each([
    ['incentive (for)', 'incentive'],
    ['rely (on) ', 'rely'],
    ['a (b) c', 'a (b) c'],
    ['plain', 'plain'],
    ['x (a) (b)', 'x (a)'],
    ['(for)', ''],
  ])('%j → %j', (input, expected) => {
    expect(cleanWordName(input)).toBe(expected);
  });
});

describe('fixSavedWordNames', () => {
  test('renames a saved word with a bracketed tail and returns its id', async () => {
    const db = await createTestDb();
    const id = await insertWord(db, fields('incentive (for)'), 't');
    expect(await fixSavedWordNames(db)).toEqual([id]);
    expect((await listWords(db)).map((w) => w.word)).toEqual(['incentive']);
  });

  test('keeps the other fields of the renamed word and makes it pending; an unchanged word keeps its generation', async () => {
    const db = await createTestDb();
    const id = await insertWord(db, { ...fields('rely (on)'), definition: 'to depend', synonyms: ['trust'] }, 't');
    await setGeneration(db, id, 'ready');
    const plainId = await insertWord(db, fields('plain'), 't');
    await setGeneration(db, plainId, 'ready');
    await fixSavedWordNames(db);
    const words = await listWords(db);
    expect(words.find((w) => w.id === id)).toMatchObject({ word: 'rely', definition: 'to depend', synonyms: ['trust'], generation: 'pending', added: '2026-11-01' });
    expect(words.find((w) => w.id === plainId)?.generation).toBe('ready');
  });

  test('leaves a word whose cleaned name another saved word has (case-insensitive)', async () => {
    const db = await createTestDb();
    await insertWord(db, fields('incentive'), 't');
    await insertWord(db, fields('Incentive (for)'), 't');
    expect(await fixSavedWordNames(db)).toEqual([]);
    expect((await listWords(db)).map((w) => w.word)).toEqual(['incentive', 'Incentive (for)']);
  });

  test('two words that clean to the same name: the first is renamed, the second is left', async () => {
    const db = await createTestDb();
    const first = await insertWord(db, fields('rely (on)'), 't');
    await insertWord(db, fields('rely (for)'), 't');
    expect(await fixSavedWordNames(db)).toEqual([first]);
    expect((await listWords(db)).map((w) => w.word)).toEqual(['rely', 'rely (for)']);
  });

  test('a word that cleans to an empty name is skipped', async () => {
    const db = await createTestDb();
    await insertWord(db, fields('(for)'), 't');
    expect(await fixSavedWordNames(db)).toEqual([]);
    expect((await listWords(db)).map((w) => w.word)).toEqual(['(for)']);
  });

  test('a second run finds nothing to fix', async () => {
    const db = await createTestDb();
    await insertWord(db, fields('incentive (for)'), 't');
    await fixSavedWordNames(db);
    expect(await fixSavedWordNames(db)).toEqual([]);
  });
});
