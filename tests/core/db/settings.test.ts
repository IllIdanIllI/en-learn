import { describe, expect, test } from 'vitest';
import { createTestDb } from '@/adapters/test/sqliteDb';
import { getSettings, setSetting } from '@/core/db/repos/settings';

describe('settings repo', () => {
  test('empty db returns defaults', async () => {
    const db = await createTestDb();
    expect(await getSettings(db)).toEqual({
      nativeLanguage: 'ru',
      models: {
        rule_draft: 'claude-sonnet-5-5',
        rule_chat: 'claude-sonnet-5-5',
        generate_session: 'claude-sonnet-5-5',
        validate_session: 'claude-sonnet-5-5',
        grade: 'claude-sonnet-5-5',
        dispute: 'claude-sonnet-5-5',
      },
      efforts: { rule_draft: 'medium', rule_chat: 'medium', generate_session: 'medium', validate_session: 'medium', grade: 'high', dispute: 'medium' },
      budgetUsd: null,
      acceptedShorthands: ['✓'],
      spellingVariant: 'british',
      theme: 'dark',
      closedSessions: [],
    });
  });

  test('budgetUsd round-trips and overwrites', async () => {
    const db = await createTestDb();
    await setSetting(db, 'budgetUsd', 0.3);
    expect((await getSettings(db)).budgetUsd).toBe(0.3);
    await setSetting(db, 'budgetUsd', null);
    expect((await getSettings(db)).budgetUsd).toBeNull();
  });

  test('partial models object merges over defaults', async () => {
    const db = await createTestDb();
    await db.execute('INSERT INTO settings (key, value) VALUES (?, ?)', ['models', JSON.stringify({ grade: 'm-x' })]);
    const s = await getSettings(db);
    expect(s.models.grade).toBe('m-x');
    expect(s.models.dispute).toBe('claude-sonnet-5-5');
  });

  test('a row without efforts loads the defaults; a partial efforts object merges over them', async () => {
    const db = await createTestDb();
    await db.execute('INSERT INTO settings (key, value) VALUES (?, ?)', ['models', JSON.stringify({ grade: 'm-x' })]);
    expect((await getSettings(db)).efforts.grade).toBe('high');
    await db.execute('INSERT INTO settings (key, value) VALUES (?, ?)', ['efforts', JSON.stringify({ grade: 'low' })]);
    const s = await getSettings(db);
    expect(s.efforts.grade).toBe('low');
    expect(s.efforts.dispute).toBe('medium');
  });
});
