import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { cleanRu, dictMatches, kaikkiUrl, lookupDict, normRu, parseKaikki } from '@/core/words/dictionary';
import type { Net } from '@/core/ports';

const fixture = (name: string) => readFileSync(`src/adapters/preview/kaikki/${name}.jsonl`, 'utf8');

describe('kaikkiUrl', () => {
  test('builds the kaikki path from the first letter and the first two letters', () => {
    expect(kaikkiUrl('Assertion')).toBe('https://kaikki.org/dictionary/English/meaning/a/as/assertion.jsonl');
    expect(kaikkiUrl('give up')).toBe('https://kaikki.org/dictionary/English/meaning/g/gi/give%20up.jsonl');
    expect(kaikkiUrl('a')).toBe('https://kaikki.org/dictionary/English/meaning/a/a/a.jsonl');
  });
});

describe('cleanRu', () => {
  test('strips stress marks and cuts at Latin tokens and tags', () => {
    expect(cleanRu('сдать pf trans.')).toBe('сдать');
    expect(cleanRu('бро́сить pf the habit')).toBe('бросить');
    expect(cleanRu('утвержде́ние')).toBe('утверждение');
    expect(cleanRu('pf')).toBeNull();
  });
});

describe('parseKaikki', () => {
  test('reads the Russian translations of a single-sense entry', () => {
    expect(parseKaikki(fixture('assertion'))).toEqual(['утверждение']);
  });

  test('keeps the first 8 distinct translations of compel', () => {
    const items = parseKaikki(fixture('compel'));
    expect(items.length).toBeLessThanOrEqual(8);
    expect(new Set(items).size).toBe(items.length);
    expect(items).toContain('принуждать');
    expect(items).toContain('заставлять');
  });

  test('a stressed translation with a tag reads as the bare word', () => {
    const line = JSON.stringify({ translations: [{ code: 'ru', word: 'бро́сить pf the habit' }] });
    expect(parseKaikki(line)).toEqual(['бросить']);
  });

  test('gives clean Russian for give up, tags and stress marks removed', () => {
    const items = parseKaikki(fixture('give up'));
    expect(items).toContain('сдаваться');
    expect(items).toContain('сдать');
    for (const item of items) {
      expect(item).not.toMatch(/[A-Za-z]/);
      expect(item).not.toContain('́');
    }
  });
});

describe('normRu and dictMatches', () => {
  test('normRu lowercases, maps ё to е and drops brackets and trailing punctuation', () => {
    expect(normRu('  Лёгкий толчок (локтем). ')).toBe('легкий толчок');
  });

  test('matches whole comma items only', () => {
    expect(dictMatches('голословное утверждение', ['утверждение'])).toBe(false);
    expect(dictMatches('утверждение, заявление', ['утверждение'])).toBe(true);
    expect(dictMatches('Лёгкий толчок (локтем)', ['лёгкий толчок'])).toBe(true);
    expect(dictMatches('', ['утверждение'])).toBe(false);
  });
});

describe('lookupDict', () => {
  const netReturning = (status: number, text = ''): Net => ({ getText: async () => ({ status, text }) });

  test('404 means no entry', async () => {
    expect(await lookupDict(netReturning(404), 'zzyzx')).toEqual({ checked: 'none', translations: [] });
  });

  test('200 reads the entry', async () => {
    expect(await lookupDict(netReturning(200, fixture('assertion')), 'assertion')).toEqual({
      checked: 'found',
      translations: ['утверждение'],
    });
  });

  test('200 without Russian translations is none', async () => {
    const german = JSON.stringify({ word: 'assertion', translations: [{ code: 'de', word: 'Behauptung' }] });
    expect(await lookupDict(netReturning(200, german), 'assertion')).toEqual({ checked: 'none', translations: [] });
  });

  test('other statuses throw', async () => {
    await expect(lookupDict(netReturning(500), 'assertion')).rejects.toThrow();
  });
});
