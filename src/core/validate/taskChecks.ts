import type { GeneratedSession } from '@/core/llm/types';

export interface CheckContext {
  topics: Map<string, { hasRule: boolean; sections: string[] }>;
  dueTopicKeys: string[];
}

export function normaliseTopicKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '-');
}

const normaliseSection = (s: string): string => s.trim().replace(/^#+/, '').trim();

const PLACEHOLDER = /(^|[\s([])([-–—…]+|_{1,2}|_{4,})(?=$|[\s)\].,])/;

const CYRILLIC = /\p{Script=Cyrillic}/u;

const wordCount = (s: string): number => s.split(/\s+/).filter(Boolean).length;

/** Returns one message per violation; an empty array means the session passes. */
export function checkGenerated(s: GeneratedSession, ctx: CheckContext): string[] {
  const out: string[] = [];
  const topics = new Map([...ctx.topics].map(([k, v]) => [normaliseTopicKey(k), v] as const));

  const checkPlaceholder = (ref: string, text: string): void => {
    const m = PLACEHOLDER.exec(text);
    if (m) out.push(`${ref} TD-1: placeholder "${m[2]}"`);
  };

  const checkEnglish = (ref: string, ...texts: string[]): void => {
    if (texts.some((t) => CYRILLIC.test(t))) out.push(`${ref} EN: task content must be English`);
  };

  const checkTopic = (ref: string, topicKey: string, ruleSection: string): void => {
    const topic = topics.get(normaliseTopicKey(topicKey));
    if (!topic) {
      out.push(`${ref} topic: unknown topic "${topicKey}"`);
      return;
    }
    if (!topic.hasRule) {
      out.push(`${ref} topic: no rule for "${topicKey}"`);
      return;
    }
    const wanted = normaliseSection(ruleSection);
    if (!topic.sections.some((sec) => normaliseSection(sec) === wanted)) {
      out.push(`${ref} section: "${ruleSection}" not in "${topicKey}"`);
    }
  };

  s.blocks.forEach((b, bi) => {
    const bref = `b${bi}`;
    if ((b.format === 'gap' || b.format === 'fix' || b.format === 'spot') && b.formatExample.trim() === '') {
      out.push(`${bref} TD-1: format example is empty`);
    }

    checkEnglish(bref, b.question, b.formatExample);

    b.items.forEach((it, ii) => {
      const ref = `${bref}.i${ii}`;
      checkEnglish(ref, it.prompt, it.expected);
      if (b.format === 'gap' && !it.prompt.includes('___')) out.push(`${ref} TD-1: gap prompt has no ___`);
      checkPlaceholder(ref, it.prompt);
      if (b.format === 'fix' && it.expected.trim() !== '✓') {
        const n = wordCount(it.expected);
        if (n < 1 || n > 2) out.push(`${ref} TD-7: correction has ${n} words`);
      }
      checkTopic(ref, it.topicKey, it.ruleSection);
    });

    b.paragraphs.forEach((p, pi) => {
      const pref = `${bref}.p${pi}`;
      checkPlaceholder(pref, p.text);
      checkEnglish(pref, p.text);
      if (b.format === 'spot') {
        if (/[\r\n]/.test(p.text)) out.push(`${pref} TD-8: text has a line break`);
        const n = p.errors.length;
        if (n < 5 || n > 7) out.push(`${pref} TD-8: has ${n} errors, need 5–7`);
      }
      p.errors.forEach((e, ei) => {
        const eref = `${pref}.e${ei}`;
        checkEnglish(eref, e.wrong, e.correction);
        if (b.format === 'spot') {
          const n = wordCount(e.correction);
          if (n < 1 || n > 2) out.push(`${eref} TD-7: correction has ${n} words`);
        }
        checkTopic(eref, e.topicKey, e.ruleSection);
      });
    });

    if (b.format === 'fix') {
      if (!b.items.some((it) => it.expected.trim() === '✓')) out.push(`${bref} TD-4: no item with expected ✓`);
      if (!b.items.some((it) => it.expected.trim() !== '✓')) out.push(`${bref} TD-4: no item with a correction`);
    }
    if ((b.format === 'gap' || b.format === 'fix') && b.items.length < 3) {
      out.push(`${bref} items: ${b.items.length} items, need at least 3`);
    }
  });

  for (const key of new Set(ctx.dueTopicKeys.map(normaliseTopicKey))) {
    const hasCheck = s.blocks.some(
      (b) => b.kind === 'review' && b.items.some((it) => it.isCheck && normaliseTopicKey(it.topicKey) === key),
    );
    if (!hasCheck) out.push(`due: "${key}" has no check item in a review block`);
  }

  return out;
}
