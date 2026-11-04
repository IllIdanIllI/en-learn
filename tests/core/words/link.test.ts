import { expect, test } from 'vitest';
import { wordLink } from '@/core/words/link';

const OXFORD = 'https://www.oxfordlearnersdictionaries.com/search/english/?q=';

test('https link kept', () => {
  expect(wordLink('cat', '  https://example.com/cat ')).toBe('https://example.com/cat');
});

test('http, javascript:, file: and empty → Oxford search link', () => {
  for (const link of ['http://example.com', 'javascript:alert(1)', 'file:///etc/passwd', '', '   ']) {
    expect(wordLink('cat', link), link).toBe(`${OXFORD}cat`);
  }
});

test('word with spaces is encoded', () => {
  expect(wordLink('give up', '')).toBe(`${OXFORD}give%20up`);
});
