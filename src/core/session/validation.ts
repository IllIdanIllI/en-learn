import type { GeneratedSession, ValidationResult } from '@/core/llm/types';
import { checkGenerated, type CheckContext } from '@/core/validate/taskChecks';
import { ruleSections, type GenerationContext, type RuleRef } from './context';

export function checkContext(ctx: GenerationContext): CheckContext {
  return {
    topics: new Map(ctx.allowed.map((r) => [r.topic.key, { hasRule: true, sections: ruleSections(r.body) }])),
    dueTopicKeys: ctx.dueTopics.map((r) => r.topic.key),
  };
}

/** Violations of the context's block plan, then the code checks (spec 6.3). Empty means the session passes. */
export function violations(s: GeneratedSession, ctx: GenerationContext): string[] {
  const out: string[] = [];
  const kinds = s.blocks.map((b) => b.kind).join(', ');
  const wanted = ctx.blocks.map((b) => b.kind).join(', ');
  if (kinds !== wanted) out.push(`blocks: got [${kinds}], the context asks for [${wanted}]`);
  s.blocks.forEach((b, i) => {
    const taskFormat = ctx.extra ? ctx.blocks.find((x) => x.kind === 'task')?.format : ctx.plan.task?.format;
    if (b.kind === 'task' && taskFormat && b.format !== taskFormat) {
      out.push(`b${i} format: task block must be ${taskFormat}, got ${b.format}`);
    }
    if (b.kind === 'task' && ctx.extra && b.items.length > 8) out.push(`b${i} items: ${b.items.length} items in an extra set, at most 8`);
    if (b.kind === 'review') {
      if (b.format !== 'gap' && b.format !== 'fix') out.push(`b${i} format: review block must be gap or fix`);
      const cap = Math.max(ctx.light ? 5 : 12, ctx.dueTopics.length);
      if (b.items.length > cap) out.push(`b${i} items: ${b.items.length} review items, at most ${cap}`);
    }
    if (b.kind === 'speaking' && b.question.trim() === '') out.push(`b${i} question: speaking block has no question`);
    if (b.kind !== 'speaking' && b.items.length === 0 && b.paragraphs.every((p) => p.errors.length === 0)) {
      out.push(`b${i} items: block has no active items`);
    }
  });
  return [...out, ...checkGenerated(s, checkContext(ctx))];
}

/** Validation input: the rulebook, then the session with a reference on every checkable unit. */
export function renderValidationInput(s: GeneratedSession, rules: RuleRef[]): string {
  const lines: string[] = ['# Rulebook', ''];
  for (const r of rules) lines.push(`## Topic ${r.topic.key}`, '', '~~~~markdown', r.body, '~~~~', '');
  lines.push('# Generated session', '');
  s.blocks.forEach((b, bi) => {
    lines.push(`## Block b${bi}: ${b.kind}, format ${b.format}`, `Instruction: ${b.instruction}`, `Format example: ${b.formatExample}`, '');
    b.items.forEach((it, ii) => {
      lines.push(`- ref b${bi}.i${ii} | prompt: ${it.prompt} | expected: ${it.expected} | topic: ${it.topicKey} | section: ${it.ruleSection}`);
    });
    b.paragraphs.forEach((p, pi) => {
      lines.push(`Paragraph b${bi}.p${pi}: ${p.text}`);
      p.errors.forEach((e, ei) => {
        lines.push(`- ref b${bi}.p${pi}.e${ei} | wrong: ${e.wrong} | correction: ${e.correction} | topic: ${e.topicKey} | section: ${e.ruleSection}`);
      });
    });
    if (b.question) lines.push(`Question: ${b.question}`);
    lines.push('');
  });
  return lines.join('\n');
}

export type Defects = Map<string, string>;

/** Defect references with their reasons, and the session without them. Refs the reviewer did not return count as ok. */
export function applyValidation(s: GeneratedSession, v: ValidationResult): { defects: Defects; remaining: GeneratedSession } {
  const defects: Defects = new Map(v.items.filter((i) => !i.ok).map((i) => [i.ref, i.reason]));
  const remaining: GeneratedSession = {
    blocks: s.blocks.map((b, bi) => ({
      ...b,
      items: b.items.filter((_, ii) => !defects.has(`b${bi}.i${ii}`)),
      paragraphs: b.paragraphs.map((p, pi) => ({
        ...p,
        errors: p.errors.filter((_, ei) => !defects.has(`b${bi}.p${pi}.e${ei}`)),
      })),
    })),
  };
  return { defects, remaining };
}

