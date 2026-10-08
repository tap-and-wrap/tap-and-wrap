import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { connectDatabase, isDatabaseReady } from '../src/config/db.js';
import { validateDatabaseUri, assertDatabaseWriteAllowed } from '../src/config/database-safety.js';
import { cleanupExpiredUploads } from '../src/commerce/uploads.js';
import { runNotificationBatch, notificationSettings } from '../src/commerce/notifications.js';
import { runMetaBatch, trackingSettings } from '../src/tracking/service.js';

export function parseJobArguments(args) {
  const options = { apply: false, target: null, batchSize: 20 };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--once') options.apply = true;
    else if (argument === '--target') options.target = args[++index];
    else if (argument === '--confirm-writes') options.confirmWrites = true;
    else if (argument === '--batch-size') options.batchSize = Number(args[++index]);
    else if (argument === '--help') options.help = true;
    else throw new Error('Unknown commerce-jobs argument.');
  }
  if (!Number.isInteger(options.batchSize) || options.batchSize < 1 || options.batchSize > 100) throw new Error('Batch size must be 1–100.');
  if (options.target && !['local', 'staging'].includes(options.target)) throw new Error('Only exact local or staging targets are allowed.');
  if (options.apply && (!options.confirmWrites || !options.target)) throw new Error('Writes require --once --target local|staging --confirm-writes.');
  return options;
}

export async function runCommerceJobs(options) {
  if (!options.apply) return { mode: 'dry-run', writes: false, notificationDeliveryEnabled: notificationSettings().enabled, metaDeliveryEnabled: trackingSettings().capiEnabled, privateStorageEnabled: process.env.STORAGE_ENABLED === 'true' };
  if (options.confirmWrites !== true || !['local', 'staging'].includes(options.target)) throw new Error('Explicit write authorization and a safe target are required.');
  if (env.databaseTarget !== options.target) throw new Error('The explicit worker target does not match DATABASE_TARGET.');
  validateDatabaseUri(env.mongoUri, { target: options.target, nodeEnv: env.nodeEnv });
  await connectDatabase();
  if (!isDatabaseReady()) throw new Error('The authorized database target is unavailable.');
  try {
    assertDatabaseWriteAllowed(mongoose.connection, env);
    const notifications = await runNotificationBatch({ batchSize: options.batchSize });
    assertDatabaseWriteAllowed(mongoose.connection, env);
    const tracking = await runMetaBatch({ batchSize: options.batchSize });
    let uploads = { enabled: false, processed: 0, deleted: 0 };
    if (process.env.STORAGE_ENABLED === 'true') {
      assertDatabaseWriteAllowed(mongoose.connection, env);
      uploads = { enabled: true, ...await cleanupExpiredUploads({ batchSize: options.batchSize }) };
    }
    return { mode: 'authorized-once', notifications, tracking, uploads };
  } finally { await mongoose.disconnect(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseJobArguments(process.argv.slice(2));
    if (options.help) console.log('Commerce jobs default to offline dry-run. Authorized bounded work: --once --target local|staging --confirm-writes [--batch-size 1..100].');
    else console.log(JSON.stringify(await runCommerceJobs(options), null, 2));
  } catch {
    console.error('Commerce jobs did not run. Check the explicit target, authorization flags and safe configuration; internal details are redacted.');
    process.exitCode = 1;
  }
}
