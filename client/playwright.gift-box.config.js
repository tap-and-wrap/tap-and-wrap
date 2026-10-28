import base from './playwright.config.js';
import { defineConfig } from '@playwright/test';
export default defineConfig({ ...base, testIgnore: [], testMatch: '**/gift-box-v2.spec.js', outputDir: './test-results-gift-box-phase3-browser',
  webServer: { ...base.webServer, env: { ...base.webServer.env, VITE_GIFT_BOX_BUILDER_ENABLED: 'true' } },
});
