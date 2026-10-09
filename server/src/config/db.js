import mongoose from 'mongoose';
import { setTimeout as delay } from 'node:timers/promises';
import { env } from './env.js';
import { validateDatabaseUri, assertDatabaseWriteAllowed, databaseDiagnostic, DatabaseSafetyError } from './database-safety.js';
import { initializeDatabaseDns } from './database-dns.js';
import { verifyDatabaseSchema } from './schema.js';

let readinessBlocked = false;
let draining = false;
let connectionStatus = { code: 'DATABASE_NOT_CONNECTED', attempts: 0 };

export function databaseConfiguration(configuration = env) {
  return { target: configuration.databaseTarget, nodeEnv: configuration.nodeEnv,
    productionDatabaseAuthorized: configuration.productionDatabaseAuthorized,
    productionDatabaseHost: configuration.productionDatabaseHost };
}

function terminalCause(error, depth = 0) {
  if (!error || depth > 5) return false;
  const code = error.code;
  const name = typeof error.name === 'string' ? error.name : '';
  const tlsCode = typeof code === 'string' && (/^ERR_(?:TLS|SSL)_/.test(code)
    || /^(?:CERT_|UNABLE_TO_.*(?:CERT|ISSUER))/.test(code) || code.includes('SELF_SIGNED'));
  if ([18, 13].includes(code) || ['CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'DEPTH_ZERO_SELF_SIGNED_CERT',
    'ERR_TLS_CERT_ALTNAME_INVALID', 'ERR_TLS_CERT_SIGNATURE_ALGORITHM_UNSUPPORTED'].includes(code)
    || tlsCode || /Authentication|Parse|InvalidArgument|Configuration/.test(name)) return true;
  if (terminalCause(error.cause, depth + 1)) return true;
  const servers = error.reason?.servers;
  return servers instanceof Map && [...servers.values()].slice(0, 32).some(server => terminalCause(server.error, depth + 1));
}

export function retryableDatabaseFailure(error) {
  return !terminalCause(error) && databaseDiagnostic(error).code === 'DATABASE_CONNECTION_FAILED';
}

async function boundedDisconnect(disconnect, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(disconnect).then(() => true, () => false),
      new Promise(resolve => { timer = setTimeout(() => resolve(false), timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); }
}

async function boundedStartupStep(operation, timeoutMs, code) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((resolve, reject) => { timer = setTimeout(() => reject(new DatabaseSafetyError(code)), timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); }
}

/** Bounded initial recovery only; wrong target/configuration/authentication never retry. */
export async function connectDatabase({ configuration = env, connect = (...args) => mongoose.connect(...args),
  disconnect = () => mongoose.disconnect(), verifySchema = verifyDatabaseSchema,
  initializeDns = initializeDatabaseDns, sleep = (ms, signal) => delay(ms, undefined, { signal }),
  random = Math.random, logger = console, signal, disconnectTimeoutMs = 2000,
  connectTimeoutMs = 12000, schemaTimeoutMs = 6000 } = {}) {
  readinessBlocked = true;
  const attempts = configuration.databaseConnectAttempts ?? 3;
  const baseMs = configuration.databaseRetryBaseMs ?? 500;
  const fail = (error, count) => {
    connectionStatus = { ...databaseDiagnostic(error), attempts: count };
    logger.warn(JSON.stringify({ event: 'database_not_ready', ...connectionStatus }));
    return { connected: false, ...connectionStatus };
  };
  if (!configuration.mongoUri) return fail(new DatabaseSafetyError('DATABASE_CONFIGURATION_MISSING'), 0);
  let target;
  try {
    target = validateDatabaseUri(configuration.mongoUri, databaseConfiguration(configuration));
    if (!Number.isInteger(attempts) || attempts < 1 || attempts > 5 || !Number.isInteger(baseMs) || baseMs < 1 || baseMs > 5000
      || !Number.isInteger(connectTimeoutMs) || connectTimeoutMs < 1 || connectTimeoutMs > 30000
      || !Number.isInteger(schemaTimeoutMs) || schemaTimeoutMs < 1 || schemaTimeoutMs > 10000) {
      throw new DatabaseSafetyError('DATABASE_RETRY_CONFIGURATION_INVALID');
    }
    const dns = initializeDns(configuration);
    if (dns.overrideEnabled) logger.log(JSON.stringify({ event: 'database_process_dns_configured', ...dns }));
  } catch (error) { return fail(error, 0); }
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (signal?.aborted || draining) return fail({ name: 'DatabaseShutdownError' }, attempt - 1);
    try {
      await boundedStartupStep(() => connect(configuration.mongoUri, { dbName: target.dbName, autoCreate: false, autoIndex: false,
        serverSelectionTimeoutMS: 6000, connectTimeoutMS: 6000, maxPoolSize: 5 }), connectTimeoutMs, 'DATABASE_STARTUP_TIMEOUT');
      if (signal?.aborted || draining) throw { name: 'DatabaseShutdownError' };
      assertDatabaseWriteAllowed(mongoose.connection, configuration);
      await boundedStartupStep(() => verifySchema(configuration, { timeoutMs: schemaTimeoutMs }), schemaTimeoutMs, 'DATABASE_SCHEMA_TIMEOUT');
      assertDatabaseWriteAllowed(mongoose.connection, configuration);
      readinessBlocked = false;
      connectionStatus = { code: 'DATABASE_READY', attempts: attempt };
      logger.log(JSON.stringify({ event: 'database_ready', target: target.target, ...connectionStatus }));
      return { connected: true, ...connectionStatus };
    } catch (error) {
      const cleaned = await boundedDisconnect(disconnect, Math.max(1, Math.min(2000, disconnectTimeoutMs)));
      if (!cleaned) return fail(new DatabaseSafetyError('DATABASE_DISCONNECT_UNCERTAIN'), attempt);
      if (!retryableDatabaseFailure(error) || attempt === attempts || signal?.aborted || draining) return fail(error, attempt);
      const waitMs = Math.min(10000, baseMs * 2 ** (attempt - 1) + Math.floor(Math.max(0, Math.min(1, random())) * baseMs));
      logger.warn(JSON.stringify({ event: 'database_retry_scheduled', code: databaseDiagnostic(error).code, attempt, waitMs }));
      try { await sleep(waitMs, signal); }
      catch { return fail({ name: 'DatabaseShutdownError' }, attempt); }
    }
  }
}

export function beginDatabaseDrain() { draining = true; }
export function databaseHealth() { return { ...connectionStatus,
  ...(connectionStatus.code === 'DATABASE_READY' && !isDatabaseReady() && !draining ? { code: 'DATABASE_CONNECTION_LOST' } : {}), draining }; }
export function isDatabaseDraining() { return draining; }
export function isDatabaseReady() {
  if (readinessBlocked || draining) return false;
  try { assertDatabaseWriteAllowed(mongoose.connection, env); return true; } catch { return false; }
}
