import { describe, expect, test } from 'vitest';
import { defaultEndDate, emptyForm, slugify, toInput, validate, type SetupForm } from '@/ui/setup/form';

const row = (title: string, key = slugify(title)) => ({ uid: title, title, keyOverride: key, kind: 'learn' as const });

function valid(): SetupForm {
  return {
    ...emptyForm(),
    title: 'Programme',
    startDate: '2026-10-19',
    endOverride: null,
    weeks: [row('Articles'), row('Conditionals')],
    slots: { 1: 'topic', 2: 'topic', 3: 'rest', 4: 'topic', 5: 'topic', 6: 'topic', 7: 'rest' },
  };
}

describe('setup form', () => {
  test('slugify makes a lowercase hyphenated key', () => {
    expect(slugify(' Present  Perfect! ')).toBe('present-perfect');
  });

  test('default end date is start + weeks x 7 - 1', () => {
    expect(defaultEndDate('2026-10-19', 3)).toBe('2026-11-08');
  });

  test('a valid form has no errors and converts to input', () => {
    const f = valid();
    expect(validate(f)).toEqual({ ok: true });
    expect(toInput(f).endDate).toBe('2026-11-01');
  });

  test('end before start is rejected', () => {
    const r = validate({ ...valid(), endOverride: '2026-10-01' });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.errors.end).toBe('setup.err.endBeforeStart');
  });

  test('needs a week topic, a slot for every weekday, titles and unique keys', () => {
    expect(validate({ ...valid(), weeks: [] })).toMatchObject({ ok: false, errors: { weeks: 'setup.err.noWeeks' } });
    expect(validate({ ...valid(), slots: { ...valid().slots, 4: '' } })).toMatchObject({ ok: false, errors: { slots: { 4: 'setup.err.slot' } } });
    const blank = validate({ ...valid(), weeks: [row(''), row('B')] });
    expect(blank).toMatchObject({ ok: false, errors: { rows: { '': { title: 'setup.err.topicTitle' } } } });
    const dup = validate({ ...valid(), weeks: [row('A', 'x'), row('B', 'x')] });
    expect(dup).toMatchObject({ ok: false, errors: { rows: { B: { key: 'setup.err.keyDuplicate' } } } });
  });
});
