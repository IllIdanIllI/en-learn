import type { WordFields } from './types';
import { cleanWordName } from './name';

export interface ParsedCard {
  index: number; // 1-based, in paste order
  fields: Partial<WordFields> & { word: string };
}

export interface ParseProblem {
  index: number;
  reason: 'no_word';
}

interface Block {
  index: number;
  heading: string;
  lines: string[];
}

const HEADING = /^###\s+(.*)$/;
const TRAILING_PAREN = /\(([^)]*)\)\s*$/;
const CYRILLIC = /[а-яё]/i;
const FIELD = /^\*\*(Word|Example|Synonyms|Link|Added):\*\*\s*(.*)$/;
const DATE = /^(\d{2})\.(\d{2})\.(\d{4})$/;

function splitBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const line of text.split(/\r?\n/)) {
    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ index: blocks.length + 1, heading: heading[1] ?? '', lines: [] });
      continue;
    }
    const last = blocks[blocks.length - 1];
    if (last) last.lines.push(line);
  }
  return blocks;
}

function parseHeading(text: string): { definition: string; translation: string } {
  const match = TRAILING_PAREN.exec(text);
  const inner = match?.[1] ?? '';
  if (!match || !CYRILLIC.test(inner)) {
    return { definition: text.trim(), translation: '' };
  }
  return { definition: text.slice(0, match.index).trim(), translation: inner.trim() };
}

function stripQuotes(value: string): string {
  const pairs: [string, string][] = [
    ['"', '"'],
    ['“', '”'],
  ];
  for (const [open, close] of pairs) {
    if (value.length >= 2 && value.startsWith(open) && value.endsWith(close)) {
      return value.slice(open.length, value.length - close.length).trim();
    }
  }
  return value;
}

// DD.MM.YYYY → YYYY-MM-DD, or undefined when not a real calendar date.
function parseAdded(value: string): string | undefined {
  const match = DATE.exec(value);
  if (!match) return undefined;
  const [, dd = '', mm = '', yyyy = ''] = match;
  const iso = `${yyyy}-${mm}-${dd}`;
  const check = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(check.getTime()) || check.toISOString().slice(0, 10) !== iso) return undefined;
  return iso;
}

function readFields(lines: string[]): Map<string, string> {
  const fields = new Map<string, string>();
  for (const line of lines) {
    const match = FIELD.exec(line.trim());
    if (match) fields.set(match[1] ?? '', (match[2] ?? '').trim());
  }
  return fields;
}

export function parseObsidian(text: string): { cards: ParsedCard[]; problems: ParseProblem[] } {
  const cards: ParsedCard[] = [];
  const problems: ParseProblem[] = [];

  for (const block of splitBlocks(text)) {
    const field = readFields(block.lines);
    const word = cleanWordName(field.get('Word') ?? '');
    if (!word) {
      problems.push({ index: block.index, reason: 'no_word' });
      continue;
    }
    const { definition, translation } = parseHeading(block.heading);
    const fields: ParsedCard['fields'] = { word, definition, translation };
    const example = field.get('Example');
    if (example !== undefined) fields.example = stripQuotes(example);
    const synonyms = field.get('Synonyms');
    if (synonyms !== undefined) {
      fields.synonyms = synonyms
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s !== '');
    }
    const link = field.get('Link');
    if (link !== undefined) fields.link = link;
    const added = field.get('Added');
    const iso = added === undefined ? undefined : parseAdded(added);
    if (iso !== undefined) fields.added = iso;
    cards.push({ index: block.index, fields });
  }

  return { cards, problems };
}

export function importPreview(
  parsed: ReturnType<typeof parseObsidian>,
  existing: string[],
): { toImport: ParsedCard[]; duplicates: number; problems: ParseProblem[] } {
  const seen = new Set(existing.map((w) => w.trim().toLowerCase()));
  const toImport: ParsedCard[] = [];
  let duplicates = 0;
  for (const card of parsed.cards) {
    const key = card.fields.word.trim().toLowerCase();
    if (seen.has(key)) {
      duplicates += 1;
    } else {
      seen.add(key);
      toImport.push(card);
    }
  }
  return { toImport, duplicates, problems: parsed.problems };
}
