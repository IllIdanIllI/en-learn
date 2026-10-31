import type { Deps, LlmResult } from '@/core/ports';
import { getSettings } from '@/core/db/repos/settings';
import { getRule, listRules } from '@/core/db/repos/rules';
import { callStructured } from '@/core/llm/call';
import type { RuleChatReply } from '@/core/llm/types';
import { checkRuleBody, SKELETON } from '@/core/rules/rules';

export type { RuleChatReply } from '@/core/llm/types';

export function checkRuleChatReply(reply: RuleChatReply, language: 'ru' | 'en'): string | null {
  return reply.proposal === null ? null : checkRuleBody(reply.proposal.body, language);
}

/**
 * One turn of the rule chat. The CLI conversation holds the history, so the rule context goes only with the first turn
 * (`resume` null); later turns send the learner's text alone. The result's sessionId is the one to pass as `resume`
 * next time, and it exists only for a valid reply. Nothing is saved here (saving needs the learner's confirmation).
 */
export async function ruleChatTurn(
  deps: Deps,
  ruleId: number,
  text: string,
  resume: string | null,
): Promise<LlmResult<RuleChatReply> & { sessionId?: string }> {
  const settings = await getSettings(deps.db);
  let message = text;
  if (resume === null) {
    const row = (await listRules(deps.db)).find((r) => r.ruleId === ruleId);
    if (!row) throw new Error('Rule not found');
    const rule = await getRule(deps.db, ruleId);
    const language = settings.nativeLanguage === 'ru' ? 'Russian' : 'English';
    message = [
      `Topic key: ${row.topic.key}`,
      `Topic title: ${row.topic.title}`,
      `Native language of the learner: ${language}`,
      'Skeleton (level-2 headings, in this order):',
      SKELETON[settings.nativeLanguage].map((h) => `## ${h}`).join('\n'),
      'Current rule body:',
      rule.body,
      'Current sources (JSON):',
      JSON.stringify(rule.sources),
      "Learner's message:",
      text,
    ].join('\n');
  }
  return callStructured<RuleChatReply>(deps, 'rule_chat', message, {
    persist: true,
    resume,
    check: (r) => checkRuleChatReply(r, settings.nativeLanguage),
  });
}
