import { expect, test } from '@playwright/test';

test('Settings shows Ready for a ready voice', async ({ page }) => {
  await page.goto('/?voice=ok#/settings');
  await expect(page.getByText('Готов', { exact: true })).toBeVisible();
  await expect(page.getByText(/^Системный голос:/)).toBeVisible();
});

test('Settings shows the download percentage', async ({ page }) => {
  await page.goto('/?voice=downloading#/settings');
  await expect(page.getByText('Загрузка: 40%', { exact: true })).toBeVisible();
});

test('a failed voice shows the reason and Retry, and Retry makes it ready', async ({ page }) => {
  await page.goto('/?voice=failed#/settings');
  await expect(page.getByText(
    'Не работает: start timed out after 20 s at: worker model loading. Звучит системный голос.',
    { exact: true },
  )).toBeVisible();
  await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect(page.getByText('Готов', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Повторить', exact: true })).toHaveCount(0);
});

test('without the Kokoro engine the row shows only the system voice line', async ({ page }) => {
  await page.goto('/#/settings');
  await expect(page.getByText(/^Системный голос:/)).toBeVisible();
  await expect(page.getByText('Готов', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Повторить', exact: true })).toHaveCount(0);
});
