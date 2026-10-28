import base from './playwright.config.js';
import { defineConfig } from '@playwright/test';

export default defineConfig({ ...base, testIgnore: [], testMatch: ['**/gift-box-policies.spec.js'], outputDir: './test-results-gift-box-phase5b4' });
