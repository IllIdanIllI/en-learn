import { expect, test } from '@playwright/test';

test('the stop button ends a running check: answers stay, the lesson stays open, no error', async ({ page }) => {
  await page.goto('/?state=generated&delay=20000#/today');
  // A task answer, not a spelling one: spelling is checked by code, a task answer needs the (slowed) LLM.
  const field = page.getByRole('region', { name: /Задание дня/ }).getByRole('textbox').first();
  await field.fill('xyzzy');
  await page.getByRole('button', { name: 'Завершить урок' }).click();

  const stop = page.getByRole('button', { name: 'Остановить проверку' });
  await expect(stop).toBeVisible();
  await expect(stop).toBeEnabled();
  expect(await stop.evaluate((el) => getComputedStyle(el).cursor)).toBe('pointer');
  await expect(page.getByRole('button', { name: 'Завершить урок' })).toBeDisabled();
  await stop.click();

  await expect(page.getByRole('button', { name: 'Проверить ответы' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Завершить урок' })).toBeEnabled();
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(field).toHaveValue('xyzzy');
  await expect(field).toBeEditable();
});
