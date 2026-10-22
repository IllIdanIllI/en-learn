import { describe, expect, test } from 'vitest';
import { en } from '@/core/i18n/en';
import { ru } from '@/core/i18n/ru';
import { t } from '@/core/i18n';

describe('i18n', () => {
  test('ru and en have identical key sets', () => {
    expect(Object.keys(ru).sort()).toEqual(Object.keys(en).sort());
  });

  test('no value contains an em dash or forbidden repeat words', () => {
    const values = [...Object.values(en), ...Object.values(ru)];
    for (const value of values) {
      expect(value).not.toContain('—');
      expect(value.toLowerCase()).not.toMatch(/again|снова|опять/);
    }
  });

  test('en title.week interpolates', () => {
    expect(t('en', 'title.week', { n: 3, date: 'Tue 20 Oct', topic: 'Conditionals' })).toBe(
      'Week 3, Tue 20 Oct · Conditionals',
    );
  });

  test('ru title.week interpolates', () => {
    expect(t('ru', 'title.week', { n: 3, date: 'Вт 20 окт', topic: 'Conditionals' })).toBe(
      'Неделя 3, Вт 20 окт · Conditionals',
    );
  });

  test('t returns the dictionary value when no vars are needed', () => {
    expect(t('en', 'nav.today')).toBe('Today');
    expect(t('ru', 'nav.today')).toBe('Сегодня');
  });

  test('missing placeholder var throws', () => {
    expect(() => t('en', 'title.review', {})).toThrow('Missing i18n var: date');
  });
});
