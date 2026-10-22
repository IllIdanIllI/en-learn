import type { BlockFormat } from '@/core/domain';

const ARROW = /\s*(?:→|-->|—>|->|=>)\s*/;

/** One "wrong → right" pair per line; a line without an arrow keeps the whole line as the wrong fragment. */
export function parseSpotLines(text: string): { wrong: string; right: string }[] {
  const out: { wrong: string; right: string }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '') continue;
    const m = ARROW.exec(line);
    if (!m) out.push({ wrong: line, right: '' });
    else out.push({ wrong: line.slice(0, m.index).trim(), right: line.slice(m.index + m[0].length).trim() });
  }
  return out;
}

export type Submission = { items: Record<number, string>; spot: Record<string, string> };
export type Question = { itemId: number; kind: 'blank' | 'shorthand' | 'llm'; symbol?: string; text?: string };

const ONLY_SYMBOLS = /^[^\p{L}\p{N}\s]+$/u;

/** Spec 8.2. Spot items have no per-item input (their paragraph text is the answer), so they are not checked here. */
export function precheckAnswers(
  sub: Submission,
  items: { id: number; format: BlockFormat }[],
  shorthands: string[],
): Question[] {
  const out: Question[] = [];
  for (const it of items) {
    if (it.format === 'spot' || it.format === 'question') continue;
    const answer = (sub.items[it.id] ?? '').trim();
    if (answer === '') out.push({ itemId: it.id, kind: 'blank' });
    else if (ONLY_SYMBOLS.test(answer) && !shorthands.includes(answer)) out.push({ itemId: it.id, kind: 'shorthand', symbol: answer });
  }
  return out;
}
