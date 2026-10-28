import { prepareDevelopmentAssets } from './lib/prepare-gift-box-assets.js';

try {
  if (process.argv.length !== 2) throw new Error('Use no arguments; gift-box preparation has a fixed ignored local destination.');
  console.log(JSON.stringify(await prepareDevelopmentAssets(), null, 2));
} catch (error) {
  console.error(error.message?.startsWith('Gift-box') || error.message?.startsWith('Use ') ? error.message : 'Gift-box preparation failed; source files were not modified.');
  process.exitCode = 1;
}
