import base from './playwright.config.js';
import { defineConfig } from '@playwright/test';
// Routine runs verify behavior without collecting the same review images again.
export default defineConfig({...base,metadata:{captureEvidence:false},testIgnore:[],testMatch:'**/gift-box-phase35.spec.js',outputDir:'./test-results-gift-box-phase35-browser',
  webServer:{...base.webServer,env:{...base.webServer.env,VITE_GIFT_BOX_BUILDER_ENABLED:'true'}}});
