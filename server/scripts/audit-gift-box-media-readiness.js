// No arguments: compact summary. --full: all verified local media identities.
// Always read-only; no credentials, database, storage provider or deployment.
import { auditGiftBoxMediaReadiness } from './lib/audit-gift-box-media-readiness.js';
try {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length && args[0] !== '--full')) throw new Error('Use no arguments or --full.');
  const report = await auditGiftBoxMediaReadiness();
  if (!args.length) delete report.entries;
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(error.message?.startsWith('Gift-box media readiness:') || error.message?.startsWith('Use ')
    ? error.message : 'Gift-box media readiness failed: source/derivative evidence is missing, altered, or invalid.');
  process.exitCode = 1;
}
