import { describe, expect, test } from 'vitest';
import { previewLlm } from '@/adapters/preview/previewLlm';
import { MINI_RULES } from '@/adapters/preview/miniSeed';
import type { LlmRequest } from '@/core/ports';
import type { RuleChatReply } from '@/core/llm/types';

const rule = MINI_RULES[0]!;
const first = (text: string) =>
  `Topic key: ${rule.topicKey}\nCurrent rule body:\n${rule.body}\nCurrent sources (JSON):\n${JSON.stringify(rule.sources)}\nLearner's message:\n${text}`;
const call = (userPrompt: string, resume: string | null) =>
  previewLlm.call({ kind: 'rule_chat', userPrompt, resume, persist: true } as LlmRequest);

describe('preview rule_chat', () => {
  test('a question gets a message and no proposal, plus a session id', async () => {
    const r = await call(first('Почему a, а не an?'), null);
    expect(r.ok && r.sessionId).toBeTruthy();
    expect(r.ok && (r.data as RuleChatReply).proposal === null).toBe(true);
  });

  test('a change request, also on a later turn, proposes the body with one more Traps line', async () => {
    const q = await call(first('Что такое артикль?'), null);
    const next = await call('Измени ловушки, пожалуйста', q.ok ? (q.sessionId ?? null) : null);
    const p = (next.ok ? (next.data as RuleChatReply).proposal : null)!;
    expect(p.sources).toEqual(rule.sources);
    const added = p.body.split('\n').filter((l) => !rule.body.split('\n').includes(l));
    expect(added).toHaveLength(1);
    expect(p.body.indexOf(added[0]!)).toBeGreaterThan(p.body.indexOf('## Ловушки'));
    expect(p.body.indexOf(added[0]!)).toBeLessThan(p.body.indexOf('## Источники'));
    expect(next.ok && next.sessionId).not.toBe(q.ok && q.sessionId);
  });
});
