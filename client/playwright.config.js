import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // Enabled-builder studies use playwright.gift-box-phase4.config.js. The
  // production chunk-loading check uses playwright.gift-box-loading.config.js.
  // Default public intake stays disabled; do not run contradictory fixtures here.
  testIgnore: ['**/gift-box-handoff.spec.js','**/gift-box-v2.spec.js','**/gift-box-phase35.spec.js','**/gift-box-phase4.spec.js','**/gift-box-cart.spec.js',
    '**/gift-box-calibration.spec.js','**/gift-box-redesign.spec.js','**/gift-box-release-checkout.spec.js',
    '**/gift-box-phase6b4-audit.spec.js','**/gift-box-personalization-final.spec.js','**/gift-box-loading.spec.js'],
  timeout: 30_000,
  expect: { timeout: 8000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  outputDir: './test-results',
  use: {
    baseURL: 'http://127.0.0.1:5191',
    browserName: 'chromium',
    channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : 'chromium'),
    headless: true,
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5191 --strictPort',
    url: 'http://127.0.0.1:5191',
    reuseExistingServer: false,
    env: { TAP_WRAP_ISOLATED_TEST: 'true', VITE_GIFT_BOX_BUILDER_ENABLED: 'false', VITE_API_BASE_URL: 'http://127.0.0.1:4091/api/v1', VITE_META_ENABLED: 'true', VITE_SEO_INDEXING_ENABLED: 'false' },
    timeout: 30_000,
  },
});
