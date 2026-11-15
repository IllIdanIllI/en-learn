import type { Locator } from '@playwright/test';

/** Taps the letter tiles of an anagram card in the given order (spaces are not tiles). */
export async function tapTiles(card: Locator, letters: string) {
  for (const ch of letters.replace(/ /g, '')) {
    await card.locator('[data-testid="tile"]:enabled').filter({ hasText: ch }).first().click();
  }
}

/** Takes every placed letter back, so the learner can lay the tiles out again. */
export async function clearTiles(card: Locator) {
  const placed = card.getByTestId('placed');
  for (let n = await placed.count(); n > 0; n--) await placed.first().click();
}
