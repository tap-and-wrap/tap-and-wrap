import {defineConfig} from '@playwright/test';
import base from './playwright.config.js';
export default defineConfig({...base,testIgnore:[],testMatch:['**/image-picker-v2.spec.js','**/staggered-menu-v2.spec.js','**/admin-media.spec.js','**/media-experience.spec.js'],outputDir:'./test-results/handoff-r2-a',timeout:60000});
