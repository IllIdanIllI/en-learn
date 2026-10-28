import { describe, expect, test } from 'vitest';
import { createTestDb } from '@/adapters/test/sqliteDb';
import { FakeLlm } from '@/adapters/test/fakeLlm';
import { FixedClock } from '@/adapters/test/fixedClock';
import { bundledPrompts } from '@/core/llm/bundledPrompts';
import { saveRuleVersion } from '@/core/db/repos/rules';
import { setSetting } from '@/core/db/repos/settings';
import { checkRuleChatReply, ruleChatTurn } from '@/core/rules/chat';
import type { Db, Deps, LlmResult } from '@/core/ports';

const NOW = '2026-10-22T10:00:00.000Z';
const HEADINGS = ['Формула', 'Примеры', 'Объяснение', 'Ловушки', 'Источники'];
const body = (marker: string, headings = HEADINGS) => headings.map((h) => `## ${h}\n\n${marker}`).join('\n\n');

const ok = (data: unknown, sessionId?: string): LlmResult<unknown> => ({
  ok: true, data, costUsd: 0.01, durationMs: 5, raw: '{}', ...(sessionId ? { sessionId } : {}),
});
const reply = (message: string, proposalBody: string | null = null) => ({
  message,
  proposal: proposalBody === null ? null : { body: proposalBody, sources: [{ title: 'Cambridge Dictionary', url: '' }] },
});

async function setup(llm: FakeLlm) {
  const db = await createTestDb();
  const prog = await db.execute("INSERT INTO programme (title, start_date, end_date) VALUES ('P', '2026-10-01', '2026-10-31')");
  const topic = await db.execute(
    "INSERT INTO topic (programme_id, key, title, kind, week_no, archived) VALUES (?, 'cond', 'Conditionals', 'learn', 1, 0)",
    [prog.lastInsertId],
  );
  const { ruleId } = await saveRuleVersion(
    db, { topicId: topic.lastInsertId }, body('CURRENT BODY MARK'), [{ title: 'British Council', url: 'https://example.com/bc' }], 'seed', NOW,
  );
  const deps: Deps = {
    db, llm, clock: new FixedClock('2026-10-22'),
    prompts: { load: async () => bundledPrompts.rule_chat },
  };
  return { db, deps, ruleId };
}

async function insertErrorRow(db: Db): Promise<void> {
  const s = await db.execute("INSERT INTO session (date, title, is_light, status, created_at) VALUES ('2026-10-20', 'S', 0, 'graded', ?)", [NOW]);
  const b = await db.execute(
    "INSERT INTO block (session_id, ord, kind, format, title, instruction, format_example, passage, minutes) VALUES (?, 0, 'task', 'gap', 'T', 'I', NULL, NULL, 5)",
    [s.lastInsertId],
  );
  const it = await db.execute(
    "INSERT INTO item (block_id, ord, prompt, expected, topic_id, is_check, status) VALUES (?, 0, 'ERRORROW PROMPT', 'x', 1, 0, 'active')",
    [b.lastInsertId],
  );
  await db.execute('INSERT INTO answer (item_id, text, verdict, fix, is_inattention) VALUES (?, ?, ?, ?, 0)', [it.lastInsertId, 'ERRORROW ANSWER', 'wrong', 'fixed']);
}

describe('ruleChatTurn', () => {
  test('first turn: persists a new session, message holds the rule and the learner text, no error rows', async () => {
    const llm = new FakeLlm({ rule_chat: [ok(reply('Hi'), 'sid-1')] });
    const { db, deps, ruleId } = await setup(llm);
    await insertErrorRow(db);
    const res = await ruleChatTurn(deps, ruleId, 'Why is it so?', null);
    expect(res).toMatchObject({ ok: true, sessionId: 'sid-1' });
    const req = llm.calls[0]!;
    expect(req.kind).toBe('rule_chat');
    expect(req.persist).toBe(true);
    expect(req.resume).toBeNull();
    expect(req.systemPrompt).toContain('Russian');
    const text = req.userPrompt;
    for (const part of ['cond', 'Conditionals', 'Russian', ...HEADINGS, 'CURRENT BODY MARK', 'British Council', 'https://example.com/bc', 'Why is it so?']) {
      expect(text).toContain(part);
    }
    expect(text.indexOf('CURRENT BODY MARK')).toBeLessThan(text.indexOf('Why is it so?'));
    expect(text).not.toContain('ERRORROW');
    expect(text).not.toContain('fixed');
  });

  test('later turns: resume id is passed and the message is only the learner text', async () => {
    const llm = new FakeLlm({ rule_chat: [ok(reply('Again'), 'sid-2')] });
    const { deps, ruleId } = await setup(llm);
    const res = await ruleChatTurn(deps, ruleId, 'And another thing?', 'sid-1');
    expect(res).toMatchObject({ ok: true, sessionId: 'sid-2' });
    const req = llm.calls[0]!;
    expect(req.resume).toBe('sid-1');
    expect(req.persist).toBe(true);
    expect(req.userPrompt).toBe('And another thing?');
  });

  test('a rejected attempt is retried from the old id; only the valid reply gives the new id', async () => {
    const wrongOrder = body('x', ['Примеры', 'Формула']);
    const llm = new FakeLlm({ rule_chat: [ok(reply('bad', wrongOrder), 'sid-bad'), ok(reply('good'), 'sid-good')] });
    const { deps, ruleId } = await setup(llm);
    const res = await ruleChatTurn(deps, ruleId, 'change it', 'sid-old');
    expect(res).toMatchObject({ ok: true, sessionId: 'sid-good' });
    expect(llm.calls.map((c) => c.resume)).toEqual(['sid-old', 'sid-old']);
  });

  test('a failed turn (after its retry) carries no session id', async () => {
    const fail: LlmResult<unknown> = { ok: false, code: 'timeout', message: 't', costUsd: 0, durationMs: 1, raw: '' };
    const llm = new FakeLlm({ rule_chat: [fail, fail] });
    const { deps, ruleId } = await setup(llm);
    const res = await ruleChatTurn(deps, ruleId, 'hi', 'sid-old');
    expect(res.ok).toBe(false);
    expect(res.sessionId).toBeUndefined();
  });

  test('a failed turn keeps the last good id: the retry resumes it again', async () => {
    const fail: LlmResult<unknown> = { ok: false, code: 'timeout', message: 't', costUsd: 0, durationMs: 1, raw: '' };
    const llm = new FakeLlm({ rule_chat: [ok(reply('one'), 'sid-A'), fail, fail, ok(reply('two'), 'sid-B')] });
    const { deps, ruleId } = await setup(llm);
    const first = await ruleChatTurn(deps, ruleId, 'first', null);
    expect(first).toMatchObject({ ok: true, sessionId: 'sid-A' });
    const failed = await ruleChatTurn(deps, ruleId, 'second', 'sid-A');
    expect(failed.ok).toBe(false);
    expect(failed.sessionId).toBeUndefined();
    const retried = await ruleChatTurn(deps, ruleId, 'second', 'sid-A');
    expect(retried).toMatchObject({ ok: true, sessionId: 'sid-B' });
    expect(llm.calls.map((c) => c.resume)).toEqual([null, 'sid-A', 'sid-A', 'sid-A']);
  });

  test('unknown rule throws', async () => {
    const { deps } = await setup(new FakeLlm({}));
    await expect(ruleChatTurn(deps, 999, 'hi', null)).rejects.toThrow('Rule not found');
  });

  test('native language English gives English skeleton headings', async () => {
    const llm = new FakeLlm({ rule_chat: [ok(reply('Hi'), 's')] });
    const { deps, ruleId } = await setup(llm);
    await setSetting(deps.db, 'nativeLanguage', 'en');
    await ruleChatTurn(deps, ruleId, 'hi', null);
    expect(llm.calls[0]!.userPrompt).toContain('## Formula');
    expect(llm.calls[0]!.systemPrompt).toContain('English');
  });
});

describe('checkRuleChatReply', () => {
  const check = (r: unknown) => checkRuleChatReply(r as Parameters<typeof checkRuleChatReply>[0], 'ru');

  test('no proposal is fine', () => expect(check(reply('answer'))).toBeNull());
  test('a full skeleton in order is fine', () => expect(check(reply('m', body('x')))).toBeNull());
  test('a skipped section is fine, order kept', () => {
    expect(check(reply('m', body('x', ['Формула', 'Примеры', 'Источники'])))).toBeNull();
  });
  test('empty body is rejected', () => expect(check(reply('m', '  \n'))).not.toBeNull());
  test('an unknown heading is rejected', () => expect(check(reply('m', body('x', ['Формула', 'Лишнее'])))).not.toBeNull());
  test('wrong order is rejected', () => expect(check(reply('m', body('x', ['Примеры', 'Формула'])))).not.toBeNull());
  test('a repeated heading is rejected', () => expect(check(reply('m', body('x', ['Формула', 'Формула'])))).not.toBeNull());
  test('a body without headings is rejected', () => expect(check(reply('m', 'plain'))).not.toBeNull());
});
