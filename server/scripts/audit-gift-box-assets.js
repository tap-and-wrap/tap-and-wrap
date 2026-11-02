import { auditAssetCollection } from './lib/gift-box-assets.js';

try {
  const args = process.argv.slice(2);
  if (args.length && !(args.length === 1 && args[0] === '--require-production-ready')) throw new Error('Use no arguments, or --require-production-ready.');
  const report = await auditAssetCollection();
  console.log(JSON.stringify({ mode: 'read-only', databaseConnections: false, networkRequests: false, writes: false, ...report }, null, 2));
  if (args.length && !report.productionReady) process.exitCode = 1;
} catch (error) {
  console.error(error.message?.startsWith('Gift-box') || error.message?.startsWith('Use ') ? error.message : 'Gift-box audit failed; check the reviewed local source collection.');
  process.exitCode = 1;
}
