import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';

// Stage 4 checks the real Gift Box builder. The standard storefront suite
// intentionally disables this route, so it cannot run the builder test.
// All requests remain confined to the existing isolated, scrubbed fixture.
export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: ['**/batch2-home-media.spec.js', '**/v10-stage4.spec.js'],
  outputDir: './test-results-v10-stage4',
  webServer: {
    ...base.webServer,
    env: { ...base.webServer.env, VITE_GIFT_BOX_BUILDER_ENABLED: 'true' },
  },
});
