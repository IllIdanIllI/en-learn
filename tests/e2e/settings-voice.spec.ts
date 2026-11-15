import { expect, test } from '@playwright/test';

test('Settings shows Ready for a ready voice', async ({ page }) => {
  await page.goto('/?voice=ok#/settings');
  await expect(page.getByText('Готов', { exact: true })).toBeVisible();
  // The app never uses the system voice with the Kokoro engine, so its line is not shown.
  await expect(page.getByText(/^Системный голос:/)).toHaveCount(0);
});

test('Settings shows the download percentage', async ({ page }) => {
  await page.goto('/?voice=downloading#/settings');
  await expect(page.getByText('Загрузка: 40%', { exact: true })).toBeVisible();
});

test('a failed voice shows the reason and Retry, and Retry makes it ready', async ({ page }) => {
  await page.goto('/?voice=failed#/settings');
  await expect(page.getByText(
    'Не работает: start timed out after 20 s at: worker model loading.',
    { exact: true },
  )).toBeVisible();
  // The failure toast has its own Retry button, so the Settings one is scoped to the page content.
  const retry = page.locator('main').getByRole('button', { name: 'Повторить', exact: true });
  await retry.click();
  await expect(page.getByText('Готов', { exact: true })).toBeVisible();
  await expect(retry).toHaveCount(0);
});

test('without the Kokoro engine the row shows only the system voice line', async ({ page }) => {
  await page.goto('/#/settings');
  await expect(page.getByText(/^Системный голос:/)).toBeVisible();
  await expect(page.getByText('Готов', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Повторить', exact: true })).toHaveCount(0);
});
