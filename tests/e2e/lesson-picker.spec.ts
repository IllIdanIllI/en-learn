import { expect, test, type Page } from '@playwright/test';

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

const card = (page: Page, name: string) => page.getByRole('button', { name, exact: false }).filter({ has: page.getByText(name, { exact: true }) });
const openSetup = async (page: Page) => {
  await page.getByRole('button', { name: 'Настроить урок' }).click();
};

test.describe('lesson picker: before a lesson', () => {
  test('the cards are hidden until the gear is pressed', async ({ page }) => {
    await page.goto('/?state=no_session#/today');
    const gear = page.getByRole('button', { name: 'Настроить урок' });
    await expect(gear).toHaveAttribute('aria-expanded', 'false');
    await expect(card(page, 'Правописание')).toHaveCount(0);
    await gear.click();
    await expect(gear).toHaveAttribute('aria-expanded', 'true');
    await expect(card(page, 'Правописание')).toBeVisible();
    await gear.click();
    await expect(card(page, 'Правописание')).toHaveCount(0);
  });

  test('shows the cards with the defaults pressed', async ({ page }) => {
    await page.goto('/?state=no_session#/today');
    await openSetup(page);
    await expect(card(page, 'Правописание')).toHaveAttribute('aria-pressed', 'true');
    await expect(card(page, 'Говорение')).toHaveAttribute('aria-pressed', 'true');
    await expect(card(page, 'Найти ошибки')).toHaveAttribute('aria-pressed', 'false');
    await expect(card(page, 'Письмо')).toHaveAttribute('aria-pressed', 'false');
    const gap = card(page, 'Вставить пропуск');
    const fix = card(page, 'Исправить предложение');
    // The programme's format for today: exactly one of gap and fix.
    await expect.poll(async () => [await gap.getAttribute('aria-pressed'), await fix.getAttribute('aria-pressed')].filter((v) => v === 'true').length).toBe(1);
  });

  test('a card that is unavailable is disabled and shows its reason', async ({ page }) => {
    await page.goto('/?state=no_session#/today');
    await openSetup(page);
    const rewrite = card(page, 'Переписать');
    await expect(rewrite).toBeDisabled();
    await expect(rewrite).toContainText('нет текста');
  });

  test('pressing speaking off gives a lesson without a speaking block', async ({ page }) => {
    await page.goto('/?state=no_session#/today');
    await openSetup(page);
    await card(page, 'Говорение').click();
    await page.getByRole('button', { name: 'Начать сессию' }).click();
    await expect(page.getByRole('button', { name: 'Проверить ответы' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /Говорение/ })).toHaveCount(0);
  });

  test('pressing find-the-errors as well gives two task blocks', async ({ page }) => {
    await page.goto('/?state=no_session#/today');
    await openSetup(page);
    await card(page, 'Найти ошибки').click();
    await page.getByRole('button', { name: 'Начать сессию' }).click();
    await expect(page.getByRole('button', { name: 'Проверить ответы' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /Найдите ошибки/ })).toHaveCount(1);
    await expect(page.getByRole('heading', { name: /Задание дня/ })).toHaveCount(1);
  });

  test('pressing writing gives a lesson with a writing block', async ({ page }) => {
    await page.goto('/?state=no_session#/today');
    await openSetup(page);
    await card(page, 'Письмо').click();
    await page.getByRole('button', { name: 'Начать сессию' }).click();
    await expect(page.getByRole('button', { name: 'Проверить ответы' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('textbox', { name: 'Ваш текст' })).toHaveCount(1);
  });

  test('the light day toggle clears the task and writing cards, and switching it off restores them', async ({ page }) => {
    await page.goto('/?state=no_session#/today');
    await openSetup(page);
    const gap = card(page, 'Вставить пропуск');
    const fix = card(page, 'Исправить предложение');
    const writing = card(page, 'Письмо');
    const pressed = async () => [await gap.getAttribute('aria-pressed'), await fix.getAttribute('aria-pressed')].filter((v) => v === 'true').length;
    await expect.poll(pressed).toBe(1);
    const defaultGap = (await gap.getAttribute('aria-pressed')) === 'true';
    await writing.click();
    await expect(writing).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Лёгкий день', exact: true }).click();
    await expect.poll(pressed).toBe(0);
    await expect(writing).toHaveAttribute('aria-pressed', 'false');
    await expect(card(page, 'Правописание')).toHaveAttribute('aria-pressed', 'true');
    // Writing and rewrite are not available on a light day.
    await expect(writing).toBeDisabled();
    await expect(writing).toContainText('не в лёгкий день');
    await expect(card(page, 'Переписать')).toBeDisabled();
    await expect(card(page, 'Переписать')).toContainText('не в лёгкий день');
    // A task can still be pressed on a light day.
    await gap.click();
    await expect.poll(pressed).toBe(1);
    await page.getByRole('button', { name: 'Лёгкий день', exact: true }).click();
    await expect(gap).toHaveAttribute('aria-pressed', String(defaultGap));
    await expect(fix).toHaveAttribute('aria-pressed', String(!defaultGap));
    await expect(writing).toBeEnabled();
  });

  test('a rest day has the same controls as a normal day: Start session, the gear and an unpressed light toggle', async ({ page }) => {
    await page.goto('/?state=rest#/today');
    await expect(page.getByRole('button', { name: 'Начать сессию' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Лёгкий день', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await openSetup(page);
    await expect(card(page, 'Письмо')).toBeEnabled();
    await expect(card(page, 'Письмо')).not.toContainText('не в лёгкий день');
    await page.getByRole('button', { name: 'Лёгкий день', exact: true }).click();
    await expect(card(page, 'Письмо')).toBeDisabled();
    await expect(card(page, 'Письмо')).toContainText('не в лёгкий день');
  });

  test('pressing Start session closes the set-up panel', async ({ page }) => {
    await page.goto('/?state=no_session&delay=1500#/today');
    await openSetup(page);
    await expect(card(page, 'Правописание')).toBeVisible();
    await page.getByRole('button', { name: 'Начать сессию' }).click();
    await expect(page.getByRole('button', { name: 'Настроить урок' })).toHaveAttribute('aria-expanded', 'false');
    await expect(card(page, 'Правописание')).toHaveCount(0);
  });

  test('pressing every card off disables Start session', async ({ page }) => {
    await page.goto('/?state=no_session#/today');
    await openSetup(page);
    const start = page.getByRole('button', { name: 'Начать сессию' });
    await expect(start).toBeEnabled();
    while ((await page.getByRole('button', { pressed: true }).count()) > 0) await page.getByRole('button', { pressed: true }).first().click();
    await expect(start).toBeDisabled();
  });

  test('a rest day presses only review (if shown) and spelling', async ({ page }) => {
    await page.goto('/?state=rest#/today');
    await openSetup(page);
    await expect(card(page, 'Правописание')).toHaveAttribute('aria-pressed', 'true');
    await expect(card(page, 'Говорение')).toHaveAttribute('aria-pressed', 'false');
    for (const name of ['Вставить пропуск', 'Исправить предложение', 'Найти ошибки', 'Письмо']) await expect(card(page, name)).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('button', { name: 'Начать сессию' })).toBeEnabled();
  });

  test('the pointer cursor shows on the cards and the gear, not-allowed on a disabled card', async ({ page }) => {
    await page.goto('/?state=no_session#/today');
    const gear = page.getByRole('button', { name: 'Настроить урок' });
    await expect(gear).toHaveCSS('cursor', 'pointer');
    await gear.click();
    await expect(card(page, 'Правописание')).toHaveCSS('cursor', 'pointer');
    await expect(card(page, 'Переписать')).toHaveCSS('cursor', 'not-allowed');
  });
});

test.describe('lesson picker: added round', () => {
  test('pressing Добавить вопросы shows four cards with the defaults pressed and an Add button', async ({ page }) => {
    await page.goto('/?state=closed#/today');
    await page.getByRole('button', { name: 'Добавить вопросы' }).click();
    const gap = card(page, 'Вставить пропуск');
    const fix = card(page, 'Исправить предложение');
    const spot = card(page, 'Найти ошибки');
    await expect(gap).toBeVisible();
    await expect(fix).toBeVisible();
    await expect(spot).toBeVisible();
    await expect(card(page, 'Письмо')).toBeVisible();
    await expect(spot).toHaveAttribute('aria-pressed', 'false');
    await expect(card(page, 'Письмо')).toHaveAttribute('aria-pressed', 'false');
    // The programme's format for today: exactly one of gap and fix.
    await expect.poll(async () => [await gap.getAttribute('aria-pressed'), await fix.getAttribute('aria-pressed')].filter((v) => v === 'true').length).toBe(1);
    await expect(page.getByRole('button', { name: 'Добавить', exact: true })).toBeEnabled();
  });

  test('pressing find-the-errors as well adds a round with a spot block', async ({ page }) => {
    await page.goto('/?state=closed#/today');
    await page.getByRole('button', { name: 'Добавить вопросы' }).click();
    await card(page, 'Найти ошибки').click();
    await page.getByRole('button', { name: 'Добавить', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Проверить ответы' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Выделите ошибку в тексте и нажмите «Исправить».')).toHaveCount(1);
  });

  test('pressing writing adds a round with a writing block', async ({ page }) => {
    await page.goto('/?state=closed#/today');
    await page.getByRole('button', { name: 'Добавить вопросы' }).click();
    await card(page, 'Письмо').click();
    await page.getByRole('button', { name: 'Добавить', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Проверить ответы' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('textbox', { name: 'Ваш текст' })).toHaveCount(1);
  });

  test('pressing every card off disables Добавить', async ({ page }) => {
    await page.goto('/?state=closed#/today');
    await page.getByRole('button', { name: 'Добавить вопросы' }).click();
    const add = page.getByRole('button', { name: 'Добавить', exact: true });
    await expect(add).toBeEnabled();
    while ((await page.getByRole('button', { pressed: true }).count()) > 0) await page.getByRole('button', { pressed: true }).first().click();
    await expect(add).toBeDisabled();
  });

  test('pressing Добавить вопросы again closes the panel', async ({ page }) => {
    await page.goto('/?state=closed#/today');
    const add = page.getByRole('button', { name: 'Добавить вопросы' });
    await add.click();
    await expect(card(page, 'Вставить пропуск')).toBeVisible();
    await add.click();
    await expect(card(page, 'Вставить пропуск')).toHaveCount(0);
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
