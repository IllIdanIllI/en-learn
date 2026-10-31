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

test('grove and lamp tokens and fonts', async ({ page }) => {
  const expectBackground = async (oklch: string) => {
    const actual = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const expected = await page.evaluate((value) => {
      const el = document.createElement('div');
      el.style.backgroundColor = value;
      document.body.appendChild(el);
      const computed = getComputedStyle(el).backgroundColor;
      el.remove();
      return computed;
    }, oklch);
    expect(actual).toBe(expected);
  };
  const fontOf = (selector: string) => page.locator(selector).first().evaluate((el) => getComputedStyle(el).fontFamily);

  await page.goto('/?state=generated#/settings');
  await page.getByRole('radio', { name: 'Тёмная' }).click();
  await page.getByRole('navigation').getByRole('link', { name: 'Сегодня' }).click();
  await expect(page.locator('h1.headline')).toBeVisible();
  await expect(page.locator('.reading').first()).toBeVisible();
  await expectBackground('oklch(0.2 0.022 165)');
  expect(await fontOf('h1.headline')).toContain('Murecho');
  expect(await fontOf('.reading')).toContain('Alegreya');

  await page.getByRole('navigation').getByRole('link', { name: 'Настройки' }).click();
  await page.getByRole('radio', { name: 'Светлая' }).click();
  await page.getByRole('navigation').getByRole('link', { name: 'Сегодня' }).click();
  await expect(page.locator('h1.headline')).toBeVisible();
  await expectBackground('oklch(0.955 0.016 115)');

  await page.getByRole('navigation').getByRole('link', { name: 'Настройки' }).click();
  await page.getByRole('radio', { name: 'Лампа' }).click();
  await page.getByRole('radio', { name: 'Тёмная' }).click();
  await page.getByRole('navigation').getByRole('link', { name: 'Сегодня' }).click();
  await expect(page.locator('h1.headline')).toBeVisible();
  await expectBackground('oklch(0.205 0.012 65)');
  expect(await fontOf('h1.headline')).toContain('Literata');
});
