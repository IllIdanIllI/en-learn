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

test('setup is prefilled from the seed and rejects an end date before the start', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1500 });
  await page.goto('/?state=empty#/setup');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('[data-testid="week-row"]')).toHaveCount(3);
  await expect(page.locator('#setup-title')).toHaveValue('Preview programme');

  await page.locator('#setup-end').fill('2026-10-01');
  await page.locator('#setup-save').click();
  const alert = page.getByRole('alert');
  await expect(alert.first()).toBeVisible();
  await expect(alert.first()).toContainText('Дата окончания');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/#\/setup$/);
  await page.screenshot({ path: `${SHOTS}/setup-empty.png` });
});

test('settings page', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.goto('/?state=no_session#/settings');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('select[data-model-kind]')).toHaveCount(5);
  await expect(page.locator('#settings-budget')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Настройка программы' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/settings.png` });
});

test('settings changes save immediately', async ({ page }) => {
  await page.goto('/?state=no_session#/settings');
  await page.locator('#settings-budget').fill('0');
  await expect(page.getByRole('alert')).toBeVisible();
  await page.locator('#settings-budget').fill('0.5');
  await expect(page.getByRole('status')).toContainText('Сохранено');
  await page.getByRole('radio', { name: 'English' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings');
});

test('prerequisites lists the four checked locations', async ({ page }) => {
  await page.goto('/?state=prereq_missing#/prerequisites');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  for (const path of [
    '$HOME/.local/bin/claude',
    '$HOME/.claude/local/claude',
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
  ]) {
    await expect(page.getByText(path, { exact: true })).toBeVisible();
  }
  await expect(page.locator('#prereq-check')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/prerequisites-missing.png`, fullPage: true });
});
