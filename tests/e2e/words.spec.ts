import { expect, test, type Locator, type Page } from '@playwright/test';
import { LIMIT_WORD_ANSWERS, PREVIEW_WORD_ANSWERS } from '../../src/adapters/preview/wordsSeed';

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

const row = (page: Page, word: string): Locator => page.getByRole('row').filter({ has: page.getByRole('link', { name: word, exact: true }) });

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
    await expect(page.getByRole('link', { name: 'lucid', exact: true })).toHaveCount(1);
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

test.describe('summary and +10 new words', () => {
  const addNew = (page: Page) => page.getByRole('button', { name: '+10 новых слов' });

  test('the header shows in progress, learned and total, failed word included', async ({ page }) => {
    await page.goto('/?state=words#/words');
    // Seed: six reviewed words, one of them Learned (stage 4), eight words in all.
    await expect(page.getByText('В процессе: 5 · Выучено: 1 · Всего: 8')).toBeVisible();
    await expect(page.getByText(/Начато/)).toHaveCount(0);
    await expect(addNew(page)).toHaveCount(0);
  });

  test('Details opens and closes the panel with Due today and the stage counts', async ({ page }) => {
    await page.goto('/?state=words#/words');
    const toggle = page.getByRole('button', { name: /Подробнее/ });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('words-details')).toHaveCount(0);
    await toggle.click();
    const panel = page.getByTestId('words-details');
    await expect(panel).toContainText('К повторению сегодня');
    for (const stage of ['Новое', 'Вспоминание', 'Употребление']) await expect(panel).toContainText(stage);
    const hide = page.getByRole('button', { name: /Скрыть/ });
    await expect(hide).toHaveAttribute('aria-expanded', 'true');
    await hide.click();
    await expect(panel).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Подробнее/ })).toHaveAttribute('aria-expanded', 'false');
  });

  test('the Details state is remembered', async ({ page }) => {
    await page.goto('/?state=words#/words');
    await page.getByRole('button', { name: /Подробнее/ }).click();
    await expect(page.getByTestId('words-details')).toBeVisible();
    await page.getByRole('navigation').getByRole('link', { name: 'Настройки' }).click();
    await page.getByRole('navigation').getByRole('link', { name: 'Слова' }).click();
    await expect(page.getByTestId('words-details')).toBeVisible();
  });

  test('words-limit: Start is disabled, +10 opens practice with a new word', async ({ page }) => {
    await page.goto('/?state=words-limit#/words');
    await expect(page.getByText('В процессе: 10 · Выучено: 0 · Всего: 21')).toBeVisible();
    await expect(page.getByText(/Начато/)).toHaveCount(0);
    await expect(page.getByText('Начать практику')).toHaveAttribute('aria-disabled', 'true');
    // Start practice and +10 share one row.
    const startRow = page.getByText('Начать практику').locator('xpath=..');
    await expect(startRow.getByRole('button', { name: '+10 новых слов' })).toBeVisible();
    await addNew(page).dblclick();
    await card(page).waitFor();
    // A double click adds ten, not twenty: the practice holds ten new cards.
    await expect(page.getByText('1 / 10')).toBeVisible();
    expect(await cardType(page)).toBe('choice');
  });

  test('words-limit: after +10 and ten cards the end screen offers +10', async ({ page }) => {
    await page.goto('/?state=words-limit#/words');
    await addNew(page).click();
    for (let i = 0; i < 10; i++) {
      await card(page).waitFor();
      const correct = LIMIT_WORD_ANSWERS[await promptOf(page)];
      expect(correct).toBeDefined();
      await card(page).getByRole('button', { name: correct!, exact: true }).click();
      await next(page).click();
    }
    const end = page.getByTestId('practice-end');
    await expect(end).toContainText('Готово: 10 из 10');
    await expect(end.getByRole('button', { name: '+10 новых слов' })).toBeVisible();
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
    await page.getByRole('button', { name: /Подробнее/ }).click();
    await expect(page.getByTestId('words-details')).toContainText('К повторению сегодня 6');
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

test.describe('a page per word', () => {
  const back = (page: Page) => page.getByRole('link', { name: 'Назад к словам' });

  test('a word opens its own page with fields, exercises and the bottom row', async ({ page }) => {
    await page.goto('/?state=words#/words');
    await row(page, 'resilient').getByRole('link', { name: 'resilient', exact: true }).click();
    await expect(page).toHaveURL(/#\/words\/\d+$/);
    await expect(page.getByRole('heading', { name: 'resilient', level: 1 })).toBeVisible();
    await expect(page.getByLabel('Перевод')).toHaveValue('устойчивый');
    await expect(page.getByRole('heading', { name: 'Упражнения' })).toBeVisible();
    await expect(back(page)).toBeVisible();
    await expect(page.getByRole('link', { name: '← Назад' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Создать заново' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Удалить' })).toBeVisible();
  });

  test('the top back arrow stays in view while the page scrolls', async ({ page }) => {
    await page.goto('/?state=words#/words/1');
    await expect(back(page)).toBeInViewport();
    await page.locator('main').evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await expect(page.getByRole('button', { name: 'Удалить' })).toBeInViewport();
    await expect(back(page)).toBeInViewport();
  });

  test('Definition and Example are text areas', async ({ page }) => {
    await page.goto('/?state=words#/words/1');
    await expect(page.locator('textarea#word-1-definition')).toBeVisible();
    await expect(page.locator('textarea#word-1-example')).toBeVisible();
  });

  test('the dictionary link sits in the Link title, outside the label; the old link under the form is gone', async ({ page }) => {
    await page.goto('/?state=words#/words/1');
    const links = page.getByRole('link', { name: 'открыть в словаре', exact: true });
    await expect(links).toHaveCount(1);
    await expect(links).toHaveAttribute('href', 'https://www.oxfordlearnersdictionaries.com/search/english/?q=resilient');
    await expect(page.getByRole('link', { name: 'Открыть в словаре', exact: true })).toHaveCount(0);
    await expect(page.locator('label[for="word-1-link"] a')).toHaveCount(0);
    await expect(page.locator('label[for="word-1-link"]')).toHaveText('Ссылка');
  });

  test('Add word: the dictionary link appears only after typing a word', async ({ page }) => {
    await page.goto('/?state=words#/words');
    await page.getByRole('button', { name: 'Добавить слово' }).click();
    await expect(page.getByRole('link', { name: 'открыть в словаре', exact: true })).toHaveCount(0);
    await page.getByLabel('Слово', { exact: true }).fill('lucid');
    await expect(page.getByRole('link', { name: 'открыть в словаре', exact: true })).toHaveAttribute('href', /\?q=lucid$/);
  });

  for (const control of ['top', 'bottom'] as const) {
    test(`the ${control} back control keeps the list search`, async ({ page }) => {
      await page.goto('/?state=words#/words');
      await page.getByLabel('Поиск').fill('устой');
      await expect(page).toHaveURL(/#\/words\?q=/);
      await row(page, 'resilient').getByRole('link', { name: 'resilient', exact: true }).click();
      await (control === 'top' ? back(page) : page.getByRole('link', { name: '← Назад' })).click();
      await expect(page.getByLabel('Поиск')).toHaveValue('устой');
      await expect(row(page, 'resilient')).toBeVisible();
      await expect(row(page, 'ephemeral')).toHaveCount(0);
    });
  }

  test('Delete asks, then returns to the list without the word', async ({ page }) => {
    await page.goto('/?state=words#/words');
    await row(page, 'ephemeral').getByRole('link', { name: 'ephemeral', exact: true }).click();
    await page.getByRole('button', { name: 'Удалить' }).click();
    await page.getByRole('button', { name: 'Да', exact: true }).click();
    await expect(page).toHaveURL(/#\/words$/);
    await expect(row(page, 'resilient')).toBeVisible();
    await expect(page.getByRole('link', { name: 'ephemeral', exact: true })).toHaveCount(0);
  });

  test('Delete keeps the list search', async ({ page }) => {
    await page.goto('/?state=words#/words');
    await page.getByLabel('Поиск').fill('устой');
    await row(page, 'resilient').getByRole('link', { name: 'resilient', exact: true }).click();
    await page.getByRole('button', { name: 'Удалить' }).click();
    await page.getByRole('button', { name: 'Да', exact: true }).click();
    await expect(page).toHaveURL(/#\/words\?q=/);
    await expect(page.getByLabel('Поиск')).toHaveValue('устой');
  });

  for (const id of ['999999', 'abc']) {
    test(`/words/${id} says the word is not found`, async ({ page }) => {
      await page.goto(`/?state=words#/words/${id}`);
      await expect(page.getByText('Слово не найдено')).toBeVisible();
      await expect(back(page)).toBeVisible();
    });
  }

  test('Regenerate shows the creating notice, then the exercises', async ({ page }) => {
    await page.goto('/?state=words#/words');
    await row(page, 'resilient').getByRole('link', { name: 'resilient', exact: true }).click();
    await page.getByRole('button', { name: 'Создать заново' }).click();
    await expect(page.getByText('Создаю упражнения…')).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: 'Упражнения' })).toBeVisible();
    await expect(page.getByLabel('Текст').first()).toBeVisible();
  });
});
