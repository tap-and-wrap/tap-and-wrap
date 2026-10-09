import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const safeEnvironment = {
  NODE_ENV: 'test', NODE_OPTIONS: '', MONGODB_URI: '', CATALOG_IMPORT_STAGING_URI: '', DATABASE_TARGET: 'local',
  DOTENV_CONFIG_PATH: fileURLToPath(new URL('../server/test/.no-env-file', import.meta.url)),
  CHECKOUT_ENABLED: 'false', COMMERCE_LAUNCH_AUTHORIZED: 'false', STORAGE_ENABLED: 'false',
  EMAIL_ENABLED: 'false', EMAIL_USER: '', EMAIL_APP_PASSWORD: '', NOTIFICATIONS_ENABLED: 'false',
  META_ENABLED: 'false', META_CAPI_ENABLED: 'false', META_ACCESS_TOKEN: '', R2_ACCESS_KEY_ID: '', R2_SECRET_ACCESS_KEY: '',
};
export default defineConfig({
  testDir: './connected-e2e', timeout: 60000, expect: { timeout: 12000 }, workers: 1, fullyParallel: false,
  reporter: 'list', outputDir: './test-results-contracts',
  use: { baseURL: 'http://127.0.0.1:5192', browserName: 'chromium',
    channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : 'chromium'),
    headless: true, viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure' },
  webServer: [
    { command: 'node ../server/test/helpers/connected-api-server.js --isolated-contract-tests', url: 'http://127.0.0.1:4092/__fixture/ready',
      reuseExistingServer: false, env: safeEnvironment, timeout: 120000 },
    { command: 'npm run dev -- --config vite.contract.config.js --host 127.0.0.1 --port 5192 --strictPort', url: 'http://127.0.0.1:5192',
      reuseExistingServer: false, env: { ...safeEnvironment, VITE_API_BASE_URL: 'http://127.0.0.1:4092/api/v1', VITE_META_ENABLED: 'false', VITE_SEO_INDEXING_ENABLED: 'false' }, timeout: 30000 },
  ],
});
