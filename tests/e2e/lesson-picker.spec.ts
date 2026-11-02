import { expect, test } from '@playwright/test';

test.describe('lesson picker: generation outlives the page', () => {
  test('leaving Today while a round is added keeps the loader and adds exactly one round', async ({ page }) => {
    await page.goto('/?state=closed&delay=1500#/today');
    const add = page.getByRole('button', { name: 'Добавить вопросы' });
    await add.click();
    await page.getByRole('button', { name: 'Добавить', exact: true }).click();
    await expect(add).toBeDisabled();
    await page.getByRole('link', { name: 'Настройки' }).click();
    await expect(page).toHaveURL(/#\/settings/);
    await page.getByRole('link', { name: 'Сегодня' }).click();
    // Still running: the loader is shown and the button is not offered again.
    await expect(page.getByRole('status')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Добавить вопросы' })).toBeDisabled();
    // Done: the lesson is open again with the added round, and the loader is gone.
    await expect(page.getByRole('button', { name: 'Проверить ответы' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('status')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Добавить вопросы' })).toHaveCount(0);

    // Exactly one round was added: the fixture with one added round has the same number of answer fields.
    // count() does not wait, so the fixture's number is read once its fields have settled, and the result is compared with a web-first assertion.
    const fields = page.getByRole('textbox');
    await page.goto('/?state=open-round#/today');
    await expect(page.getByRole('button', { name: 'Проверить ответы' })).toBeVisible();
    await expect(fields.first()).toBeVisible();
    let expected = -1;
    await expect.poll(async () => {
      const n = await fields.count();
      const settled = n === expected;
      expected = n;
      return settled;
    }, { intervals: [300] }).toBe(true);
    await page.goto('/?state=closed&delay=1500#/today');
    await page.getByRole('button', { name: 'Добавить вопросы' }).click();
    await page.getByRole('button', { name: 'Добавить', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Проверить ответы' })).toBeVisible({ timeout: 30_000 });
    await expect(fields).toHaveCount(expected);
  });
});

test.describe('lesson picker: before a lesson', () => {
  test('shows the rows with the defaults ticked', async ({ page }) => {
    await page.goto('/?state=no_session#/today');
    await expect(page.getByRole('checkbox', { name: 'Правописание', exact: true })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Говорение', exact: true })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Задание: найти ошибки' })).not.toBeChecked();
    const gap = page.getByRole('checkbox', { name: 'Задание: вставить пропуск' });
    const fix = page.getByRole('checkbox', { name: 'Задание: исправить предложение' });
    // The programme's format for today: exactly one of gap and fix.
    await expect.poll(async () => [await gap.isChecked(), await fix.isChecked()].filter(Boolean).length).toBe(1);
  });

  test('unticking speaking gives a lesson without a speaking block', async ({ page }) => {
    await page.goto('/?state=no_session#/today');
    await page.getByRole('checkbox', { name: 'Говорение', exact: true }).uncheck();
    await page.getByRole('button', { name: 'Начать сессию' }).click();
    await expect(page.getByRole('button', { name: 'Проверить ответы' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /Говорение/ })).toHaveCount(0);
  });

  test('ticking find-the-errors as well gives two task blocks', async ({ page }) => {
    await page.goto('/?state=no_session#/today');
    await page.getByRole('checkbox', { name: 'Задание: найти ошибки' }).check();
    await page.getByRole('button', { name: 'Начать сессию' }).click();
    await expect(page.getByRole('button', { name: 'Проверить ответы' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /Найдите ошибки/ })).toHaveCount(1);
    await expect(page.getByRole('heading', { name: /Задание дня/ })).toHaveCount(1);
  });

  test('the light day toggle clears the task ticks, and switching it off restores them', async ({ page }) => {
    await page.goto('/?state=no_session#/today');
    const gap = page.getByRole('checkbox', { name: 'Задание: вставить пропуск' });
    const fix = page.getByRole('checkbox', { name: 'Задание: исправить предложение' });
    const ticked = async () => [await gap.isChecked(), await fix.isChecked()].filter(Boolean).length;
    await expect.poll(ticked).toBe(1);
    const defaultGap = await gap.isChecked();
    await page.getByRole('button', { name: 'Лёгкий день' }).click();
    await expect.poll(ticked).toBe(0);
    await expect(page.getByRole('checkbox', { name: 'Правописание', exact: true })).toBeChecked();
    // A task can still be ticked on a light day.
    await gap.check();
    await expect.poll(ticked).toBe(1);
    await page.getByRole('button', { name: 'Лёгкий день' }).click();
    await expect(gap).toBeChecked({ checked: defaultGap });
    await expect(fix).toBeChecked({ checked: !defaultGap });
  });

  test('unticking all rows disables Start session', async ({ page }) => {
    await page.goto('/?state=no_session#/today');
    const start = page.getByRole('button', { name: 'Начать сессию' });
    await expect(start).toBeEnabled();
    for (const box of await page.getByRole('checkbox').all()) {
      if (await box.isChecked()) await box.uncheck();
    }
    await expect(start).toBeDisabled();
  });

  test('a rest day ticks only review (if shown) and spelling', async ({ page }) => {
    await page.goto('/?state=rest#/today');
    await expect(page.getByRole('checkbox', { name: 'Правописание', exact: true })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Говорение', exact: true })).not.toBeChecked();
    for (const box of await page.getByRole('checkbox', { name: /^Задание:/ }).all()) await expect(box).not.toBeChecked();
    await expect(page.getByRole('button', { name: 'Начать лёгкий день' })).toBeEnabled();
  });
});

test.describe('lesson picker: added round', () => {
  test('pressing Добавить вопросы shows the format rows with the defaults ticked and an Add button', async ({ page }) => {
    await page.goto('/?state=closed#/today');
    await page.getByRole('button', { name: 'Добавить вопросы' }).click();
    const gap = page.getByRole('checkbox', { name: 'Задание: вставить пропуск' });
    const fix = page.getByRole('checkbox', { name: 'Задание: исправить предложение' });
    const spot = page.getByRole('checkbox', { name: 'Задание: найти ошибки' });
    await expect(gap).toBeVisible();
    await expect(fix).toBeVisible();
    await expect(spot).toBeVisible();
    await expect(spot).not.toBeChecked();
    // The programme's format for today: exactly one of gap and fix.
    await expect.poll(async () => [await gap.isChecked(), await fix.isChecked()].filter(Boolean).length).toBe(1);
    await expect(page.getByRole('button', { name: 'Добавить', exact: true })).toBeEnabled();
  });

  test('ticking find-the-errors as well adds a round with a spot block', async ({ page }) => {
    await page.goto('/?state=closed#/today');
    await page.getByRole('button', { name: 'Добавить вопросы' }).click();
    await page.getByRole('checkbox', { name: 'Задание: найти ошибки' }).check();
    await page.getByRole('button', { name: 'Добавить', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Проверить ответы' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Выделите ошибку в тексте и нажмите «Исправить».')).toHaveCount(1);
  });

  test('unticking every row disables Добавить', async ({ page }) => {
    await page.goto('/?state=closed#/today');
    await page.getByRole('button', { name: 'Добавить вопросы' }).click();
    const add = page.getByRole('button', { name: 'Добавить', exact: true });
    await expect(add).toBeEnabled();
    for (const box of await page.getByRole('checkbox').all()) {
      if (await box.isChecked()) await box.uncheck();
    }
    await expect(add).toBeDisabled();
  });

  test('pressing Добавить вопросы again closes the panel', async ({ page }) => {
    await page.goto('/?state=closed#/today');
    const add = page.getByRole('button', { name: 'Добавить вопросы' });
    await add.click();
    await expect(page.getByRole('checkbox', { name: 'Задание: вставить пропуск' })).toBeVisible();
    await add.click();
    await expect(page.getByRole('checkbox', { name: 'Задание: вставить пропуск' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Добавить', exact: true })).toHaveCount(0);
  });
});

test.describe('lesson picker: retry of an added round', () => {
  test('retrying after leaving Today sends the defaults, not an empty choice', async ({ page }) => {
    await page.goto('/?state=closed&fail=timeout#/today');
    await page.getByRole('button', { name: 'Добавить вопросы' }).click();
    await page.getByRole('button', { name: 'Добавить', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Preview failure: timeout', { timeout: 15_000 });
    await page.getByRole('link', { name: 'Настройки' }).click();
    await expect(page).toHaveURL(/#\/settings/);
    await page.getByRole('link', { name: 'Сегодня' }).click();
    // The formats of the failed round are gone with the page: Retry must still send the defaults.
    await page.getByRole('button', { name: 'Повторить' }).click();
    await expect(page.getByRole('alert')).toContainText('Preview failure: timeout', { timeout: 15_000 });
    await expect(page.getByRole('alert')).not.toContainText('Choose at least one task');
  });
});
