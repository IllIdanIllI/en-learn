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
  ['words', 'words'], ['words', 'words/practice?mode=new'], ['words', 'words/practice?mode=review'], ['words-done', 'words/practice'], ['words-limit', 'words'],
  ['words', 'words/1'], ['words', 'words/abc'], ['words-fill', 'words'],
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

test('pointer cursor: Retry of a failed transcription fill', async ({ page }) => {
  await page.goto('/?state=words-fill&fail=cli_error#/words');
  const retry = page.getByRole('button', { name: 'Повторить', exact: true });
  await retry.waitFor();
  expect(await retry.evaluate((el) => getComputedStyle(el).cursor)).toBe('pointer');
});

test('pointer cursor: anagram tiles, a placed letter and Skip', async ({ page }) => {
  await page.goto('/?state=words#/words/practice?mode=review');
  const card = page.locator('[data-card-type]');
  await card.waitFor();
  // Skip every card until an anagram shows (the stage-1 words have one); a word card is left with Дальше.
  for (let i = 0; i < 30 && (await card.getAttribute('data-card-type')) !== 'anagram'; i++) {
    if ((await card.getAttribute('data-card-type')) === 'intro') {
      await page.getByRole('button', { name: 'Дальше' }).click();
    } else {
      await card.getByRole('button', { name: 'Пропустить' }).click();
      await page.getByRole('button', { name: 'Дальше' }).click();
    }
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

test('pointer cursor: intro and build tiles, a placed tile is not-allowed, slots are not buttons', async ({ page }) => {
  await page.goto('/?state=words-limit#/words');
  await page.getByRole('button', { name: '+10 новых слов' }).click();
  const card = page.locator('[data-card-type]');
  await card.waitFor();
  expect(await card.getAttribute('data-card-type')).toBe('intro');
  const cursor = (locator: ReturnType<typeof card.locator>) => locator.evaluate((el) => getComputedStyle(el).cursor);
  expect(await cursor(card.getByRole('button', { name: 'Дальше' }))).toBe('pointer');
  // Ten intros come first, then the choice cards, then the build cards: answer the choices right until a build shows.
  for (let i = 0; i < 40 && (await card.getAttribute('data-card-type')) !== 'build'; i++) {
    if ((await card.getAttribute('data-card-type')) === 'intro') {
      await card.getByRole('button', { name: 'Дальше' }).click();
    } else {
      const correct = LIMIT_WORD_ANSWERS[(await card.locator('p.reading').first().innerText()).trim()];
      await card.getByRole('button', { name: correct!, exact: true }).click();
      await page.getByRole('button', { name: 'Дальше' }).click();
    }
    await card.waitFor();
  }
  await expect(card).toHaveAttribute('data-card-type', 'build');
  await expect(card.getByTestId('slot').first()).toBeVisible();
  expect(await card.getByTestId('slot').first().evaluate((el) => el.tagName)).not.toBe('BUTTON');
  expect(await cursor(card.getByTestId('tile').first())).toBe('pointer');
  // The first letter of the word, so the tile is placed (a wrong tile would only flash).
  const first = LIMIT_WORD_ANSWERS[(await card.locator('p.reading').first().innerText()).trim()]![0]!;
  await card.locator('[data-testid="tile"]:enabled').filter({ hasText: first }).first().click();
  await expect(card.locator('[data-testid="tile"]:disabled')).toHaveCount(1);
  expect(await cursor(card.locator('[data-testid="tile"]:disabled').first())).toBe('not-allowed');
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

test('pointer cursor: the Wiktionary link of the dictionary line', async ({ page }) => {
  await page.goto('/?state=words-dict#/words');
  await page.getByRole('link', { name: 'assertion', exact: true }).click();
  const link = page.getByRole('link', { name: 'Wiktionary' });
  await expect(link).toBeVisible();
  expect(await link.evaluate((el) => getComputedStyle(el).cursor)).toBe('pointer');
  expect(await wrongCursors(page)).toEqual([]);
});

test('pointer cursor: the edit word panel from a training card', async ({ page }) => {
  await page.goto('/?state=words#/words/practice?mode=new');
  const card = page.locator('[data-card-type]');
  await card.waitFor();
  const cursor = (locator: ReturnType<typeof card.locator>) => locator.evaluate((el) => getComputedStyle(el).cursor);
  const edit = card.getByRole('button', { name: 'Изменить слово' });
  expect(await cursor(edit)).toBe('pointer');
  await edit.click();
  const dialog = page.getByRole('dialog', { name: 'ephemeral' });
  await expect(dialog).toBeVisible();
  expect(await cursor(dialog.getByRole('button', { name: 'Закрыть', exact: true }))).toBe('pointer');
  expect(await cursor(dialog.getByRole('button', { name: 'Удалить', exact: true }))).toBe('pointer');
  await dialog.getByLabel('Перевод', { exact: true }).fill('проверка');
  expect(await cursor(dialog.locator('form').getByRole('button', { name: 'Сохранить', exact: true }))).toBe('pointer');
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
  for (let i = 0; i < 40; i++) {
    const card = page.locator('[data-card-type]');
    await card.waitFor();
    const type = await card.getAttribute('data-card-type');
    if (type === 'intro') {
      await card.getByRole('button', { name: 'Дальше' }).click();
      continue;
    }
    const correct = LIMIT_WORD_ANSWERS[(await card.locator('p.reading').first().innerText()).trim()];
    expect(correct).toBeDefined();
    if (type === 'choice') {
      await card.getByRole('button', { name: correct!, exact: true }).click();
    } else if (type === 'build') {
      await tapTiles(card, correct!);
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

test('pointer cursor: word card buttons, the Remove confirmation, and a training with nothing to do', async ({ page }) => {
  await page.goto('/?state=words-limit#/words');
  const cursor = (locator: ReturnType<typeof page.locator>) => locator.evaluate((el) => getComputedStyle(el).cursor);
  expect(await cursor(page.getByText('Новые слова · 0'))).toBe('not-allowed');
  expect(await cursor(page.getByText('Повторение · 0'))).toBe('not-allowed');
  await page.getByRole('button', { name: '+10 новых слов' }).click();
  const card = page.locator('[data-card-type]');
  await card.waitFor();
  expect(await cursor(card.getByRole('button', { name: 'Уже знаю это слово' }))).toBe('pointer');
  expect(await cursor(card.getByRole('button', { name: 'Удалить из словаря' }))).toBe('pointer');
  expect(await cursor(card.getByRole('button', { name: 'Произнести' }).first())).toBe('pointer');
  await card.getByRole('button', { name: 'Удалить из словаря' }).click();
  await expect(page.getByRole('button', { name: 'Да', exact: true })).toBeVisible();
  expect(await cursor(page.getByRole('button', { name: 'Да', exact: true }))).toBe('pointer');
  expect(await cursor(page.getByRole('button', { name: 'Нет', exact: true }))).toBe('pointer');
  expect(await wrongCursors(page)).toEqual([]);
});
