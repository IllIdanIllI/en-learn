import type { GradingItem } from '@/core/db/repos/sessions';
import type { Settings } from '@/core/db/repos/settings';
import type { GradeResult } from '@/core/llm/types';
import { parseSpotLines } from './precheck';

export interface SpotParagraph {
  blockId: number;
  blockOrd: number;
  paragraph: number;
  passageText: string;
  /** The learner's raw lines for this paragraph. */
  learnerText: string;
  errors: GradingItem[];
}

export interface Refs {
  byRef: Map<string, GradingItem>;
  refOf: Map<number, string>;
  blockByOrd: Map<number, number>;
}

/**
 * Refs from DB order (never from the generator's indexes): "b<block.ord>.i<item.ord>" for items and
 * "b<block.ord>.p<paragraph>.e<k>" for hidden errors, k = position among that paragraph's errors.
 */
export function buildRefs(items: GradingItem[]): Refs {
  const byRef = new Map<string, GradingItem>();
  const refOf = new Map<number, string>();
  const blockByOrd = new Map<number, number>();
  const seen = new Map<string, number>();
  for (const it of items) {
    blockByOrd.set(it.blockOrd, it.blockId);
    let ref: string;
    if (it.format === 'spot' && it.paragraph !== null) {
      const key = `b${it.blockOrd}.p${it.paragraph}`;
      const k = seen.get(key) ?? 0;
      seen.set(key, k + 1);
      ref = `${key}.e${k}`;
    } else {
      ref = `b${it.blockOrd}.i${it.ord}`;
    }
    byRef.set(ref, it);
    refOf.set(it.id, ref);
  }
  return { byRef, refOf, blockByOrd };
}

/** The learner's line that names this hidden error's wrong fragment, or ''. */
export function matchingLine(learnerText: string, wrongFragment: string): string {
  const w = wrongFragment.trim().toLowerCase();
  for (const line of learnerText.split(/\r?\n/)) {
    const parsed = parseSpotLines(line)[0];
    const lw = parsed?.wrong.toLowerCase() ?? '';
    if (lw !== '' && (lw.includes(w) || w.includes(lw))) return line.trim();
  }
  return '';
}

export function spotParagraphs(items: GradingItem[], texts: Record<string, string>): SpotParagraph[] {
  const out: SpotParagraph[] = [];
  const blocks = new Map<number, GradingItem[]>();
  for (const it of items) if (it.format === 'spot' && it.paragraph !== null) blocks.set(it.blockId, [...(blocks.get(it.blockId) ?? []), it]);
  for (const [blockId, errs] of blocks) {
    const first = errs[0]!;
    const paragraphs = [...new Set(errs.map((e) => e.paragraph!))].sort((a, b) => a - b);
    for (const p of paragraphs) {
      out.push({
        blockId, blockOrd: first.blockOrd, paragraph: p, passageText: first.passage?.[p] ?? '',
        learnerText: texts[`${blockId}:${p}`] ?? '',
        errors: errs.filter((e) => e.paragraph === p && e.status === 'active'),
      });
    }
  }
  return out.filter((p) => p.errors.length > 0);
}

export interface GradeBatch {
  items: { item: GradingItem; answer: string }[];
  spots: SpotParagraph[];
}

/** The grade user message: settings, the full rule body once per topic, every item, every spot paragraph. */
export function renderGradeInput(batch: GradeBatch, refs: Refs, settings: Settings): string {
  const all = [...batch.items.map((i) => i.item), ...batch.spots.flatMap((s) => s.errors)];
  const rules = new Map<string, GradingItem>();
  for (const it of all) if (it.topicKey !== null && it.ruleBody !== null) rules.set(it.topicKey, it);

  const out: string[] = [
    '## Learner settings',
    `Spelling variant: ${settings.spellingVariant}`,
    `Accepted shorthands for "correct as it is": ${settings.acceptedShorthands.join(' ')} (an answer made only of one of these means the item is correct as written)`,
    '',
    '## Rules (the full current body of each topic, with its version)',
  ];
  for (const [key, it] of rules) out.push('', `### Topic ${key} (rule version ${it.ruleVersion})`, 'Rule body:', it.ruleBody!);

  if (batch.items.length > 0) out.push('', '## Items');
  for (const { item, answer } of batch.items) {
    out.push(
      '', `### ${refs.refOf.get(item.id)}`, `Format: ${item.format}`, `Topic key: ${item.topicKey ?? ''}`,
      `Rule section: ${item.ruleSection ?? ''}`, `Prompt: ${item.prompt}`, `Expected: ${item.expected}`, `Learner answer: ${answer}`,
    );
  }

  if (batch.spots.length > 0) out.push('', '## Error-spotting paragraphs');
  for (const s of batch.spots) {
    out.push('', `### b${s.blockOrd} paragraph ${s.paragraph}`, `Paragraph text: ${s.passageText}`, 'Learner lines (wrong → right):', s.learnerText.trim(), 'Hidden errors:');
    for (const e of s.errors) {
      out.push(`- ${refs.refOf.get(e.id)} | wrong fragment: "${e.prompt}" | expected correction: "${e.expected}" | topic key: ${e.topicKey ?? ''} | rule section: ${e.ruleSection ?? ''}`);
    }
  }
  return `${out.join('\n')}\n`;
}

/** Everything the model wrote for the learner, for the tone check. */
export function proseOf(r: GradeResult): string[] {
  return [
    ...r.patterns,
    ...r.items.flatMap((i) => [i.explanation, i.vocabularyNote]),
    ...r.tomorrow,
    ...r.spot.flatMap((s) => s.extra.map((e) => e.explanation)),
  ].filter((t) => t !== '');
}

/** Refs the batch needs an answer for but the result omitted; spot paragraphs need an entry of their own. */
export function missingRefs(batch: GradeBatch, refs: Refs, r: GradeResult): string[] {
  const have = new Set(r.items.map((i) => i.ref));
  const out = batch.items.map((i) => refs.refOf.get(i.item.id)!).filter((ref) => !have.has(ref));
  for (const s of batch.spots) {
    if (!r.spot.some((e) => e.blockRef === `b${s.blockOrd}` && e.paragraph === s.paragraph)) out.push(`b${s.blockOrd}.p${s.paragraph}`);
  }
  return out;
}
