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
