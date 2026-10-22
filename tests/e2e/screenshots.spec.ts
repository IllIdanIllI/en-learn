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

  await expect(page.locator('[data-testid="week-row"] [data-move="up"]')).toHaveCount(3);
  await expect(page.locator('[data-testid="week-row"] [data-move="down"]')).toHaveCount(3);
  await expect(page.locator('[data-testid="week-row"] [data-move="up"]').first()).toBeDisabled();
  await page.locator('[data-testid="week-row"] [data-move="down"]').first().click();
  await expect(page.locator('[data-testid="week-row"] input').first()).toHaveValue('Conditionals');
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

test.describe('today session', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1400 });
  });

  test('no_session offers Start session and a light day toggle', async ({ page }) => {
    await page.goto('/?state=no_session#/today');
    await expect(page.getByRole('button', { name: 'Начать сессию' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Лёгкий день' })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/today-no_session.png` });
  });

  test('generating keeps the skeleton until the session is built, then shows it', async ({ page }) => {
    await page.goto('/?state=no_session&delay=1500#/today');
    await page.getByRole('button', { name: 'Начать сессию' }).click();
    await expect(page.getByText('Собираю сессию на сегодня…')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Начать сессию' })).toBeDisabled();
    await page.screenshot({ path: `${SHOTS}/today-generating.png` });
    await expect(page.getByRole('button', { name: 'Проверить ответы' })).toBeVisible({ timeout: 15_000 });
  });

  test('generated session keeps the answer key out of the DOM', async ({ page }) => {
    await page.goto('/?state=generated#/today');
    await expect(page.getByRole('button', { name: 'Проверить ответы' })).toBeVisible();
    await expect(page.getByText('I saw a elephant at the zoo.')).toBeVisible();
    const html = await page.content();
    expect(html).not.toContain('an elephant');
    expect(html).not.toContain('a teacher');
    const input = page.getByPlaceholder('✓ или исправленный фрагмент').first();
    await expect(input).toHaveAttribute('spellcheck', 'false');
    await expect(input).toHaveAttribute('autocorrect', 'off');
    await expect(input).toHaveAttribute('autocapitalize', 'off');
    await page.screenshot({ path: `${SHOTS}/today-generated.png`, fullPage: true });
  });

  test('blank and shorthand answers raise inline questions', async ({ page }) => {
    await page.goto('/?state=questions#/today');
    const inputs = page.getByPlaceholder('✓ или исправленный фрагмент');
    await inputs.nth(1).fill('+');
    await page.getByRole('button', { name: 'Проверить ответы' }).click();
    await expect(page.getByText('Пропустить это задание?').first()).toBeVisible();
    await expect(page.getByText('Значит ли', { exact: false })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('[data-question] :focus')).toHaveCount(1);
    await page.screenshot({ path: `${SHOTS}/today-questions.png`, fullPage: true });
    // Skipping the blanks and accepting the shorthand lets grading finish.
    for (const yes of await page.getByRole('radio', { name: 'Да' }).all()) await yes.click();
    await page.getByRole('button', { name: 'Проверить ответы' }).click();
    await expect(page.getByText('Итоги')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Итоги' })).toBeFocused();
  });

  test('graded session shows the feedback summary and verdicts with a mark, not only colour', async ({ page }) => {
    await page.goto('/?state=graded#/today');
    await expect(page.getByRole('heading', { name: 'Исправить' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Что повторить завтра' })).toBeVisible();
    await expect(page.getByText('✗').first()).toBeVisible();
    await expect(page.getByText('✓', { exact: false }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Проверить ответы' })).toHaveCount(0);
    expect(await page.content()).toContain('a teacher');
    await page.screenshot({ path: `${SHOTS}/today-graded.png`, fullPage: true });
  });

  test('Ctrl+Enter submits from anywhere on the page', async ({ page }) => {
    await page.goto('/?state=generated#/today');
    await page.getByRole('button', { name: 'Проверить ответы' }).waitFor();
    await page.keyboard.press('Control+Enter');
    await expect(page.getByText('Пропустить это задание?').first()).toBeVisible();
  });
});
