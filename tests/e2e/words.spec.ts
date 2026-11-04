import { expect, test, type Locator, type Page } from '@playwright/test';
import { PREVIEW_WORD_ANSWERS } from '../../src/adapters/preview/wordsSeed';

const card = (page: Page) => page.locator('[data-card-type]');
const cardType = async (page: Page) => (await card(page).getAttribute('data-card-type')) ?? '';
const next = (page: Page) => page.getByRole('button', { name: 'Дальше' });
const check = (page: Page) => card(page).getByRole('button', { name: 'Проверить' });

/** What the current card asks: the first paragraph of text (definition, sentence or Russian text), never the use card's. */
const promptOf = async (page: Page) => (await card(page).locator('p.reading').first().innerText()).trim();

const SENTENCE = 'Honestly the word fits this sentence quite well.';

/** Answers the current card, right (or wrong, except for a use card, which the fake checker always accepts), and presses Дальше. */
async function answer(page: Page, right = true) {
  const type = await cardType(page);
  const c = card(page);
  if (type === 'use') {
    await c.getByRole('textbox').fill(SENTENCE);
    await check(page).click();
  } else {
    const correct = PREVIEW_WORD_ANSWERS[await promptOf(page)];
    expect(correct, `an answer for the ${type} card is in the fixture`).toBeDefined();
    if (type === 'choice' || type === 'confusable') {
      const options = await c.getByRole('button').allInnerTexts();
      const pick = right ? correct! : options.find((o) => o.trim() !== correct)!.trim();
      await c.getByRole('button', { name: pick, exact: true }).click();
    } else if (type === 'translation') {
      await c.getByRole('textbox').fill(right ? correct! : 'Totally wrong answer here.');
      await check(page).click();
      if (!right) await c.getByRole('button', { name: 'Я ошибся(лась)' }).click();
    } else {
      await c.getByRole('textbox').fill(right ? correct! : 'qqqqqqqqqq');
      await check(page).click();
    }
  }
  await next(page).click();
}

/** Answers cards right until one of the type shows (the fixture's seeded random puts every type in the first practice). */
async function advanceTo(page: Page, type: string) {
  for (let i = 0; i < 12; i++) {
    await card(page).waitFor();
    if ((await cardType(page)) === type) return;
    await answer(page);
  }
  throw new Error(`no ${type} card met`);
}

const openPractice = async (page: Page, state = 'words') => {
  await page.goto(`/?state=${state}#/words/practice`);
  await card(page).waitFor();
};

const row = (page: Page, word: string): Locator => page.getByRole('row').filter({ has: page.getByRole('button', { name: word, exact: true }) });

const CARDS = [
  '### a very long-lasting thing (долговечный)',
  '**Word:** durable',
  '**Example:** Durable boots last for years.',
  '',
  '### clear and easy to understand (ясный)',
  '**Word:** lucid',
  '',
  '### honest and direct',
  '**Word:** resilient',
  '',
  '### a card with no word field',
].join('\n');

test.describe('words page', () => {
  test('import preview counts new, existing and broken cards; importing adds rows that become ready', async ({ page }) => {
    await page.goto('/?state=words#/words');
    await page.getByRole('button', { name: 'Импорт' }).click();
    await page.getByLabel('Вставьте карточки из Obsidian').fill(CARDS);
    await expect(page.getByText('Найдено 3 · 1 уже есть · 1 проблем')).toBeVisible();
    await expect(page.getByText('карточка 4: нет Word')).toBeVisible();
    await page.getByRole('button', { name: 'Импортировать 2 слов' }).click();
    await expect(row(page, 'durable')).toBeVisible();
    await expect(row(page, 'lucid')).toBeVisible();
    // The fake generator finishes both: only the seeded failed word still says its exercises are missing.
    await expect(page.getByText('Создаю упражнения…')).toHaveCount(0);
    await expect(page.getByText('Упражнения не созданы')).toHaveCount(1);
    await page.getByRole('link', { name: 'Начать практику' }).click();
    await expect(page.getByText('1 / 9')).toBeVisible();
  });

  test('add a word; a duplicate is refused', async ({ page }) => {
    await page.goto('/?state=words#/words');
    await page.getByRole('button', { name: 'Добавить слово' }).click();
    const word = page.getByLabel('Слово', { exact: true });
    await word.fill('lucid');
    await page.getByRole('button', { name: 'Сохранить' }).click();
    await expect(row(page, 'lucid')).toBeVisible();
    await expect(page.getByText('Создаю упражнения…')).toHaveCount(0);
    await word.fill('LUCID');
    await page.getByRole('button', { name: 'Сохранить' }).click();
    await expect(page.getByRole('alert')).toHaveText('Такое слово уже есть');
    await expect(page.getByRole('button', { name: 'lucid', exact: true })).toHaveCount(1);
  });

  test('a failed word shows Retry and is not practised', async ({ page }) => {
    await page.goto('/?state=words#/words');
    const failed = row(page, 'obscure');
    await expect(failed).toContainText('Упражнения не созданы');
    await expect(failed.getByRole('button', { name: 'Повторить' })).toBeVisible();
    await page.getByRole('link', { name: 'Начать практику' }).click();
    // Seven ready words are due or new; the failed one is not among them.
    await expect(page.getByText('1 / 7')).toBeVisible();
  });
});

test.describe('practice', () => {
  test('answers every card type it meets, one by one, up to the end screen', async ({ page }) => {
    await openPractice(page);
    const seen: string[] = [];
    for (let i = 0; i < 7; i++) {
      await card(page).waitFor();
      await expect(page.getByText(`${i + 1} / 7`)).toBeVisible();
      seen.push(await cardType(page));
      await answer(page);
    }
    await expect(page.getByTestId('practice-end')).toContainText('Готово: 7 из 7');
    for (const type of ['choice', 'anagram', 'gap_hint', 'translation', 'use']) expect(seen).toContain(type);
  });

  test('a new word starts with the choice card: tapping the right option shows the word', async ({ page }) => {
    await openPractice(page);
    await advanceTo(page, 'choice');
    await card(page).getByRole('button', { name: 'ephemeral', exact: true }).click();
    await expect(page.getByText('Верно')).toBeVisible();
    await expect(next(page)).toBeVisible();
  });

  test('Almost, then retry: a one-letter slip gets one more try', async ({ page }) => {
    await openPractice(page);
    await advanceTo(page, 'anagram');
    const word = PREVIEW_WORD_ANSWERS[await promptOf(page)]!;
    const input = card(page).getByRole('textbox');
    await input.fill(`${word.slice(0, -1)}${word.endsWith('x') ? 'z' : 'x'}`);
    await check(page).click();
    await expect(page.getByText('Почти: одна буква не та. Попробуйте ещё раз.')).toBeVisible();
    await expect(next(page)).toHaveCount(0);
    await input.fill(word);
    await check(page).click();
    await expect(page.getByText('Верно')).toBeVisible();
    await expect(next(page)).toBeVisible();
  });

  test('translation: a different wording is self-marked after the accepted answers are shown', async ({ page }) => {
    await openPractice(page);
    await advanceTo(page, 'translation');
    const accepted = PREVIEW_WORD_ANSWERS[await promptOf(page)]!;
    await card(page).getByRole('textbox').fill('My own different wording.');
    await check(page).click();
    await expect(page.getByText(`Допустимые ответы: ${accepted}`)).toBeVisible();
    await card(page).getByRole('button', { name: 'Я ответил(а) верно' }).click();
    await expect(page.getByText('Верно')).toBeVisible();
    await expect(next(page)).toBeVisible();
  });

  test('use it: Skip replaces the card with a translation card', async ({ page }) => {
    await openPractice(page);
    await advanceTo(page, 'use');
    const position = await page.locator('header span.tabular').innerText();
    await card(page).getByRole('button', { name: 'Пропустить' }).click();
    await expect(card(page)).toHaveAttribute('data-card-type', 'translation');
    await expect(page.locator('header span.tabular')).toHaveText(position);
  });

  test('use it: Check shows the word note and the error', async ({ page }) => {
    await openPractice(page);
    await advanceTo(page, 'use');
    await card(page).getByRole('textbox').fill(SENTENCE);
    await check(page).click();
    await expect(page.getByText('Слово употреблено верно.')).toBeVisible();
    await expect(page.getByText('Пример замечания в режиме предпросмотра.')).toBeVisible();
    await expect(page.getByText('Ваш ответ: ' + SENTENCE)).toBeVisible();
    await expect(next(page)).toBeVisible();
  });

  test('end screen lists the words that moved up and down; a wrong answer is repeated at the end', async ({ page }) => {
    await openPractice(page);
    await answer(page, false); // the Learned word: down a stage
    await expect(page.getByText('2 / 8')).toBeVisible();
    for (let i = 1; i < 8; i++) await answer(page);
    const end = page.getByTestId('practice-end');
    await expect(end).toContainText('Готово: 6 из 7');
    await expect(end.locator('section', { hasText: 'Повысились' })).toContainText('ubiquitous → Вспоминание');
    await expect(end.locator('section', { hasText: 'Повысились' })).toContainText('tenacious → Вспоминание');
    await expect(end.locator('section', { hasText: 'Понизились' })).toContainText('resilient → Употребление');
    await expect(end.getByRole('link', { name: 'К словам' })).toBeVisible();
    await expect(end.getByRole('button', { name: /Продолжить/ })).toHaveCount(0);
  });

  test('ending early offers Continue, which starts a practice with the cards left', async ({ page }) => {
    await openPractice(page);
    await answer(page);
    await page.getByRole('button', { name: 'Закончить' }).click();
    const end = page.getByTestId('practice-end');
    await expect(end).toContainText('Готово: 1 из 1');
    await end.getByRole('button', { name: 'Продолжить · ещё 20' }).click();
    await expect(page.getByText('1 / 6')).toBeVisible();
  });

  test('words-done: nothing is due, so practice says All done with the next date', async ({ page }) => {
    await page.goto('/?state=words-done#/words/practice');
    await expect(page.getByText(/^На сегодня всё\. Следующее повторение: \d{4}-\d{2}-\d{2}$/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'К словам' })).toBeVisible();
    await expect(card(page)).toHaveCount(0);
  });
});

test.describe('around the lessons', () => {
  test('Today shows the Words link, which opens the Words page', async ({ page }) => {
    await page.goto('/?state=words#/today');
    await page.getByRole('link', { name: 'Слова: 7 к практике → Практика' }).click();
    await expect(page.getByRole('heading', { name: 'Слова' })).toBeVisible();
    await expect(page.getByText('К повторению сегодня: 6')).toBeVisible();
  });

  test('the error bank shows a Words error after Check', async ({ page }) => {
    await openPractice(page);
    await advanceTo(page, 'use');
    await card(page).getByRole('textbox').fill(SENTENCE);
    await check(page).click();
    await expect(next(page)).toBeVisible();
    await page.getByRole('navigation').getByRole('link', { name: 'Банк ошибок' }).click();
    const bank = page.getByRole('row').filter({ hasText: 'Honestly' });
    await expect(bank).toContainText('Слова');
  });
});
