import { describe, expect, test } from 'vitest';
import { createTestDb } from '@/adapters/test/sqliteDb';
import type { Db } from '@/core/ports';
import { insertBlock, insertDraftSession, insertItem, setSessionStatus, type NewItem } from '@/core/db/repos/sessions';
import { loadSessionView } from '@/core/session/view';

const base: NewItem = {
  prompt: '', expected: '', paragraph: null, topicId: null, ruleId: null, ruleVersion: null, ruleSection: null,
  spellingWordId: null, isCheck: false, status: 'active', note: null,
};

/** Spelling, a gap task with one defect item, a spot block with two errors in one paragraph, a speaking question. */
async function build(db: Db) {
  await db.execute("INSERT INTO programme (title, start_date, end_date) VALUES ('P','2026-10-01','2026-12-01')");
  await db.execute("INSERT INTO topic (programme_id, key, title, kind) VALUES (1,'t','T','learn')");
  await db.execute('INSERT INTO rule (topic_id, current_version) VALUES (1, 1)');
  const sid = await insertDraftSession(db, { date: '2026-10-20', title: 'Week 1, Tue 20 Oct · Articles', isLight: false, createdAt: 'x' });
  const blk = (ord: number, kind: 'spelling' | 'task' | 'speaking', format: 'spelling' | 'gap' | 'spot' | 'question', minutes: number, passage: string | null = null) =>
    insertBlock(db, sid, ord, { kind, format, title: `B${ord}`, instruction: 'do it', formatExample: null, passage, minutes });
  const b0 = await blk(0, 'spelling', 'spelling', 2);
  const b1 = await blk(1, 'task', 'gap', 10);
  const b2 = await blk(2, 'task', 'spot', 10, JSON.stringify(['A old friend had a idea.']));
  const b3 = await blk(3, 'speaking', 'question', 3, 'Describe a time when you helped someone.');
  await insertItem(db, b0, 0, { ...base, prompt: 'Not optional', expected: 'necessary' });
  await insertItem(db, b1, 0, { ...base, prompt: 'She bought ___ umbrella.', expected: 'KEY-AN', ruleSection: 'Basics' });
  await insertItem(db, b1, 1, { ...base, prompt: 'He is ___ best.', expected: 'KEY-THE', ruleSection: 'Basics' });
  await insertItem(db, b1, 2, { ...base, prompt: 'Broken ___ item.', expected: 'KEY-DEFECT', status: 'defect', note: 'two answers possible' });
  await insertItem(db, b2, 0, { ...base, prompt: 'A old', expected: 'KEY-AN-OLD', paragraph: 0, ruleSection: 'Traps' });
  await insertItem(db, b2, 1, { ...base, prompt: 'a idea', expected: 'KEY-AN-IDEA', paragraph: 0, ruleSection: 'Traps' });
  await setSessionStatus(db, sid, 'generated');
  return { sid, b0, b1, b2, b3 };
}

async function grade(db: Db, sid: number) {
  await db.execute("UPDATE session SET status = 'graded' WHERE id = ?", [sid]);
  await db.execute(
    `INSERT INTO answer (item_id, text, verdict, fix, rule_section, explanation, vocabulary_note) VALUES
     (1, 'necesary', 'wrong', 'necessary', NULL, NULL, NULL),
     (2, 'an', 'correct', '', '', '', ''),
     (3, 'a', 'rule_gap', 'the', 'Basics', 'Close.', 'best: superlative'),
     (5, 'A old → An old', 'correct', 'KEY-AN-OLD', 'Traps', '', ''),
     (6, '', 'wrong', 'KEY-AN-IDEA', 'Traps', 'Use an.', '')`,
  );
  await db.execute("INSERT INTO spot_answer (block_id, paragraph, text) VALUES (3, 0, 'A old → An old')");
  await db.execute("INSERT INTO extra_finding (block_id, paragraph, text, explanation) VALUES (3, 0, 'friend', 'This is fine.')");
  await db.execute("INSERT INTO session_feedback (session_id, patterns, tomorrow) VALUES (?, '[\"Pattern one\"]', '[\"Review a/an\"]')", [sid]);
}

describe('loadSessionView before grading', () => {
  test('never carries the answer key, hides defects and spot errors, orders blocks', async () => {
    const db = await createTestDb();
    const { sid } = await build(db);
    const view = await loadSessionView(db, sid);
    const json = JSON.stringify(view);
    for (const secret of ['KEY-AN', 'KEY-THE', 'KEY-DEFECT', 'KEY-AN-OLD', 'KEY-AN-IDEA', 'necessary', 'two answers possible']) {
      expect(json).not.toContain(secret);
    }
    expect(view.status).toBe('generated');
    expect(view.blocks.map((b) => b.ord)).toEqual([0, 1, 2, 3]);
    expect(view.blocks[1]!.items.map((i) => i.prompt)).toEqual(['She bought ___ umbrella.', 'He is ___ best.']);
    expect(view.blocks[2]!.items).toEqual([]);
    expect(view.blocks[2]!.paragraphs).toEqual([{ index: 0, text: 'A old friend had a idea.' }]);
    expect(view.blocks[3]).toMatchObject({ question: 'Describe a time when you helped someone.', items: [], paragraphs: [] });
    expect(view.feedback).toBeUndefined();
  });

  test('sums minutes and names the first rule section of the task block', async () => {
    const db = await createTestDb();
    const { sid } = await build(db);
    const view = await loadSessionView(db, sid);
    expect(view.totalMinutes).toBe(25);
    expect(view.readFirst).toEqual({ section: 'Basics', blockNumber: 2 });
  });

  test('readFirst is omitted when no task item has a rule section', async () => {
    const db = await createTestDb();
    const { sid } = await build(db);
    await db.execute('UPDATE item SET rule_section = NULL');
    expect((await loadSessionView(db, sid)).readFirst).toBeNull();
  });
});

describe('loadSessionView after grading', () => {
  test('carries expected, answers, effective verdicts, defects, gaps, spot results and feedback', async () => {
    const db = await createTestDb();
    const { sid } = await build(db);
    await grade(db, sid);
    await db.execute("INSERT INTO rule_gap (item_id, rule_id, proposal, explanation, sources) VALUES (3, 1, 'New rule body', 'why', '[]')");

    const view = await loadSessionView(db, sid);
    expect(view.status).toBe('graded');
    const [spelling, gap, spot, speaking] = view.blocks;

    expect(spelling!.items[0]).toMatchObject({ expected: 'necessary', effective: 'wrong', answer: { text: 'necesary', verdict: 'wrong', fix: 'necessary' } });
    expect(spelling!.score).toEqual({ correct: 0, counted: 1 });

    expect(gap!.items.map((i) => i.effective)).toEqual(['correct', null, null]);
    expect(gap!.items[0]!.expected).toBe('KEY-AN');
    expect(gap!.items[1]).toMatchObject({ answer: { verdict: 'rule_gap', vocabularyNote: 'best: superlative' }, gap: { status: 'pending', proposal: 'New rule body' } });
    expect(gap!.items[2]).toMatchObject({ status: 'defect', note: 'two answers possible', answer: null, effective: null });
    expect(gap!.score).toEqual({ correct: 1, counted: 1 });

    expect(spot!.items).toEqual([]);
    const p = spot!.paragraphs[0]!;
    expect(p.learnerText).toBe('A old → An old');
    expect(p.errors!.map((e) => [e.prompt, e.expected, e.effective])).toEqual([['A old', 'KEY-AN-OLD', 'correct'], ['a idea', 'KEY-AN-IDEA', 'wrong']]);
    expect(p.extra).toEqual([{ text: 'friend', explanation: 'This is fine.' }]);
    expect(spot!.score).toEqual({ correct: 1, counted: 2 });

    expect(speaking!.score).toBeUndefined();
    expect(view.feedback).toEqual({ patterns: ['Pattern one'], tomorrow: ['Review a/an'] });
  });

  test('a dispute decision changes the effective verdict', async () => {
    const db = await createTestDb();
    const { sid } = await build(db);
    await grade(db, sid);
    await db.execute("UPDATE answer SET dispute_text = 'but', dispute_reply = 'r', dispute_decision = 'correct' WHERE item_id = 1");
    const view = await loadSessionView(db, sid);
    expect(view.blocks[0]!.items[0]).toMatchObject({ effective: 'correct', answer: { disputeText: 'but', disputeDecision: 'correct' } });
    expect(view.blocks[0]!.score).toEqual({ correct: 1, counted: 1 });
  });

  test('throws for an unknown session', async () => {
    await expect(loadSessionView(await createTestDb(), 99)).rejects.toThrow('Session 99 not found');
  });
});
