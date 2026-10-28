import type { Deps, LlmResult } from '@/core/ports';
import { getSettings } from '@/core/db/repos/settings';
import { getTopics, getCurrentRules } from '@/core/db/repos/programme';
import { callStructured } from '@/core/llm/call';
import type { RuleDraft } from '@/core/llm/types';
import { errorBank } from '@/core/progress/derive';
import { plainText } from '@/core/progress/errorContext';
import { loadGradedFacts } from '@/core/progress/history';

export type { Source } from '@/core/llm/types';

const SKELETON: Record<'ru' | 'en', string[]> = {
  ru: ['Формула', 'Примеры', 'Объяснение', 'Ловушки', 'Источники'],
  en: ['Formula', 'Examples', 'Explanation', 'Traps', 'Sources'],
};

/** Text of each level-2 heading (`## X` gives `X`), in order. */
export function ruleSections(body: string): string[] {
  return [...body.matchAll(/^##[ \t]+(.+?)[ \t]*$/gm)].map((m) => m[1]!.trim());
}

/** Proposes a rule body for a topic. Does not save it; saving needs the learner's confirmation (D3). */
export async function draftRule(deps: Deps, topicId: number): Promise<LlmResult<RuleDraft>> {
  const topic = (await getTopics(deps.db)).find((t) => t.id === topicId);
  if (!topic) throw new Error('Topic not found');
  const settings = await getSettings(deps.db);
  const existing = (await getCurrentRules(deps.db)).get(topicId)?.body;
  const facts = await loadGradedFacts(deps.db);
  const errors = errorBank(facts.errorRows).filter((r) => r.topicId === topicId && r.kind === 'grammar');

  const language = settings.nativeLanguage === 'ru' ? 'Russian' : 'English';
  const headings = SKELETON[settings.nativeLanguage].map((h) => `## ${h}`).join('\n');
  const errorLines = errors.length
    ? errors.map((r) => `- was: ${JSON.stringify(plainText(r.was))} | should be: ${JSON.stringify(plainText(r.shouldBe))} | kind: ${r.kind}`).join('\n')
    : '(none)';
  const message = [
    `Topic key: ${topic.key}`,
    `Topic title: ${topic.title}`,
    `Native language of the learner: ${language}`,
    'Skeleton (level-2 headings, in this order):',
    headings,
    'Current rule body (empty if the topic has no rule yet):',
    existing ?? '(none)',
    "Learner's error-bank rows for this topic (what was written | what is correct | kind):",
    errorLines,
  ].join('\n');

  return callStructured<RuleDraft>(deps, 'rule_draft', message);
}
