import { expect, test, type Page } from '@playwright/test';

const PARAGRAPH = 'Yesterday I met a old friend';

/** Selects `fragment` inside the spot paragraph that contains `text`, as a real user selection would. */
async function select(page: Page, fragment: string) {
  await expect(page.locator('p[id^="para-"]', { hasText: PARAGRAPH })).toBeVisible();
  await page.evaluate(({ text, fragment }) => {
    const p = [...document.querySelectorAll<HTMLElement>('p[id^="para-"]')].find((el) => el.textContent?.includes(text))!;
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    let node: Text | null = null;
    for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
      if (n.data.includes(fragment)) { node = n; break; }
    }
    const start = node!.data.indexOf(fragment);
    const range = document.createRange();
    range.setStart(node!, start);
    range.setEnd(node!, start + fragment.length);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    // selectionchange is async: let the listener run before the test looks at the page.
    return new Promise<void>((resolve) => setTimeout(resolve, 50));
  }, { text: PARAGRAPH, fragment });
}

test.describe('error spotting: select and fix', () => {
  test('select → Fix adds a prefilled field; ✕ removes it', async ({ page }) => {
    await page.goto('/?state=spot#/today');
    await select(page, 'old fri');
    await page.getByRole('button', { name: 'Исправить' }).click();
    const field = page.getByRole('textbox', { name: 'было: old friend' });
    await expect(field).toHaveValue('old friend');
    await page.getByRole('button', { name: 'Убрать' }).click();
    await expect(page.getByRole('textbox', { name: 'было: old friend' })).toHaveCount(0);
  });

  test('selecting the same fragment again focuses the existing field', async ({ page }) => {
    await page.goto('/?state=spot#/today');
    await select(page, 'old fri');
    await page.getByRole('button', { name: 'Исправить' }).click();
    await select(page, 'old fri');
    await page.getByRole('button', { name: 'Исправить' }).click();
    await expect(page.getByRole('textbox', { name: 'было: old friend' })).toHaveCount(1);
    await expect(page.getByRole('textbox', { name: 'было: old friend' })).toBeFocused();
  });

  test('no flyout for a selection of spaces', async ({ page }) => {
    await page.goto('/?state=spot#/today');
    await select(page, ' ');
    await expect(page.getByRole('button', { name: 'Исправить' })).toHaveCount(0);
  });

  test('fields survive leaving and returning to the lesson', async ({ page }) => {
    await page.goto('/?state=spot#/today');
    await select(page, 'old fri');
    await page.getByRole('button', { name: 'Исправить' }).click();
    await page.getByRole('textbox', { name: 'было: old friend' }).fill('an old friend');
    await page.waitForTimeout(800);
    await page.getByRole('navigation').getByRole('link', { name: 'Настройки' }).click();
    await page.getByRole('navigation').getByRole('link', { name: 'Сегодня' }).click();
    await expect(page.getByRole('textbox', { name: 'было: old friend' })).toHaveValue('an old friend');
  });

  test('typing a multi-word fix keeps its spaces', async ({ page }) => {
    await page.goto('/?state=spot#/today');
    await select(page, 'old fri');
    await page.getByRole('button', { name: 'Исправить' }).click();
    const field = page.getByRole('textbox', { name: 'было: old friend' });
    await field.fill('');
    await field.pressSequentially('an old friend');
    await expect(field).toHaveValue('an old friend');
  });

  test('adding a field keeps a trailing space in another field', async ({ page }) => {
    await page.goto('/?state=spot#/today');
    await select(page, 'old fri');
    await page.getByRole('button', { name: 'Исправить' }).click();
    const first = page.getByRole('textbox', { name: 'было: old friend' });
    await first.fill('');
    await first.pressSequentially('an old ');
    await select(page, 'Yesterday');
    await page.getByRole('button', { name: 'Исправить' }).click();
    await expect(page.getByRole('textbox', { name: 'было: Yesterday' })).toBeFocused();
    const second = page.getByRole('textbox', { name: 'было: old friend' });
    await second.click();
    await second.press('End');
    await second.pressSequentially('friend');
    await expect(page.getByRole('textbox', { name: 'было: old friend' })).toHaveValue('an old friend');
  });

  test('spot block shows the app hint, not the generated example', async ({ page }) => {
    await page.goto('/?state=spot#/today');
    const block = page.locator('section').filter({ has: page.locator('p[id^="para-"]', { hasText: PARAGRAPH }) });
    await expect(block.getByText('Выделите ошибку в тексте и нажмите «Исправить».')).toBeVisible();
    await expect(block.locator('textarea')).toHaveCount(0);
  });
});

const EXPLANATION = 'Перед гласным звуком нужен артикль an: an old friend.';

test.describe('error spotting: results', () => {
  test('graded paragraph shows found N of M', async ({ page }) => {
    await page.goto('/?state=spot-graded#/today');
    await expect(page.getByText(/Найдено \d+ из \d+/).first()).toBeVisible();
  });

  test('Explain fills the explanation once', async ({ page }) => {
    await page.goto('/?state=spot-graded#/today');
    const missed = page.getByRole('listitem').filter({ hasText: 'Не найдено' });
    const explain = missed.getByRole('button', { name: 'Объяснить' }).first();
    await expect(explain).toBeVisible();
    const before = await page.getByRole('button', { name: 'Объяснить' }).count();
    await explain.dblclick();
    await expect(page.getByText(EXPLANATION)).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Объяснить' })).toHaveCount(before - 1);
    // Leave the lesson and come back: the stored explanation stays, the button stays gone.
    await page.getByRole('navigation').getByRole('link', { name: 'Настройки' }).click();
    await page.getByRole('navigation').getByRole('link', { name: 'Сегодня' }).click();
    await expect(page.getByText(EXPLANATION)).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Объяснить' })).toHaveCount(before - 1);
  });
});
