import type { Net } from '@/core/ports';

const KAIKKI = 'https://kaikki.org/dictionary/English/meaning';
const MAX_TRANSLATIONS = 8;

/** The kaikki.org page for an English word, e.g. `give up` → `.../g/gi/give%20up.jsonl`. */
export function kaikkiUrl(word: string): string {
  const w = word.toLowerCase().trim();
  return `${KAIKKI}/${w[0]}/${w.slice(0, 2)}/${encodeURIComponent(w)}.jsonl`;
}

/** One Russian translation as shown: stress marks removed; tokens from the first Latin one or a tag ending in `.` are cut. */
export function cleanRu(raw: string): string | null {
  const kept: string[] = [];
  for (const token of raw.replace(/́/g, '').split(/\s+/)) {
    if (token === '') continue;
    if (/[A-Za-z]/.test(token) || token.endsWith('.')) break;
    kept.push(token);
  }
  return kept.length > 0 ? kept.join(' ') : null;
}

/** Comparison key: no brackets, trimmed, lowercase, ё as е, no trailing punctuation. */
export function normRu(s: string): string {
  return s
    .replace(/\([^)]*\)/g, '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[.;:!?]+$/, '')
    .trim();
}

/** Russian translations of a kaikki JSONL reply, cleaned, deduplicated, in file order, at most 8. */
export function parseKaikki(jsonl: string): string[] {
  type Tr = { code?: string; word?: string };
  type Entry = { translations?: Tr[]; senses?: { translations?: Tr[] }[] };
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (list: Tr[] | undefined) => {
    for (const t of list ?? []) {
      if (t.code !== 'ru' || typeof t.word !== 'string') continue;
      const ru = cleanRu(t.word);
      if (ru === null || seen.has(normRu(ru))) continue;
      seen.add(normRu(ru));
      out.push(ru);
    }
  };
  for (const line of jsonl.split('\n')) {
    if (line.trim() === '') continue;
    const entry = JSON.parse(line) as Entry;
    add(entry.translations);
    for (const sense of entry.senses ?? []) add(sense.translations);
  }
  return out.slice(0, MAX_TRANSLATIONS);
}

/** True when one comma-separated item of `translation` equals one of the dictionary items (after normRu). */
export function dictMatches(translation: string, dict: string[]): boolean {
  const items = new Set(dict.map(normRu).filter((d) => d !== ''));
  return translation
    .replace(/\([^)]*\)/g, '')
    .split(',')
    .map(normRu)
    .some((t) => t !== '' && items.has(t));
}

export type LookupResult = { checked: 'found' | 'none'; translations: string[] };

/** 404 means kaikki has no entry; a 200 without Russian translations is 'none' too; any other status throws, so the word is not marked checked. */
export async function lookupDict(net: Net, word: string): Promise<LookupResult> {
  const res = await net.getText(kaikkiUrl(word));
  if (res.status === 404) return { checked: 'none', translations: [] };
  if (res.status !== 200) throw new Error(`kaikki.org answered ${res.status}`);
  const translations = parseKaikki(res.text);
  return { checked: translations.length > 0 ? 'found' : 'none', translations };
}
