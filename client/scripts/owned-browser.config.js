import { defineConfig } from '@playwright/test';
import { resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
if(process.env.TAP_WRAP_ISOLATED_TEST!=='true'||process.env.NODE_ENV!=='test'||!process.env.TAP_WRAP_BROWSER_CONFIG)throw Error('Use the owned isolated browser launcher.');
const file=resolve(process.env.TAP_WRAP_BROWSER_CONFIG),within=relative(process.cwd(),file);
if(!within||within.startsWith('..')||isAbsolute(within))throw Error('Project test configuration required.');
const config=(await import(pathToFileURL(file).href)).default;
export default defineConfig({...config,testDir:resolve('e2e'),outputDir:resolve(config.outputDir||'test-results'),webServer:undefined});
