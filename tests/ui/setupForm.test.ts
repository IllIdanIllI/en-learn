import { describe, expect, test } from 'vitest';
import { createTestDb } from '@/adapters/test/sqliteDb';
import { getTopics } from '@/core/db/repos/programme';
import { saveProgramme } from '@/core/programme/setup';
import { defaultEndDate, emptyForm, moveRow, slugify, toInput, validate, type SetupForm } from '@/ui/setup/form';

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

describe('topic order and keys', () => {
  test('moveRow swaps neighbours and ignores the ends', () => {
    const rows = [row('A'), row('B'), row('C')];
    expect(moveRow(rows, 'C', -1).map((r) => r.uid)).toEqual(['A', 'C', 'B']);
    expect(moveRow(rows, 'A', -1)).toBe(rows);
    expect(moveRow(rows, 'C', 1)).toBe(rows);
  });

  test('week_no follows the list after moving', async () => {
    const db = await createTestDb();
    const f = valid();
    f.weeks = moveRow([row('Articles'), row('Conditionals'), row('Gerunds')], 'Gerunds', -1);
    await saveProgramme(db, toInput(f));
    const weekNos = Object.fromEntries((await getTopics(db)).map((t) => [t.key, t.weekNo]));
    expect(weekNos).toEqual({ articles: 1, gerunds: 2, conditionals: 3 });
  });

  test('key must be lowercase letters, digits and hyphens', () => {
    const bad = validate({ ...valid(), weeks: [row('Articles', 'Bad Key')] });
    expect(bad).toMatchObject({ ok: false, errors: { rows: { Articles: { key: 'setup.err.keyFormat' } } } });
    expect(validate({ ...valid(), weeks: [row('Какая-то тема', '')] }).ok).toBe(false);
  });
});
