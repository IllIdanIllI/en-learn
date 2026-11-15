import { expect, test, type Page } from '@playwright/test';

const PROMPT = 'Some people think that working from home is better than working in an office.';

/** 60+ words with "goes" and "are" (the preview grader's errors) and the two phrases it counts as strong. */
const TEXT = 'Working from home gives people more freedom because nobody wastes time on a long commute every morning. '
  + 'My brother goes to the office by bus and he says the trip makes him tired before the day even starts. '
  + 'Many companies are happy to let staff choose where they work, and the vast majority of workers like it. '
  + 'On the other hand, some people miss their colleagues and the daily talk in the kitchen.';

const finish = (page: Page) => page.getByRole('button', { name: 'Завершить урок' }).click();
const editor = (page: Page) => page.getByRole('textbox', { name: 'Ваш текст' });

async function expectEvaluated(page: Page, scope: ReturnType<Page['locator']>) {
  const evaluation = scope.getByTestId('writing-evaluation');
  await expect(evaluation).toContainText('Примерная оценка IELTS: 6.0');
  await expect(evaluation).toContainText('Ответ на задание');
  await expect(evaluation).toContainText('5.5');
  await expect(evaluation).toContainText('Оценка приблизительная');
  await expect(scope.getByTestId('writing-kinds')).toHaveText('Грамматика 2');
  await expect(scope.locator('[data-strength]')).toHaveText(['the vast majority', 'On the other hand']);
  await expect(scope.locator('li', { hasText: 'My brother goes to the office' })).toContainText('Грамматика');
  const strengths = scope.getByTestId('writing-strengths');
  await expect(strengths).toContainText('Сильные места');
  await expect(strengths).toContainText('«the vast majority»');
  await expect(strengths).toContainText('Точное устойчивое сочетание.');
  // Error list comes before the strong parts list.
  const errorList = await scope.locator('ol').first().boundingBox();
  const strengthBox = await strengths.boundingBox();
  expect(strengthBox!.y).toBeGreaterThan(errorList!.y);
}

test.describe('writing evaluation', () => {
  test('a checked essay shows the evaluation, counts, strong parts and type labels in Today and on the Writing page', async ({ page }) => {
    await page.goto('/?state=writing#/today');
    await editor(page).fill(TEXT);
    await finish(page);
    await expect(page.locator('[data-error]')).toHaveText(['goes', 'are']);
    await expectEvaluated(page, page.locator('main'));

    await page.getByRole('navigation').getByRole('link', { name: 'Письмо' }).click();
    await page.getByRole('button', { name: PROMPT }).click();
    await expectEvaluated(page, page.getByTestId('writing-detail'));
  });

  test('a text checked before evaluation existed shows none of it', async ({ page }) => {
    for (const hash of ['today', 'writing']) {
      await page.goto(`/?state=writing-graded-old#/${hash}`);
      if (hash === 'writing') await page.getByRole('button', { name: PROMPT }).click();
      await expect(page.locator('[data-error]')).toHaveText(['goes', 'are']);
      await expect(page.getByText('2 ош. · 3.3 на 100 слов')).toBeVisible();
      await expect(page.getByTestId('writing-evaluation')).toHaveCount(0);
      await expect(page.getByTestId('writing-kinds')).toHaveCount(0);
      await expect(page.getByTestId('writing-strengths')).toHaveCount(0);
      await expect(page.locator('[data-strength]')).toHaveCount(0);
    }
  });
});
