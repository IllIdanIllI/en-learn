import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { createTestDb } from '@/adapters/test/sqliteDb';
import { getProgramme, getSlots, getTopics, topicHasRule } from '@/core/db/repos/programme';
import { insertSeedRules, parseSeed, replaceProgramme, saveProgramme } from '@/core/programme/setup';
import type { ProgrammeInput } from '@/core/programme/setup';

const dir = path.resolve(import.meta.dirname, '../../fixtures/seed');
const files = {
  programme: fs.readFileSync(path.join(dir, 'programme.json'), 'utf8'),
  rules: { 'articles.md': fs.readFileSync(path.join(dir, 'rules/articles.md'), 'utf8') },
};

describe('parseSeed', () => {
  test('returns 3 weeks and 1 rule with sources; dates from today', () => {
    const { programme, rules } = parseSeed(files, '2026-10-22'); // Thursday
    expect(programme.weeks).toHaveLength(3);
    expect(programme.background).toHaveLength(1);
    expect(programme.startDate).toBe('2026-10-22');
    expect(programme.endDate).toBe('2026-11-11');
    expect(programme.slots[2]).toBe('topic');
    expect(rules).toHaveLength(1);
    expect(rules[0]?.topicKey).toBe('articles');
    expect(rules[0]?.sources).toHaveLength(2);
    expect(rules[0]?.sources[0]).toEqual({
      title: 'Cambridge Dictionary',
      url: 'https://dictionary.cambridge.org/grammar/british-grammar/a-an-and-the',
    });
    expect(rules[0]?.body.startsWith('## Basics')).toBe(true);
  });
  test('the start date is today on any weekday; calendar weeks count from it', () => {
    expect(parseSeed(files, '2026-10-19').programme.startDate).toBe('2026-10-19'); // Monday
    const sunday = parseSeed(files, '2026-10-25').programme;
    expect(sunday.startDate).toBe('2026-10-25');
    expect(sunday.endDate).toBe('2026-11-14');
  });
});

describe('setup', () => {
  const input = (): ProgrammeInput => parseSeed(files, '2026-10-19').programme;

  test('saveProgramme stores programme, topics, slots; second call throws', async () => {
    const db = await createTestDb();
    const id = await saveProgramme(db, input());
    expect((await getProgramme(db))?.id).toBe(id);
    const topics = await getTopics(db);
    expect(topics.map((t) => [t.key, t.weekNo])).toEqual([
      ['articles', 1], ['conditionals', 2], ['present-perfect', 3], ['third-person-s', null],
    ]);
    expect((await getSlots(db))[3]).toBe('rest');
    await expect(saveProgramme(db, input())).rejects.toThrow('Programme exists; use replaceProgramme');
  });

  test('insertSeedRules inserts v1 and skips unknown topics', async () => {
    const db = await createTestDb();
    await saveProgramme(db, input());
    const { rules } = parseSeed(files, '2026-10-19');
    await insertSeedRules(db, [...rules, { topicKey: 'nope', body: 'x', sources: [] }], 'NOW');
    const topics = await getTopics(db);
    expect(await topicHasRule(db, topics[0]!.id)).toBe(true);
    expect(await topicHasRule(db, topics[1]!.id)).toBe(false);
    const rv = await db.select<{ version: number; reason: string; created_at: string }>('SELECT * FROM rule_version');
    expect(rv).toHaveLength(1);
    expect(rv[0]).toMatchObject({ version: 1, reason: 'seed', created_at: 'NOW' });
    await insertSeedRules(db, rules, 'NOW2');
    expect(await db.select('SELECT * FROM rule')).toHaveLength(1);
  });

  test('replaceProgramme keeps topics referenced by items', async () => {
    const db = await createTestDb();
    await saveProgramme(db, input());
    const x = (await getTopics(db)).find((t) => t.key === 'conditionals')!;
    await db.execute("INSERT INTO session (date, title, is_light, status, created_at) VALUES ('2026-10-20','S',0,'graded','x')");
    await db.execute("INSERT INTO block (session_id, ord, kind, format, title, instruction, minutes) VALUES (1,1,'task','gap','B','i',5)");
    await db.execute('INSERT INTO item (block_id, ord, prompt, expected, topic_id) VALUES (1,1,?,?,?)', ['p', 'e', x.id]);
    const next = input();
    next.weeks = [next.weeks[2]!, next.weeks[0]!]; // drops conditionals, reorders
    next.title = 'New';
    await replaceProgramme(db, next);
    const topics = await getTopics(db);
    expect(topics.find((t) => t.key === 'conditionals')).toMatchObject({ id: x.id, weekNo: null, archived: true });
    expect(topics.filter((t) => t.key !== 'conditionals').every((t) => !t.archived)).toBe(true);
    expect(topics.find((t) => t.key === 'present-perfect')?.weekNo).toBe(1);
    expect(topics.find((t) => t.key === 'articles')?.weekNo).toBe(2);
    expect((await getProgramme(db))?.title).toBe('New');
  });

  test('replaceProgramme un-archives a topic that returns to the input', async () => {
    const db = await createTestDb();
    await saveProgramme(db, input());
    const x = (await getTopics(db)).find((t) => t.key === 'conditionals')!;
    await db.execute("INSERT INTO session (date, title, is_light, status, created_at) VALUES ('2026-10-20','S',0,'graded','x')");
    await db.execute("INSERT INTO block (session_id, ord, kind, format, title, instruction, minutes) VALUES (1,1,'task','gap','B','i',5)");
    await db.execute('INSERT INTO item (block_id, ord, prompt, expected, topic_id) VALUES (1,1,?,?,?)', ['p', 'e', x.id]);
    const without = input();
    without.weeks = without.weeks.filter((w) => w.key !== 'conditionals');
    await replaceProgramme(db, without);
    expect((await getTopics(db)).find((t) => t.key === 'conditionals')?.archived).toBe(true);
    await replaceProgramme(db, input());
    expect((await getTopics(db)).find((t) => t.key === 'conditionals')).toMatchObject({ archived: false, weekNo: 2 });
  });

  test('replaceProgramme deletes unreferenced topics', async () => {
    const db = await createTestDb();
    await saveProgramme(db, input());
    const next = input();
    next.weeks = next.weeks.slice(0, 2);
    await replaceProgramme(db, next);
    expect((await getTopics(db)).map((t) => t.key)).not.toContain('present-perfect');
  });
});
