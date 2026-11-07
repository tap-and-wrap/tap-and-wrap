import {defineConfig} from '@playwright/test';
import base from './playwright.config.js';
export default defineConfig({...base,testIgnore:[],testMatch:['**/owner-handoff-visual.spec.js'],outputDir:'./test-results/handoff-r1',timeout:90000,webServer:{...base.webServer,env:{...base.webServer.env,VITE_GIFT_BOX_BUILDER_ENABLED:'true'}}});
