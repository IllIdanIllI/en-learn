import { expect, test } from '@playwright/test';

test('the debug log section shows the entry count', async ({ page }) => {
  await page.goto('/?state=words#/settings');
  await expect(page.getByText(/^Записей: [1-9]\d*$/)).toBeVisible();
});

test('Show opens the log, Clear empties it', async ({ page }) => {
  await page.goto('/?state=words#/settings');
  await page.getByRole('button', { name: 'Показать журнал', exact: true }).click();
  const area = page.getByRole('textbox', { name: 'Журнал отладки' });
  await expect(area).toHaveValue(/--- this run ---/);
  await expect(area).toHaveValue(/route \/settings/);
  await page.getByRole('button', { name: 'Очистить', exact: true }).click();
  await expect(page.getByText('Записей: 0', { exact: true })).toBeVisible();
  await expect(area).toHaveValue('--- this run ---');
});

test('Copy puts the log on the clipboard and shows Скопировано', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/?state=words#/settings');
  await page.getByRole('button', { name: 'Скопировать журнал', exact: true }).click();
  await expect(page.getByText('Скопировано', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('--- this run ---');
});

test('Cmd+Option+L (Ctrl+Alt+L here) on Today copies the log and shows a toast', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/?state=words#/today');
  await page.locator('main').waitFor();
  await page.keyboard.press('Control+Alt+KeyL');
  await expect(page.getByText('Журнал скопирован')).toBeVisible();
});
