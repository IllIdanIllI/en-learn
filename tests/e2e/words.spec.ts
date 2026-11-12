import { expect, test, type Locator, type Page } from '@playwright/test';
import { LIMIT_WORD_ANSWERS, LIMIT_WORDS, PHRASE_WORD_ANSWERS, PHRASE_WORDS, PREVIEW_WORD_ANSWERS, PREVIEW_WORDS } from '../../src/adapters/preview/wordsSeed';
import { clearTiles, tapTiles } from './helpers';

// Button names are matched in both languages, so the same helpers drive the Russian and the English practice.
const card = (page: Page) => page.locator('[data-card-type]');
const cardType = async (page: Page) => (await card(page).getAttribute('data-card-type')) ?? '';
const next = (page: Page) => page.getByRole('button', { name: /^(Дальше|Next)$/ });
const check = (page: Page) => card(page).getByRole('button', { name: /^(Проверить|Check)$/ });
const skipOf = (c: Locator) => c.getByRole('button', { name: /^(Пропустить|Skip)$/ });
const gotIt = (c: Locator) => c.getByRole('button', { name: /^(Понятно|Got it)$/ });

/** What the current card asks: the first paragraph of text (definition, sentence or Russian text), never the use card's. */
const promptOf = async (page: Page) => (await card(page).locator('p.reading').first().innerText()).trim();

const ANSWERS: Record<string, string> = { ...PREVIEW_WORD_ANSWERS, ...LIMIT_WORD_ANSWERS, ...PHRASE_WORD_ANSWERS };

/** Each prompt the cards show, mapped to the word it belongs to. */
const WORD_OF: Record<string, string> = Object.fromEntries(
  [...PREVIEW_WORDS, ...LIMIT_WORDS, ...PHRASE_WORDS].flatMap((w) => [
    [w.definition, w.word],
    ...w.gaps.map((g) => [g, w.word]),
    ...w.collocations.map((c) => [c, w.word]),
    [w.form.sentence, w.word],
    [w.confusable.sentence, w.word],
    ...w.translations.map((tr) => [tr.text, w.word]),
  ]),
);

/** The word a card is about: the word its prompt belongs to, or the word a use card names in its instruction. */
async function wordOfCard(page: Page): Promise<string> {
  if ((await cardType(page)) === 'use') return /со словом «(.+?)»/.exec(await card(page).innerText())?.[1] ?? '';
  return WORD_OF[await promptOf(page)] ?? '';
}

const SENTENCE = 'Honestly the word fits this sentence quite well.';

/** Taps a wrong tile of a build card three times: the card ends wrong. */
async function failBuild(c: Locator, word: string) {
  const first = word.replace(/ /g, '')[0]!;
  const wrong = c.locator('[data-testid="tile"]:enabled').filter({ hasNotText: first }).first();
  for (let n = 0; n < 3; n++) await wrong.click();
}

/** Answers the current card, right (or wrong, except for a use card, which the fake checker always accepts), and presses Дальше. */
async function answer(page: Page, right = true) {
  const type = await cardType(page);
  const c = card(page);
  if (type === 'intro') {
    // The intro is not a test: Понятно moves on, with no Дальше.
    await gotIt(c).click();
    return;
  }
  if (type === 'use') {
    // A use card cannot be answered wrong in the preview (the checker accepts any sentence), so a wrong answer is a Skip.
    if (right) {
      await c.getByRole('textbox').fill(SENTENCE);
      await check(page).click();
    } else {
      await skipOf(c).click();
    }
  } else {
    const correct = ANSWERS[await promptOf(page)];
    expect(correct, `an answer for the ${type} card is in the fixture`).toBeDefined();
    if (type === 'choice' || type === 'confusable') {
      const options = (await c.getByRole('button').allInnerTexts()).map((o) => o.trim()).filter((o) => !/^(Пропустить|Skip)$/.test(o));
      const pick = right ? correct! : options.find((o) => o !== correct)!;
      await c.getByRole('button', { name: pick, exact: true }).click();
    } else if (type === 'build') {
      if (right) await tapTiles(c, correct!);
      else await failBuild(c, correct!);
    } else if (type === 'translation') {
      await c.getByRole('textbox').fill(right ? correct! : 'Totally wrong answer here.');
      await check(page).click();
      if (!right) await c.getByRole('button', { name: 'Я ошибся(лась)' }).click();
    } else if (type === 'anagram') {
      await tapTiles(c, right ? correct! : [...correct!].reverse().join(''));
      await check(page).click();
    } else {
      await c.getByRole('textbox').fill(right ? correct! : 'qqqqqqqqqq');
      await check(page).click();
    }
  }
  await next(page).click();
}

/** Answers cards right until one of the type shows (the fixture's seeded random puts every type in the first practice). */
async function advanceTo(page: Page, type: string) {
  for (let i = 0; i < 30; i++) {
    await card(page).waitFor();
    if ((await cardType(page)) === type) return;
    await answer(page);
  }
  throw new Error(`no ${type} card met`);
}

/** Answers cards right until the card of this word with this type shows; returns the cards met before it. */
async function playUntil(page: Page, word: string, type: string) {
  const seen: { type: string; word: string }[] = [];
  for (let i = 0; i < 30; i++) {
    await card(page).waitFor();
    const current = { type: await cardType(page), word: await wordOfCard(page) };
    if (current.type === type && current.word === word) return seen;
    seen.push(current);
    await answer(page);
  }
  throw new Error(`no ${type} card of ${word} met`);
}

const headerPosition = async (page: Page) => (await page.locator('header span.tabular').innerText()).split(' / ').map(Number);

/** Answers the next `count` cards right and returns each one's type and word. */
async function runCards(page: Page, count: number) {
  const seen: { type: string; word: string }[] = [];
  for (let i = 0; i < count; i++) {
    await card(page).waitFor();
    const word = await wordOfCard(page);
    expect(word, `the word of card ${i + 1}`).not.toBe('');
    seen.push({ type: await cardType(page), word });
    await answer(page);
  }
  return seen;
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
    // Seven seeded words (15 cards: ephemeral is new, with 4 cards) and the two new ones (4 cards each).
    await expect(page.getByText('1 / 23')).toBeVisible();
  });

  test('an imported card with a bracketed tail is saved as the bare word', async ({ page }) => {
    await page.goto('/?state=words#/words');
    await page.getByRole('button', { name: 'Импорт' }).click();
    await page.getByLabel('Вставьте карточки из Obsidian').fill('### a stimulus\n**Word:** incentive (for)\n');
    await page.getByRole('button', { name: /^Импортировать/ }).click();
    await expect(row(page, 'incentive')).toBeVisible();
    await expect(page.getByRole('link', { name: 'incentive (for)', exact: true })).toHaveCount(0);
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
    // Seven ready words are due or new (15 cards); the failed one is not among them.
    await expect(page.getByText('1 / 15')).toBeVisible();
  });
});

test.describe('summary and +10 new words', () => {
  const addNew = (page: Page) => page.getByRole('button', { name: '+10 новых слов' });

  test('the header shows in progress, learned and total as tiles, failed word included', async ({ page }) => {
    await page.goto('/?state=words#/words');
    // Seed: six reviewed words, one of them Learned (stage 4), eight words in all.
    for (const [label, n] of [['В процессе', '5'], ['Выучено', '1'], ['Всего', '8']]) {
      const tile = page.getByTestId('words-tile').filter({ hasText: label });
      await expect(tile.getByText(label, { exact: true })).toBeVisible();
      await expect(tile.getByText(n, { exact: true })).toBeVisible();
    }
    await expect(page.getByRole('img', { name: 'В процессе: 5 · Выучено: 1 · Всего: 8' })).toBeVisible();
    await expect(page.getByText(/Начато/)).toHaveCount(0);
    await expect(addNew(page)).toHaveCount(0);
  });

  test('Details opens and closes the panel with Due today and the stage counts', async ({ page }) => {
    await page.goto('/?state=words#/words');
    const toggle = page.getByRole('button', { name: /Подробнее/ });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toHaveText('Подробнее ▾');
    await expect(page.getByTestId('words-details')).toHaveCount(0);
    await toggle.click();
    const panel = page.getByTestId('words-details');
    await expect(panel).toContainText('К повторению сегодня');
    await expect(panel.locator('dt')).toHaveCount(4);
    for (const stage of ['Новое', 'Вспоминание', 'Употребление']) await expect(panel).toContainText(stage);
    const hide = page.getByRole('button', { name: /Скрыть/ });
    await expect(hide).toHaveAttribute('aria-expanded', 'true');
    await expect(hide).toHaveText('Скрыть ▴');
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
    await expect(page.getByRole('img', { name: 'В процессе: 10 · Выучено: 0 · Всего: 21' })).toBeVisible();
    await expect(page.getByText(/Начато/)).toHaveCount(0);
    await expect(page.getByText('Начать практику')).toHaveAttribute('aria-disabled', 'true');
    // Start practice and +10 share one row.
    const startRow = page.getByText('Начать практику').locator('xpath=..');
    await expect(startRow.getByRole('button', { name: '+10 новых слов' })).toBeVisible();
    await addNew(page).dblclick();
    await card(page).waitFor();
    // A double click adds ten, not twenty: ten new words of four cards each (the intro is the first).
    await expect(page.getByText('1 / 40')).toBeVisible();
    expect(await cardType(page)).toBe('intro');
  });

  test('words-limit: after +10 and its forty cards the end screen offers +10', async ({ page }) => {
    await page.goto('/?state=words-limit#/words');
    await addNew(page).click();
    for (let i = 0; i < 40; i++) {
      await card(page).waitFor();
      await answer(page);
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
    for (let i = 0; i < 15; i++) {
      await card(page).waitFor();
      await expect(page.getByText(`${i + 1} / 15`)).toBeVisible();
      seen.push(await cardType(page));
      await answer(page);
    }
    // The intro is not counted: seven words, seven answers.
    await expect(page.getByTestId('practice-end')).toContainText('Готово: 7 из 7');
    for (const type of ['intro', 'choice', 'build', 'anagram', 'gap_hint', 'translation', 'use']) expect(seen).toContain(type);
  });

  test('the first seven cards are seven different words, and ephemeral starts with its intro card', async ({ page }) => {
    await openPractice(page);
    await expect(page.getByText('1 / 15')).toBeVisible();
    const seen = await runCards(page, 7);
    expect(new Set(seen.map((c) => c.word)).size).toBe(7);
    // Rounds are shuffled, but round 1 holds every word's first card: ephemeral's intro is among the first seven.
    expect(seen.find((c) => c.word === 'ephemeral')?.type).toBe('intro');
  });

  test('ephemeral shows intro, choice, build and gap_hint in that order', async ({ page }) => {
    await openPractice(page);
    const seen = await runCards(page, 15);
    expect(seen.filter((c) => c.word === 'ephemeral').map((c) => c.type)).toEqual(['intro', 'choice', 'build', 'gap_hint']);
    // No word twice in a row, except in the last round, where ephemeral's build and gap_hint may end the practice together.
    for (let i = 1; i < seen.length - 1; i++) expect(seen[i]!.word, `card ${i + 1}`).not.toBe(seen[i - 1]!.word);
  });

  test('a wrong answer on the choice card of ephemeral adds one build card: the total grows to 16', async ({ page }) => {
    await openPractice(page);
    const before = await playUntil(page, 'ephemeral', 'choice');
    await answer(page, false);
    await expect(page.locator('header span.tabular')).toHaveText(`${before.length + 2} / 16`);
    const seen = [...before, { type: 'choice', word: 'ephemeral' }, ...(await runCards(page, 16 - before.length - 1))];
    expect(seen.filter((c) => c.word === 'ephemeral').map((c) => c.type)).toEqual(['intro', 'choice', 'build', 'build', 'gap_hint']);
  });

  test('a second wrong answer on the same word adds no card', async ({ page }) => {
    await openPractice(page);
    await playUntil(page, 'ephemeral', 'choice');
    await answer(page, false);
    const header = page.locator('header span.tabular');
    await expect(header).toHaveText(/^\d+ \/ 16$/);
    // Ephemeral's own build card or the extra one, whichever comes first.
    let found = false;
    for (let i = 0; i < 30 && !found; i++) {
      await card(page).waitFor();
      found = (await cardType(page)) === 'build' && (await wordOfCard(page)) === 'ephemeral';
      if (!found) await answer(page);
    }
    expect(found, 'an ephemeral build card within 30 cards').toBe(true);
    await failBuild(card(page), 'ephemeral');
    await expect(page.getByText('Неверно')).toBeVisible();
    await next(page).click();
    await expect(header).toHaveText(/^\d+ \/ 16$/);
  });

  test('a mistake on the last card adds a card instead of ending the practice', async ({ page }) => {
    await openPractice(page);
    await runCards(page, 14);
    await expect(page.getByText('15 / 15')).toBeVisible();
    await answer(page, false);
    await expect(page.getByText('16 / 16')).toBeVisible();
    await expect(page.getByTestId('practice-end')).toHaveCount(0);
    await answer(page);
    await expect(page.getByTestId('practice-end')).toContainText('Готово: 7 из 7');
  });

  test('a new word\'s choice card: tapping the right option shows the word', async ({ page }) => {
    await openPractice(page);
    await advanceTo(page, 'choice');
    await card(page).getByRole('button', { name: 'ephemeral', exact: true }).click();
    await expect(page.getByText('Верно')).toBeVisible();
    await expect(next(page)).toBeVisible();
  });

  test('anagram tiles: a tap places a letter, a placed letter goes back, and Check accepts the word', async ({ page }) => {
    await openPractice(page);
    await advanceTo(page, 'anagram');
    const c = card(page);
    const word = PREVIEW_WORD_ANSWERS[await promptOf(page)]!;
    await expect(c.getByTestId('tile')).toHaveCount(word.length);
    await expect(c.getByRole('textbox')).toHaveCount(0);
    await c.getByTestId('tile').first().click();
    await expect(c.getByTestId('placed')).toHaveCount(1);
    await expect(c.getByTestId('tile').first()).toBeDisabled();
    await c.getByTestId('placed').first().click();
    await expect(c.getByTestId('placed')).toHaveCount(0);
    await expect(c.getByTestId('tile').first()).toBeEnabled();
    await tapTiles(c, word);
    await check(page).click();
    await expect(page.getByText('Верно')).toBeVisible();
    await expect(next(page)).toBeVisible();
  });

  test('anagram keyboard: letters place tiles in any case, Backspace takes the last one back, Enter checks', async ({ page }) => {
    await openPractice(page);
    await advanceTo(page, 'anagram');
    const c = card(page);
    const word = PREVIEW_WORD_ANSWERS[await promptOf(page)]!;
    await page.keyboard.type(word.slice(0, 3).toUpperCase());
    await expect(c.getByTestId('placed')).toHaveCount(3);
    await page.keyboard.press('Backspace');
    await expect(c.getByTestId('placed')).toHaveCount(2);
    await page.keyboard.type(word.slice(2));
    await expect(c.getByTestId('placed')).toHaveCount(word.length);
    await page.keyboard.press('Enter');
    await expect(page.getByText('Верно')).toBeVisible();
  });

  test('anagram keyboard on a Russian layout: the key position places the Latin letter', async ({ page }) => {
    await openPractice(page);
    await advanceTo(page, 'anagram');
    const c = card(page);
    const letter = PREVIEW_WORD_ANSWERS[await promptOf(page)]![0]!;
    await page.evaluate((l) => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ф', code: `Key${l.toUpperCase()}` })), letter);
    await expect(c.getByTestId('placed')).toHaveCount(1);
    await expect(c.getByTestId('placed')).toHaveText(letter);
  });

  test('intro: the new word shows its word and definition, Понятно is focused and moves on with no review', async ({ page }) => {
    await openPractice(page);
    await playUntil(page, 'ephemeral', 'intro');
    const c = card(page);
    await expect(c.getByText('Новое слово')).toBeVisible();
    await expect(c.locator('.answer').first()).toHaveText('ephemeral');
    await expect(c.getByText('lasting for a very short time', { exact: true })).toBeVisible();
    await expect(gotIt(c)).toBeFocused();
    await expect(skipOf(c)).toHaveCount(0);
    await gotIt(c).click();
    // No feedback and no Дальше: the card is gone, and the next one is not the intro.
    await expect(page.getByText('Верно')).toHaveCount(0);
    await expect(next(page)).toHaveCount(0);
    await expect(c).not.toHaveAttribute('data-card-type', 'intro');
  });

  test('build: the right letters fill the slots and the card ends Верно without a Check button', async ({ page }) => {
    await openPractice(page);
    await playUntil(page, 'ephemeral', 'build');
    const c = card(page);
    await expect(c.getByText('Соберите слово по буквам')).toBeVisible();
    await expect(c.getByTestId('slot')).toHaveCount(9);
    await expect(c.getByTestId('tile')).toHaveCount(9);
    await expect(c.getByRole('textbox')).toHaveCount(0);
    await expect(check(page)).toHaveCount(0);
    await tapTiles(c, 'ephemeral');
    await expect(page.getByText('Верно')).toBeVisible();
    await expect(check(page)).toHaveCount(0);
    await expect(next(page)).toBeVisible();
  });

  test('build tiles are at least 44 pixels, and nine letters take two centred rows of at most six', async ({ page }) => {
    await openPractice(page);
    await playUntil(page, 'ephemeral', 'build');
    const boxes = await card(page).getByTestId('tile').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { w: r.width, h: r.height, x: r.left, y: Math.round(r.top), right: r.right };
      }),
    );
    for (const b of boxes) {
      expect(b.w).toBeGreaterThanOrEqual(44);
      expect(b.h).toBeGreaterThanOrEqual(44);
    }
    const rows = [...new Set(boxes.map((b) => b.y))];
    expect(rows).toHaveLength(2);
    const centre = (y: number) => {
      const row = boxes.filter((b) => b.y === y);
      expect(row.length).toBeLessThanOrEqual(6);
      return (Math.min(...row.map((b) => b.x)) + Math.max(...row.map((b) => b.right))) / 2;
    };
    expect(Math.abs(centre(rows[0]!) - centre(rows[1]!))).toBeLessThan(1);
  });

  test('build: a wrong tile flashes and costs one of three attempts, and the card goes on', async ({ page }) => {
    await openPractice(page);
    await playUntil(page, 'ephemeral', 'build');
    const c = card(page);
    const attempts = c.getByTestId('attempts');
    await expect(attempts).toHaveText('Попытки: 3 из 3');
    await c.locator('[data-testid="tile"]:enabled').filter({ hasNotText: 'e' }).first().click();
    await expect(attempts).toHaveText('Попытки: 2 из 3');
    await expect(c.locator('[data-used="true"]')).toHaveCount(1);
    await expect(page.getByText('Неверно')).toHaveCount(0);
    await tapTiles(c, 'ephemeral');
    await expect(page.getByText('Верно')).toBeVisible();
  });

  test('build: three wrong tiles end the card Неверно and the header total grows by one', async ({ page }) => {
    await openPractice(page);
    await playUntil(page, 'ephemeral', 'build');
    const [position, total] = await headerPosition(page);
    await failBuild(card(page), 'ephemeral');
    await expect(page.getByText('Неверно')).toBeVisible();
    await expect(page.locator('span.answer.font-semibold', { hasText: 'ephemeral' })).toBeVisible();
    await expect(page.locator('header span.tabular')).toHaveText(`${position} / ${total! + 1}`);
  });

  test('build keyboard: letters place tiles in order in any case, a letter on no tile is ignored, Backspace and Enter do nothing', async ({ page }) => {
    await openPractice(page);
    await playUntil(page, 'ephemeral', 'build');
    const c = card(page);
    const placedTiles = c.locator('[data-testid="tile"]:disabled');
    await page.keyboard.type('EPH');
    await expect(placedTiles).toHaveCount(3);
    await page.keyboard.type('z');
    await expect(placedTiles).toHaveCount(3);
    await expect(c.getByTestId('attempts')).toHaveText('Попытки: 3 из 3');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Enter');
    await expect(placedTiles).toHaveCount(3);
    await expect(page.getByText('Верно')).toHaveCount(0);
    // A letter on another unused tile is a mistake: the a tile flashes and costs an attempt.
    await page.keyboard.type('a');
    await expect(c.getByTestId('attempts')).toHaveText('Попытки: 2 из 3');
    await page.keyboard.type('emeral');
    await expect(page.getByText('Верно')).toBeVisible();
  });

  test('phrase: the build card shows a gap between the word parts, and tapping its letters ends Верно', async ({ page }) => {
    await openPractice(page, 'words-phrase');
    await expect(page.getByText('1 / 4')).toBeVisible();
    await advanceTo(page, 'build');
    const c = card(page);
    const groups = c.getByTestId('slot-group');
    await expect(groups).toHaveCount(2);
    await expect(groups.nth(0).getByTestId('slot')).toHaveCount(4);
    await expect(groups.nth(1).getByTestId('slot')).toHaveCount(2);
    await expect(c.getByTestId('tile')).toHaveCount(6);
    await tapTiles(c, 'give up');
    await expect(page.getByText('Верно')).toBeVisible();
  });

  test('phrase: the gap card accepts the answer with its space', async ({ page }) => {
    await openPractice(page, 'words-phrase');
    await advanceTo(page, 'gap_hint');
    expect(await wordOfCard(page)).toBe('give up');
    await card(page).getByRole('textbox').fill('give up');
    await check(page).click();
    await expect(page.getByText('Верно')).toBeVisible();
  });

  test('the fill-the-word clue is the translation in Russian, and the sentence translation is not shown', async ({ page }) => {
    await openPractice(page);
    await advanceTo(page, 'gap_hint');
    const word = await wordOfCard(page);
    const translation = PREVIEW_WORDS.find((w) => w.word === word)!.translation;
    await expect(card(page).getByText(translation, { exact: true })).toBeVisible();
    await expect(card(page).getByText('Пример перевода.')).toHaveCount(0);
  });

  test('in English, the fill-the-word clue is the definition', async ({ page }) => {
    await page.goto('/?state=words#/settings');
    await page.getByRole('radio', { name: 'English' }).click();
    await page.evaluate(() => {
      window.location.hash = '#/words/practice';
    });
    await card(page).waitFor();
    await advanceTo(page, 'gap_hint');
    const word = await wordOfCard(page);
    const definition = PREVIEW_WORDS.find((w) => w.word === word)!.definition;
    await expect(card(page).getByText(definition, { exact: true })).toBeVisible();
    await expect(card(page).getByText('Пример перевода.')).toHaveCount(0);
  });

  test('Skip is on the Check row of a typed card', async ({ page }) => {
    await openPractice(page);
    await advanceTo(page, 'gap_hint');
    await expect(check(page).locator('xpath=..').getByRole('button', { name: /^(Пропустить|Skip)$/ })).toHaveCount(1);
  });

  test('Skip is on the Check row of an anagram', async ({ page }) => {
    await openPractice(page);
    await advanceTo(page, 'anagram');
    await expect(check(page).locator('xpath=..').getByRole('button', { name: /^(Пропустить|Skip)$/ })).toHaveCount(1);
  });

  test('Skip is alone in its row under a choice card', async ({ page }) => {
    await openPractice(page);
    await advanceTo(page, 'choice');
    await expect(skipOf(card(page))).toBeVisible();
    await expect(skipOf(card(page)).locator('xpath=..').getByRole('button')).toHaveCount(1);
  });

  test('Almost, then retry: two neighbouring letters swapped get one more try', async ({ page }) => {
    await openPractice(page);
    await advanceTo(page, 'anagram');
    const c = card(page);
    const word = PREVIEW_WORD_ANSWERS[await promptOf(page)]!;
    const [a, b, ...rest] = Array.from(word);
    await tapTiles(c, [b, a, ...rest].join(''));
    await check(page).click();
    await expect(page.getByText('Почти: одна буква не та. Попробуйте ещё раз.')).toBeVisible();
    await expect(next(page)).toHaveCount(0);
    await clearTiles(c);
    await tapTiles(c, word);
    await check(page).click();
    await expect(page.getByText('Верно')).toBeVisible();
    await expect(next(page)).toBeVisible();
  });

  test('spell: the letters are shown as text, a one-letter slip is Almost, and the typed word is checked', async ({ page }) => {
    await openPractice(page);
    await advanceTo(page, 'spell');
    const c = card(page);
    const word = PREVIEW_WORD_ANSWERS[await promptOf(page)]!;
    await expect(c.getByText('Напишите слово')).toBeVisible();
    await expect(c.getByTestId('tile')).toHaveCount(0);
    await expect(c.getByRole('button', { name: 'Первая буква' })).toHaveCount(0);
    const shown = (await c.locator('p.answer').innerText()).replace(/\s/g, '');
    expect(Array.from(shown).sort().join('')).toBe(Array.from(word).sort().join(''));
    const input = c.getByRole('textbox');
    await input.fill(`${word.slice(0, -1)}${word.endsWith('x') ? 'z' : 'x'}`);
    await check(page).click();
    await expect(page.getByText('Почти: одна буква не та. Попробуйте ещё раз.')).toBeVisible();
    await input.fill(word);
    await check(page).click();
    await expect(page.getByText('Верно')).toBeVisible();
    await expect(next(page)).toBeVisible();
  });

  test('Skip on an exercise card shows the right answer', async ({ page }) => {
    await openPractice(page);
    await advanceTo(page, 'gap_hint');
    const word = await wordOfCard(page);
    await card(page).getByRole('button', { name: 'Пропустить' }).click();
    await expect(page.getByText('Неверно')).toBeVisible();
    await expect(page.getByText(`Правильный ответ: ${word}`)).toBeVisible();
  });

  test('Skip on a choice card shows the word, counts wrong and adds one card', async ({ page }) => {
    await openPractice(page);
    await advanceTo(page, 'choice');
    const [position, total] = await headerPosition(page);
    await card(page).getByRole('button', { name: 'Пропустить' }).click();
    await expect(page.getByText('Неверно')).toBeVisible();
    await expect(page.locator('span.answer.font-semibold', { hasText: 'ephemeral' })).toBeVisible();
    await expect(page.locator('header span.tabular')).toHaveText(`${position} / ${total! + 1}`);
    await expect(page.getByRole('button', { name: 'Пропустить' })).toHaveCount(0);
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

  test('use it: Skip counts wrong and shows the word example', async ({ page }) => {
    await openPractice(page);
    await advanceTo(page, 'use');
    const word = await wordOfCard(page);
    const example = PREVIEW_WORDS.find((w) => w.word === word)?.example ?? '';
    expect(example).not.toBe('');
    const [position, total] = await headerPosition(page);
    await card(page).getByRole('button', { name: 'Пропустить' }).click();
    await expect(page.getByText('Неверно')).toBeVisible();
    await expect(page.getByText(example, { exact: true })).toBeVisible();
    await expect(page.locator('header span.tabular')).toHaveText(`${position} / ${total! + 1}`);
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

  test('end screen lists the words that moved up and down', async ({ page }) => {
    await openPractice(page);
    // Meticulous is at stage 3 and its first card is always the translation: a wrong answer there moves it down a stage.
    // (Resilient's card is a use card in this seed, and the preview checker always accepts those.)
    const header = page.locator('header span.tabular');
    let missed = false;
    for (let i = 0; i < 30; i++) {
      await card(page).waitFor();
      const [position, total] = (await header.innerText()).split(' / ').map(Number);
      if (!missed && (await wordOfCard(page)) === 'meticulous' && (await cardType(page)) === 'translation') {
        missed = true;
        await answer(page, false);
      } else {
        await answer(page);
      }
      if (position === total) break;
    }
    expect(missed, 'meticulous is in the practice').toBe(true);
    const end = page.getByTestId('practice-end');
    await expect(end).toContainText('Готово: 6 из 7');
    await expect(end.locator('section', { hasText: 'Повысились' })).toContainText('ubiquitous → Вспоминание');
    await expect(end.locator('section', { hasText: 'Повысились' })).toContainText('tenacious → Вспоминание');
    await expect(end.locator('section', { hasText: 'Понизились' })).toContainText('meticulous → Вспоминание');
    await expect(end.getByRole('link', { name: 'К словам' })).toBeVisible();
    await expect(end.getByRole('button', { name: /Продолжить/ })).toHaveCount(0);
  });

  test('ending early offers Continue, which starts a practice with the cards left', async ({ page }) => {
    await openPractice(page);
    // Intro cards are not answers: answer up to the first card that is.
    while ((await cardType(page)) === 'intro') await answer(page);
    await answer(page);
    await page.getByRole('button', { name: 'Закончить' }).click();
    const end = page.getByTestId('practice-end');
    await expect(end).toContainText('Готово: 1 из 1');
    await end.getByRole('button', { name: 'Продолжить · ещё 10 слов' }).click();
    // The answered word is no longer due and its other cards go with it: five due words are left (nine cards), plus ephemeral's four new cards.
    await expect(page.getByText('1 / 13')).toBeVisible();
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
    await expect(page.getByTestId('words-details')).toContainText('К повторению сегодня6');
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

  test('the seeded word has no link, so the Link title has no dictionary link; the old link under the form is gone', async ({ page }) => {
    await page.goto('/?state=words#/words/1');
    await expect(page.getByRole('link', { name: 'открыть в словаре', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Открыть в словаре', exact: true })).toHaveCount(0);
    await expect(page.locator('label[for="word-1-link"]')).toHaveText('Ссылка');
  });

  test('typing an https link into the Link field shows the dictionary link with that href', async ({ page }) => {
    await page.goto('/?state=words#/words/1');
    const link = page.getByRole('link', { name: 'открыть в словаре', exact: true });
    await page.getByLabel('Ссылка', { exact: true }).fill('http://example.com/x');
    await expect(link).toHaveCount(0);
    await page.getByLabel('Ссылка', { exact: true }).fill(' https://example.com/resilient ');
    await expect(link).toHaveAttribute('href', 'https://example.com/resilient');
    await expect(page.locator('label[for="word-1-link"] a')).toHaveCount(0);
  });

  test('Definition and Example use the same font as the other fields', async ({ page }) => {
    await page.goto('/?state=words#/words/1');
    const font = (sel: string) => page.locator(sel).evaluate((el) => getComputedStyle(el).fontFamily);
    const input = await font('input#word-1-synonyms');
    expect(await font('textarea#word-1-definition')).toBe(input);
    expect(await font('textarea#word-1-example')).toBe(input);
  });

  test('Add word: the dictionary link appears only after an https link is typed', async ({ page }) => {
    await page.goto('/?state=words#/words');
    await page.getByRole('button', { name: 'Добавить слово' }).click();
    const link = page.getByRole('link', { name: 'открыть в словаре', exact: true });
    await expect(link).toHaveCount(0);
    await page.getByLabel('Слово', { exact: true }).fill('lucid');
    await expect(link).toHaveCount(0);
    await page.getByLabel('Ссылка', { exact: true }).fill('https://example.com/lucid');
    await expect(link).toHaveAttribute('href', 'https://example.com/lucid');
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
