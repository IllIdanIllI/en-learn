import { expect, test } from 'vitest';
import { t } from '@/core/i18n';
import { cleanupPlan, moveTarget, planMove, refusePicked } from '@/core/dataFolder';

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

const home = '/Users/me';
const appData = '/Users/me/Library/Application Support/com.example.app';

test('picked folders that must be refused', () => {
  expect(refusePicked('/Users/me', home, appData)).toBe('home');
  expect(refusePicked('/Users/me/', home, appData)).toBe('home');
  expect(refusePicked('/', home, appData)).toBe('root');
  expect(refusePicked('//', home, appData)).toBe('root');
  expect(refusePicked('/Users/me/Library', home, appData)).toBe('library');
  expect(refusePicked('/Users/me/Library/Preferences', home, appData)).toBe('library');
  expect(refusePicked('/Users/me/Library/Application Support', home, appData)).toBe('library');
  expect(refusePicked('/System', home, appData)).toBe('system');
  expect(refusePicked('/System/Library/X', home, appData)).toBe('system');
  expect(refusePicked('/Volumes/Backup', home, appData)).toBe('volume');
  expect(refusePicked('/Volumes/Backup/', home, appData)).toBe('volume');
});

test('other picked folders pass, including the app data folder and below it', () => {
  expect(refusePicked('/Users/me/Documents', home, appData)).toBeNull();
  expect(refusePicked('/Users/me/Libraryx', home, appData)).toBeNull();
  expect(refusePicked('/Systems', home, appData)).toBeNull();
  expect(refusePicked('/Volumes', home, appData)).toBeNull();
  expect(refusePicked('/Volumes/Backup/data', home, appData)).toBeNull();
  expect(refusePicked(appData, home, appData)).toBeNull();
  expect(refusePicked(`${appData}/sub/`, home, appData)).toBeNull();
});

test('comparison is case-insensitive', () => {
  expect(refusePicked('/users/ME', home, appData)).toBe('home');
  expect(refusePicked('/system/x', home, appData)).toBe('system');
  expect(refusePicked('/VOLUMES/Backup', home, appData)).toBe('volume');
  expect(refusePicked('/users/me/LIBRARY/x', home, appData)).toBe('library');
  expect(refusePicked(appData.toUpperCase(), home, appData)).toBeNull();
});

test('the confirm text names the real target folder', () => {
  expect(t('en', 'settings.dataDir.confirm', { path: moveTarget('/x/y/') })).toContain('/x/y/EnglishExamCoach');
});

test('a rollback list removes copied files, then the dirs under the target, deepest first', () => {
  expect(cleanupPlan(['/t/enlearn.db', '/t/prompts/sub/a.md'], ['/t'])).toEqual({
    files: ['/t/enlearn.db', '/t/prompts/sub/a.md'],
    dirs: ['/t/prompts/sub', '/t/prompts'],
  });
});

test('the data goes into a subfolder of the picked folder', () => {
  expect(moveTarget('/x/y')).toBe('/x/y/EnglishExamCoach');
  expect(moveTarget('/x/y/')).toBe('/x/y/EnglishExamCoach');
});

test('a target that is not empty is refused, after same, inside and occupied', () => {
  expect(planMove('/a/b', '/x', present, false, true)).toEqual({ ok: false, reason: 'notEmpty' });
  expect(planMove('/a/b', '/x', present, true, true)).toEqual({ ok: false, reason: 'occupied' });
  expect(planMove('/a/b', '/a/b', present, false, true)).toEqual({ ok: false, reason: 'same' });
  expect(planMove('/a/b', '/a/b/EnglishExamCoach', present, false, true)).toEqual({ ok: false, reason: 'inside' });
});

test('cleanup lists the copied files, then emptied folders deepest first, never the roots', () => {
  const files = ['/db/enlearn.db', '/db/enlearn.db-wal', '/app/prompts/grade.md', '/app/prompts/sub/deep/x.json', '/app/prompts/sub/y.json'];
  expect(cleanupPlan(files, ['/db', '/app'])).toEqual({
    files,
    dirs: ['/app/prompts/sub/deep', '/app/prompts/sub', '/app/prompts'],
  });
  expect(cleanupPlan(['/a/b/enlearn.db'], ['/a/b'])).toEqual({ files: ['/a/b/enlearn.db'], dirs: [] });
});
