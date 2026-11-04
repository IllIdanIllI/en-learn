import { expect, test, type Page } from '@playwright/test';

// Learner's rule (CLAUDE.md): every interactive element shows the pointer cursor; disabled ones show `not-allowed`.
// Each page is opened in a few preview states; open panels and expandable rows are opened too, then every interactive element is checked.

const INTERACTIVE = [
  'button', 'a[href]', 'summary', 'select', 'label[for]',
  'input[type="checkbox"]', 'input[type="radio"]',
  '[role="button"]', '[role="link"]', '[role="menuitem"]', '[role="menuitemcheckbox"]', '[role="menuitemradio"]',
  '[role="option"]', '[role="tab"]', '[role="switch"]', '[role="checkbox"]', '[role="radio"]',
].join(',');

async function wrongCursors(page: Page): Promise<string[]> {
  return page.evaluate((selector) => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue; // hidden
      const disabled = el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true';
      const want = disabled ? 'not-allowed' : 'pointer';
      const got = getComputedStyle(el).cursor;
      if (got !== want) {
        const name = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
        out.push(`<${el.tagName.toLowerCase()}${el.getAttribute('role') ? ` role=${el.getAttribute('role')}` : ''}> "${name}": ${got}, want ${want}`);
      }
    }
    return out;
  }, INTERACTIVE);
}

/** Opens what a page hides behind a click: the set-up panel (gear), expandable rows and dispute forms, each once. */
async function openHidden(page: Page) {
  const toggles = await page.locator('button[aria-expanded="false"]:not([role="combobox"])').all();
  for (const toggle of toggles) {
    if (await toggle.isVisible() && await toggle.isEnabled()) await toggle.click();
  }
}

const CASES: [string, string][] = [
  ['no_session', 'today'], ['rest', 'today'], ['questions', 'today'], ['graded', 'today'], ['closed', 'today'],
  ['spot', 'today'], ['spot-graded', 'today'], ['writing', 'today'], ['writing-graded', 'today'], ['rewrite', 'today'],
  ['progress', 'progress'], ['writing-graded', 'progress'], ['graded', 'rules'], ['graded', 'errors'],
  ['writing-graded', 'errors'], ['writing-graded', 'writing'], ['graded', 'settings'], ['prereq_missing', 'prerequisites'],
  ['words', 'words'], ['words', 'words/practice'], ['words-done', 'words/practice'],
];

for (const [state, route] of CASES) {
  test(`pointer cursor: ${route} (${state})`, async ({ page }) => {
    await page.goto(`/?state=${state}#/${route}`);
    await page.waitForLoadState('networkidle');
    await page.locator('main').waitFor();
    await openHidden(page);
    expect(await wrongCursors(page)).toEqual([]);
  });
}

test('pointer cursor: settings with a select list open', async ({ page }) => {
  await page.goto('/?state=graded#/settings');
  await page.getByRole('combobox').first().click();
  await expect(page.getByRole('option').first()).toBeVisible();
  expect(await wrongCursors(page)).toEqual([]);
});
