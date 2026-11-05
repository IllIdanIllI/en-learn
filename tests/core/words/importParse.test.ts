import { describe, expect, test } from 'vitest';
import { importPreview, parseObsidian } from '@/core/words/importParse';

const SAMPLE = `### the situation in which all the parts of something fit together well (связность)
?
**Word:** coherence
**Example:** "The essay lost marks for a lack of coherence between paragraphs."
**Synonyms:** consistency, unity
**Link:** https://www.oxfordlearnersdictionaries.com/us/definition/english/coherence
**Added:** 04.10.2026
<!--SR:!2026-10-28,1,166-->
`;

describe('parseObsidian', () => {
  test('parses the sample card', () => {
    const { cards, problems } = parseObsidian(SAMPLE);
    expect(problems).toEqual([]);
    expect(cards).toHaveLength(1);
    expect(cards[0]?.index).toBe(1);
    expect(cards[0]?.fields).toEqual({
      word: 'coherence',
      definition: 'the situation in which all the parts of something fit together well',
      translation: 'связность',
      example: 'The essay lost marks for a lack of coherence between paragraphs.',
      synonyms: ['consistency', 'unity'],
      link: 'https://www.oxfordlearnersdictionaries.com/us/definition/english/coherence',
      added: '2026-10-04',
    });
  });

  test('heading without parentheses → empty translation', () => {
    const { cards } = parseObsidian('### a way of thinking\n**Word:** mindset\n');
    expect(cards[0]?.fields.definition).toBe('a way of thinking');
    expect(cards[0]?.fields.translation).toBe('');
  });

  test('trailing (formal) without Cyrillic stays in the definition', () => {
    const { cards } = parseObsidian('### a polite way to say it (formal)\n**Word:** courteous\n');
    expect(cards[0]?.fields.definition).toBe('a polite way to say it (formal)');
    expect(cards[0]?.fields.translation).toBe('');
  });

  test('missing fields stay undefined', () => {
    const { cards } = parseObsidian('### to do something\n**Word:** act\n');
    const fields = cards[0]?.fields;
    expect(fields?.word).toBe('act');
    expect(fields?.example).toBeUndefined();
    expect(fields?.synonyms).toBeUndefined();
    expect(fields?.link).toBeUndefined();
    expect(fields?.added).toBeUndefined();
  });

  test('card without Word → problem no_word with its index', () => {
    const text = '### first\n**Word:** one\n\n### second\n**Example:** "no word here"\n';
    const { cards, problems } = parseObsidian(text);
    expect(cards.map((c) => c.index)).toEqual([1]);
    expect(problems).toEqual([{ index: 2, reason: 'no_word' }]);
  });

  test('crlf line endings parse the same', () => {
    const lf = parseObsidian(SAMPLE);
    const crlf = parseObsidian(SAMPLE.replace(/\n/g, '\r\n'));
    expect(crlf).toEqual(lf);
  });

  test('no headings → 0 cards, 0 problems', () => {
    expect(parseObsidian('just some text\n**Word:** lonely\n')).toEqual({ cards: [], problems: [] });
  });

  test('invalid Added date → added undefined', () => {
    const { cards } = parseObsidian('### x\n**Word:** w\n**Added:** 31.02.2026\n');
    expect(cards[0]?.fields.added).toBeUndefined();
  });
});

describe('importPreview', () => {
  const twoCards = parseObsidian(
    '### one\n**Word:** Alpha\n### two\n**Word:** beta\n### three\n**Word:** ALPHA\n### four\n**Word:** gamma\n',
  );

  test('stored words (case-insensitive) and repeats within the paste count as duplicates', () => {
    const preview = importPreview(twoCards, ['BETA']);
    expect(preview.duplicates).toBe(2);
    expect(preview.toImport.map((c) => c.fields.word)).toEqual(['Alpha', 'gamma']);
    expect(preview.problems).toEqual([]);
  });

  test('only the first paste occurrence is imported when not stored', () => {
    const preview = importPreview(twoCards, []);
    expect(preview.duplicates).toBe(1);
    expect(preview.toImport.map((c) => c.index)).toEqual([1, 2, 4]);
  });

  test('problems pass through and are not counted as duplicates', () => {
    const parsed = parseObsidian('### no word\n### x\n**Word:** x\n');
    const preview = importPreview(parsed, []);
    expect(preview.problems).toEqual([{ index: 1, reason: 'no_word' }]);
    expect(preview.duplicates).toBe(0);
    expect(preview.toImport.map((c) => c.index)).toEqual([2]);
  });
});
