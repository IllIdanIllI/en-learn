import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { parseSeed } from '@/core/programme/setup';

const SEED = path.resolve(import.meta.dirname, '..', 'seed');

// URLs verified in .superpowers/sdd/2026-10-22-s1-core-loop/seed-sources.md
const VERIFIED_URLS = [
  'https://learnenglish.britishcouncil.org/free-resources/grammar/a1-a2-grammar/articles-a-an-the',
  'https://learnenglish.britishcouncil.org/free-resources/grammar/a1-a2-grammar/articles-the-or-no-article',
  'https://dictionary.cambridge.org/grammar/british-grammar/a-an-and-the',
  'https://learnenglish.britishcouncil.org/free-resources/grammar/b1-b2/conditionals-zero-first-second',
  'https://dictionary.cambridge.org/grammar/british-grammar/conditionals-if',
  'https://dictionary.cambridge.org/grammar/british-grammar/conditionals-typical-errors',
  'https://learnenglish.britishcouncil.org/free-resources/grammar/b1-b2/present-perfect',
  'https://dictionary.cambridge.org/grammar/british-grammar/past-simple-or-present-perfect',
  'https://dictionary.cambridge.org/grammar/british-grammar/past-typical-errors',
  'https://learnenglish.britishcouncil.org/free-resources/grammar/english-grammar-reference/present-simple',
  'https://dictionary.cambridge.org/grammar/british-grammar/present-simple-i-work',
];

function load() {
  const rulesDir = path.join(SEED, 'rules');
  const rules: Record<string, string> = {};
  for (const f of fs.readdirSync(rulesDir)) rules[f] = fs.readFileSync(path.join(rulesDir, f), 'utf8');
  const programme = fs.readFileSync(path.join(SEED, 'programme.json'), 'utf8');
  return parseSeed({ programme, rules }, '2026-10-22');
}

const HEADINGS = ['Формула', 'Примеры', 'Объяснение', 'Ловушки', 'Источники'];

describe('seed', () => {
  const seed = load();

  test('programme loads: 3 learn weeks, one notice, 21 days from next Monday', () => {
    const p = seed.programme;
    expect(p.title).toBe('IELTS grammar, 3 weeks');
    expect(p.weeks.map((w) => w.key)).toEqual(['articles', 'conditionals', 'present-perfect-past-simple']);
    expect(p.weeks.every((w) => w.kind === 'learn')).toBe(true);
    expect(p.startDate).toBe('2026-10-26');
    expect(p.endDate).toBe('2026-11-15');
    expect(Object.values(p.slots)).toEqual(['error_spotting', 'topic', 'rest', 'second_set', 'speaking', 'writing', 'review_rewrite']);
  });

  test('third-person-s is a background notice topic', () => {
    expect(seed.programme.background).toEqual([{ title: 'Third person -s', key: 'third-person-s', kind: 'notice' }]);
  });

  test('one rule per topic', () => {
    const topics = [...seed.programme.weeks, ...seed.programme.background].map((t) => t.key).sort();
    expect(seed.rules.map((r) => r.topicKey).sort()).toEqual(topics);
  });

  test.each(seed.rules.map((r) => [r.topicKey, r] as const))('rule %s has headings in order', (_k, rule) => {
    const found = rule.body.split('\n').filter((l) => l.startsWith('## ')).map((l) => l.slice(3).trim());
    const expected = found[0] === 'Формула' ? HEADINGS : HEADINGS.slice(1);
    expect(found).toEqual(expected);
  });

  test.each(seed.rules.map((r) => [r.topicKey, r] as const))('rule %s has authoritative, verified sources', (_k, rule) => {
    expect(rule.sources.length).toBeGreaterThanOrEqual(2);
    for (const s of rule.sources) {
      if (s.title.startsWith('Swan')) continue;
      expect(['learnenglish.britishcouncil.org', 'dictionary.cambridge.org']).toContain(new URL(s.url).host);
      expect(VERIFIED_URLS).toContain(s.url);
    }
  });

  test.each(seed.rules.map((r) => [r.topicKey, r] as const))('rule %s body lists its sources', (_k, rule) => {
    const section = rule.body.split('## Источники')[1] ?? '';
    for (const s of rule.sources) expect(section).toContain(s.title);
  });

  test('conditionals rule has no third or mixed conditional', () => {
    const body = seed.rules.find((r) => r.topicKey === 'conditionals')?.body ?? '';
    expect(body).not.toMatch(/had\s+\w+ed|would have\s+(been|\w+ed)|третий|смешанн/i);
  });
});
