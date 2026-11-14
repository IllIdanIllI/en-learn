import { expect, test, type Locator, type Page } from '@playwright/test';
import { LIMIT_WORD_ANSWERS, LIMIT_WORDS, PHRASE_WORD_ANSWERS, PHRASE_WORDS, PREVIEW_WORD_ANSWERS, PREVIEW_WORDS } from '../../src/adapters/preview/wordsSeed';
import { clearTiles, tapTiles } from './helpers';

// Button names are matched in both languages, so the same helpers drive the Russian and the English practice.
const card = (page: Page) => page.locator('[data-card-type]');
const cardType = async (page: Page) => (await card(page).getAttribute('data-card-type')) ?? '';
const next = (page: Page) => page.getByRole('button', { name: /^(Дальше|Next)$/ });
const check = (page: Page) => card(page).getByRole('button', { name: /^(Проверить|Check)$/ });
const skipOf = (c: Locator) => c.getByRole('button', { name: /^(Пропустить|Skip)$/ });

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
    // The word card is not a test: Дальше moves on.
    await next(page).click();
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

const openPractice = async (page: Page, state = 'words', mode: 'new' | 'review' = 'new') => {
  await page.goto(`/?state=${state}#/words/practice?mode=${mode}`);
  await card(page).waitFor();
};

/** Answers right until the practice ends; returns each card's type and word. */
async function runToEnd(page: Page) {
  const seen: { type: string; word: string }[] = [];
  for (let i = 0; i < 60; i++) {
    await expect.poll(async () => (await page.getByTestId('practice-end').count()) + (await card(page).count())).toBeGreaterThan(0);
    if (await page.getByTestId('practice-end').count() > 0) return seen;
    seen.push({ type: await cardType(page), word: await wordOfCard(page) });
    await answer(page);
  }
  throw new Error('the practice did not end');
}

/** Replaces speechSynthesis with a stub that records the spoken text in window.__spoken. */
const SPEECH_STUB = () => {
  const w = window as unknown as { __spoken: string[] };
  w.__spoken = [];
  class Utterance {
    text: string;
    lang = '';
    constructor(text: string) {
      this.text = text;
    }
  }
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: Utterance, configurable: true });
  Object.defineProperty(window, 'speechSynthesis', {
    value: { speak: (u: Utterance) => w.__spoken.push(u.text), cancel: () => {}, getVoices: () => [] },
    configurable: true,
  });
};
const spoken = (page: Page) => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);

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
    // Ephemeral and the two new words are new: three word cards and nine tests in one group.
    await page.getByRole('link', { name: 'Новые слова · 3' }).click();
    await expect(page.getByText('1 / 9')).toBeVisible();
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
    // Only ephemeral is new (three tests); the failed word is not among the new words.
    await page.getByRole('link', { name: 'Новые слова · 1' }).click();
    await expect(page.getByText('1 / 3')).toBeVisible();
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
    // Both trainings are empty: the allowance is used and nothing is due.
    await expect(page.getByText('Новые слова · 0')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByText('Повторение · 0')).toHaveAttribute('aria-disabled', 'true');
    // The two trainings and +10 share one row.
    const startRow = page.getByText('Новые слова · 0').locator('xpath=..');
    await expect(startRow.getByRole('button', { name: '+10 новых слов' })).toBeVisible();
    await addNew(page).dblclick();
    await card(page).waitFor();
    // A double click adds ten, not twenty: ten new words, three tests each (30), and their word cards (10).
    await expect(page.getByText('1 / 30')).toBeVisible();
    expect(await cardType(page)).toBe('intro');
    expect(page.url()).toContain('mode=new');
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
    await openPractice(page, 'words', 'review');
    const seen: string[] = [];
    for (let i = 0; i < 11; i++) {
      await card(page).waitFor();
      await expect(page.getByText(`${i + 1} / 11`)).toBeVisible();
      seen.push(await cardType(page));
      await answer(page);
    }
    // Six due words, eleven tests and no word cards.
    await expect(page.getByTestId('practice-end')).toContainText('Готово: 6 из 6');
    for (const type of ['anagram', 'translation', 'spell', 'collocation', 'gap_hint', 'use']) expect(seen).toContain(type);
    expect(seen).not.toContain('intro');
  });

  test('the new training shows ephemeral: its word card, then its choice, build and gap_hint tests, counted in the header', async ({ page }) => {
    await openPractice(page);
    await expect(page.getByText('1 / 3')).toBeVisible();
    const seen = await runCards(page, 4);
    expect(seen.map((c) => c.type)).toEqual(['intro', 'choice', 'build', 'gap_hint']);
    expect(seen.every((c) => c.word === 'ephemeral')).toBe(true);
    await expect(page.getByTestId('practice-end')).toContainText('Готово: 1 из 1');
  });

  test('a wrong answer on the choice card of ephemeral adds a build card at the end: the total grows to 4', async ({ page }) => {
    await openPractice(page);
    await playUntil(page, 'ephemeral', 'choice');
    const header = page.locator('header span.tabular');
    await expect(header).toHaveText('1 / 3');
    await answer(page, false);
    await expect(header).toHaveText('2 / 4');
    // Ephemeral is the only word, so no other card comes between: the extra build is appended after gap_hint.
    const rest = await runCards(page, 3);
    expect(rest.map((c) => c.type)).toEqual(['build', 'gap_hint', 'build']);
    await expect(page.getByTestId('practice-end')).toContainText('Готово: 0 из 1');
  });

  test('a second wrong answer adds a second extra card, a third adds none', async ({ page }) => {
    await openPractice(page);
    const header = page.locator('header span.tabular');
    await answer(page); // the word card
    await answer(page, false); // choice: the first extra (a build card)
    await expect(header).toHaveText('2 / 4');
    await failBuild(card(page), 'ephemeral'); // the planned build: the second extra
    await expect(header).toHaveText('2 / 5');
    await next(page).click();
    await expect(header).toHaveText('3 / 5');
    await answer(page, false); // gap_hint: the third mistake adds nothing
    await expect(header).toHaveText('4 / 5');
    const rest = await runCards(page, 2);
    expect(rest.map((c) => c.type)).toEqual(['build', 'build']);
    await expect(page.getByTestId('practice-end')).toContainText('Готово: 0 из 1');
  });

  test('a mistake on the last card adds a card instead of ending the practice', async ({ page }) => {
    await openPractice(page);
    await runCards(page, 3);
    await expect(page.getByText('3 / 3')).toBeVisible();
    await answer(page, false);
    await expect(page.getByText('4 / 4')).toBeVisible();
    await expect(page.getByTestId('practice-end')).toHaveCount(0);
    await answer(page);
    await expect(page.getByTestId('practice-end')).toContainText('Готово: 1 из 1');
  });

  test('a new word\'s choice card: tapping the right option shows the word', async ({ page }) => {
    await openPractice(page);
    await advanceTo(page, 'choice');
    await card(page).getByRole('button', { name: 'ephemeral', exact: true }).click();
    await expect(page.getByText('Верно')).toBeVisible();
    await expect(next(page)).toBeVisible();
  });

  test('anagram tiles: a tap places a letter, a placed letter goes back, and Check accepts the word', async ({ page }) => {
    await openPractice(page, 'words', 'review');
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
    await openPractice(page, 'words', 'review');
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
    await openPractice(page, 'words', 'review');
    await advanceTo(page, 'anagram');
    const c = card(page);
    const letter = PREVIEW_WORD_ANSWERS[await promptOf(page)]![0]!;
    await page.evaluate((l) => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ф', code: `Key${l.toUpperCase()}` })), letter);
    await expect(c.getByTestId('placed')).toHaveCount(1);
    await expect(c.getByTestId('placed')).toHaveText(letter);
  });

  test('word card: Дальше is focused, moves on with no feedback and no Skip', async ({ page }) => {
    await openPractice(page);
    const c = card(page);
    await expect(c.locator('.answer').first()).toHaveText('ephemeral');
    await expect(c.getByText('lasting for a very short time', { exact: true })).toBeVisible();
    await expect(next(page)).toBeFocused();
    await expect(skipOf(c)).toHaveCount(0);
    await next(page).click();
    await expect(page.getByText('Верно')).toHaveCount(0);
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
    await expect(page.getByText('1 / 3')).toBeVisible();
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
    await openPractice(page, 'words', 'review');
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
      window.location.hash = '#/words/practice?mode=review';
    });
    await card(page).waitFor();
    await advanceTo(page, 'gap_hint');
    const word = await wordOfCard(page);
    const definition = PREVIEW_WORDS.find((w) => w.word === word)!.definition;
    await expect(card(page).getByText(definition, { exact: true })).toBeVisible();
    await expect(card(page).getByText('Пример перевода.')).toHaveCount(0);
  });

  test('Skip is on the Check row of a typed card', async ({ page }) => {
    await openPractice(page, 'words', 'review');
    await advanceTo(page, 'gap_hint');
    await expect(check(page).locator('xpath=..').getByRole('button', { name: /^(Пропустить|Skip)$/ })).toHaveCount(1);
  });

  test('Skip is on the Check row of an anagram', async ({ page }) => {
    await openPractice(page, 'words', 'review');
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
    await openPractice(page, 'words', 'review');
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
    await openPractice(page, 'words', 'review');
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
    await openPractice(page, 'words', 'review');
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
    await openPractice(page, 'words', 'review');
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
    await openPractice(page, 'words', 'review');
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
    await openPractice(page, 'words', 'review');
    await advanceTo(page, 'use');
    await card(page).getByRole('textbox').fill(SENTENCE);
    await check(page).click();
    await expect(page.getByText('Слово употреблено верно.')).toBeVisible();
    await expect(page.getByText('Пример замечания в режиме предпросмотра.')).toBeVisible();
    await expect(page.getByText('Ваш ответ: ' + SENTENCE)).toBeVisible();
    await expect(next(page)).toBeVisible();
  });

  test('end screen lists the words that moved up and down', async ({ page }) => {
    await openPractice(page, 'words', 'review');
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
    await expect(end).toContainText('Готово: 5 из 6');
    await expect(end.locator('section', { hasText: 'Повысились' })).toContainText('ubiquitous → Вспоминание');
    await expect(end.locator('section', { hasText: 'Повысились' })).toContainText('tenacious → Вспоминание');
    await expect(end.locator('section', { hasText: 'Понизились' })).toContainText('meticulous → Вспоминание');
    await expect(end.getByRole('link', { name: 'К словам' })).toBeVisible();
    await expect(end.getByRole('button', { name: /Продолжить/ })).toHaveCount(0);
  });

  test('ending early offers Continue, which starts a practice with the cards left', async ({ page }) => {
    await openPractice(page, 'words', 'review');
    await answer(page);
    await page.getByRole('button', { name: 'Закончить' }).click();
    const end = page.getByTestId('practice-end');
    await expect(end).toContainText('Готово: 1 из 1');
    await end.getByRole('button', { name: 'Продолжить · ещё 5' }).click();
    await expect(page).toHaveURL(/mode=review/);
    // The answered word is no longer due and its other cards go with it: five due words are left (nine cards).
    await expect(page.getByText('1 / 9')).toBeVisible();
  });

  test('words-done: nothing is due, so practice says All done with the next date', async ({ page }) => {
    await page.goto('/?state=words-done#/words/practice');
    await expect(page.getByText(/^На сегодня всё\. Следующее повторение: \d{4}-\d{2}-\d{2}$/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'К словам' })).toBeVisible();
    await expect(card(page)).toHaveCount(0);
  });
});

test.describe('two trainings, the word card and its buttons', () => {
  const addNew = (page: Page) => page.getByRole('button', { name: '+10 новых слов' });

  test('the Words page shows the two trainings with their counts', async ({ page }) => {
    await page.goto('/?state=words#/words');
    await expect(page.getByRole('link', { name: 'Новые слова · 1' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Повторение · 6' })).toBeVisible();
  });

  test('the review training holds the six due words and no word cards', async ({ page }) => {
    await page.goto('/?state=words#/words');
    await page.getByRole('link', { name: 'Повторение · 6' }).click();
    await expect(page).toHaveURL(/mode=review/);
    await expect(page.getByText('1 / 11')).toBeVisible();
    const seen = await runToEnd(page);
    expect(seen).toHaveLength(11);
    expect(seen.some((c) => c.type === 'intro')).toBe(false);
    expect(new Set(seen.map((c) => c.word))).toEqual(new Set(['resilient', 'meticulous', 'pragmatic', 'candid', 'tenacious', 'ubiquitous']));
  });

  test('the new training: each group shows its word cards, then its tests, then the next group', async ({ page }) => {
    await page.goto('/?state=words-limit#/words');
    await addNew(page).click();
    await expect(page.getByText('1 / 30')).toBeVisible();
    const seen = await runToEnd(page);
    expect(seen).toHaveLength(40);
    // Ten words in groups of 3, 3, 2 and 2: each group's word cards, then its tests (three per word).
    let at = 0;
    for (const size of [3, 3, 2, 2]) {
      const intros = seen.slice(at, at + size);
      const tests = seen.slice(at + size, at + size + 3 * size);
      expect(intros.map((c) => c.type)).toEqual(Array(size).fill('intro'));
      expect(tests.some((c) => c.type === 'intro')).toBe(false);
      expect(new Set(tests.map((c) => c.word))).toEqual(new Set(intros.map((c) => c.word)));
      // No two neighbouring tests share a word, unless only that word's tests are left in the group.
      for (let j = 1; j < tests.length; j++) {
        if (tests[j]!.word === tests[j - 1]!.word) expect(tests.slice(j - 1).every((c) => c.word === tests[j]!.word), `test ${j + 1} of group ${size}`).toBe(true);
      }
      at += size + 3 * size;
    }
  });

  test('a wrong answer brings the word back as a build card right after the next test of another word', async ({ page }) => {
    await page.goto('/?state=words-limit#/words');
    await addNew(page).click();
    await card(page).waitFor();
    await advanceTo(page, 'choice');
    const word = await wordOfCard(page);
    const header = page.locator('header span.tabular');
    const [k, n] = await headerPosition(page);
    await answer(page, false);
    // The next card is a test of another word; the header counts the one extra test.
    await expect(header).toHaveText(`${k! + 1} / ${n! + 1}`);
    const rest = await runToEnd(page);
    // The extra is never directly after the missed card: it comes after the next test of another word.
    expect(rest[0]!.word).not.toBe(word);
    expect(rest[1]).toEqual({ type: 'build', word });
    expect(rest.filter((c) => c.word === word).map((c) => c.type)).toEqual(['build', 'build', 'gap_hint']);
  });

  test('Already know on a word card: the word is Learned, its tests leave the training, the header drops by three', async ({ page }) => {
    await page.goto('/?state=words-limit#/words');
    await addNew(page).click();
    await card(page).waitFor();
    const word = await wordOfCard(page);
    const header = page.locator('header span.tabular');
    await expect(header).toHaveText('1 / 30');
    await card(page).getByRole('button', { name: 'Уже знаю это слово' }).click();
    await expect(header).toHaveText('1 / 27');
    const seen = await runToEnd(page);
    expect(seen).toHaveLength(36);
    expect(seen.some((c) => c.word === word)).toBe(false);
    await page.getByRole('link', { name: 'К словам' }).click();
    await expect(row(page, word).getByText('Выучено', { exact: true })).toBeVisible();
  });

  test('Remove on a word card asks first: No keeps the word, Yes deletes it and its tests', async ({ page }) => {
    await page.goto('/?state=words-limit#/words');
    await addNew(page).click();
    await card(page).waitFor();
    const word = await wordOfCard(page);
    const header = page.locator('header span.tabular');
    const c = card(page);
    await c.getByRole('button', { name: 'Удалить из словаря' }).click();
    await expect(page.getByText('Удалить слово из словаря?')).toBeVisible();
    await c.getByRole('button', { name: 'Нет', exact: true }).click();
    await expect(page.getByText('Удалить слово из словаря?')).toHaveCount(0);
    await expect(header).toHaveText('1 / 30');
    await c.getByRole('button', { name: 'Удалить из словаря' }).click();
    await c.getByRole('button', { name: 'Да', exact: true }).click();
    await expect(header).toHaveText('1 / 27');
    const seen = await runToEnd(page);
    expect(seen.some((x) => x.word === word)).toBe(false);
    await page.getByRole('link', { name: 'К словам' }).click();
    await expect(row(page, word)).toHaveCount(0);
  });

  test('Edit word on the intro card opens the word in a dialog titled with the word', async ({ page }) => {
    await openPractice(page);
    await card(page).getByRole('button', { name: 'Изменить слово' }).click();
    await expect(page.getByRole('dialog', { name: 'ephemeral' })).toBeVisible();
  });

  test('a change saved in the edit panel shows on the same card after Esc, and focus returns to Edit word', async ({ page }) => {
    await openPractice(page);
    const edit = card(page).getByRole('button', { name: 'Изменить слово' });
    await edit.click();
    const dialog = page.getByRole('dialog', { name: 'ephemeral' });
    await dialog.getByLabel('Перевод', { exact: true }).fill('проверка');
    await dialog.locator('form').getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(dialog.getByRole('status')).toHaveText('Сохранено');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(card(page).getByText('проверка', { exact: true })).toBeVisible();
    await expect(edit).toBeFocused();
  });

  test('the feedback after an answer has Edit word too', async ({ page }) => {
    await openPractice(page);
    await answer(page);
    const c = card(page);
    await expect(c).toHaveAttribute('data-card-type', 'choice');
    await skipOf(c).click();
    await c.getByRole('button', { name: 'Изменить слово' }).click();
    await expect(page.getByRole('dialog', { name: 'ephemeral' })).toBeVisible();
  });

  test('typing in the edit panel on a build card after its feedback leaves the card as it was', async ({ page }) => {
    await openPractice(page);
    await playUntil(page, 'ephemeral', 'build');
    const c = card(page);
    await failBuild(c, 'ephemeral');
    const edit = c.getByRole('button', { name: 'Изменить слово' });
    await expect(edit).toBeVisible();
    const header = page.locator('header span.tabular');
    const position = await header.innerText();
    await edit.click();
    const dialog = page.getByRole('dialog', { name: 'ephemeral' });
    await dialog.getByLabel('Перевод', { exact: true }).click();
    await page.keyboard.type('abc');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(header).toHaveText(position);
    await expect(edit).toBeFocused();
  });

  test('a click outside the edit panel closes it', async ({ page }) => {
    await openPractice(page);
    await card(page).getByRole('button', { name: 'Изменить слово' }).click();
    const dialog = page.getByRole('dialog', { name: 'ephemeral' });
    await expect(dialog).toBeVisible();
    await page.mouse.click(40, 300);
    await expect(dialog).toHaveCount(0);
  });

  test('Delete in the edit panel closes it, and the word\'s tests leave the training', async ({ page }) => {
    await page.goto('/?state=words-limit#/words');
    await addNew(page).click();
    await card(page).waitFor();
    const word = await wordOfCard(page);
    const header = page.locator('header span.tabular');
    await expect(header).toHaveText('1 / 30');
    await card(page).getByRole('button', { name: 'Изменить слово' }).click();
    const dialog = page.getByRole('dialog', { name: word });
    await dialog.getByRole('button', { name: 'Удалить', exact: true }).click();
    await dialog.getByRole('button', { name: 'Да', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(header).toHaveText('1 / 27');
    const seen = await runToEnd(page);
    expect(seen.some((x) => x.word === word)).toBe(false);
  });

  test('the word card shows transcription, part of speech, translation, definition and the example with the word in bold', async ({ page }) => {
    await openPractice(page);
    const c = card(page);
    await expect(c.getByText('/ɪˈfemərəl/ · adjective', { exact: true })).toBeVisible();
    await expect(c.getByText('недолговечный', { exact: true })).toBeVisible();
    await expect(c.getByText('lasting for a very short time', { exact: true })).toBeVisible();
    await expect(c.locator('strong', { hasText: 'ephemeral' })).toBeVisible();
    await expect(c.getByText('Fame can be ephemeral.', { exact: true })).toBeVisible();
  });

  test('the speaker buttons speak the word and the example when speech synthesis is available', async ({ page }) => {
    await page.addInitScript(SPEECH_STUB);
    await openPractice(page);
    const speakers = card(page).getByRole('button', { name: 'Произнести' });
    await expect(speakers).toHaveCount(2);
    await speakers.nth(0).click();
    await speakers.nth(1).click();
    expect(await spoken(page)).toEqual(['ephemeral', 'Fame can be ephemeral.']);
  });

  test('without speech synthesis there are no speaker buttons', async ({ page }) => {
    await page.addInitScript(() => {
      delete (window as unknown as { speechSynthesis?: unknown }).speechSynthesis;
      delete (window as unknown as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance;
    });
    await openPractice(page);
    await expect(card(page).locator('.answer').first()).toHaveText('ephemeral');
    await expect(card(page).getByRole('button', { name: 'Произнести' })).toHaveCount(0);
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
    await openPractice(page, 'words', 'review');
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

/** Opens diligent's word page until its transcription shows; the fill writes it a moment after its progress text goes. */
async function expectDiligentFilled(page: Page) {
  await expect(async () => {
    await page.getByRole('link', { name: 'Слова', exact: true }).click();
    await row(page, 'diligent').getByRole('link', { name: 'diligent', exact: true }).click();
    await expect(page.getByLabel('Транскрипция')).toHaveValue('/diligent/', { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

test.describe('transcription fill on a Words visit', () => {
  test('the fill shows its progress, then the words have their transcriptions', async ({ page }) => {
    await page.goto('/?state=words-fill&delay=300#/words');
    await expect(page.getByText('Добавляю транскрипции: 0 из 3')).toBeVisible();
    await expect(page.getByText('Добавляю транскрипции')).toHaveCount(0, { timeout: 10_000 });
    await row(page, 'diligent').getByRole('link', { name: 'diligent', exact: true }).click();
    await expect(page.getByLabel('Транскрипция')).toHaveValue('/diligent/');
  });

  test('a failed fill shows its message and Retry; trainings and Regenerate stay enabled', async ({ page }) => {
    await page.goto('/?state=words-fill&fail=cli_error#/words');
    const notice = page.getByRole('alert').filter({ hasText: 'Не удалось добавить транскрипции' });
    await expect(notice).toContainText('Preview failure');
    await expect(notice.getByRole('button', { name: 'Повторить' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Новые слова/ })).toBeVisible();
    await row(page, 'diligent').getByRole('link', { name: 'diligent', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Создать заново' })).toBeEnabled();
  });

  test('a word added while the fill runs, and a visit during its generation: both complete, no busy notice', async ({ page }) => {
    await page.goto('/?state=words-fill&delay=3000#/words');
    await expect(page.getByText('Добавляю транскрипции: 0 из 3')).toBeVisible();
    await page.getByRole('button', { name: 'Добавить слово' }).click();
    await page.getByLabel('Слово', { exact: true }).fill('lucid');
    await page.getByRole('button', { name: 'Сохранить' }).click();
    await expect(row(page, 'lucid')).toBeVisible();
    // A second visit while the generation runs: the fill must not start a second run.
    await page.evaluate(() => { location.hash = '#/today'; });
    await page.evaluate(() => { location.hash = '#/words'; });
    // The Words page is mounted again while the fill still runs.
    await expect(page.getByText('Добавляю транскрипции: 0 из 3')).toBeVisible();
    // The generation waits for the fill, so its translation shows only after the fill has ended.
    await expect(row(page, 'lucid')).toContainText('перевод', { timeout: 20_000 });
    await expect(row(page, 'lucid')).not.toContainText('Упражнения не созданы');
    await expect(page.getByText('Сейчас создаётся урок')).toHaveCount(0);
    await expectDiligentFilled(page);
  });

  test('two Words visits during one fill run it once: the total stays 3', async ({ page }) => {
    await page.goto('/?state=words-fill&delay=3000#/words');
    await expect(page.getByText('Добавляю транскрипции: 0 из 3')).toBeVisible();
    await page.evaluate(() => { location.hash = '#/today'; });
    await page.evaluate(() => { location.hash = '#/words'; });
    await expect(page.getByText('Добавляю транскрипции: 0 из 3')).toBeVisible();
    await expectDiligentFilled(page);
    await expect(page.getByText(/из 6/)).toHaveCount(0);
    await expect(page.getByText('Сейчас создаётся урок')).toHaveCount(0);
  });
});

test.describe('search shortcut and saved confirmation', () => {
  test('the search field has a search icon inside its wrapper', async ({ page }) => {
    await page.goto('/?state=words#/words');
    const icon = page.locator('#words-search').locator('xpath=..').locator('svg');
    await expect(icon).toHaveCount(1);
    await expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  for (const key of ['Meta+f', 'Control+f']) {
    test(`${key} focuses the search field and selects its text`, async ({ page }) => {
      await page.goto('/?state=words#/words');
      const search = page.locator('#words-search');
      await search.fill('устой');
      await page.locator('h1').click();
      await page.keyboard.press(key);
      await expect(search).toBeFocused();
      const selection = await search.evaluate((el: HTMLInputElement) => ({ start: el.selectionStart, end: el.selectionEnd, length: el.value.length }));
      expect(selection).toEqual({ start: 0, end: 5, length: 5 });
    });
  }

  test('saving a word shows Saved until a field changes', async ({ page }) => {
    await page.goto('/?state=words#/words');
    await row(page, 'resilient').getByRole('link', { name: 'resilient', exact: true }).click();
    const saved = page.getByRole('status').filter({ hasText: 'Сохранено' });
    await expect(saved).toHaveCount(0);
    await page.getByLabel('Перевод', { exact: true }).fill('стойкий');
    await page.locator('form').getByRole('button', { name: 'Сохранить' }).click();
    await expect(saved).toBeVisible();
    await page.getByLabel('Перевод', { exact: true }).fill('стойкий!');
    await expect(saved).toHaveCount(0);
  });

  test('saving an exercise shows Saved in its own row, and typing hides it', async ({ page }) => {
    await page.goto('/?state=words#/words');
    await row(page, 'resilient').getByRole('link', { name: 'resilient', exact: true }).click();
    const exercise = page.locator('li').filter({ hasText: 'Допустимые ответы' }).first();
    const saved = exercise.getByRole('status');
    await expect(saved).toHaveCount(0);
    await exercise.getByLabel('Текст', { exact: true }).fill('Edited prompt');
    await exercise.getByRole('button', { name: 'Сохранить' }).click();
    await expect(saved).toHaveText('Сохранено');
    await exercise.getByLabel('Текст', { exact: true }).fill('Edited again');
    await expect(saved).toHaveCount(0);
  });
});
