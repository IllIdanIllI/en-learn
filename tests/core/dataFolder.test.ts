import { expect, test } from 'vitest';
import { planMove } from '@/core/dataFolder';

const present = ['enlearn.db', 'enlearn.db-wal', 'prompts/grade.md', 'prompts/sub/x.json'];

test('the current folder is refused, also with a trailing slash', () => {
  expect(planMove('/a/b', '/a/b', present, false)).toEqual({ ok: false, reason: 'same' });
  expect(planMove('/a/b/', '/a/b', present, false)).toEqual({ ok: false, reason: 'same' });
});

test('a folder inside the current one is refused', () => {
  expect(planMove('/a/b', '/a/b/c', present, false)).toEqual({ ok: false, reason: 'inside' });
  expect(planMove('/a/b', '/a/bc', present, false).ok).toBe(true);
});

test('a target that already has a database is refused', () => {
  expect(planMove('/a/b', '/x', present, true)).toEqual({ ok: false, reason: 'occupied' });
});

test('every present file is copied under the new folder', () => {
  expect(planMove('/a/b', '/x/y/', present, false)).toEqual({
    ok: true,
    copies: [
      { from: '/a/b/enlearn.db', to: '/x/y/enlearn.db' },
      { from: '/a/b/enlearn.db-wal', to: '/x/y/enlearn.db-wal' },
      { from: '/a/b/prompts/grade.md', to: '/x/y/prompts/grade.md' },
      { from: '/a/b/prompts/sub/x.json', to: '/x/y/prompts/sub/x.json' },
    ],
  });
});
