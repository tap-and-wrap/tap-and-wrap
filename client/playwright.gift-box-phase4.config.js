import base from './playwright.config.js';
import { defineConfig } from '@playwright/test';

export default defineConfig({ ...base, metadata: { captureEvidence: false }, testIgnore: [],
  testMatch: ['**/gift-box-phase4.spec.js', '**/gift-box-v2.spec.js', '**/gift-box-phase35.spec.js'],
  outputDir: './test-results-gift-box-phase4',
  webServer: { ...base.webServer, env: { ...base.webServer.env, VITE_GIFT_BOX_BUILDER_ENABLED: 'true' } },
});
