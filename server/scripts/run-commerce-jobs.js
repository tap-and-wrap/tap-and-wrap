import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { validateDatabaseUri, assertDatabaseWriteAllowed } from '../src/config/database-safety.js';
import { createWorkBudget, shouldStop, boundedOperation } from '../src/commerce/work-budget.js';
import { CommerceJobRun } from '../src/models/CommerceJobRun.js';

export function parseJobArguments(args) {
  const options = { apply: false, target: null, batchSize: 20, maxDurationMs: 60000 };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--once') options.apply = true;
    else if (argument === '--target') options.target = args[++index];
    else if (argument === '--confirm-writes') options.confirmWrites = true;
    else if (argument === '--confirm-production-writes') options.confirmProductionWrites = true;
    else if (argument === '--batch-size') options.batchSize = Number(args[++index]);
    else if (argument === '--max-duration-ms') options.maxDurationMs = Number(args[++index]);
    else if (argument === '--help') options.help = true;
    else throw new Error('Unknown commerce-jobs argument.');
  }
  if (!Number.isInteger(options.batchSize) || options.batchSize < 1 || options.batchSize > 100) throw new Error('Batch size must be 1–100.');
  if (!Number.isInteger(options.maxDurationMs) || options.maxDurationMs < 1000 || options.maxDurationMs > 600000) throw new Error('Worker duration must be 1000–600000 milliseconds.');
  if (options.target && (!['local', 'staging', 'production'].includes(options.target) || (options.target === 'production' && options.confirmProductionWrites !== true))) throw new Error('Only exact local or staging targets are allowed unless production write confirmation is explicit.');
  if (options.confirmProductionWrites && options.target !== 'production') throw new Error('Production confirmation requires the exact production target.');
  if (options.apply && (!options.confirmWrites || !options.target)) throw new Error('Writes require --once --target local|staging --confirm-writes.');
  return options;
}

/** Offline validation only. The additional production worker flag is separate
 * from database, checkout and provider launch approval. No credentials returned. */
export function validateWorkerTarget(options, settings = process.env) {
  if (options.apply !== true || options.confirmWrites !== true || !['local', 'staging', 'production'].includes(options.target)) throw new Error('Explicit worker write authorization and target are required.');
  if ((settings.DATABASE_TARGET || 'local') !== options.target) throw new Error('The explicit worker target does not match DATABASE_TARGET.');
  if (options.target === 'production' && (options.confirmProductionWrites !== true || settings.PRODUCTION_WORKER_AUTHORIZED !== 'true')) throw new Error('Production workers require separate explicit authorization.');
  return validateDatabaseUri(settings.MONGODB_URI || '', { target: options.target, nodeEnv: settings.NODE_ENV || 'development',
    productionDatabaseAuthorized: settings.PRODUCTION_DATABASE_AUTHORIZED === 'true', productionDatabaseHost: settings.PRODUCTION_DATABASE_HOST || '' });
}

/** Nodemailer cannot abort an active pooled SMTP send. Only arm this after the
 * command has finalized its durable state and awaited database disconnect.
 * An unref timer leaves healthy processes alone and bounds residual sockets. */
export function armResidualProcessExit({ graceMs = 5000 } = {}) {
  if (!Number.isInteger(graceMs) || graceMs < 1 || graceMs > 5000) throw new Error('Invalid residual shutdown budget.');
  const timer = setTimeout(() => {
    console.error(JSON.stringify({ event: 'worker_shutdown_forced', code: 'RESIDUAL_HANDLE_TIMEOUT' }));
    process.exit(process.exitCode || 0);
  }, graceMs);
  timer.unref();
  return timer;
}

/** A single explicit execution, not a scheduler. Persist safe counters only;
 * never recipients, uploads, request bodies, tokens or provider error text. */
export async function executeCommerceBatch({ batchSize = 20, maxDurationMs = 60000, signal, confirmProductionWrites = false } = {}, adapters) {
  if (adapters && process.env.NODE_ENV !== 'test') throw new Error('Job adapters are test-only.');
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) throw new Error('Invalid job batch size.');
  const budget = createWorkBudget({ maxDurationMs, signal });
  process.env.TAP_WRAP_SKIP_DOTENV = 'true';
  const [{ env }, { cleanupExpiredUploads }, { runNotificationBatch }, { runMetaBatch }] = await Promise.all([
    import('../src/config/env.js'), import('../src/commerce/uploads.js'), import('../src/commerce/notifications.js'), import('../src/tracking/service.js'),
  ]);
  if (env.databaseTarget === 'production' && (confirmProductionWrites !== true || process.env.PRODUCTION_WORKER_AUTHORIZED !== 'true')) throw new Error('Production worker execution is not authorized.');
  const runId = randomUUID();
  const startedAt = new Date();
  assertDatabaseWriteAllowed(CommerceJobRun.db, env);
  const expired = await CommerceJobRun.find({ state: 'running', leaseUntil: { $lte: startedAt } }).select('_id').limit(batchSize).lean().maxTimeMS(3000);
  if (expired.length) await CommerceJobRun.updateMany({ _id: { $in: expired.map(run => run._id) }, state: 'running', leaseUntil: { $lte: startedAt } }, { $set: { state: 'interrupted', finishedAt: startedAt } });
  await CommerceJobRun.create({ runId, state: 'running', startedAt, leaseUntil: new Date(startedAt.getTime() + maxDurationMs + 60000) });
  const stages = {};
  const work = [
    ['notifications', adapters?.notificationBatch || runNotificationBatch, true],
    ['tracking', adapters?.trackingBatch || runMetaBatch, true],
    ['uploads', adapters?.uploadCleanup || cleanupExpiredUploads, adapters?.storageEnabled ?? process.env.STORAGE_ENABLED === 'true'],
  ];
  for (const [name, perform, enabled] of work) {
    if (!enabled) { stages[name] = { enabled: false }; continue; }
    if (shouldStop(budget)) { stages[name] = { stopped: true }; continue; }
    const stageStarted = Date.now();
    try {
      assertDatabaseWriteAllowed(mongoose.connection, env);
      const result = await perform({ batchSize, budget });
      stages[name] = Object.fromEntries(Object.entries(result || {}).filter(([key, value]) => /^[a-zA-Z][a-zA-Z0-9]{0,50}$/.test(key) && (typeof value === 'boolean' || Number.isSafeInteger(value))));
    } catch {
      // A failed independent provider must not starve other maintenance stages.
      // Every underlying lease retains its own retry/uncertain-delivery rules.
      stages[name] = { failed: true, code: 'STAGE_FAILED' };
    }
    stages[name].durationMs = Date.now() - stageStarted;
    assertDatabaseWriteAllowed(CommerceJobRun.db, env);
    await CommerceJobRun.updateOne({ runId, state: 'running' }, { $set: { stages } }).maxTimeMS(3000);
  }
  const state = Object.values(stages).some(stage => stage.failed === true || Number(stage.failed) > 0 || Number(stage.dead) > 0 || Number(stage.uncertain) > 0 || Number(stage.reviewRequired) > 0)
    ? 'partial' : Object.values(stages).some(stage => stage.stopped) ? 'stopped' : 'completed';
  assertDatabaseWriteAllowed(CommerceJobRun.db, env);
  await CommerceJobRun.updateOne({ runId, state: 'running' }, { $set: { state, stages, finishedAt: new Date() } }).maxTimeMS(3000);
  return { runId, state, ...stages };
}

export async function runCommerceJobs(options) {
  if (!options.apply) return { mode: 'dry-run', writes: false, databaseConnected: false, dotenvLoaded: false,
    notificationDeliveryEnabled: process.env.EMAIL_ENABLED === 'true' || process.env.NOTIFICATIONS_ENABLED === 'true',
    metaDeliveryEnabled: process.env.META_ENABLED === 'true' && process.env.META_POLICY_APPROVED === 'true' && process.env.META_CAPI_ENABLED === 'true', privateStorageEnabled: process.env.STORAGE_ENABLED === 'true' };
  validateWorkerTarget(options);
  process.env.TAP_WRAP_SKIP_DOTENV = 'true';
  const [{ env }, { connectDatabase, isDatabaseReady }] = await Promise.all([import('../src/config/env.js'), import('../src/config/db.js')]);
  if (env.databaseTarget !== options.target) throw new Error('The explicit worker target does not match DATABASE_TARGET.');
  validateDatabaseUri(env.mongoUri, { target: options.target, nodeEnv: env.nodeEnv, productionDatabaseAuthorized: env.productionDatabaseAuthorized, productionDatabaseHost: env.productionDatabaseHost });
  try {
    await connectDatabase({ signal: options.signal });
    if (!isDatabaseReady()) throw new Error('The authorized database target is unavailable.');
    return { mode: 'authorized-once', ...await executeCommerceBatch(options) };
  } finally { await boundedOperation(() => mongoose.disconnect(), { timeoutMs: 5000, code: 'DATABASE_DISCONNECT_TIMEOUT' }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseJobArguments(process.argv.slice(2));
    if (options.help) console.log('Commerce jobs default to offline dry-run. Authorized bounded work: --once --target local|staging --confirm-writes [--batch-size 1..100] [--max-duration-ms 1000..600000]. Production additionally requires --target production --confirm-production-writes and independently approved terminal worker/database configuration.');
    else {
      const controller = new AbortController();
      const stop = () => controller.abort();
      process.once('SIGTERM', stop); process.once('SIGINT', stop);
      try {
        const result = await runCommerceJobs({ ...options, signal: controller.signal });
        console.log(JSON.stringify(result, null, 2));
        if (result.state === 'partial') process.exitCode = 1;
      }
      finally { process.removeListener('SIGTERM', stop); process.removeListener('SIGINT', stop); }
    }
  } catch {
    console.error('Commerce jobs did not run. Check the explicit target, authorization flags and safe configuration; internal details are redacted.');
    process.exitCode = 1;
  } finally { armResidualProcessExit(); }
}
