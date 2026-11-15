import { describe, expect, test } from 'vitest';
import { previewLlm } from '@/adapters/preview/previewLlm';
import { toneViolations } from '@/core/validate/tone';
import { textProblems } from '@/core/grading/input';
import type { LlmRequest } from '@/core/ports';
import type { GradeResult } from '@/core/llm/types';

const prompt = (format: 'essay' | 'rewrite', text: string) =>
  `## Texts\n\n### b3 (${format})\nPrompt: Discuss.\nText:\n${text}\n\n## Programme topics\n\n- articles: Articles | sections: "Basics"\n`;
const grade = async (userPrompt: string) => {
  const r = await previewLlm.call({ kind: 'grade', userPrompt, resume: null, persist: false } as LlmRequest);
  return (r.ok ? (r.data as GradeResult) : null)!.texts[0]!;
};

describe('preview grade, texts', () => {
  const text = 'On the other hand, the vast majority of people say he goes home and they are glad.';

  test('an essay gets kinds, the canned strengths and an assessment', async () => {
    const t = await grade(prompt('essay', text));
    expect(t.errors.map((e) => e.kind)).toEqual(['grammar', 'grammar']);
    expect(t.strengths.map((s) => s.fragment)).toEqual(['the vast majority', 'On the other hand']);
    expect(t.assessment).toMatchObject({
      taskResponse: { band: 6 }, coherence: { band: 6 }, vocabulary: { band: 5.5 }, grammar: { band: 5.5 },
    });
    const batch = { items: [], spots: [], texts: [{ blockId: 1, blockOrd: 3, format: 'essay' as const, prompt: 'Discuss.', text }], topics: [{ key: 'articles', title: 'Articles', sections: ['Basics'] }] };
    expect(textProblems(batch, { items: [], spot: [], patterns: [], tomorrow: [], spellingErrors: [], ruleGaps: [], texts: [t] })).toBeNull();
    expect(toneViolations(Object.values(t.assessment).map((c) => c.note))).toEqual([]);
  });

  test('a rewrite has bands 0 and empty notes; a text with no strong phrase has none', async () => {
    const t = await grade(prompt('rewrite', 'He goes home.'));
    expect(t.strengths).toEqual([]);
    expect(Object.values(t.assessment)).toEqual(Array(4).fill({ band: 0, note: '' }));
  });
});
