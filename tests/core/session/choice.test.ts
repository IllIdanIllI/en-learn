import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { createTestDb } from '@/adapters/test/sqliteDb';
import { FakeLlm } from '@/adapters/test/fakeLlm';
import { FixedClock } from '@/adapters/test/fixedClock';
import { insertSeedRules, parseSeed, saveProgramme } from '@/core/programme/setup';
import { lessonOptions, normaliseChoice } from '@/core/session/choice';
import type { ISODate } from '@/core/domain';
import type { Db, Deps } from '@/core/ports';

const seedDir = path.resolve(import.meta.dirname, '../../fixtures/seed');
const seedFiles = {
  programme: fs.readFileSync(path.join(seedDir, 'programme.json'), 'utf8'),
  rules: { 'articles.md': fs.readFileSync(path.join(seedDir, 'rules/articles.md'), 'utf8') },
};

/** Seed programme starting Mon 2026-10-19: week 1 articles (rule), week 2 conditionals (no rule). */
async function setup({ rules = true }: { rules?: boolean } = {}): Promise<Db> {
  const db = await createTestDb();
  const { programme, rules: seedRules } = parseSeed(seedFiles, '2026-10-19');
  await saveProgramme(db, programme);
  if (rules) await insertSeedRules(db, seedRules, 'x');
  return db;
}

function depsFor(db: Db, today: ISODate): Deps {
  return { db, llm: new FakeLlm({}), clock: new FixedClock(today), prompts: { load: async () => ({ system: '', schema: {} }) } };
}

/** A graded session on 2026-10-20 with one counted wrong answer on the articles topic. */
async function gradeSession(db: Db): Promise<void> {
  const { lastInsertId: sid } = await db.execute(
    "INSERT INTO session (date, title, status, created_at) VALUES ('2026-10-20', 'Articles', 'graded', '2026-10-20T10:00:00Z')",
  );
  const { lastInsertId: bid } = await db.execute(
    "INSERT INTO block (session_id, ord, kind, format, title, instruction, minutes) VALUES (?, 1, 'task', 'fix', 'Fix', 'Write ✓ or the fix.', 6)",
    [sid],
  );
  const [topic] = await db.select<{ id: number }>("SELECT id FROM topic WHERE key = 'articles'");
  const [rule] = await db.select<{ id: number }>('SELECT id FROM rule WHERE topic_id = ?', [topic?.id]);
  const { lastInsertId: iid } = await db.execute(
    "INSERT INTO item (block_id, ord, prompt, expected, topic_id, rule_id, rule_version, rule_section) VALUES (?, 1, 'She has a apple.', 'an', ?, ?, 1, 'Basics')",
    [bid, topic?.id, rule?.id],
  );
  await db.execute("INSERT INTO answer (item_id, text, verdict, fix) VALUES (?, 'a apple', 'wrong', 'an')", [iid]);
}

describe('lessonOptions', () => {
  test('normal learn day: defaults tick the programme format, spelling and speaking; gap and fix are available', async () => {
    const db = await setup();
    // Tue 2026-10-20: slot topic, fix on the articles topic.
    const opts = await lessonOptions(depsFor(db, '2026-10-20'), '2026-10-20', false);
    expect(opts.reviewAvailable).toBe(false);
    expect(opts.formats).toEqual({ gap: null, fix: null, spot: null });
    expect(opts.defaults).toEqual({ review: false, formats: ['fix'], spelling: true, speaking: true });
  });

  test('spot day: spot is the default, gap and fix are available with the week topic', async () => {
    const db = await setup();
    // Mon 2026-10-19: error-spotting slot, so the programme task is spot.
    const opts = await lessonOptions(depsFor(db, '2026-10-19'), '2026-10-19', false);
    expect(opts.formats).toEqual({ gap: null, fix: null, spot: null });
    expect(opts.defaults).toEqual({ review: false, formats: ['spot'], spelling: true, speaking: true });
  });

  test('review is shown and ticked when the last graded session has counted wrong answers', async () => {
    const db = await setup();
    await gradeSession(db);
    const opts = await lessonOptions(depsFor(db, '2026-10-21'), '2026-10-21', false);
    expect(opts.reviewAvailable).toBe(true);
    expect(opts.defaults.review).toBe(true);
  });

  test('rest day: only review (if available) and spelling are ticked', async () => {
    const db = await setup();
    const opts = await lessonOptions(depsFor(db, '2026-10-21'), '2026-10-21', true);
    expect(opts.defaults).toEqual({ review: false, formats: [], spelling: true, speaking: false });

    await gradeSession(db);
    const withReview = await lessonOptions(depsFor(db, '2026-10-21'), '2026-10-21', true);
    expect(withReview.defaults).toEqual({ review: true, formats: [], spelling: true, speaking: false });
  });

  test('outside the programme: gap and fix say no week topic; review, spelling and speaking are ticked', async () => {
    const db = await setup();
    const opts = await lessonOptions(depsFor(db, '2026-11-10'), '2026-11-10', false);
    expect(opts.formats.gap).toBe('no_week_topic');
    expect(opts.formats.fix).toBe('no_week_topic');
    expect(opts.formats.spot).toBeNull();
    expect(opts.defaults).toEqual({ review: false, formats: [], spelling: true, speaking: true });
  });

  test('outside the programme with no rules at all: spot says no topics', async () => {
    const db = await setup({ rules: false });
    const opts = await lessonOptions(depsFor(db, '2026-11-10'), '2026-11-10', false);
    expect(opts.formats).toEqual({ gap: 'no_week_topic', fix: 'no_week_topic', spot: 'no_topics' });
  });

  test('week topic without a rule: gap and fix say no rule, and the disabled format is not ticked', async () => {
    const db = await setup();
    // Tue 2026-10-27: week 2 conditionals, which has no rule in the seed.
    const opts = await lessonOptions(depsFor(db, '2026-10-27'), '2026-10-27', false);
    expect(opts.formats.gap).toBe('no_rule');
    expect(opts.formats.fix).toBe('no_rule');
    expect(opts.defaults.formats).toEqual([]);
  });

  test('no rules at all on a learn day: spot says no topics, gap and fix say no rule', async () => {
    const db = await setup({ rules: false });
    const opts = await lessonOptions(depsFor(db, '2026-10-19'), '2026-10-19', false);
    expect(opts.formats).toEqual({ gap: 'no_rule', fix: 'no_rule', spot: 'no_topics' });
    expect(opts.defaults.formats).toEqual([]);
  });
});

describe('normaliseChoice', () => {
  test('orders formats gap, fix, spot and removes duplicates', () => {
    expect(
      normaliseChoice({ review: true, formats: ['spot', 'gap', 'spot', 'fix'], spelling: false, speaking: true }),
    ).toEqual({ review: true, formats: ['gap', 'fix', 'spot'], spelling: false, speaking: true });
    expect(normaliseChoice({ review: false, formats: ['fix', 'spot'], spelling: true, speaking: false }).formats).toEqual([
      'fix',
      'spot',
    ]);
  });
});
