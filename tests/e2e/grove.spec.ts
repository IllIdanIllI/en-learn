import { expect, test } from '@playwright/test';

test('design switch applies immediately', async ({ page }) => {
  await page.goto('/?state=no_session#/settings');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-design', 'grove');
  await page.getByRole('radio', { name: 'Лампа' }).click();
  await expect(html).toHaveAttribute('data-design', 'lamp');
  await page.getByRole('radio', { name: 'Ночная роща' }).click();
  await expect(html).toHaveAttribute('data-design', 'grove');
});

test('system theme follows the OS', async ({ page }) => {
  await page.goto('/?state=no_session#/settings');
  await page.getByRole('radio', { name: 'Как в системе' }).click();
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
});
