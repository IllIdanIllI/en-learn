import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { createTestDb } from '@/adapters/test/sqliteDb';
import { FakeLlm } from '@/adapters/test/fakeLlm';
import { FixedClock } from '@/adapters/test/fixedClock';
import type { Db, Deps, LlmResult } from '@/core/ports';
import { getRule, getRuleTopicTitle, listRules, ruleHistory, saveRuleVersion } from '@/core/db/repos/rules';
import { draftRule, ruleSections } from '@/core/rules/rules';

const promptsDir = path.resolve(import.meta.dirname, '../../../prompts');
const ruleDraftSchema = JSON.parse(fs.readFileSync(path.join(promptsDir, 'rule_draft.schema.json'), 'utf8')) as object;

const NOW = '2026-10-22T10:00:00.000Z';

async function insertTopic(db: Db, key: string, title: string, weekNo: number | null): Promise<number> {
  const prog = await db.select<{ id: number }>('SELECT id FROM programme ORDER BY id LIMIT 1');
  let programmeId = prog[0]?.id;
  if (programmeId === undefined) {
    const res = await db.execute("INSERT INTO programme (title, start_date, end_date) VALUES ('P', '2026-10-01', '2026-10-31')");
    programmeId = res.lastInsertId;
  }
  const res = await db.execute(
    "INSERT INTO topic (programme_id, key, title, kind, week_no, archived) VALUES (?, ?, ?, 'learn', ?, 0)",
    [programmeId, key, title, weekNo],
  );
  return res.lastInsertId;
}

/** Inserts a graded session with one answered item per entry. */
async function insertGradedAnswers(
  db: Db,
  rows: { topicId: number | null; format?: 'gap' | 'spelling'; prompt: string; text: string; fix: string; isInattention: boolean }[],
): Promise<void> {
  const s = await db.execute(
    "INSERT INTO session (date, title, is_light, status, created_at) VALUES ('2026-10-20', 'S', 0, 'graded', ?)",
    [NOW],
  );
  for (const [i, r] of rows.entries()) {
    const format = r.format ?? 'gap';
    const kind = format === 'spelling' ? 'spelling' : 'task';
    const b = await db.execute(
      'INSERT INTO block (session_id, ord, kind, format, title, instruction, format_example, passage, minutes) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, 5)',
      [s.lastInsertId, i, kind, format, 'T', 'I'],
    );
    const it = await db.execute(
      "INSERT INTO item (block_id, ord, prompt, expected, topic_id, is_check, status) VALUES (?, 0, ?, ?, ?, 0, 'active')",
      [b.lastInsertId, r.prompt, 'expected', r.topicId],
    );
    await db.execute('INSERT INTO answer (item_id, text, verdict, fix, is_inattention) VALUES (?, ?, ?, ?, ?)', [
      it.lastInsertId, r.text, 'wrong', r.fix, r.isInattention ? 1 : 0,
    ]);
  }
}

const SKELETON_RU = ['Формула', 'Примеры', 'Объяснение', 'Ловушки', 'Источники'];

function bodyWith(marker: string): string {
  return SKELETON_RU.map((h) => `## ${h}\n\n${marker} ${h.toLowerCase()}`).join('\n\n');
}

function depsWith(db: Db, llm: FakeLlm): Deps {
  return {
    db,
    llm,
    clock: new FixedClock('2026-10-22', NOW),
    prompts: { load: async () => ({ system: 'SYSTEM {{nativeLanguage}}', schema: ruleDraftSchema }) },
  };
}

const draftOk = (body: string): LlmResult<unknown> => ({
  ok: true,
  data: { body, sources: [] },
  costUsd: 0.01,
  durationMs: 5,
  raw: '{}',
});

describe('saveRuleVersion', () => {
  test('first save creates rule and version 1', async () => {
    const db = await createTestDb();
    const topicId = await insertTopic(db, 'cond', 'Conditionals', 1);
    const res = await saveRuleVersion(db, { topicId }, bodyWith('v1'), [{ title: 'BC', url: 'https://learnenglish.britishcouncil.org/' }], 'seed', NOW);
    expect(res.version).toBe(1);
    const rule = await db.select<{ current_version: number }>('SELECT current_version FROM rule WHERE id = ?', [res.ruleId]);
    expect(rule[0]?.current_version).toBe(1);
    const v = await db.select<{ created_at: string; reason: string }>('SELECT created_at, reason FROM rule_version WHERE rule_id = ?', [res.ruleId]);
    expect(v).toEqual([{ created_at: NOW, reason: 'seed' }]);
  });

  test('second save creates version 2 and sets current_version', async () => {
    const db = await createTestDb();
    const topicId = await insertTopic(db, 'cond', 'Conditionals', 1);
    const first = await saveRuleVersion(db, { topicId }, bodyWith('v1'), [], 'seed', NOW);
    const second = await saveRuleVersion(db, { ruleId: first.ruleId }, bodyWith('v2'), [], 'manual edit', NOW);
    expect(second).toEqual({ ruleId: first.ruleId, version: 2 });
    const rule = await db.select<{ current_version: number }>('SELECT current_version FROM rule WHERE id = ?', [first.ruleId]);
    expect(rule[0]?.current_version).toBe(2);
  });

  test('saving with a topic that already has a rule adds a version to it', async () => {
    const db = await createTestDb();
    const topicId = await insertTopic(db, 'cond', 'Conditionals', 1);
    const first = await saveRuleVersion(db, { topicId }, bodyWith('v1'), [], 'seed', NOW);
    const second = await saveRuleVersion(db, { topicId }, bodyWith('v2'), [], 'draft', NOW);
    expect(second).toEqual({ ruleId: first.ruleId, version: 2 });
  });

  test('an existing item keeps its rule_version and getRule still returns the old body', async () => {
    const db = await createTestDb();
    const topicId = await insertTopic(db, 'cond', 'Conditionals', 1);
    const { ruleId } = await saveRuleVersion(db, { topicId }, bodyWith('old'), [], 'seed', NOW);
    const s = await db.execute("INSERT INTO session (date, title, is_light, status, created_at) VALUES ('2026-10-21', 'S', 0, 'generated', ?)", [NOW]);
    const b = await db.execute(
      "INSERT INTO block (session_id, ord, kind, format, title, instruction, minutes) VALUES (?, 0, 'task', 'gap', 'T', 'I', 5)",
      [s.lastInsertId],
    );
    const it = await db.execute(
      "INSERT INTO item (block_id, ord, prompt, expected, topic_id, rule_id, rule_version, is_check, status) VALUES (?, 0, 'p', 'e', ?, ?, 1, 0, 'active')",
      [b.lastInsertId, topicId, ruleId],
    );
    await saveRuleVersion(db, { ruleId }, bodyWith('new'), [], 'manual edit', NOW);
    const item = await db.select<{ rule_version: number }>('SELECT rule_version FROM item WHERE id = ?', [it.lastInsertId]);
    expect(item[0]?.rule_version).toBe(1);
    const old = await getRule(db, ruleId, 1);
    expect(old.body).toBe(bodyWith('old'));
    expect(old.version).toBe(1);
  });
});

describe('getRule and ruleHistory', () => {
  test('without a version returns the current version', async () => {
    const db = await createTestDb();
    const topicId = await insertTopic(db, 'cond', 'Conditionals', 1);
    const { ruleId } = await saveRuleVersion(db, { topicId }, 'first', [{ title: 'T', url: 'https://u' }], 'seed', NOW);
    await saveRuleVersion(db, { ruleId }, 'second', [], 'edit', NOW);
    expect(await getRule(db, ruleId)).toEqual({ body: 'second', sources: [], version: 2 });
  });

  test('parses sources', async () => {
    const db = await createTestDb();
    const topicId = await insertTopic(db, 'cond', 'Conditionals', 1);
    const { ruleId } = await saveRuleVersion(db, { topicId }, 'b', [{ title: 'T', url: 'https://u' }], 'seed', NOW);
    expect((await getRule(db, ruleId)).sources).toEqual([{ title: 'T', url: 'https://u' }]);
  });

  test('unknown rule throws', async () => {
    const db = await createTestDb();
    await expect(getRule(db, 999)).rejects.toThrow('Rule not found');
  });

  test('unknown version throws', async () => {
    const db = await createTestDb();
    const topicId = await insertTopic(db, 'cond', 'Conditionals', 1);
    const { ruleId } = await saveRuleVersion(db, { topicId }, 'b', [], 'seed', NOW);
    await expect(getRule(db, ruleId, 5)).rejects.toThrow('Rule not found');
  });

  test('ruleHistory returns versions newest first', async () => {
    const db = await createTestDb();
    const topicId = await insertTopic(db, 'cond', 'Conditionals', 1);
    const { ruleId } = await saveRuleVersion(db, { topicId }, 'a', [], 'seed', '2026-10-20T10:00:00.000Z');
    await saveRuleVersion(db, { ruleId }, 'b', [], 'manual edit', '2026-10-21T10:00:00.000Z');
    expect(await ruleHistory(db, ruleId)).toEqual([
      { version: 2, reason: 'manual edit', createdAt: '2026-10-21T10:00:00.000Z' },
      { version: 1, reason: 'seed', createdAt: '2026-10-20T10:00:00.000Z' },
    ]);
  });
});

describe('getRuleTopicTitle', () => {
  test('returns the topic title of the rule, empty for an unknown rule', async () => {
    const db = await createTestDb();
    const topicId = await insertTopic(db, 'articles', 'Articles', 1);
    await saveRuleVersion(db, { topicId }, 'body', [], 'first', NOW);
    expect(await getRuleTopicTitle(db, 1)).toBe('Articles');
    expect(await getRuleTopicTitle(db, 99)).toBe('');
  });
});

describe('listRules', () => {
  test('lists current versions ordered by week (null last), then title; includes archived topics', async () => {
    const db = await createTestDb();
    const alpha = await insertTopic(db, 'alpha', 'Gamma background', null);
    const zeta = await insertTopic(db, 'zeta', 'Zeta', 2);
    const beta = await insertTopic(db, 'beta', 'Beta', 1);
    const other = await insertTopic(db, 'other', 'Alpha background', null);
    await db.execute('UPDATE topic SET archived = 1 WHERE id = ?', [zeta]);
    await saveRuleVersion(db, { topicId: alpha }, 'a', [], 'seed', '2026-10-20T10:00:00.000Z');
    await saveRuleVersion(db, { topicId: zeta }, 'z1', [], 'seed', '2026-10-20T10:00:00.000Z');
    await saveRuleVersion(db, { topicId: zeta }, 'z2', [], 'edit', '2026-10-22T09:00:00.000Z');
    await saveRuleVersion(db, { topicId: beta }, 'b', [], 'seed', '2026-10-20T10:00:00.000Z');
    await saveRuleVersion(db, { topicId: other }, 'o', [], 'seed', '2026-10-20T10:00:00.000Z');

    const rows = await listRules(db);
    expect(rows.map((r) => r.topic.title)).toEqual(['Beta', 'Zeta', 'Alpha background', 'Gamma background']);
    expect(rows[1]).toMatchObject({
      version: 2,
      updatedAt: '2026-10-22T09:00:00.000Z',
      topic: { id: zeta, key: 'zeta', title: 'Zeta', kind: 'learn', weekNo: 2, archived: true },
    });
  });
});

describe('ruleSections', () => {
  test('returns the level-2 headings in order, without the ### subheadings', () => {
    const body = [
      '## Формула', 'table', '### Sub', 'x', '## Примеры', 'y', '## Объяснение', '## Ловушки', '## Источники',
    ].join('\n');
    expect(ruleSections(body)).toEqual(['Формула', 'Примеры', 'Объяснение', 'Ловушки', 'Источники']);
  });

  test('returns the five skeleton headings when all are present', () => {
    expect(ruleSections(bodyWith('x'))).toEqual(SKELETON_RU);
  });

  test('returns an empty list when there are no headings', () => {
    expect(ruleSections('just text')).toEqual([]);
  });
});

describe('draftRule', () => {
  test('context excludes inattention and spelling rows, and carries topic, language, skeleton and existing body', async () => {
    const db = await createTestDb();
    const topicId = await insertTopic(db, 'cond', 'Conditionals', 1);
    const { ruleId } = await saveRuleVersion(db, { topicId }, 'EXISTING BODY MARK', [], 'seed', NOW);
    expect(ruleId).toBeGreaterThan(0);
    await insertGradedAnswers(db, [
      { topicId, prompt: 'If I ___ rich', text: 'will be', fix: 'were', isInattention: false },
      { topicId, prompt: 'If I ___ rich', text: 'wrt', fix: 'write', isInattention: true },
      { topicId, format: 'spelling', prompt: 'hint', text: 'recieve', fix: 'receive', isInattention: false },
    ]);
    const llm = new FakeLlm({ rule_draft: [draftOk(bodyWith('draft'))] });

    const res = await draftRule(depsWith(db, llm), topicId);

    expect(res.ok).toBe(true);
    expect(llm.calls).toHaveLength(1);
    const req = llm.calls[0]!;
    expect(req.kind).toBe('rule_draft');
    expect(req.systemPrompt).toContain('Russian');
    const text = req.userPrompt;
    expect(text).toContain('Conditionals');
    expect(text).toContain('cond');
    expect(text).toContain('Russian');
    for (const h of SKELETON_RU) expect(text).toContain(h);
    expect(text).toContain('EXISTING BODY MARK');
    expect(text).toContain('will be');
    expect(text).toContain('were');
    expect(text).not.toContain('wrt');
    expect(text).not.toContain('recieve');
    expect(text).not.toContain('receive');
  });

  test('the error lines carry plain sentences: an extra word leaves no "__" placeholder', async () => {
    const db = await createTestDb();
    const topicId = await insertTopic(db, 'art', 'Articles', 1);
    await insertGradedAnswers(db, [{ topicId, prompt: 'I like the films a lot.', text: '✓', fix: 'films', isInattention: false }]);
    await db.execute("UPDATE block SET format = 'fix'");
    await db.execute("UPDATE item SET wrong = 'the films', expected = 'films'");
    const llm = new FakeLlm({ rule_draft: [draftOk(bodyWith('draft'))] });

    await draftRule(depsWith(db, llm), topicId);

    const text = llm.calls[0]!.userPrompt;
    expect(text).toContain('I like the films a lot.');
    expect(text).toContain('I like films a lot.');
    expect(text).not.toContain('__');
  });

  test('does not save a rule version', async () => {
    const db = await createTestDb();
    const topicId = await insertTopic(db, 'cond', 'Conditionals', 1);
    const llm = new FakeLlm({ rule_draft: [draftOk(bodyWith('draft'))] });
    await draftRule(depsWith(db, llm), topicId);
    const rows = await db.select<{ n: number }>('SELECT COUNT(*) AS n FROM rule');
    expect(rows[0]?.n).toBe(0);
  });
});
