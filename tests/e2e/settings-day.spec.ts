import { expect, test, type Page } from '@playwright/test';

const dayStart = (page: Page) => page.getByRole('combobox', { name: 'Day starts at' });
const newDay = (page: Page) => page.getByRole('button', { name: 'Start a new day' });

async function open(page: Page, query = '') {
  await page.goto(`/?state=words${query}#/settings`);
  await page.getByRole('radio', { name: 'English' }).click();
  await expect(dayStart(page)).toBeVisible();
}

test('day start select offers 00:00 to 12:00 and defaults to 05:00', async ({ page }) => {
  await open(page);
  await expect(dayStart(page)).toContainText('05:00');
  await dayStart(page).click();
  await expect(page.getByRole('option')).toHaveCount(13);
  await expect(page.getByRole('option').first()).toHaveText('00:00');
  await expect(page.getByRole('option').last()).toHaveText('12:00');
});

test('start a new day is disabled once the day has started', async ({ page }) => {
  await open(page);
  await expect(newDay(page)).toBeDisabled();
  await expect(page.getByText('The day has already started')).toBeVisible();
  expect(await newDay(page).evaluate((el) => getComputedStyle(el).cursor)).toBe('not-allowed');
});

test('start hour 00:00 hides the button', async ({ page }) => {
  await open(page);
  await dayStart(page).click();
  await page.getByRole('option', { name: '00:00' }).click();
  await expect(newDay(page)).toHaveCount(0);
});

test('start a new day moves the date', async ({ page }) => {
  await open(page, '&early=1');
  await expect(newDay(page)).toBeEnabled();
  await newDay(page).click();
  await expect(page.getByText(/Start .+\?/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(newDay(page)).toBeDisabled();
});
