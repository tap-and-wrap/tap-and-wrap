import {defineConfig} from '@playwright/test';
import base from './playwright.config.js';
export default defineConfig({...base,testIgnore:[],testMatch:['**/premium-cart-photos.spec.js'],outputDir:'./test-results/batch2',webServer:{...base.webServer,env:{...base.webServer.env,VITE_GIFT_BOX_BUILDER_ENABLED:'true'}}});
