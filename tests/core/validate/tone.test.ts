import { describe, expect, test } from 'vitest';
import { toneViolations } from '@/core/validate/tone';

describe('toneViolations', () => {
  test('"against" is not flagged', () => {
    expect(toneViolations(['against'])).toEqual([]);
  });

  test('"Againstall" is not flagged', () => {
    expect(toneViolations(['Againstall'])).toEqual([]);
  });

  test('"Again, the -s is missing" gives one violation', () => {
    expect(toneViolations(['Again, the -s is missing'])).toEqual(['text 0: "Again"']);
  });

  test('"3 times" gives one violation', () => {
    expect(toneViolations(['3 times'])).toEqual(['text 0: "3 times"']);
  });

  test('"опять" gives one violation', () => {
    expect(toneViolations(['опять'])).toEqual(['text 0: "опять"']);
  });

  test('"еще раз" is flagged', () => {
    expect(toneViolations(['Сделай еще раз'])).toEqual(['text 0: "еще раз"']);
  });

  test('"ещё раз" is flagged', () => {
    expect(toneViolations(['Сделай ещё раз'])).toEqual(['text 0: "ещё раз"']);
  });

  test('"5 раз" is flagged', () => {
    expect(toneViolations(['Ошибка 5 раз'])).toEqual(['text 0: "5 раз"']);
  });

  test('repeat counts with no space and with "раза" are flagged', () => {
    expect(toneViolations(['2раза', '1 time', '15 times'])).toEqual([
      'text 0: "2раза"',
      'text 1: "1 time"',
      'text 2: "15 times"',
    ]);
  });

  test('"упустил" is flagged', () => {
    expect(toneViolations(['Ты упустил артикль'])).toEqual(['text 0: "упустил"']);
  });

  test('the испорт stem is flagged with any ending', () => {
    expect(toneViolations(['испортил'])).toEqual(['text 0: "испортил"']);
  });

  test('en words "missed", "spoiled" and "once more" are flagged', () => {
    expect(toneViolations(['missed it', 'spoiled it', 'once more'])).toEqual([
      'text 0: "missed"',
      'text 1: "spoiled"',
      'text 2: "once more"',
    ]);
  });

  test('words that only contain a banned word are not flagged', () => {
    expect(toneViolations(['dismissed', '5 timestamps', 'раздел'])).toEqual([]);
  });

  test('every match is reported with its text index, in order', () => {
    expect(toneViolations(['fine', 'Again and again'])).toEqual([
      'text 1: "Again"',
      'text 1: "again"',
    ]);
  });
});
