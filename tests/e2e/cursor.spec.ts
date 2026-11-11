import { expect, test, type Page } from '@playwright/test';
import { LIMIT_WORD_ANSWERS } from '../../src/adapters/preview/wordsSeed';
import { tapTiles } from './helpers';

// Learner's rule (CLAUDE.md): every interactive element shows the pointer cursor; disabled ones show `not-allowed`.
// Each page is opened in a few preview states; open panels and expandable rows are opened too, then every interactive element is checked.

const INTERACTIVE = [
  'button', 'a[href]', 'summary', 'select',
  'input[type="checkbox"]', 'input[type="radio"]',
  '[role="button"]', '[role="link"]', '[role="menuitem"]', '[role="menuitemcheckbox"]', '[role="menuitemradio"]',
  '[role="option"]', '[role="tab"]', '[role="switch"]', '[role="checkbox"]', '[role="radio"]',
].join(',');

async function wrongCursors(page: Page): Promise<string[]> {
  return page.evaluate((selector) => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue; // hidden
      const disabled = el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true';
      const want = disabled ? 'not-allowed' : 'pointer';
      const got = getComputedStyle(el).cursor;
      if (got !== want) {
        const name = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
        out.push(`<${el.tagName.toLowerCase()}${el.getAttribute('role') ? ` role=${el.getAttribute('role')}` : ''}> "${name}": ${got}, want ${want}`);
      }
    }
    return out;
  }, INTERACTIVE);
}

/** Opens what a page hides behind a click: the set-up panel (gear), expandable rows and dispute forms, each once. */
async function openHidden(page: Page) {
  const toggles = await page.locator('button[aria-expanded="false"]:not([role="combobox"])').all();
  for (const toggle of toggles) {
    if (await toggle.isVisible() && await toggle.isEnabled()) await toggle.click();
  }
}

const CASES: [string, string][] = [
  ['no_session', 'today'], ['rest', 'today'], ['questions', 'today'], ['graded', 'today'], ['closed', 'today'],
  ['spot', 'today'], ['spot-graded', 'today'], ['writing', 'today'], ['writing-graded', 'today'], ['rewrite', 'today'],
  ['progress', 'progress'], ['writing-graded', 'progress'], ['graded', 'rules'], ['graded', 'errors'],
  ['writing-graded', 'errors'], ['writing-graded', 'writing'], ['graded', 'settings'], ['prereq_missing', 'prerequisites'],
  ['words', 'words'], ['words', 'words/practice'], ['words-done', 'words/practice'], ['words-limit', 'words'],
  ['words', 'words/1'], ['words', 'words/abc'],
];

for (const [state, route] of CASES) {
  test(`pointer cursor: ${route} (${state})`, async ({ page }) => {
    await page.goto(`/?state=${state}#/${route}`);
    await page.waitForLoadState('networkidle');
    await page.locator('main').waitFor();
    await openHidden(page);
    expect(await wrongCursors(page)).toEqual([]);
  });
}

test('pointer cursor: anagram tiles, a placed letter and Skip', async ({ page }) => {
  await page.goto('/?state=words-limit#/words');
  await page.getByRole('button', { name: '+10 новых слов' }).click();
  const card = page.locator('[data-card-type]');
  await card.waitFor();
  // Each new word starts with its choice card; the anagram cards come after the ten choice cards.
  for (let i = 0; i < 30 && (await card.getAttribute('data-card-type')) !== 'anagram'; i++) {
    const correct = LIMIT_WORD_ANSWERS[(await card.locator('p.reading').first().innerText()).trim()];
    await card.getByRole('button', { name: correct!, exact: true }).click();
    await page.getByRole('button', { name: 'Дальше' }).click();
    await card.waitFor();
  }
  expect(await card.getAttribute('data-card-type')).toBe('anagram');
  const cursor = (locator: ReturnType<typeof card.locator>) => locator.evaluate((el) => getComputedStyle(el).cursor);
  await card.getByTestId('tile').first().click();
  await expect(card.getByTestId('placed')).toHaveCount(1);
  expect(await cursor(card.getByTestId('tile').first())).toBe('not-allowed');
  expect(await cursor(card.getByTestId('placed').first())).toBe('pointer');
  expect(await cursor(card.getByRole('button', { name: 'Пропустить' }))).toBe('pointer');
  expect(await wrongCursors(page)).toEqual([]);
});

test('field titles (label[for]) keep the default cursor', async ({ page }) => {
  await page.goto('/?state=words#/words/1');
  await page.locator('label[for]').first().waitFor();
  const cursors = await page.locator('label[for]').evaluateAll((els) => els.map((el) => getComputedStyle(el).cursor));
  expect(cursors.length).toBeGreaterThan(0);
  for (const c of cursors) expect(['auto', 'default']).toContain(c);
});

test('pointer cursor: words with the details panel open', async ({ page }) => {
  await page.goto('/?state=words#/words');
  await page.getByRole('button', { name: /Подробнее/ }).click();
  await expect(page.getByTestId('words-details')).toBeVisible();
  expect(await wrongCursors(page)).toEqual([]);
});

test('pointer cursor: settings with a new day available', async ({ page }) => {
  await page.goto('/?state=graded&early=1#/settings');
  await page.getByRole('button', { name: 'Начать новый день' }).waitFor();
  expect(await wrongCursors(page)).toEqual([]);
});

test('pointer cursor: settings with a select list open', async ({ page }) => {
  await page.goto('/?state=graded#/settings');
  await page.getByRole('combobox').first().click();
  await expect(page.getByRole('option').first()).toBeVisible();
  expect(await wrongCursors(page)).toEqual([]);
});

test('pointer cursor: practice end screen with +10 new words', async ({ page }) => {
  await page.goto('/?state=words-limit#/words');
  await page.getByRole('button', { name: '+10 новых слов' }).click();
  for (let i = 0; i < 30; i++) {
    const card = page.locator('[data-card-type]');
    await card.waitFor();
    const type = await card.getAttribute('data-card-type');
    const correct = LIMIT_WORD_ANSWERS[(await card.locator('p.reading').first().innerText()).trim()];
    expect(correct).toBeDefined();
    if (type === 'choice') {
      await card.getByRole('button', { name: correct!, exact: true }).click();
    } else if (type === 'anagram') {
      await tapTiles(card, correct!);
      await card.getByRole('button', { name: 'Проверить' }).click();
    } else {
      await card.getByRole('textbox').fill(correct!);
      await card.getByRole('button', { name: 'Проверить' }).click();
    }
    await page.getByRole('button', { name: 'Дальше' }).click();
  }
  await expect(page.getByTestId('practice-end').getByRole('button', { name: '+10 новых слов' })).toBeVisible();
  expect(await wrongCursors(page)).toEqual([]);
});
