import { expect, test, type Page } from '@playwright/test';

const OLD = 'Some people think that working from home is better than working in an office.';
/** The canned reply of the preview essay_prompt call. */
const NEW = 'Some people think that cities should ban cars from their centres. To what extent do you agree or disagree?';
const TEXT = 'Working from home gives people more freedom because nobody wastes time on a long commute every morning.';

const topicButton = (page: Page) => page.getByRole('button', { name: 'Новая тема', exact: true });
const editor = (page: Page) => page.getByRole('textbox', { name: 'Ваш текст' });
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Сменить тему?' });
const notice = (page: Page) => page.getByRole('alert').filter({ hasText: 'Не удалось сменить тему' });
/** The preview keeps its database in memory, so leaving the page and coming back is the way to read the saved state. */
async function leaveAndReturn(page: Page) {
  await page.getByRole('navigation').getByRole('link', { name: 'Настройки' }).click();
  await page.getByRole('navigation').getByRole('link', { name: 'Сегодня' }).click();
}
/** The debug log is kept in localStorage; a "new topic ok" entry is one prompt change. */
const topicLog = (page: Page) => page.evaluate(() => localStorage.getItem('en-learn.debugLog') ?? '');

test.describe('new topic button on an open essay', () => {
  test('sits under the prompt, above the text area', async ({ page }) => {
    await page.goto('/?state=writing#/today');
    const prompt = page.getByText(OLD);
    await expect(topicButton(page)).toBeVisible();
    const promptBox = await prompt.boundingBox();
    const buttonBox = await topicButton(page).boundingBox();
    const editorBox = await editor(page).boundingBox();
    expect(promptBox && buttonBox && editorBox).toBeTruthy();
    expect(buttonBox!.y).toBeGreaterThanOrEqual(promptBox!.y + promptBox!.height);
    expect(buttonBox!.y + buttonBox!.height).toBeLessThanOrEqual(editorBox!.y);
  });

  test('is absent on a rewrite and on a checked essay', async ({ page }) => {
    await page.goto('/?state=rewrite#/today');
    await expect(editor(page)).toBeVisible();
    await expect(topicButton(page)).toHaveCount(0);
    await page.goto('/?state=writing-graded#/today');
    await expect(page.locator('[data-error]').first()).toBeVisible();
    await expect(topicButton(page)).toHaveCount(0);
  });

  test('empty text: the new prompt replaces the old one at once, with no dialog', async ({ page }) => {
    await page.goto('/?state=writing#/today');
    await topicButton(page).click();
    await expect(page.getByText(NEW)).toBeVisible();
    await expect(page.getByText(OLD)).toHaveCount(0);
    await expect(dialog(page)).toHaveCount(0);
  });

  test('with text: a dialog first; Cancel changes nothing and sends no request', async ({ page }) => {
    await page.goto('/?state=writing#/today');
    await editor(page).fill(TEXT);
    await topicButton(page).click();
    await expect(dialog(page)).toBeVisible();
    await page.getByRole('button', { name: 'Отмена', exact: true }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(topicButton(page)).toBeFocused();
    await expect(page.getByText(OLD)).toBeVisible();
    await expect(editor(page)).toHaveValue(TEXT);
    expect(await topicLog(page)).not.toContain('new topic');
  });

  test('Keep: the new prompt shows and the text stays', async ({ page }) => {
    await page.goto('/?state=writing#/today');
    await editor(page).fill(TEXT);
    await topicButton(page).click();
    await page.getByRole('button', { name: 'Оставить текст', exact: true }).click();
    await expect(page.getByText(NEW)).toBeVisible();
    await expect(editor(page)).toHaveValue(TEXT);
    await leaveAndReturn(page);
    await expect(editor(page)).toHaveValue(TEXT);
    await expect(page.getByText(NEW)).toBeVisible();
  });

  test('Clear: the new prompt shows and the text area is empty, also after leaving the page', async ({ page }) => {
    await page.goto('/?state=writing#/today');
    await editor(page).fill(TEXT);
    await page.waitForTimeout(800);
    await topicButton(page).click();
    await page.getByRole('button', { name: 'Очистить текст', exact: true }).click();
    await expect(page.getByText(NEW)).toBeVisible();
    await expect(editor(page)).toHaveValue('');
    await leaveAndReturn(page);
    await expect(editor(page)).toHaveValue('');
    await expect(page.getByText(NEW)).toBeVisible();
  });

  test('a failed request keeps the old prompt and the text, shows the notice, and the button is enabled', async ({ page }) => {
    await page.goto('/?state=writing&fail=cli_error#/today');
    await editor(page).fill(TEXT);
    await topicButton(page).click();
    await page.getByRole('button', { name: 'Очистить текст', exact: true }).click();
    await expect(notice(page)).toContainText('Не удалось сменить тему: ');
    await expect(page.getByText(OLD)).toBeVisible();
    await expect(editor(page)).toHaveValue(TEXT);
    await expect(topicButton(page)).toBeEnabled();
    await leaveAndReturn(page);
    await expect(editor(page)).toHaveValue(TEXT);
  });

  test('a double click sends one request: the button shows the busy label and is disabled at once', async ({ page }) => {
    await page.goto('/?state=writing&delay=1500#/today');
    const busy = page.getByRole('button', { name: 'Подбираю тему', exact: true });
    await topicButton(page).dblclick();
    await expect(busy).toBeDisabled();
    await expect(page.getByText(NEW)).toBeVisible();
    // The log is written a moment after each entry; a repeated entry is shown as "×N".
    await expect.poll(() => topicLog(page)).toContain('new topic ok');
    const log = await topicLog(page);
    expect(log.split('new topic').length - 1).toBe(1);
    expect(log).not.toMatch(/new topic ok ×/);
    await expect(notice(page)).toHaveCount(0);
  });
});
