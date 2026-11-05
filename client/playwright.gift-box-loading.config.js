import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';

export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: ['**/gift-box-loading.spec.js'],
  outputDir: './test-results/gift-box-loading',
  webServer: {
    ...base.webServer,
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 5191 --strictPort',
    timeout: 60000,
    env: { ...base.webServer.env, NODE_ENV: 'production', VITE_GIFT_BOX_BUILDER_ENABLED: 'true' },
  },
});
