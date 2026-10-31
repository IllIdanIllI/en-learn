import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { createTestDb } from '@/adapters/test/sqliteDb';
import { FakeLlm } from '@/adapters/test/fakeLlm';
import { FixedClock } from '@/adapters/test/fixedClock';
import { parseSeed, saveProgramme, insertSeedRules } from '@/core/programme/setup';
import { insertBlock, insertDraftSession, insertItem, setSessionStatus } from '@/core/db/repos/sessions';
import { upsertAnswer, upsertRuleGap } from '@/core/db/repos/answers';
import { getRule, ruleHistory, saveRuleVersion } from '@/core/db/repos/rules';
import { loadGradedFacts, getTopicStates } from '@/core/progress/history';
import { blockScores } from '@/core/progress/derive';
import type { Db, Deps, Llm, LlmResult } from '@/core/ports';
import type { DisputeReply, Source } from '@/core/llm/types';
import type { Verdict } from '@/core/domain';
import {
  decideDispute, decideRuleGap, disputeItem, disputeItems, RuleGapStaleError, recordSupport, saveMnemonic, setInattention,
} from '@/core/grading/actions';

const seedDir = path.resolve(import.meta.dirname, '../../fixtures/seed');
const promptsDir = path.resolve(import.meta.dirname, '../../../prompts');
const seedFiles = {
  programme: fs.readFileSync(path.join(seedDir, 'programme.json'), 'utf8'),
  rules: { 'articles.md': fs.readFileSync(path.join(seedDir, 'rules/articles.md'), 'utf8') },
};
const disputeSchema = JSON.parse(fs.readFileSync(path.join(promptsDir, 'dispute.schema.json'), 'utf8')) as object;

const NOW = '2026-10-22T10:00:00.000Z';
const ok = (data: unknown): LlmResult<unknown> => ({ ok: true, data, costUsd: 0.01, durationMs: 5, raw: JSON.stringify(data) });
const reply = (recommendation: DisputeReply['recommendation'] = 'drop'): DisputeReply => ({
  position: 'Position text.', ruleSection: 'Basics', sources: [], recommendation,
});

const one = (r: DisputeReply, ref = 'd1'): LlmResult<unknown> => ok({ replies: [{ ref, ...r }] });

const PROPOSAL = '## Formula\n\nUse "a" before a consonant sound and "an" before a vowel sound, including silent h: "an hour".';
const GAP_SOURCES: Source[] = [{ title: 'Cambridge Dictionary', url: 'https://dictionary.cambridge.org/grammar/british-grammar/a-an-and-the' }];

interface Row {
  prompt: string;
  expected: string;
  text: string;
  verdict: Verdict;
  fix?: string;
  explanation?: string;
  gap?: { proposal: string; explanation: string; sources: Source[] };
}

/** One block of answered items on topic 1 (articles) and rule 1 (version 1). Session status as given. */
async function gradedSession(rows: Row[], status: 'draft' | 'generated' | 'graded' = 'graded') {
  const db = await createTestDb();
  const { programme, rules } = parseSeed(seedFiles, '2026-10-19');
  await saveProgramme(db, programme);
  await insertSeedRules(db, rules, 'x');
  const sid = await insertDraftSession(db, { date: '2026-10-20', title: 't', isLight: false, createdAt: 'x' });
  const blockId = await insertBlock(db, sid, 0, {
    kind: 'task', format: 'fix', title: 'Fix', instruction: 'i', formatExample: null, passage: null, minutes: 5,
  });
  const ids: number[] = [];
  for (const [ord, r] of rows.entries()) {
    await insertItem(db, blockId, ord, {
      prompt: r.prompt, expected: r.expected, paragraph: null, topicId: 1, ruleId: 1, ruleVersion: 1,
      ruleSection: 'Basics', spellingWordId: null, isCheck: false, status: 'active', note: null, wrong: null,
    });
    const itemId = (await db.select<{ id: number }>('SELECT id FROM item WHERE block_id = ? AND ord = ?', [blockId, ord]))[0]!.id;
    ids.push(itemId);
    await upsertAnswer(db, {
      itemId, text: r.text, verdict: r.verdict, fix: r.fix ?? null, ruleSection: 'Basics',
      explanation: r.explanation ?? null, vocabularyNote: null,
    });
    if (r.gap) await upsertRuleGap(db, { itemId, ruleId: 1, proposal: r.gap.proposal, explanation: r.gap.explanation, sources: JSON.stringify(r.gap.sources), baseVersion: 1 });
  }
  await setSessionStatus(db, sid, status);
  return { db, sid, blockId, ids };
}

const depsFor = (db: Db, llm: Llm): Deps => ({
  db, llm, clock: new FixedClock('2026-10-22'),
  prompts: { load: async () => ({ system: 's', schema: disputeSchema }) },
});

const count = async (db: Db, sql: string, p?: unknown[]) => (await db.select<{ n: number }>(sql, p))[0]!.n;

const WRONG = { prompt: 'She has a apple.', expected: 'an', text: 'a', verdict: 'wrong', fix: 'an', explanation: 'Use an.' } as const;
const RIGHT = { prompt: 'He ate a banana.', expected: '✓', text: '✓', verdict: 'correct' } as const;
const WRONG_2 = { prompt: 'It is a hour long.', expected: 'an', text: 'a', verdict: 'wrong', fix: 'an', explanation: 'Use an.' } as const;
const GAP = {
  prompt: 'It was a honest mistake.', expected: 'an', text: 'a', verdict: 'rule_gap',
  gap: { proposal: PROPOSAL, explanation: 'Silent h takes an.', sources: GAP_SOURCES },
} as const;

describe('disputeItems', () => {
  const answerRow = async (db: Db, id: number) =>
    (await db.select<{ dispute_text: string | null; dispute_reply: string | null }>('SELECT dispute_text, dispute_reply FROM answer WHERE item_id = ?', [id]))[0]!;

  test('two disputes: one LLM call, numbered entries, both replies saved', async () => {
    const { db, ids } = await gradedSession([{ ...WRONG }, { ...WRONG_2 }]);
    const llm = new FakeLlm({ dispute: [ok({ replies: [{ ref: 'd2', ...reply('keep') }, { ref: 'd1', ...reply('correct') }] })] });
    const res = await disputeItems(depsFor(db, llm), [{ itemId: ids[0]!, text: 'first' }, { itemId: ids[1]!, text: 'second' }]);
    expect(res.ok).toBe(true);
    expect(llm.calls).toHaveLength(1);
    const p = llm.calls[0]!.userPrompt;
    expect(p).toContain('### d1\nTopic key: articles\nPrompt: She has a apple.');
    expect(p).toContain('### d2\nTopic key: articles\nPrompt: It is a hour long.');
    expect(await answerRow(db, ids[0]!)).toEqual({ dispute_text: 'first', dispute_reply: JSON.stringify(reply('correct')) });
    expect(await answerRow(db, ids[1]!)).toEqual({ dispute_text: 'second', dispute_reply: JSON.stringify(reply('keep')) });
  });

  test('a reply missing one ref is retried once, then errors; objections stay, no reply saved', async () => {
    const { db, ids } = await gradedSession([{ ...WRONG }, { ...WRONG_2 }]);
    const llm = new FakeLlm({ dispute: [one(reply()), one(reply())] });
    const res = await disputeItems(depsFor(db, llm), [{ itemId: ids[0]!, text: 'first' }, { itemId: ids[1]!, text: 'second' }]);
    expect(res).toMatchObject({ ok: false, code: 'check' });
    expect(llm.calls).toHaveLength(2);
    expect(await answerRow(db, ids[0]!)).toEqual({ dispute_text: 'first', dispute_reply: null });
    expect(await answerRow(db, ids[1]!)).toEqual({ dispute_text: 'second', dispute_reply: null });
  });

  test('entries from two sessions throw and save nothing', async () => {
    const a = await gradedSession([{ ...WRONG }]);
    const sid2 = await insertDraftSession(a.db, { date: '2026-10-21', title: 't2', isLight: false, createdAt: 'x' });
    const block2 = await insertBlock(a.db, sid2, 0, { kind: 'task', format: 'fix', title: 'Fix', instruction: 'i', formatExample: null, passage: null, minutes: 5 });
    await insertItem(a.db, block2, 0, {
      prompt: 'Other.', expected: 'an', paragraph: null, topicId: 1, ruleId: 1, ruleVersion: 1,
      ruleSection: 'Basics', spellingWordId: null, isCheck: false, status: 'active', note: null, wrong: null,
    });
    const other = (await a.db.select<{ id: number }>('SELECT id FROM item WHERE block_id = ?', [block2]))[0]!.id;
    await upsertAnswer(a.db, { itemId: other, text: 'a', verdict: 'wrong', fix: 'an', ruleSection: 'Basics', explanation: 'x', vocabularyNote: null });
    const llm = new FakeLlm({});
    await expect(disputeItems(depsFor(a.db, llm), [{ itemId: a.ids[0]!, text: 'x' }, { itemId: other, text: 'y' }])).rejects.toThrow('one session');
    expect(llm.calls).toHaveLength(0);
    expect(await answerRow(a.db, a.ids[0]!)).toEqual({ dispute_text: null, dispute_reply: null });
  });

  test('a non-disputable item throws before anything is saved', async () => {
    const { db, ids } = await gradedSession([{ ...WRONG }, { ...RIGHT }]);
    const llm = new FakeLlm({});
    await expect(disputeItems(depsFor(db, llm), [{ itemId: ids[0]!, text: 'x' }, { itemId: ids[1]!, text: 'y' }])).rejects.toThrow('dispute not allowed');
    expect(await answerRow(db, ids[0]!)).toEqual({ dispute_text: null, dispute_reply: null });
  });
});

describe('disputeItem', () => {
  test('wrong item: saves dispute_text and the reply JSON, returns the LLM result', async () => {
    const { db, ids, sid } = await gradedSession([{ ...WRONG }]);
    const r = reply('keep');
    const llm = new FakeLlm({ dispute: [one(r)] });
    const res = await disputeItem(depsFor(db, llm), ids[0]!, 'I think "a apple" is fine.');
    expect(res).toMatchObject({ ok: true, data: r });
    const row = (await db.select<{ dispute_text: string; dispute_reply: string }>('SELECT dispute_text, dispute_reply FROM answer WHERE item_id = ?', [ids[0]]))[0]!;
    expect(row).toEqual({ dispute_text: 'I think "a apple" is fine.', dispute_reply: JSON.stringify(r) });
    expect(await count(db, 'SELECT COUNT(*) AS n FROM llm_call WHERE session_id = ?', [sid])).toBe(1);
  });

  test('rule_gap item is allowed', async () => {
    const { db, ids } = await gradedSession([{ ...GAP }]);
    const llm = new FakeLlm({ dispute: [one(reply('correct'))] });
    const res = await disputeItem(depsFor(db, llm), ids[0]!, 'Natural English.');
    expect(res.ok).toBe(true);
    expect(await count(db, 'SELECT COUNT(*) AS n FROM answer WHERE item_id = ? AND dispute_text IS NOT NULL', [ids[0]])).toBe(1);
  });

  test('correct item throws dispute not allowed and makes no call', async () => {
    const { db, ids } = await gradedSession([{ ...RIGHT }]);
    const llm = new FakeLlm({});
    await expect(disputeItem(depsFor(db, llm), ids[0]!, 'x')).rejects.toThrow('dispute not allowed');
    expect(llm.calls).toHaveLength(0);
  });

  test('user message carries labelled item, grade, rule section, full rule body and objection', async () => {
    const { db, ids } = await gradedSession([{ ...WRONG }]);
    const llm = new FakeLlm({ dispute: [one(reply())] });
    await disputeItem(depsFor(db, llm), ids[0]!, 'Why is "a apple" wrong?');
    const p = llm.calls[0]!.userPrompt;
    expect(p).toContain('Topic key: articles');
    expect(p).toContain('Prompt: She has a apple.');
    expect(p).toContain('Expected answer: an');
    expect(p).toContain('Learner answer: a');
    expect(p).toContain('Grade verdict: wrong');
    expect(p).toContain('Grade fix: an');
    expect(p).toContain('Grade explanation: Use an.');
    expect(p).toContain('Rule section: Basics');
    expect(p).toContain('Rule body (version 1):');
    expect(p).toContain('Use "a" before a consonant sound and "an" before a vowel sound.');
    expect(p).toContain("Learner's objection:\nWhy is \"a apple\" wrong?");
    expect(llm.calls[0]!.kind).toBe('dispute');
  });

  test('dispute_text is saved before the LLM call', async () => {
    const { db, ids } = await gradedSession([{ ...WRONG }]);
    const seen: (string | null)[] = [];
    const llm: Llm = {
      call: async () => {
        seen.push((await db.select<{ t: string | null }>('SELECT dispute_text AS t FROM answer WHERE item_id = ?', [ids[0]]))[0]!.t);
        return one(reply());
      },
    };
    await disputeItem(depsFor(db, llm), ids[0]!, 'objection');
    expect(seen).toEqual(['objection']);
  });

  test('a new objection clears the previous reply and decision', async () => {
    const { db, ids } = await gradedSession([{ ...WRONG }]);
    const llm = new FakeLlm({ dispute: [one(reply('drop')), one(reply('keep'))] });
    const deps = depsFor(db, llm);
    await disputeItem(deps, ids[0]!, 'first objection');
    await decideDispute(db, ids[0]!, 'drop');
    await disputeItem(deps, ids[0]!, 'second objection');
    const row = (await db.select<{ dispute_text: string; dispute_reply: string; dispute_decision: string | null }>(
      'SELECT dispute_text, dispute_reply, dispute_decision FROM answer WHERE item_id = ?', [ids[0]],
    ))[0]!;
    expect(row.dispute_text).toBe('second objection');
    expect(row.dispute_reply).toBe(JSON.stringify(reply('keep')));
    expect(row.dispute_decision).toBeNull();
  });

  test('a new objection whose call fails leaves no stale reply or decision', async () => {
    const { db, ids } = await gradedSession([{ ...WRONG }]);
    const failed: LlmResult<unknown> = { ok: false, code: 'cli_error', message: 'boom', costUsd: 0, durationMs: 1, raw: '' };
    const llm = new FakeLlm({ dispute: [one(reply('drop')), failed, failed] });
    const deps = depsFor(db, llm);
    await disputeItem(deps, ids[0]!, 'first objection');
    await decideDispute(db, ids[0]!, 'drop');
    await disputeItem(deps, ids[0]!, 'second objection');
    const row = (await db.select<{ dispute_reply: string | null; dispute_decision: string | null }>(
      'SELECT dispute_reply, dispute_decision FROM answer WHERE item_id = ?', [ids[0]],
    ))[0]!;
    expect(row).toEqual({ dispute_reply: null, dispute_decision: null });
  });

  test('LLM failure keeps dispute_text and leaves dispute_reply empty', async () => {
    const { db, ids } = await gradedSession([{ ...WRONG }]);
    const failed: LlmResult<unknown> = { ok: false, code: 'cli_error', message: 'boom', costUsd: 0, durationMs: 1, raw: '' };
    const llm = new FakeLlm({ dispute: [failed, failed] });
    const res = await disputeItem(depsFor(db, llm), ids[0]!, 'objection');
    expect(res.ok).toBe(false);
    const row = (await db.select<{ dispute_text: string | null; dispute_reply: string | null }>('SELECT dispute_text, dispute_reply FROM answer WHERE item_id = ?', [ids[0]]))[0]!;
    expect(row).toEqual({ dispute_text: 'objection', dispute_reply: null });
  });
});

describe('decideDispute', () => {
  test('drop removes the item from the block score', async () => {
    const { db, ids, blockId } = await gradedSession([{ ...WRONG }, { ...RIGHT }, { ...WRONG_2 }, { ...GAP }]);
    const scoreOf = async () => blockScores((await loadGradedFacts(db)).scored).find((s) => s.blockId === blockId);
    expect(await scoreOf()).toEqual({ blockId, correct: 1, counted: 3 });
    await disputeItem(depsFor(db, new FakeLlm({ dispute: [one(reply('drop'))] })), ids[0]!, 'Bad item.');
    await decideDispute(db, ids[0]!, 'drop');
    expect(await scoreOf()).toEqual({ blockId, correct: 1, counted: 2 });
  });

  test("'correct' removes the topic's error from the replay", async () => {
    const { db, ids } = await gradedSession([{ ...WRONG }]);
    expect((await getTopicStates(db)).get(1)!.status).toBe('open');
    await disputeItem(depsFor(db, new FakeLlm({ dispute: [one(reply('correct'))] })), ids[0]!, 'I was right.');
    await decideDispute(db, ids[0]!, 'correct');
    const topic = (await getTopicStates(db)).get(1);
    expect(topic?.status ?? 'none').toBe('none');
    expect(topic?.history ?? []).toEqual([]);
  });

  test('throws No dispute to decide when no dispute was filed', async () => {
    const { db, ids } = await gradedSession([{ ...WRONG }]);
    await expect(decideDispute(db, ids[0]!, 'keep')).rejects.toThrow('No dispute to decide');
    expect(await count(db, 'SELECT COUNT(*) AS n FROM answer WHERE dispute_decision IS NOT NULL')).toBe(0);
  });
});

describe('setInattention', () => {
  test('true on a wrong item: error bank kind inattention and the topic is not opened', async () => {
    const { db, ids } = await gradedSession([{ ...WRONG }]);
    expect((await getTopicStates(db)).get(1)!.status).toBe('open');
    await setInattention(db, ids[0]!, true);
    const facts = await loadGradedFacts(db);
    expect(facts.errorRows.find((r) => r.itemId === ids[0])!.isInattention).toBe(true);
    expect(facts.errorRows.find((r) => r.itemId === ids[0])!.verdict).toBe('wrong');
    const topic = (await getTopicStates(db)).get(1);
    expect(topic?.status ?? 'none').toBe('none');
    expect(topic?.history ?? []).toEqual([]);
  });

  test('false clears the tag', async () => {
    const { db, ids } = await gradedSession([{ ...WRONG }]);
    await setInattention(db, ids[0]!, true);
    await setInattention(db, ids[0]!, false);
    expect(await count(db, 'SELECT is_inattention AS n FROM answer WHERE item_id = ?', [ids[0]])).toBe(0);
  });

  test('throws inattention not allowed on a correct item', async () => {
    const { db, ids } = await gradedSession([{ ...RIGHT }]);
    await expect(setInattention(db, ids[0]!, true)).rejects.toThrow('inattention not allowed');
  });
});

describe('decideRuleGap', () => {
  test('approve saves version 2 from the proposal and the item counts as correct', async () => {
    const { db, ids } = await gradedSession([{ ...GAP }]);
    const gapId = (await db.select<{ id: number }>('SELECT id FROM rule_gap'))[0]!.id;
    const effective = async () => (await loadGradedFacts(db)).errorRows.find((r) => r.itemId === ids[0])!.effective;
    expect(await effective()).toBeNull();
    await decideRuleGap(db, gapId, true, NOW);
    const rule = await getRule(db, 1);
    expect(rule).toMatchObject({ version: 2, body: PROPOSAL, sources: GAP_SOURCES });
    expect((await ruleHistory(db, 1))[0]).toEqual({ version: 2, reason: 'rule gap', createdAt: NOW });
    expect(await count(db, 'SELECT COUNT(*) AS n FROM rule_gap WHERE id = ? AND status = ?', [gapId, 'approved'])).toBe(1);
    expect(await effective()).toBe('correct');
  });

  test('retry after a crash between the version write and the status write adds no duplicate version', async () => {
    const { db, ids } = await gradedSession([{ ...GAP }]);
    const gapId = (await db.select<{ id: number }>('SELECT id FROM rule_gap'))[0]!.id;
    // Simulated crash: the version was saved, but the gap is still pending.
    await saveRuleVersion(db, { ruleId: 1 }, PROPOSAL, GAP_SOURCES, 'rule gap', NOW);
    expect(await count(db, 'SELECT COUNT(*) AS n FROM rule_gap WHERE id = ? AND status = ?', [gapId, 'pending'])).toBe(1);
    await decideRuleGap(db, gapId, true, NOW);
    expect((await getRule(db, 1)).version).toBe(2);
    expect(await count(db, 'SELECT COUNT(*) AS n FROM rule_version WHERE rule_id = 1')).toBe(2);
    expect(await count(db, 'SELECT COUNT(*) AS n FROM rule_gap WHERE id = ? AND status = ?', [gapId, 'approved'])).toBe(1);
    expect((await loadGradedFacts(db)).errorRows.find((r) => r.itemId === ids[0])!.effective).toBe('correct');
  });

  test('approve is refused when the rule has a newer version than the gap was proposed against', async () => {
    const { db } = await gradedSession([{ ...GAP }]);
    const gapId = (await db.select<{ id: number }>('SELECT id FROM rule_gap'))[0]!.id;
    await saveRuleVersion(db, { ruleId: 1 }, '## Formula\n\nOther edit.', [], 'manual', NOW);
    await expect(decideRuleGap(db, gapId, true, NOW)).rejects.toBeInstanceOf(RuleGapStaleError);
    expect(await getRule(db, 1)).toMatchObject({ version: 2, body: '## Formula\n\nOther edit.' });
    expect(await count(db, 'SELECT COUNT(*) AS n FROM rule_gap WHERE id = ? AND status = ?', [gapId, 'pending'])).toBe(1);
    await decideRuleGap(db, gapId, false, NOW);
    expect(await count(db, 'SELECT COUNT(*) AS n FROM rule_gap WHERE id = ? AND status = ?', [gapId, 'rejected'])).toBe(1);
  });

  test('approve is refused when the base version is unknown (NULL)', async () => {
    const { db } = await gradedSession([{ ...GAP }]);
    const gapId = (await db.select<{ id: number }>('SELECT id FROM rule_gap'))[0]!.id;
    await db.execute('UPDATE rule_gap SET base_version = NULL WHERE id = ?', [gapId]);
    await expect(decideRuleGap(db, gapId, true, NOW)).rejects.toBeInstanceOf(RuleGapStaleError);
    expect((await getRule(db, 1)).version).toBe(1);
  });

  test('reject leaves the rule unchanged and the item not counted', async () => {
    const { db, ids } = await gradedSession([{ ...GAP }]);
    const gapId = (await db.select<{ id: number }>('SELECT id FROM rule_gap'))[0]!.id;
    const before = await getRule(db, 1);
    await decideRuleGap(db, gapId, false, NOW);
    expect(await getRule(db, 1)).toEqual(before);
    expect(before.version).toBe(1);
    expect(await count(db, 'SELECT COUNT(*) AS n FROM rule_gap WHERE id = ? AND status = ?', [gapId, 'rejected'])).toBe(1);
    expect((await loadGradedFacts(db)).errorRows.find((r) => r.itemId === ids[0])!.effective).toBeNull();
  });

  test('deciding an already-decided gap throws and changes nothing', async () => {
    const { db } = await gradedSession([{ ...GAP }]);
    const gapId = (await db.select<{ id: number }>('SELECT id FROM rule_gap'))[0]!.id;
    await decideRuleGap(db, gapId, false, NOW);
    await expect(decideRuleGap(db, gapId, true, NOW)).rejects.toThrow('Rule gap already decided');
    expect((await getRule(db, 1)).version).toBe(1);
  });
});

describe('recordSupport', () => {
  test('inserts the support row while the session is generated, once per topic', async () => {
    const { db, sid } = await gradedSession([], 'generated');
    await recordSupport(db, sid, 1);
    await recordSupport(db, sid, 1);
    expect(await count(db, 'SELECT COUNT(*) AS n FROM session_support WHERE session_id = ? AND topic_id = 1', [sid])).toBe(1);
  });

  test('is ignored after grading', async () => {
    const { db, sid } = await gradedSession([{ ...WRONG }], 'graded');
    await recordSupport(db, sid, 1);
    expect(await count(db, 'SELECT COUNT(*) AS n FROM session_support')).toBe(0);
  });

  test('is ignored for a draft session', async () => {
    const { db, sid } = await gradedSession([], 'draft');
    await recordSupport(db, sid, 1);
    expect(await count(db, 'SELECT COUNT(*) AS n FROM session_support')).toBe(0);
  });
});

describe('saveMnemonic', () => {
  async function wordDb() {
    const { db } = await gradedSession([]);
    const { lastInsertId } = await db.execute("INSERT INTO spelling_word (word, hint, created_at) VALUES ('necessary', 'Not optional', 'x')");
    return { db, wordId: lastInsertId };
  }
  const mnemonicOf = async (db: Db, id: number) =>
    (await db.select<{ mnemonic: string | null }>('SELECT mnemonic FROM spelling_word WHERE id = ?', [id]))[0]!.mnemonic;

  test('round-trips trimmed text', async () => {
    const { db, wordId } = await wordDb();
    await saveMnemonic(db, wordId, '  one collar, two sleeves  ');
    expect(await mnemonicOf(db, wordId)).toBe('one collar, two sleeves');
  });

  test('empty or blank text stores NULL', async () => {
    const { db, wordId } = await wordDb();
    await saveMnemonic(db, wordId, 'x');
    await saveMnemonic(db, wordId, '   ');
    expect(await mnemonicOf(db, wordId)).toBeNull();
  });
});
