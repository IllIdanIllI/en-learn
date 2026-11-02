import { expect, test } from '@playwright/test';

test('design switch applies immediately', async ({ page }) => {
  await page.goto('/?state=no_session#/settings');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-design', 'grove');
  await page.getByRole('radio', { name: 'По умолчанию' }).click();
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
  await page.getByRole('radio', { name: 'По умолчанию' }).click();
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

  test('firefly CSS rule: glow animates, and stops under reduced motion', async ({ page }) => {
    // Probes the style rule on a stand-in element; the real fireflies are covered by the next test.
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

  test('fireflies: one per correct answer yesterday, night only', async ({ page }) => {
    // The session log of the same fixture shows yesterday's score as "N из M"; N is the correct count.
    await page.goto('/?state=fireflies#/progress');
    const card = (await page.getByText(/\d+ из \d+ · \d+%/).first().textContent()) ?? '';
    const expected = Math.min(Number(/^\D*(\d+)/.exec(card)![1]), 12);
    expect(expected).toBeGreaterThan(0);
    await page.goto('/?state=fireflies#/settings');
    await page.getByRole('radio', { name: 'Тёмная' }).click();
    await page.goto('/?state=fireflies#/today');
    await expect(page.locator('[data-garden]')).toHaveAttribute('data-night', 'true');
    await expect(page.locator('[data-garden] [data-firefly]')).toHaveCount(expected);
    await page.screenshot({ path: 'test-results/screens/grove-garden-fireflies-dark.png' });
    await page.getByRole('navigation').getByRole('link', { name: 'Настройки' }).click();
    await page.getByRole('radio', { name: 'Светлая' }).click();
    await page.getByRole('navigation').getByRole('link', { name: 'Сегодня' }).click();
    await expect(page.locator('[data-garden]')).toHaveAttribute('data-night', 'false');
    await expect(page.locator('[data-garden] [data-firefly]')).toHaveCount(0);
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

  test('geta follows closing and reopening without a reload', async ({ page }) => {
    await page.goto('/?state=graded#/today');
    await expect(page.locator('[data-garden]')).toBeVisible();
    await expect(page.locator('[data-garden] [data-geta]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Закрыть урок' }).click();
    await expect(page.getByRole('heading', { name: 'Урок завершён' })).toBeVisible();
    await expect(page.locator('[data-garden] [data-geta]')).toHaveCount(1);
    await page.getByRole('button', { name: 'Добавить вопросы' }).click();
    await page.getByRole('button', { name: 'Добавить', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Урок завершён' })).toHaveCount(0);
    await expect(page.locator('[data-garden] [data-geta]')).toHaveCount(0);
  });

  test('Lamp has no garden; collapsed sidebar hides it', async ({ page }) => {
    await page.goto('/?state=graded#/settings');
    await page.getByRole('radio', { name: 'По умолчанию' }).click();
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

test.describe('lesson details', () => {
  const setDesign = async (page: import('@playwright/test').Page, state: string, design: 'Ночная роща' | 'По умолчанию') => {
    await page.goto(`/?state=${state}#/settings`);
    await page.getByRole('radio', { name: design }).click();
  };

  test('grove: leaf before block headings, dividers, answer meter counts filled fields', async ({ page }) => {
    await page.goto('/?state=generated#/today');
    const titles = page.locator('section h2.title');
    await expect(titles.first()).toBeVisible();
    const count = await titles.count();
    for (let i = 0; i < count; i++) await expect(titles.nth(i).locator('svg').first()).toBeVisible();
    await expect(page.locator('[data-divider]')).toHaveCount(count - 1);

    const fields = await page.locator('section input[type="text"], section input:not([type]), section textarea').count();
    expect(fields).toBeGreaterThan(0);
    const meter = page.locator('[data-answer-meter]');
    await expect(meter).toContainText(`Ответов: 0 из ${fields}`);
    await page.locator('section input[type="text"], section input:not([type])').first().fill('word');
    await expect(meter).toContainText(`Ответов: 1 из ${fields}`);
    await page.screenshot({ path: 'test-results/screens/grove-lesson-answering-dark.png' });
  });

  test('grove: no divider above the first visible block of an added round', async ({ page }) => {
    await page.goto('/?state=open-round#/today');
    const round = page.locator('#latest-round');
    await expect(round.locator('section').first()).toBeVisible();
    await expect(round.locator('[data-divider]')).toHaveCount((await round.locator('section').count()) - 1);
  });

  test('grove: score bar after checking, dry leaves in the error bank', async ({ page }) => {
    await page.goto('/?state=graded#/today');
    const bar = page.locator('[data-score-bar]');
    await expect(bar).toBeVisible();
    // The bar must agree with the per-block scores printed in the summary.
    const rows = await page.locator('#feedback-title ~ ul li span:last-child').allTextContents();
    const pairs = rows.map((r) => /(\d+) из (\d+)/.exec(r)!.slice(1).map(Number) as [number, number]);
    const right = pairs.reduce((n, [c]) => n + c, 0);
    const counted = pairs.reduce((n, [, m]) => n + m, 0);
    expect(counted).toBeGreaterThan(0);
    await expect(bar).toContainText(`${right} / ${counted}`);
    await expect(bar).toContainText(`Верно ${right} из ${counted}`);
    await expect(bar.locator('svg')).toHaveCount(1);
    const sizes = await page.evaluate(() => ({
      score: parseFloat(getComputedStyle(document.querySelector('[data-score-bar] .grove-score')!).fontSize),
      title: parseFloat(getComputedStyle(document.querySelector('h2.title')!).fontSize),
    }));
    expect(sizes.score).toBeGreaterThan(sizes.title);
    await page.screenshot({ path: 'test-results/screens/grove-lesson-checked-dark.png' });

    await page.goto('/?state=graded#/errors');
    const rowsEl = page.locator('tbody tr');
    await expect(rowsEl.first()).toBeVisible();
    for (let i = 0; i < (await rowsEl.count()); i++) await expect(rowsEl.nth(i).locator('td').first().locator('svg')).toHaveCount(1);
  });

  test('grove light screenshots', async ({ page }) => {
    await setDesign(page, 'generated', 'Ночная роща');
    await page.getByRole('radio', { name: 'Светлая' }).click();
    await page.goto('/?state=generated#/today');
    await expect(page.locator('[data-answer-meter]')).toBeVisible();
    await page.screenshot({ path: 'test-results/screens/grove-lesson-answering-light.png' });
    await page.goto('/?state=graded#/settings');
    await page.getByRole('radio', { name: 'Светлая' }).click();
    await page.getByRole('navigation').getByRole('link', { name: 'Сегодня' }).click();
    await expect(page.locator('[data-score-bar]')).toBeVisible();
    await page.screenshot({ path: 'test-results/screens/grove-lesson-checked-light.png' });
  });

  test('lamp: none of the grove details', async ({ page }) => {
    const nav = (name: string) => page.getByRole('navigation').getByRole('link', { name }).click();
    await setDesign(page, 'generated', 'По умолчанию');
    await nav('Сегодня');
    await expect(page.locator('section h2.title').first()).toBeVisible();
    await expect(page.locator('section h2.title svg')).toHaveCount(0);
    await expect(page.locator('[data-divider], [data-answer-meter]')).toHaveCount(0);
    await setDesign(page, 'graded', 'По умолчанию');
    await nav('Сегодня');
    await expect(page.locator('#feedback-title')).toBeVisible();
    await expect(page.locator('[data-score-bar]')).toHaveCount(0);
    await nav('Банк ошибок');
    await expect(page.locator('tbody tr').first()).toBeVisible();
    await expect(page.locator('tbody svg')).toHaveCount(0);
  });
});
