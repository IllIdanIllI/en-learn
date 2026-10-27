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

for (const state of ['empty', 'no_session', 'generated', 'questions', 'graded', 'rest', 'rule_missing', 'spot_rule_missing', 'prereq_missing', 'earlier_session', 'progress_archived', 'closed', 'open-round']) {
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

  test('generating shows the loader until the session is built, then shows it', async ({ page }) => {
    await page.goto('/?state=no_session&delay=1500#/today');
    await page.getByRole('button', { name: 'Начать сессию' }).click();
    await expect(page.getByText('Составляю задания', { exact: true })).toBeVisible();
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

  test('the action bar sticks to the bottom of a long session', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 500 });
    await page.goto('/?state=generated#/today');
    const check = page.locator('#check-answers');
    await expect(check).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('main').evaluate((m) => m.scrollTo(0, 0)).catch(() => undefined);
    const box = (await check.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(500);
  });

  test('blank and shorthand answers raise inline questions', async ({ page }) => {
    await page.goto('/?state=questions#/today');
    const inputs = page.getByPlaceholder('✓ или исправленный фрагмент');
    await inputs.nth(1).fill('~');
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

  test('buttons show a pointer cursor and disabled ones not-allowed', async ({ page }) => {
    await page.goto('/?state=generated#/today');
    const check = page.getByRole('button', { name: 'Проверить ответы' });
    await expect(check).toBeVisible();
    expect(await check.evaluate((el) => getComputedStyle(el).cursor)).toBe('pointer');
    await page.goto('/?state=no_session&delay=1500#/today');
    const start = page.getByRole('button', { name: 'Начать сессию' });
    await start.click();
    await expect(start).toBeDisabled();
    expect(await start.evaluate((el) => getComputedStyle(el).cursor)).toBe('not-allowed');
  });

  test('the ✓ button on a fix item fills its answer with ✓', async ({ page }) => {
    await page.goto('/?state=generated#/today');
    const inputs = page.getByPlaceholder('✓ или исправленный фрагмент');
    const marks = page.getByRole('button', { name: 'Отметить как верное' });
    await expect(marks).toHaveCount(await inputs.count());
    await marks.first().click();
    await expect(inputs.first()).toHaveValue('✓');
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

  test('Close lesson on the graded page leads to the closed card, which can show the results again', async ({ page }) => {
    await page.goto('/?state=graded#/today');
    await page.getByRole('button', { name: 'Закрыть урок' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Урок завершён' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Добавить вопросы' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Закрыть урок' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Показать результаты' }).click();
    await expect(page.getByRole('heading', { name: 'Итоги' })).toBeVisible();
    expect(await page.content()).toContain('a teacher');
    await expect(page.getByRole('button', { name: 'Закрыть урок' })).toHaveCount(0);
  });

  test('a closed lesson stays closed on a later visit; Add more questions opens a new round', async ({ page }) => {
    await page.goto('/?state=closed&delay=600#/today');
    await expect(page.getByRole('heading', { level: 1, name: 'Урок завершён' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Проверить ответы' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Добавить вопросы' }).click();
    await expect(page.getByText('Составляю задания', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Проверить ответы' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('My sister is an nurse')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Закрыть урок' })).toHaveCount(0);
  });

  test('an open round takes answers while the earlier blocks keep their results; grading it enables Close lesson', async ({ page }) => {
    await page.goto('/?state=open-round#/today');
    await expect(page.getByRole('button', { name: 'Проверить ответы' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Завершить урок' })).toBeVisible();
    const html = await page.content();
    expect(html).toContain('a teacher');
    for (const key of ['an honest', 'a nurse', 'an umbrella']) expect(html).not.toContain(key);
    await expect(page.getByRole('heading', { name: 'Итоги' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Закрыть урок' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Завершить урок' }).click();
    await expect(page.getByRole('button', { name: 'Закрыть урок' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Проверить ответы' })).toHaveCount(0);
    await expect(page.getByText('My sister is an nurse')).toBeVisible();
    await expect(page.getByText('Не засчитано').first()).toBeVisible();
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

  test('the sticky bar sends typed disputes in one go', async ({ page }) => {
    await page.goto('/?state=graded#/today');
    await expect(page.getByRole('button', { name: /Отправить возражения/ })).toHaveCount(0);
    await teacher(page).getByRole('button', { name: 'Оспорить' }).click();
    await teacher(page).getByRole('textbox', { name: 'Ваше возражение' }).fill('Допустимо.');
    await page.getByRole('button', { name: 'Отправить возражения (1)' }).click();
    await expect(teacher(page).getByText('Правило допускает только указанный вариант.')).toBeVisible();
    await expect(page.getByRole('button', { name: /Отправить возражения/ })).toHaveCount(0);
  });

  test('a spot error counts in the sticky bar and its saved dispute is kept after sending', async ({ page }) => {
    await page.goto('/?state=graded#/today');
    const spotError = page.getByRole('listitem').filter({ hasText: '→' }).filter({ has: page.getByRole('button', { name: 'Оспорить' }) }).first();
    await spotError.getByRole('button', { name: 'Оспорить' }).click();
    await spotError.getByRole('textbox', { name: 'Ваше возражение' }).fill('Здесь нет ошибки.');
    await page.getByRole('button', { name: 'Отправить возражения (1)' }).click();
    await expect(page.getByRole('button', { name: /Отправить возражения/ })).toHaveCount(0);
    await expect(page.getByText('Правило допускает только указанный вариант.')).toBeVisible();
    await expect(page.getByText('Здесь нет ошибки.')).toBeVisible();
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

test.describe('rules, error bank and progress', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1100 });
  });

  test('the rules list shows every rule with its version and lists topics without a rule', async ({ page }) => {
    await page.goto('/?state=spot_rule_missing#/rules');
    await expect(page.getByRole('heading', { level: 1, name: 'Правила' })).toBeVisible();
    await expect(page.getByRole('row')).toHaveCount(4);
    await expect(page.getByRole('link', { name: 'Articles' })).toBeVisible();
    await expect(page.getByRole('row', { name: /Articles/ })).toContainText('Учить');
    await expect(page.getByRole('row', { name: /Articles/ })).toContainText('1');
    await expect(page.getByRole('heading', { name: 'Темы без правил' })).toBeVisible();
    await expect(page.getByText('Third person s')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/rules-list.png` });
  });

  test('a rule opens with its table, sources and history; Edit needs a reason and adds a version', async ({ page }) => {
    await page.goto('/?state=no_session#/rules');
    await page.getByRole('link', { name: 'Articles' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Articles' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Артикль' })).toBeVisible();
    await expect(page.getByText('Cambridge Dictionary')).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'Источники' })).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'История версий' })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/rule-view.png`, fullPage: true });

    await page.getByRole('button', { name: 'Править' }).click();
    const body = page.getByRole('textbox', { name: 'Текст правила (Markdown)' });
    await body.fill('## Формула\n\na / an + новая запись.');
    await expect(page.getByText('a / an + новая запись.', { exact: true }).last()).toBeVisible();
    await page.getByRole('button', { name: 'Сохранить правило' }).click();
    await expect(page.getByRole('alert')).toContainText('Укажите причину правки');
    await page.getByRole('textbox', { name: 'Причина правки' }).fill('Упростил формулу');
    await page.screenshot({ path: `${SHOTS}/rule-edit.png`, fullPage: true });
    await page.getByRole('button', { name: 'Сохранить правило' }).click();
    await expect(page.getByText('Правило, версия 2')).toBeVisible();
    await expect(page.getByRole('row', { name: /Упростил формулу/ })).toBeVisible();

    await page.getByRole('row', { name: /seed/ }).getByRole('button', { name: 'Показать' }).click();
    await expect(page.getByText('Правило, версия 1')).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Артикль' })).toBeVisible();
    await page.getByRole('button', { name: 'К текущей версии' }).click();
    await expect(page.getByText('a / an + новая запись.', { exact: true })).toBeVisible();
  });

  test('a topic without a rule is drafted from the rules list and saved only on confirm', async ({ page }) => {
    await page.goto('/?state=rule_missing#/rules');
    await expect(page.getByRole('link', { name: 'Articles' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Составить правило' }).click();
    await expect(page.getByRole('textbox', { name: 'Текст правила (Markdown)' })).toContainText('## Формула');
    await page.screenshot({ path: `${SHOTS}/rule-draft.png`, fullPage: true });
    await page.getByRole('button', { name: 'Отмена' }).click();
    await expect(page.getByRole('link', { name: 'Articles' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Составить правило' }).click();
    await page.getByRole('button', { name: 'Сохранить правило' }).click();
    await expect(page.getByRole('link', { name: 'Articles' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Темы без правил' })).toHaveCount(0);
  });

  test('the error bank lists mistakes newest first and filters by kind and topic', async ({ page }) => {
    await page.goto('/?state=progress#/errors');
    await expect(page.getByRole('heading', { level: 1, name: 'Банк ошибок' })).toBeVisible();
    const rows = page.locator('tbody tr');
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThan(3);
    await expect(rows.first().locator('td').nth(0)).toHaveClass(/answer/);
    const dates = await rows.locator('td:nth-child(5)').allTextContents();
    expect(dates).toEqual([...dates].sort().reverse());
    expect(await page.content()).not.toMatch(/streak/i);
    await page.screenshot({ path: `${SHOTS}/errors.png`, fullPage: true });

    const all = await rows.count();
    await page.getByLabel('Тип ошибки').selectOption('spelling');
    await expect(rows).toHaveCount(all - 1);
    for (const kind of await rows.locator('td:nth-child(3)').allTextContents()) expect(kind).toBe('Орфография');
    await page.getByLabel('Тип ошибки').selectOption('');
    await page.getByLabel('Тема', { exact: true }).selectOption({ label: 'Articles' });
    await expect(rows).toHaveCount(1);
    for (const topic of await rows.locator('td:nth-child(4)').allTextContents()) expect(topic).toBe('Articles');
  });

  test('the error bank explains an empty bank in one sentence', async ({ page }) => {
    await page.goto('/?state=no_session#/errors');
    await expect(page.getByText('Ошибок пока нет')).toBeVisible();
    await expect(page.locator('table')).toHaveCount(0);
  });

  test('progress shows the consistency grid, open topics and the session log', async ({ page }) => {
    await page.goto('/?state=progress#/progress');
    await expect(page.getByRole('heading', { level: 1, name: 'Прогресс' })).toBeVisible();
    await expect(page.getByText('Дней с занятиями: 6 из 10. Лёгких: 1.')).toBeVisible();
    await expect(page.locator('[data-testid="day-cell"]')).toHaveCount(100);
    await expect(page.locator('[data-testid="day-cell"][data-state="practised"]')).toHaveCount(5);
    await expect(page.locator('[data-testid="day-cell"][data-state="light"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="day-cell"][title="2026-10-18: лёгкий день"]')).toHaveCount(1);
    await expect(page.getByRole('img', { name: 'Дней с занятиями: 6 из 10. Лёгких: 1.' })).toBeVisible();
    await expect(page.locator('[data-testid="day-cell"][aria-hidden="true"]')).toHaveCount(100);
    const text = (await page.locator('body').innerText()) + (await page.content());
    expect(text).not.toMatch(/streak|flame/i);

    const topics = page.getByRole('table', { name: 'Темы' });
    await expect(topics.getByText('Открыта').first()).toBeVisible();
    await page.getByRole('table', { name: 'Журнал занятий' }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('table', { name: 'Журнал занятий' }).locator('tbody tr')).toHaveCount(6);
    await expect(page.getByText('Лёгкий день').first()).toBeVisible();
    await expect(page.getByText(/\$0\.\d{4}/).first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/progress.png`, fullPage: true });

    await expect(page.getByRole('table', { name: 'Журнал занятий' })).toContainText(/Повторение[^·]* 2 из 4/);
    await topics.getByRole('link', { name: 'Правило: Articles' }).click();
    await expect(page).toHaveURL(/#\/rules\/\d+$/);
  });

  test('progress in English', async ({ page }) => {
    await page.goto('/?state=progress#/settings');
    await page.getByRole('radio', { name: 'English' }).click();
    await page.getByRole('link', { name: 'Progress' }).click();
    await expect(page.getByText('Practised 6 of the last 10 days, 1 light')).toBeVisible();
  });
});

test.describe('answers, earlier sessions, errors and fallbacks', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1400 });
  });

  test('typed answers survive a visit to another page', async ({ page }) => {
    await page.goto('/?state=generated#/today');
    const first = page.getByPlaceholder('Ответ').first();
    await first.fill('necessary');
    await page.getByRole('link', { name: 'Прогресс' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Прогресс' })).toBeVisible();
    await page.getByRole('link', { name: 'Сегодня' }).click();
    await expect(page.getByPlaceholder('Ответ').first()).toHaveValue('necessary');
  });

  test('rebuilding a generated session shows the loader under its header', async ({ page }) => {
    await page.goto('/?state=generated&delay=1500#/today');
    const rebuild = page.getByRole('button', { name: 'Пересобрать' });
    await rebuild.click();
    await expect(page.getByText('Составляю задания', { exact: true })).toBeVisible();
    await expect(rebuild).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Проверить ответы' })).toBeVisible({ timeout: 15_000 });
  });

  test('starting today from an earlier session shows the loader below the notice', async ({ page }) => {
    await page.goto('/?state=earlier_session&delay=1500#/today');
    await page.getByRole('button', { name: 'Начать сегодняшнюю сессию' }).click();
    await expect(page.getByText('Составляю задания', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Чт 22 окт', { timeout: 15_000 });
  });

  test('an earlier ungraded session is shown with its own title and a way to start today', async ({ page }) => {
    await page.goto('/?state=earlier_session#/today');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Вт 20 окт');
    await expect(page.getByText('Эта сессия от', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Пересобрать' })).toHaveCount(0);
    await page.getByPlaceholder('Ответ').first().fill('necessary');
    await page.screenshot({ path: `${SHOTS}/today-earlier.png`, fullPage: true });
    // The window regaining focus (midnight check) keeps the session and what was typed.
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByPlaceholder('Ответ').first()).toHaveValue('necessary');
    await page.getByRole('button', { name: 'Начать сегодняшнюю сессию' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Чт 22 окт', { timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Начать сегодняшнюю сессию' })).toHaveCount(0);
  });

  test('an earlier session can be answered and graded; the feedback stays', async ({ page }) => {
    await page.goto('/?state=earlier_session#/today');
    await page.getByRole('button', { name: 'Проверить ответы' }).click();
    for (const yes of await page.getByRole('radio', { name: 'Да' }).all()) await yes.click();
    await page.getByRole('button', { name: 'Проверить ответы' }).click();
    await expect(page.getByRole('heading', { name: 'Итоги' })).toBeVisible({ timeout: 15_000 });
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('heading', { name: 'Итоги' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Начать сегодняшнюю сессию' })).toBeVisible();
  });

  test('not signed in: the message names the command and the button rechecks', async ({ page }) => {
    await page.goto('/?state=no_session&fail=not_signed_in#/today');
    await page.getByRole('button', { name: 'Начать сессию' }).click();
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Выполните `claude` в Терминале и войдите в аккаунт.');
    await expect(alert).not.toContainText('Preview failure');
    await alert.getByRole('button', { name: 'Я вошёл' }).click();
    await expect(alert).toContainText('Вход в Claude пока не выполнен.');
  });

  test('budget: the message links to Settings', async ({ page }) => {
    await page.goto('/?state=no_session&fail=budget#/today');
    await page.getByRole('button', { name: 'Начать сессию' }).click();
    await expect(page.getByRole('alert')).toContainText('Достигнут лимит бюджета на один вызов.');
    await page.getByRole('link', { name: 'Изменить в настройках' }).click();
    await expect(page.locator('#settings-budget')).toBeVisible();
  });

  test('other failures keep the message and Retry', async ({ page }) => {
    await page.goto('/?state=no_session&fail=timeout#/today');
    await page.getByRole('button', { name: 'Начать сессию' }).click();
    await expect(page.getByRole('alert')).toContainText('Сессия не собрана: Preview failure: timeout');
    await expect(page.getByRole('button', { name: 'Повторить' })).toBeVisible();
  });

  test('a failed check shows the code message too', async ({ page }) => {
    await page.goto('/?state=generated&fail=budget#/today');
    await page.getByRole('button', { name: 'Проверить ответы' }).waitFor();
    for (const box of await page.getByRole('textbox').all()) await box.fill('an');
    await page.getByRole('button', { name: 'Проверить ответы' }).click();
    await expect(page.getByRole('alert')).toContainText('Достигнут лимит бюджета на один вызов.', { timeout: 15_000 });
  });

  test('without claude only Today changes; the other pages stay usable', async ({ page }) => {
    await page.goto('/?state=prereq_missing#/today');
    await expect(page.getByRole('alert')).toContainText('Claude недоступен');
    await expect(page.getByRole('button', { name: 'Начать сессию' })).toHaveCount(0);
    await page.getByRole('link', { name: 'Открыть проверку Claude' }).click();
    await expect(page).toHaveURL(/#\/prerequisites$/);
    for (const [link, heading] of [['Правила', 'Правила'], ['Банк ошибок', 'Банк ошибок'], ['Прогресс', 'Прогресс'], ['Настройки', 'Настройки']]) {
      await page.getByRole('navigation').getByRole('link', { name: link }).click();
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    }
  });

  test('archived topics are labelled and show no next check dates', async ({ page }) => {
    await page.goto('/?state=progress_archived#/progress');
    const row = page.getByRole('table', { name: 'Темы' }).getByRole('row', { name: /Articles/ });
    await expect(row).toContainText('в архиве');
    await expect(row).not.toContainText('2026-10-23');
  });

  test('a rule body does not load remote images', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    await page.goto('/?state=no_session#/rules');
    await page.getByRole('link', { name: 'Articles' }).click();
    await page.getByRole('button', { name: 'Править' }).click();
    await page.getByRole('textbox', { name: 'Текст правила (Markdown)' }).fill('## Формула\n\ntext ![x](https://example.invalid/pixel.png)');
    await expect(page.getByText('text', { exact: false }).last()).toBeVisible();
    await expect(page.locator('main img')).toHaveCount(0);
    expect(requests.filter((u) => u.includes('example.invalid'))).toEqual([]);
  });

  test('a page that fails to render shows a calm fallback and the sidebar still works', async ({ page }) => {
    await page.route('**/src/ui/pages/Rules.tsx*', (route) =>
      route.fulfill({ contentType: 'text/javascript', body: 'export function Rules() { throw new Error("boom"); }' }),
    );
    await page.goto('/?state=no_session#/rules');
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Что-то пошло не так.');
    await expect(alert.getByRole('button', { name: 'Перезагрузить' })).toBeVisible();
    await page.getByRole('navigation').getByRole('link', { name: 'Настройки' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Настройки' })).toBeVisible();
  });

  test('a start-up failure is shown as an alert in the interface language', async ({ browser }) => {
    // Settings are unavailable at that point, so the system language decides: Russian is the app's default.
    const context = await browser.newContext({ locale: 'ru-RU' });
    const page = await context.newPage();
    await page.route('**/*.wasm', (route) => route.abort());
    await page.goto('/?state=no_session#/today');
    await expect(page.getByRole('alert')).toContainText('Приложение не запустилось.');
    await context.close();
  });
});
