// Renders src-tauri/icons/source/{light,night}.svg to PNGs next to them (1024x1024, transparent corners).
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const dir = resolve('src-tauri/icons/source');
const bundledChromium = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(existsSync(bundledChromium) ? { executablePath: bundledChromium } : {});
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
for (const name of ['light', 'night']) {
  await page.goto(pathToFileURL(resolve(dir, `${name}.svg`)).href);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(dir, `${name}.png`), omitBackground: true });
}
await browser.close();
