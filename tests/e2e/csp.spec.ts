import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const conf = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8')) as { app: { security: { csp: string; devCsp: string } } };
const { csp, devCsp } = conf.app.security;
const preambleHash = /'sha256-[^']+'/.exec(devCsp)?.[0] ?? '';

// Production policy plus only what the preview needs: sql.js wasm, Vite's refresh preamble and the dev origin.
const previewCsp = csp
  .replace('script-src', `script-src 'wasm-unsafe-eval' ${preambleHash}`)
  .replace('connect-src', 'connect-src http://localhost:5174 ws://localhost:5174');

test('production CSP does not break structured LLM calls (no eval / new Function)', async ({ page }) => {
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') return route.continue();
    const res = await route.fetch();
    await route.fulfill({ response: res, headers: { ...res.headers(), 'content-security-policy': previewCsp } });
  });
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(m.text());
  });
  page.on('pageerror', (e) => problems.push(e.message));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`));
  });

  await page.setViewportSize({ width: 1280, height: 1400 });
  await page.goto('/?state=no_session#/today');
  await page.getByRole('button', { name: 'Начать сессию' }).click();
  // Wait for either outcome so a violation is reported as such, not as a missing button.
  const graded = page.getByRole('button', { name: 'Проверить ответы' });
  await expect.poll(async () => problems.length > 0 || (await graded.isVisible()), { timeout: 15_000 }).toBe(true);
  expect(problems).toEqual([]);
  await expect(graded).toBeVisible();
});
