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

test.describe('sidebar garden', () => {
  const setTheme = async (page: import('@playwright/test').Page, radio: string) => {
    await page.goto('/?state=graded#/settings');
    await page.getByRole('radio', { name: radio }).click();
  };

  test('night: moon, lit lantern, no geta; screenshot', async ({ page }) => {
    await setTheme(page, 'Тёмная');
    await page.goto('/?state=graded#/today');
    const garden = page.locator('[data-garden]');
    await expect(garden).toBeVisible();
    await expect(garden).toHaveAttribute('aria-hidden', 'true');
    await expect(garden).toHaveAttribute('data-night', 'true');
    await expect(garden.locator('[data-moon]')).toHaveCount(1);
    await expect(garden.locator('[data-lantern]')).toHaveAttribute('data-lit', 'true');
    await expect(garden.locator('[data-geta]')).toHaveCount(0);
    expect(await garden.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
    await page.screenshot({ path: 'test-results/screens/grove-garden-dark.png' });
  });

  test('firefly glow animates, and stops under reduced motion', async ({ page }) => {
    // No fixture has a session yesterday, so probe the style on a stand-in element.
    const animationOf = () =>
      page.evaluate(() => {
        const el = document.createElement('span');
        el.className = 'grove-firefly';
        document.body.appendChild(el);
        const style = getComputedStyle(el);
        const result = { name: style.animationName, position: style.position };
        el.remove();
        return result;
      });
    await page.goto('/?state=graded#/today');
    await expect(page.locator('[data-garden]')).toBeVisible();
    expect(await animationOf()).toEqual({ name: 'grove-blink', position: 'absolute' });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect((await animationOf()).name).toBe('none');
  });

  test('day: no moon, no fireflies, unlit lantern; screenshot', async ({ page }) => {
    await setTheme(page, 'Светлая');
    await page.goto('/?state=graded#/today');
    const garden = page.locator('[data-garden]');
    await expect(garden).toHaveAttribute('data-night', 'false');
    await expect(garden.locator('[data-moon]')).toHaveCount(0);
    await expect(garden.locator('[data-firefly]')).toHaveCount(0);
    await expect(garden.locator('[data-lantern]')).toHaveAttribute('data-lit', 'false');
    await page.screenshot({ path: 'test-results/screens/grove-garden-light.png' });
  });

  test('geta only when today is closed', async ({ page }) => {
    await page.goto('/?state=closed#/today');
    await expect(page.locator('[data-garden] [data-geta]')).toHaveCount(1);
    await page.goto('/?state=graded#/today');
    await expect(page.locator('[data-garden]')).toBeVisible();
    await expect(page.locator('[data-garden] [data-geta]')).toHaveCount(0);
  });

  test('Lamp has no garden; collapsed sidebar hides it', async ({ page }) => {
    await page.goto('/?state=graded#/settings');
    await page.getByRole('radio', { name: 'Лампа' }).click();
    await expect(page.locator('[data-garden]')).toHaveCount(0);
    await page.getByRole('radio', { name: 'Ночная роща' }).click();
    await expect(page.locator('[data-garden]')).toBeVisible();
    await page.setViewportSize({ width: 1000, height: 700 });
    await expect(page.locator('[data-garden]')).toBeHidden();
  });

  test('never covers the menu at 1280x640', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 640 });
    await page.goto('/?state=graded#/today');
    const garden = page.locator('[data-garden]');
    await expect(garden).toBeVisible();
    const last = await page.getByRole('navigation').getByRole('link').last().boundingBox();
    const box = await garden.boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(last!.y + last!.height);
  });

  test('theme system follows the OS live', async ({ page }) => {
    await setTheme(page, 'Как в системе');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('[data-garden]')).toHaveAttribute('data-night', 'true');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('[data-garden]')).toHaveAttribute('data-night', 'false');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('[data-garden]')).toHaveAttribute('data-night', 'true');
  });
});
