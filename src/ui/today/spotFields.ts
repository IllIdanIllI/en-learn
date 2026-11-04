import { parseSpotLines } from '@/core/grading/precheck';

export type SpotField = { original: string; fix: string };

const WORD_CHAR = /[\p{L}\p{N}'’-]/u;

export function fieldsFromLines(text: string): SpotField[] {
  return parseSpotLines(text).map(({ wrong, right }) => ({ original: wrong, fix: right }));
}

export function linesFromFields(fields: SpotField[]): string {
  return fields.map((f) => `${f.original} → ${f.fix}`).join('\n');
}

/** Adds a field for `original` in paragraph order; an existing field for the same fragment is kept as it is. */
export function addField(
  fields: SpotField[],
  paragraph: string,
  original: string,
): { fields: SpotField[]; index: number } {
  const existing = fields.findIndex((f) => f.original === original);
  if (existing >= 0) return { fields, index: existing };
  const sorted = [...fields, { original, fix: original }].sort(
    (a, b) => paragraph.indexOf(a.original) - paragraph.indexOf(b.original),
  );
  return { fields: sorted, index: sorted.findIndex((f) => f.original === original) };
}

/** Trims non-word characters at the edges of [start, end), then widens the range to whole words. */
export function snapToWords(text: string, start: number, end: number): { start: number; end: number } | null {
  let s = start;
  let e = end;
  while (s < e && !WORD_CHAR.test(text.charAt(s))) s++;
  while (e > s && !WORD_CHAR.test(text.charAt(e - 1))) e--;
  if (s >= e) return null;
  while (s > 0 && WORD_CHAR.test(text.charAt(s - 1))) s--;
  while (e < text.length && WORD_CHAR.test(text.charAt(e))) e++;
  return { start: s, end: e };
}
