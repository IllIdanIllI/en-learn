import { expect, test, type Page } from '@playwright/test';

const PROMPT = 'Some people think that working from home is better than working in an office.';

/** 60 words that contain "goes" and "are", the two fragments the preview grader marks. */
const TEXT = 'Working from home gives people more freedom because nobody wastes time on a long commute every morning. '
  + 'My brother goes to the office by bus and he says the trip makes him tired before the day even starts. '
  + 'Many companies are happy to let staff choose where they work, and the results are usually quite good for everyone involved here.';

/** The other blocks of the lesson stay blank, so "Завершить урок" grades without asking about them. */
const finish = (page: Page) => page.getByRole('button', { name: 'Завершить урок' }).click();
const editor = (page: Page) => page.getByRole('textbox', { name: 'Ваш текст' });

test.describe('writing block', () => {
  test('shows the prompt and counts words; the text survives leaving the page', async ({ page }) => {
    await page.goto('/?state=writing#/today');
    await expect(page.getByText(PROMPT)).toBeVisible();
    await editor(page).fill(TEXT);
    await expect(page.getByText('60 / 250')).toBeVisible();
    await page.waitForTimeout(800);
    await page.getByRole('navigation').getByRole('link', { name: 'Настройки' }).click();
    await page.getByRole('navigation').getByRole('link', { name: 'Сегодня' }).click();
    await expect(editor(page)).toHaveValue(TEXT);
    await expect(page.getByText('60 / 250')).toBeVisible();
  });

  test('checking underlines the errors, lists them and gives the rate, with no score', async ({ page }) => {
    await page.goto('/?state=writing#/today');
    await editor(page).fill(TEXT);
    await finish(page);
    await expect(page.locator('[data-error]')).toHaveText(['goes', 'are']);
    const list = page.locator('li', { hasText: 'My brother goes to the office' });
    await expect(list).toContainText('goes');
    await expect(list).toContainText('→ go');
    await expect(page.locator('li', { hasText: 'Many companies are happy' })).toContainText('→ is');
    await expect(page.getByText('2 ош. · 3.3 на 100 слов')).toBeVisible();
    await expect(page.locator('section[aria-labelledby="feedback-title"] li', { hasText: 'Эссе' })).toHaveCount(0);
  });

  test('a graded essay opens already checked', async ({ page }) => {
    await page.goto('/?state=writing-graded#/today');
    await expect(page.locator('[data-error]')).toHaveText(['goes', 'are']);
    await expect(page.getByText('2 ош. · 3.3 на 100 слов')).toBeVisible();
    await expect(editor(page)).toHaveCount(0);
  });

  test('a text under 50 words is not checked', async ({ page }) => {
    await page.goto('/?state=writing#/today');
    await editor(page).fill(TEXT.split(' ').slice(0, 20).join(' '));
    await expect(page.getByText('20 / 250')).toBeVisible();
    await finish(page);
    await expect(page.getByText('Слишком коротко для проверки')).toBeVisible();
    await expect(page.locator('[data-error]')).toHaveCount(0);
  });
});

test.describe('rewrite block', () => {
  test('is prefilled with the source and lists its errors; checking shows Было and Стало', async ({ page }) => {
    await page.goto('/?state=rewrite#/today');
    await expect(editor(page)).toHaveValue(TEXT);
    await expect(page.getByText('Ошибки в прошлый раз')).toBeVisible();
    await expect(page.getByText('goes', { exact: true })).toBeVisible();
    await editor(page).fill(TEXT.replace('goes', 'go').replace(' are ', ' is ').replace(' are ', ' is '));
    await finish(page);
    await expect(page.getByRole('heading', { name: 'Было' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Стало' })).toBeVisible();
    await expect(page.getByText('2 ош. · 3.3 на 100 слов')).toBeVisible();
    await expect(page.getByText('0 ош. · 0 на 100 слов')).toBeVisible();
  });

  test('an untouched prefill is submitted as it is', async ({ page }) => {
    await page.goto('/?state=rewrite#/today');
    await expect(editor(page)).toHaveValue(TEXT);
    await finish(page);
    await expect(page.getByRole('heading', { name: 'Стало' })).toBeVisible();
  });
});

test.describe('writing page, rate chart and error bank "Other"', () => {
  test('sidebar: Письмо sits after Банк ошибок', async ({ page }) => {
    await page.goto('/?state=writing-graded#/today');
    const links = page.getByRole('navigation').getByRole('link');
    await expect(links).toHaveCount(6);
    const names = await links.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
    expect(names).toEqual(['Сегодня', 'Прогресс', 'Правила', 'Банк ошибок', 'Письмо', 'Настройки']);
  });

  test('a checked text is listed with its rate; the row expands to the underlined text, read-only', async ({ page }) => {
    await page.goto('/?state=writing-graded#/writing');
    const toggle = page.getByRole('button', { name: PROMPT });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    const row = page.locator('tbody tr', { has: toggle });
    await expect(row).toContainText('Эссе');
    await expect(row).toContainText('60');
    await expect(row).toContainText('3.3');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('[data-error]')).toHaveText(['goes', 'are']);
    await expect(page.getByText('2 ош. · 3.3 на 100 слов')).toBeVisible();
    await expect(page.locator('li', { hasText: 'My brother goes to the office' })).toContainText('→ go');
    await expect(page.getByTestId('writing-detail').getByRole('button')).toHaveCount(0);
  });

  test('progress: errors per 100 words, one point and a dashed target line labelled 3', async ({ page }) => {
    await page.goto('/?state=writing-graded#/progress');
    await expect(page.getByRole('heading', { name: 'Ошибки на 100 слов' })).toBeVisible();
    const chart = page.getByRole('img', { name: 'Ошибки на 100 слов' });
    await expect(chart.locator('circle')).toHaveCount(1);
    await expect(chart.locator('line[stroke-dasharray]')).toHaveCount(1);
    await expect(chart.getByTestId('rate-target')).toHaveText('3');
  });

  test('error bank: Другое lists the error without a topic, with its possible topic', async ({ page }) => {
    await page.goto('/?state=writing-graded#/errors');
    await page.getByRole('combobox', { name: 'Тема' }).click();
    await page.getByRole('option', { name: 'Другое' }).click();
    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('is');
    await expect(rows.first()).toContainText('возможная тема: subject-verb agreement');
  });

  test('empty states with no texts', async ({ page }) => {
    await page.goto('/?state=no_session#/writing');
    await expect(page.getByText('Здесь будут ваши тексты')).toBeVisible();
    await page.goto('/?state=no_session#/progress');
    await expect(page.getByText('Здесь появится график после первого текста')).toBeVisible();
  });
});
