import { expect, test } from '@playwright/test';

test('app icon setting switches Light and Night and tells the core', async ({ page }) => {
  await page.goto('/?state=words#/settings');
  await page.getByRole('radio', { name: 'English' }).click();
  const night = page.getByRole('radio', { name: 'Night', exact: true });
  const group = page.getByRole('radiogroup', { name: 'App icon' });
  await expect(group).toBeVisible();
  await expect(group.getByRole('radio', { name: 'Light', exact: true })).toHaveAttribute('aria-checked', 'true');
  expect(await group.getByRole('radio', { name: 'Light', exact: true }).evaluate((el) => getComputedStyle(el).cursor)).toBe('pointer');
  expect(await night.evaluate((el) => getComputedStyle(el).cursor)).toBe('pointer');

  await night.click();
  await expect(night).toHaveAttribute('aria-checked', 'true');
  expect(await page.evaluate(() => window.__appIcon)).toBe(true);

  await group.getByRole('radio', { name: 'Light', exact: true }).click();
  await expect(group.getByRole('radio', { name: 'Light', exact: true })).toHaveAttribute('aria-checked', 'true');
  expect(await page.evaluate(() => window.__appIcon)).toBe(false);
});
