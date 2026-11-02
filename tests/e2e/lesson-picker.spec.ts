import { expect, test } from '@playwright/test';

test.describe('lesson picker: generation outlives the page', () => {
  test('leaving Today while a round is added keeps the loader and adds exactly one round', async ({ page }) => {
    await page.goto('/?state=closed&delay=1500#/today');
    const add = page.getByRole('button', { name: 'Добавить вопросы' });
    await add.click();
    await expect(add).toBeDisabled();
    await page.getByRole('link', { name: 'Настройки' }).click();
    await expect(page).toHaveURL(/#\/settings/);
    await page.getByRole('link', { name: 'Сегодня' }).click();
    // Still running: the loader is shown and the button is not offered again.
    await expect(page.getByRole('status')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Добавить вопросы' })).toBeDisabled();
    // Done: the lesson is open again with the added round.
    await expect(page.getByRole('textbox').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Добавить вопросы' })).toHaveCount(0);
    const fields = await page.getByRole('textbox').count();

    // Exactly one round was added: the fixture with one added round has the same number of answer fields.
    await page.goto('/?state=open-round#/today');
    await expect(page.getByRole('textbox').first()).toBeVisible();
    await expect(page.getByRole('textbox')).toHaveCount(fields);
  });
});
