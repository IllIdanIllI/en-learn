import { describe, expect, test } from 'vitest';
import { createTestDb } from '@/adapters/test/sqliteDb';
import { FixedClock } from '@/adapters/test/fixedClock';
import { FakeLlm } from '@/adapters/test/fakeLlm';
import { callStructured } from '@/core/llm/call';
import { COMMON_RULES } from '@/core/llm/bundledPrompts';
import { setSetting } from '@/core/db/repos/settings';
import type { Deps, LlmResult } from '@/core/ports';

const schema = {
  type: 'object',
  properties: { word: { type: 'string' } },
  required: ['word'],
  additionalProperties: false,
};

const good = (data: unknown): LlmResult<unknown> => ({ ok: true, data, costUsd: 0.01, durationMs: 5, raw: JSON.stringify(data) });
const bad = (code: 'budget' | 'timeout'): LlmResult<unknown> => ({
  ok: false, code, message: code, costUsd: 0.02, durationMs: 5, raw: '',
});

async function setup(llm: FakeLlm) {
  const db = await createTestDb();
  const deps: Deps = {
    db,
    llm,
    clock: new FixedClock('2026-10-22'),
    prompts: { load: async () => ({ system: 'Explain in {{nativeLanguage}}. Again {{nativeLanguage}}.', schema }) },
  };
  return deps;
}

const rows = (deps: Deps) =>
  deps.db.select<{ ok: number; error: string | null; model: string; kind: string; session_id: number | null }>(
    'SELECT ok, error, model, kind, session_id FROM llm_call ORDER BY id',
  );

describe('callStructured', () => {
  test('retries once after a schema failure then succeeds, logging both attempts', async () => {
    const llm = new FakeLlm({ grade: [good({ nope: 1 }), good({ word: 'cat' })] });
    const deps = await setup(llm);
    const r = await callStructured<{ word: string }>(deps, 'grade', 'prompt');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual({ word: 'cat' });
    const logged = await rows(deps);
    expect(logged).toHaveLength(2);
    expect(logged[0]!.ok).toBe(0);
    expect(logged[0]!.error).toMatch(/^schema: /);
    expect(logged[1]!.ok).toBe(1);
    expect(logged[1]!.error).toBeNull();
  });

  test('does not retry on budget', async () => {
    const llm = new FakeLlm({ grade: [bad('budget'), good({ word: 'cat' })] });
    const deps = await setup(llm);
    const r = await callStructured(deps, 'grade', 'p');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('budget');
    expect(llm.calls).toHaveLength(1);
    expect(await rows(deps)).toHaveLength(1);
  });

  test('maxAttempts 1 does not retry a check failure', async () => {
    const llm = new FakeLlm({ grade: [good({ word: 'a' }), good({ word: 'b' })] });
    const deps = await setup(llm);
    const r = await callStructured<{ word: string }>(deps, 'grade', 'p', { check: () => 'tone', maxAttempts: 1 });
    expect(r.ok).toBe(false);
    expect(llm.calls).toHaveLength(1);
    expect(await rows(deps)).toHaveLength(1);
  });

  test('gives up after two attempts on timeout', async () => {
    const llm = new FakeLlm({ grade: [bad('timeout'), bad('timeout'), good({ word: 'x' })] });
    const deps = await setup(llm);
    const r = await callStructured(deps, 'grade', 'p');
    expect(r.ok).toBe(false);
    expect(llm.calls).toHaveLength(2);
  });

  test('check returning a message twice ends with code check', async () => {
    const llm = new FakeLlm({ grade: [good({ word: 'a' }), good({ word: 'b' })] });
    const deps = await setup(llm);
    const r = await callStructured<{ word: string }>(deps, 'grade', 'p', { check: () => 'tone' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('check');
      expect(r.message).toBe('tone');
    }
    expect(llm.calls).toHaveLength(2);
  });

  test('uses settings.models.grade, budget, timeout and native language', async () => {
    const llm = new FakeLlm({ grade: [good({ word: 'a' })], generate_session: [good({ word: 'a' })] });
    const deps = await setup(llm);
    await setSetting(deps.db, 'models', {
      rule_draft: 'm-r', rule_chat: 'm-c', generate_session: 'm-g', validate_session: 'm-v', grade: 'm-grade', dispute: 'm-d', explain: 'm-e', words: 'm-w', word_check: 'm-wc', phonetics: 'm-p',
    });
    await setSetting(deps.db, 'efforts', { rule_draft: 'low', rule_chat: 'low', generate_session: 'low', validate_session: 'low', grade: 'medium', dispute: 'low', explain: 'low', words: 'low', word_check: 'low', phonetics: 'low' });
    await setSetting(deps.db, 'budgetUsd', 0.5);
    await callStructured(deps, 'grade', 'p', { sessionId: undefined });
    await callStructured(deps, 'generate_session', 'p');
    expect(llm.calls[0]!.model).toBe('m-grade');
    expect(llm.calls[0]!.effort).toBe('medium');
    expect(llm.calls[1]!.effort).toBe('low');
    expect(llm.calls[0]!.budgetUsd).toBe(0.5);
    expect(llm.calls[0]!.timeoutMs).toBe(120000);
    expect(llm.calls[0]!.systemPrompt).toBe(`${COMMON_RULES}\n\nExplain in Russian. Again Russian.`);
    expect(llm.calls[1]!.model).toBe('m-g');
    expect(llm.calls[1]!.timeoutMs).toBe(300000);
    expect((await rows(deps))[0]!.model).toBe('m-grade');
  });

  test('words gets the long timeout and {{spellingVariant}} is replaced', async () => {
    const llm = new FakeLlm({ words: [good({ word: 'a' })] });
    const deps = await setup(llm);
    deps.prompts = { load: async () => ({ system: 'Use {{spellingVariant}} spelling.', schema }) };
    await callStructured(deps, 'words', 'p');
    expect(llm.calls[0]!.timeoutMs).toBe(300000);
    expect(llm.calls[0]!.systemPrompt).toBe(`${COMMON_RULES}\n\nUse British spelling.`);
    await setSetting(deps.db, 'spellingVariant', 'american');
    const llm2 = new FakeLlm({ words: [good({ word: 'a' })] });
    deps.llm = llm2;
    await callStructured(deps, 'words', 'p');
    expect(llm2.calls[0]!.systemPrompt).toBe(`${COMMON_RULES}\n\nUse American spelling.`);
  });

  test('English native language is applied', async () => {
    const llm = new FakeLlm({ dispute: [good({ word: 'a' })] });
    const deps = await setup(llm);
    await setSetting(deps.db, 'nativeLanguage', 'en');
    await callStructured(deps, 'dispute', 'p');
    expect(llm.calls[0]!.systemPrompt).toBe(`${COMMON_RULES}\n\nExplain in English. Again English.`);
  });
});

test('every kind starts its system prompt with the common rules', async () => {
  const kinds = ['rule_draft', 'rule_chat', 'generate_session', 'validate_session', 'grade', 'dispute', 'explain', 'words', 'word_check', 'phonetics'] as const;
  const llm = new FakeLlm(Object.fromEntries(kinds.map((k) => [k, [good({ word: 'a' })]])));
  const deps = await setup(llm);
  for (const k of kinds) await callStructured(deps, k, 'p');
  expect(llm.calls.map((c) => c.systemPrompt.startsWith(`${COMMON_RULES}\n\n`))).toEqual(kinds.map(() => true));
  expect(COMMON_RULES).toContain('Do exactly what the task asks');
});
