import { describe, expect, test } from 'vitest';
import { addField, fieldsFromLines, linesFromFields, snapToWords } from '@/ui/today/spotFields';

describe('spot fields', () => {
  test('round trip', () => {
    const f = [{ original: 'a old', fix: 'an old' }, { original: 'a hour', fix: '' }];
    expect(linesFromFields(f)).toBe('a old → an old\na hour → ');
    expect(fieldsFromLines('a old → an old\na hour → ')).toEqual(f);
  });
  test('legacy line without arrow becomes a field with an empty fix', () =>
    expect(fieldsFromLines('a old')).toEqual([{ original: 'a old', fix: '' }]));
  test('addField orders by position and returns the index', () => {
    const p = 'I met a old friend for a hour.';
    const one = addField([], p, 'a hour');
    expect(addField(one.fields, p, 'a old')).toEqual({ fields: [{ original: 'a old', fix: 'a old' }, { original: 'a hour', fix: 'a hour' }], index: 0 });
  });
  test('addField with an existing fragment returns its index unchanged', () => {
    const p = 'I met a old friend.';
    const f = [{ original: 'a old', fix: 'an old' }];
    expect(addField(f, p, 'a old')).toEqual({ fields: f, index: 0 });
  });
  test('snap extends to whole words', () => expect(snapToWords('He went home.', 1, 6)).toEqual({ start: 0, end: 7 }));
  test('snap trims edge spaces and punctuation', () => expect(snapToWords('He went home.', 7, 13)).toEqual({ start: 8, end: 12 }));
  test('snap keeps apostrophes inside words', () => expect(snapToWords("It's late", 1, 2)).toEqual({ start: 0, end: 4 }));
  test('snap of spaces or punctuation only is null', () => expect(snapToWords('He went.', 2, 3)).toBeNull());
});
