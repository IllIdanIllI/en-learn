import { expect, test } from '@playwright/test';

const SHOTS = 'test-results/screens';

test('shell renders sidebar', async ({ page }) => {
  await page.goto('/#/today');
  const nav = page.getByRole('navigation');
  for (const label of ['Сегодня', 'Прогресс', 'Правила', 'Банк ошибок', 'Настройки']) {
    await expect(nav.getByText(label)).toBeVisible();
  }
  await expect(nav.getByRole('link')).toHaveCount(5);
  await page.screenshot({ path: `${SHOTS}/shell-no_session.png` });
});

test('shell collapses to icons below 1100px', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.goto('/#/today');
  const nav = page.getByRole('navigation');
  await expect(nav.getByRole('link')).toHaveCount(5);
  await expect(nav.getByText('Сегодня')).toBeHidden();
  expect((await nav.boundingBox())?.width).toBe(56);
  await page.screenshot({ path: `${SHOTS}/shell-collapsed.png` });
});

for (const state of ['empty', 'no_session', 'generated', 'questions', 'graded', 'rest', 'rule_missing', 'prereq_missing']) {
  test(`today loads in state ${state}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`/?state=${state}#/today`);
    await expect(page.getByRole('navigation')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/today-${state}.png` });
    expect(errors).toEqual([]);
  });
}
