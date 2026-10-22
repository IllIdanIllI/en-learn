import { expect, test, type Page } from '@playwright/test';

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

for (const state of ['empty', 'no_session', 'generated', 'questions', 'graded', 'rest', 'rule_missing', 'spot_rule_missing', 'prereq_missing']) {
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

test.describe('today actions', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1400 });
  });
  const teacher = (page: Page) => page.getByRole('listitem').filter({ hasText: 'She is an teacher' });
  const elephant = (page: Page) => page.getByRole('listitem').filter({ hasText: 'I saw a elephant' });

  test('a rule chip opens a non-blocking side panel scrolled to its section', async ({ page }) => {
    await page.goto('/?state=graded#/today');
    await page.getByRole('button', { name: '§ Ловушки' }).first().click();
    const panel = page.locator('[data-slot="sheet-content"]');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('исчисляемое существительное');
    await expect(panel.getByRole('table')).toHaveCount(1);
    await expect(panel.getByRole('columnheader', { name: 'Артикль' })).toBeVisible();
    await expect(panel.getByRole('heading', { name: 'Ловушки' })).toBeInViewport();
    expect((await panel.boundingBox())?.width).toBe(420);
    // The panel is a non-modal dialog (role=dialog, aria-modal not set): no overlay, nothing inert or hidden behind it.
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(panel).not.toHaveAttribute('aria-modal', 'true');
    await expect(page.locator('[data-slot="sheet-overlay"]')).toHaveCount(0);
    await expect(page.getByRole('main')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/today-rule-panel.png` });
    // The page behind stays clickable and scrollable.
    await teacher(page).getByRole('button', { name: 'Невнимательность' }).click();
    await expect(teacher(page).getByRole('button', { name: 'Невнимательность', pressed: true })).toBeVisible();
    const main = page.getByRole('main');
    await main.evaluate((el) => el.scrollTo(0, 200));
    expect(await main.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    await panel.getByRole('button', { name: 'Закрыть' }).click();
    await expect(panel).toHaveCount(0);
  });

  test('the header link opens the rule before grading', async ({ page }) => {
    await page.goto('/?state=generated#/today');
    await page.getByRole('button', { name: '§ Ловушки' }).click();
    await expect(page.locator('[data-slot="sheet-content"]')).toContainText('Выбор a или an зависит от звука');
    await expect(page.getByRole('button', { name: 'Проверить ответы' })).toBeVisible();
  });

  test('a dispute opens inline, shows the reply, and dropping the item changes the block score', async ({ page }) => {
    await page.goto('/?state=graded#/today');
    await expect(page.getByText('1 из 2')).toBeVisible();
    await teacher(page).getByRole('button', { name: 'Оспорить' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const field = teacher(page).getByRole('textbox', { name: 'Ваше возражение' });
    await expect(field).toBeVisible();
    await field.fill('Артикль здесь не нужен.');
    await teacher(page).getByRole('button', { name: 'Отправить' }).click();
    await expect(teacher(page).getByText('Правило допускает только указанный вариант.')).toBeVisible();
    await expect(teacher(page).getByText('Cambridge Dictionary')).toBeVisible();
    await teacher(page).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/today-dispute.png` });
    await teacher(page).getByRole('button', { name: 'Снять задание' }).click();
    await expect(page.getByText('1 из 1')).toBeVisible();
    await expect(teacher(page).getByText('Не засчитано: задание снято')).toBeVisible();
    await expect(teacher(page).getByText('Задание снято с подсчёта.')).toBeVisible();
  });

  test('counting a disputed item as correct raises the score', async ({ page }) => {
    await page.goto('/?state=graded#/today');
    await teacher(page).getByRole('button', { name: 'Оспорить' }).click();
    await teacher(page).getByRole('textbox', { name: 'Ваше возражение' }).fill('Допустимо.');
    await teacher(page).getByRole('button', { name: 'Отправить' }).click();
    await teacher(page).getByRole('button', { name: 'Засчитать как верный' }).click();
    await expect(page.getByText('2 из 2')).toBeVisible();
  });

  test('inattention toggles on wrong items only', async ({ page }) => {
    await page.goto('/?state=graded#/today');
    const toggle = teacher(page).getByRole('button', { name: 'Невнимательность' });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('listitem').filter({ hasText: 'The sun rises' }).getByRole('button', { name: 'Невнимательность' })).toHaveCount(0);
    await expect(page.getByRole('listitem').filter({ hasText: 'The sun rises' }).getByRole('button', { name: 'Оспорить' })).toHaveCount(0);
  });

  test('a rule gap shows its proposal and Approve counts the item as correct', async ({ page }) => {
    await page.goto('/?state=graded#/today');
    await expect(elephant(page).getByText('Не засчитано: в правилах пока нет такого случая')).toBeVisible();
    await expect(elephant(page).getByText('I saw one elephant')).toBeVisible();
    await expect(page.getByText('1 из 2')).toBeVisible();
    await elephant(page).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/today-rule-gap.png` });
    await elephant(page).getByRole('button', { name: 'Принять' }).click();
    await expect(page.getByText('2 из 3')).toBeVisible();
    await expect(elephant(page).getByText('Правило обновлено.')).toBeVisible();
    await expect(elephant(page).getByRole('button', { name: 'Принять' })).toHaveCount(0);
    await page.getByRole('button', { name: '§ Ловушки' }).first().click();
    await expect(page.locator('[data-slot="sheet-content"]')).toContainText('I saw one elephant');
  });

  test('Reject leaves the rule gap item uncounted', async ({ page }) => {
    await page.goto('/?state=graded#/today');
    await elephant(page).getByRole('button', { name: 'Отклонить' }).click();
    await expect(elephant(page).getByText('Предложение отклонено.')).toBeVisible();
    await expect(page.getByText('1 из 2')).toBeVisible();
  });

  test('spelling items take a mnemonic that saves on blur', async ({ page }) => {
    await page.goto('/?state=graded#/today');
    // Every spelling item takes a mnemonic (spec 7.2), right or wrong.
    await expect(page.getByRole('textbox', { name: 'Мнемоника' })).toHaveCount(4);
    const box = page.getByRole('textbox', { name: 'Мнемоника' }).first();
    await box.fill('одна c, две s');
    await box.blur();
    await expect(page.getByText('Сохранено')).toBeVisible();
    await expect(box).toHaveValue('одна c, две s');
    await page.screenshot({ path: `${SHOTS}/today-mnemonic.png` });
  });

  test('a missing rule is drafted, edited, saved, and then the session can start', async ({ page }) => {
    await page.goto('/?state=rule_missing#/today');
    await expect(page.getByText('Нет правила для темы «Articles»')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Начать сессию' })).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/today-rule_missing.png` });
    await page.getByRole('button', { name: 'Составить правило' }).click();
    const body = page.getByRole('textbox', { name: 'Текст правила (Markdown)' });
    await expect(body).toContainText('## Формула');
    await expect(page.getByRole('heading', { name: 'Формула' })).toBeVisible();
    await body.fill('## Формула\n\na / an + существительное.\n\n## Ловушки\n\nan hour.');
    await expect(page.getByText('a / an + существительное.', { exact: true }).last()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/today-rule-draft.png` });
    await page.getByRole('button', { name: 'Сохранить правило' }).click();
    await expect(page.getByRole('button', { name: 'Начать сессию' })).toBeVisible();
  });

  test('cancelling a rule draft returns to the missing state', async ({ page }) => {
    await page.goto('/?state=rule_missing#/today');
    await page.getByRole('button', { name: 'Составить правило' }).click();
    await page.getByRole('button', { name: 'Отмена' }).click();
    await expect(page.getByRole('button', { name: 'Составить правило' })).toBeVisible();
    await expect(page.getByRole('textbox')).toHaveCount(0);
  });

  test('error-spotting topics without rules are listed under the empty state', async ({ page }) => {
    await page.goto('/?state=spot_rule_missing#/today');
    await expect(page.getByRole('button', { name: 'Начать сессию' })).toBeVisible();
    await expect(page.getByText('Third person s')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/today-spot_rule_missing.png` });
    await page.getByRole('button', { name: 'Составить правило' }).click();
    await expect(page.getByRole('textbox', { name: 'Текст правила (Markdown)' })).toBeVisible();
    await page.getByRole('button', { name: 'Сохранить правило' }).click();
    await expect(page.getByText('Third person s')).toHaveCount(0);
  });

  test('a rest day offers a light day', async ({ page }) => {
    await page.goto('/?state=rest#/today');
    await expect(page.getByRole('heading', { level: 1, name: 'День отдыха' })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/today-rest.png` });
    await page.getByRole('button', { name: 'Начать лёгкий день' }).click();
    await expect(page.getByRole('button', { name: 'Проверить ответы' })).toBeVisible({ timeout: 15_000 });
  });

  test('a generated session can be rebuilt as a light day', async ({ page }) => {
    await page.goto('/?state=generated#/today');
    const rebuild = page.getByRole('button', { name: 'Пересобрать' });
    await expect(rebuild).toBeVisible();
    const light = page.getByRole('button', { name: 'Лёгкий день' });
    await expect(light).toHaveAttribute('aria-pressed', 'false');
    await page.getByPlaceholder('Ответ').first().fill('draft');
    await light.click();
    await expect(light).toHaveAttribute('aria-pressed', 'true');
    await page.screenshot({ path: `${SHOTS}/today-rebuild.png` });
    await rebuild.click();
    await expect(page.getByPlaceholder('Ответ').first()).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Лёгкий день' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Проверить ответы' })).toBeVisible();
  });

  test('the Results heading shows the amber focus ring', async ({ page }) => {
    await page.goto('/?state=questions#/today');
    await page.getByRole('button', { name: 'Проверить ответы' }).click();
    for (const yes of await page.getByRole('radio', { name: 'Да' }).all()) await yes.click();
    await page.getByRole('button', { name: 'Проверить ответы' }).focus();
    await page.keyboard.press('Enter');
    const heading = page.getByRole('heading', { name: 'Итоги' });
    await expect(heading).toBeFocused({ timeout: 15_000 });
    expect(await heading.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
    expect(await heading.evaluate((el) => getComputedStyle(el).outlineWidth)).toBe('2px');
  });
});
