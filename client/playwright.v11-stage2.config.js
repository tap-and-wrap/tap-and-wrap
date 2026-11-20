import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';
// Owner-safe, isolated customer feature checks. Never points at production.
export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: ['**/v11-stage2.spec.js','**/v10-stage4.spec.js','**/gift-box-phase4.spec.js',
    '**/gift-box-phase35.spec.js','**/gift-box-handoff.spec.js','**/gift-box-redesign.spec.js',
    '**/gift-box-calibration.spec.js','**/gift-box-phase6b4-audit.spec.js'],
  outputDir:'./test-results-v11-stage2',
  webServer: {...base.webServer,env:{...base.webServer.env,VITE_GIFT_BOX_BUILDER_ENABLED:'true'}},
});
