import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { createTestDb } from '@/adapters/test/sqliteDb';
import { FakeLlm } from '@/adapters/test/fakeLlm';
import { FixedClock } from '@/adapters/test/fixedClock';
import { insertSeedRules, parseSeed, saveProgramme } from '@/core/programme/setup';
import { lessonOptions, normaliseChoice } from '@/core/session/choice';
import { getSessionChoice } from '@/core/db/repos/sessions';
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
    expect(opts.defaults).toEqual({ review: false, formats: ['fix'], spelling: true, speaking: true, writing: false, rewrite: false });
  });

  test('spot day: spot is the default, gap and fix are available with the week topic', async () => {
    const db = await setup();
    // Mon 2026-10-19: error-spotting slot, so the programme task is spot.
    const opts = await lessonOptions(depsFor(db, '2026-10-19'), '2026-10-19', false);
    expect(opts.formats).toEqual({ gap: null, fix: null, spot: null });
    expect(opts.defaults).toEqual({ review: false, formats: ['spot'], spelling: true, speaking: true, writing: false, rewrite: false });
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
    expect(opts.defaults).toEqual({ review: false, formats: [], spelling: true, speaking: false, writing: false, rewrite: false });

    await gradeSession(db);
    const withReview = await lessonOptions(depsFor(db, '2026-10-21'), '2026-10-21', true);
    expect(withReview.defaults).toEqual({ review: true, formats: [], spelling: true, speaking: false, writing: false, rewrite: false });
  });

  test('outside the programme: gap and fix say no week topic; review, spelling and speaking are ticked', async () => {
    const db = await setup();
    const opts = await lessonOptions(depsFor(db, '2026-11-10'), '2026-11-10', false);
    expect(opts.formats.gap).toBe('no_week_topic');
    expect(opts.formats.fix).toBe('no_week_topic');
    expect(opts.formats.spot).toBeNull();
    expect(opts.defaults).toEqual({ review: false, formats: [], spelling: true, speaking: true, writing: false, rewrite: false });
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

/** A graded session on 2026-10-20 whose writing text has 60 words, so rewrite has a source. */
async function gradeWriting(db: Db): Promise<void> {
  const { lastInsertId: sid } = await db.execute(
    "INSERT INTO session (date, title, status, created_at) VALUES ('2026-10-20', 'Essay', 'graded', '2026-10-20T10:00:00Z')",
  );
  const { lastInsertId: bid } = await db.execute(
    "INSERT INTO block (session_id, ord, kind, format, title, instruction, minutes) VALUES (?, 1, 'writing', 'essay', 'Essay', 'Write.', 20)",
    [sid],
  );
  await db.execute("INSERT INTO writing_text (block_id, text, words, created_at) VALUES (?, 'essay', 60, '2026-10-20T10:30:00Z')", [bid]);
}

describe('writing and rewrite defaults', () => {
  // Sat 2026-10-24 is the writing slot, Sun 2026-10-25 the review_rewrite slot.
  test('writing is ticked on a writing slot day, and not on a rest day', async () => {
    const db = await setup();
    expect((await lessonOptions(depsFor(db, '2026-10-24'), '2026-10-24', false)).defaults.writing).toBe(true);
    expect((await lessonOptions(depsFor(db, '2026-10-24'), '2026-10-24', true)).defaults.writing).toBe(false);
  });

  test('rewrite is ticked on a review_rewrite slot day with a graded text', async () => {
    const db = await setup();
    await gradeWriting(db);
    const opts = await lessonOptions(depsFor(db, '2026-10-25'), '2026-10-25', false);
    expect(opts.rewriteReason).toBeNull();
    expect(opts.defaults.rewrite).toBe(true);
    expect((await lessonOptions(depsFor(db, '2026-10-25'), '2026-10-25', true)).defaults.rewrite).toBe(false);
  });

  test('rewrite says no text, and is not ticked, without a graded text', async () => {
    const db = await setup();
    const opts = await lessonOptions(depsFor(db, '2026-10-25'), '2026-10-25', false);
    expect(opts.rewriteReason).toBe('no_text');
    expect(opts.defaults.rewrite).toBe(false);
  });

  test('other days tick neither writing nor rewrite, even with a text', async () => {
    const db = await setup();
    await gradeWriting(db);
    for (const d of ['2026-10-20', '2026-10-21', '2026-10-22'] as const) {
      const opts = await lessonOptions(depsFor(db, d), d, false);
      expect(opts.defaults.writing).toBe(false);
      expect(opts.defaults.rewrite).toBe(false);
    }
  });
});

describe('getSessionChoice', () => {
  test('a choice stored without writing and rewrite reads them as false', async () => {
    const db = await createTestDb();
    await db.execute(
      "INSERT INTO session (date, title, status, created_at, choice) VALUES ('2026-10-20', 'Old', 'graded', '2026-10-20T10:00:00Z', ?)",
      [JSON.stringify({ review: true, formats: ['gap'], spelling: true, speaking: true })],
    );
    expect(await getSessionChoice(db, 1)).toEqual({ review: true, formats: ['gap'], spelling: true, speaking: true, writing: false, rewrite: false });
  });
});

describe('normaliseChoice', () => {
  test('orders formats gap, fix, spot and removes duplicates', () => {
    expect(
      normaliseChoice({ review: true, formats: ['spot', 'gap', 'spot', 'fix'], spelling: false, speaking: true, writing: false, rewrite: false }),
    ).toEqual({ review: true, formats: ['gap', 'fix', 'spot'], spelling: false, speaking: true, writing: false, rewrite: false });
    expect(normaliseChoice({ review: false, formats: ['fix', 'spot'], spelling: true, speaking: false, writing: false, rewrite: false }).formats).toEqual([
      'fix',
      'spot',
    ]);
  });
});
