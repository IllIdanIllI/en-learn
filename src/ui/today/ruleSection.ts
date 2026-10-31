const clean = (s: string) =>
  s.replace(/^[\s§\d.]+/, '').trim().toLowerCase();

/** Index of the rule heading a "§ section" ref points at: exact match first, then a heading containing it; -1 if none. */
export function findSection(sections: string[], wanted: string): number {
  const w = clean(wanted);
  if (w === '') return -1;
  const exact = sections.findIndex((s) => clean(s) === w);
  return exact >= 0 ? exact : sections.findIndex((s) => clean(s).includes(w));
}
