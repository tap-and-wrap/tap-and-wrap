import { defineConfig } from '@playwright/test';

if (process.env.NODE_ENV !== 'test' || process.env.TAP_WRAP_ISOLATED_TEST !== 'true' ||
  !['TAP_WRAP_CONTRACT_API_PORT', 'TAP_WRAP_CONTRACT_WEB_PORT'].every(key => /^\d+$/.test(process.env[key] || '') && Number(process.env[key]) >= 1024 && Number(process.env[key]) <= 65535)) {
  throw new Error('Use scripts/run-contract-tests.js; existing local APIs must never be reused.');
}


export default defineConfig({
  testMatch: process.env.TAP_WRAP_CONTRACT_CHECKOUT === 'true' ? '**/enabled-checkout.spec.js' : '**/*contracts.spec.js',
  testDir: './connected-e2e', timeout: 60000, expect: { timeout: 12000 }, workers: 1, fullyParallel: false,
  reporter: 'list', outputDir: './test-results-contracts/browser-' + process.env.TAP_WRAP_CONTRACT_API_PORT,
  use: { baseURL: 'http://127.0.0.1:' + (process.env.TAP_WRAP_CONTRACT_WEB_PORT || 5192), browserName: 'chromium',
    channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : 'chromium'),
    headless: true, viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure' },
  // The guarded launcher owns API, Vite and database lifecycle through IPC.
});
