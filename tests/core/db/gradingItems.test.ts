import { expect, test } from 'vitest';
import { createTestDb } from '@/adapters/test/sqliteDb';
import { insertBlock, insertDraftSession, insertItem, listGradingItems } from '@/core/db/repos/sessions';

test('listGradingItems reads plain-text passages of question blocks without parsing them', async () => {
  const db = await createTestDb();
  const sid = await insertDraftSession(db, { date: '2026-10-20', title: 't', isLight: false, createdAt: 'x' });
  const q = await insertBlock(db, sid, 0, { kind: 'speaking', format: 'question', title: 'S', instruction: 'i', formatExample: null, passage: 'Describe a time when you helped.', minutes: 3 });
  const s = await insertBlock(db, sid, 1, { kind: 'task', format: 'spot', title: 'T', instruction: 'i', formatExample: null, passage: JSON.stringify(['One.']), minutes: 3 });
  const base = { expected: '', paragraph: null, topicId: null, ruleId: null, ruleVersion: null, ruleSection: null, spellingWordId: null, isCheck: false, status: 'active', note: null } as const;
  await insertItem(db, q, 0, { ...base, prompt: 'Describe a time when you helped.' });
  await insertItem(db, s, 0, { ...base, prompt: 'a old', expected: 'an old', paragraph: 0 });
  const items = await listGradingItems(db, sid);
  expect(items.map((i) => i.passage)).toEqual([null, ['One.']]);
});
