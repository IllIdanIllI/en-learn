import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

const bundledChromium = '/opt/pw-browsers/chromium';

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results/playwright',
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5174',
    viewport: { width: 1280, height: 800 },
    launchOptions: existsSync(bundledChromium) ? { executablePath: bundledChromium } : {},
  },
  webServer: {
    command: 'node_modules/.bin/vite --port 5174 --strictPort',
    url: 'http://localhost:5174',
    reuseExistingServer: true,
  },
});
