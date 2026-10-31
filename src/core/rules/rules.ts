import type { Deps, LlmResult } from '@/core/ports';
import { getSettings } from '@/core/db/repos/settings';
import { getTopics, getCurrentRules } from '@/core/db/repos/programme';
import { callStructured } from '@/core/llm/call';
import type { RuleDraft } from '@/core/llm/types';

export type { Source } from '@/core/llm/types';

export const SKELETON: Record<'ru' | 'en', string[]> = {
  ru: ['Формула', 'Примеры', 'Объяснение', 'Ловушки', 'Источники'],
  en: ['Formula', 'Examples', 'Explanation', 'Traps', 'Sources'],
};

/** Text of each level-2 heading (`## X` gives `X`), in order. */
export function ruleSections(body: string): string[] {
  return [...body.matchAll(/^##[ \t]+(.+?)[ \t]*$/gm)].map((m) => m[1]!.trim());
}

/** A proposed rule body must keep to the skeleton: its headings are skeleton headings, each at most once, in skeleton order. */
export function checkRuleBody(body: string, language: 'ru' | 'en'): string | null {
  if (body.trim() === '') return 'Proposal body is empty';
  const skeleton = SKELETON[language];
  let last = -1;
  const headings = ruleSections(body);
  if (headings.length === 0) return 'Proposal has no section headings';
  for (const h of headings) {
    const at = skeleton.indexOf(h);
    if (at < 0) return `Heading "${h}" is not in the skeleton`;
    if (at <= last) return `Heading "${h}" is repeated or out of skeleton order`;
    last = at;
  }
  return null;
}

/** Proposes a rule body for a topic. Does not save it; saving needs the learner's confirmation (D3). */
export async function draftRule(deps: Deps, topicId: number): Promise<LlmResult<RuleDraft>> {
  const topic = (await getTopics(deps.db)).find((t) => t.id === topicId);
  if (!topic) throw new Error('Topic not found');
  const settings = await getSettings(deps.db);
  const existing = (await getCurrentRules(deps.db)).get(topicId)?.body;

  const language = settings.nativeLanguage === 'ru' ? 'Russian' : 'English';
  const headings = SKELETON[settings.nativeLanguage].map((h) => `## ${h}`).join('\n');
  const message = [
    `Topic key: ${topic.key}`,
    `Topic title: ${topic.title}`,
    `Native language of the learner: ${language}`,
    'Skeleton (level-2 headings, in this order):',
    headings,
    'Current rule body (empty if the topic has no rule yet):',
    existing ?? '(none)',
  ].join('\n');

  return callStructured<RuleDraft>(deps, 'rule_draft', message);
}
