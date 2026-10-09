import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { validateDatabaseUri, assertDatabaseWriteAllowed, DatabaseSafetyError } from '../src/config/database-safety.js';
import { validateAuthTopology, validateTrustedProxies, runtimeSettings } from '../src/config/deployment.js';
import { validateDatabaseDns, initializeDatabaseDns } from '../src/config/database-dns.js';
import { connectDatabase, retryableDatabaseFailure } from '../src/config/db.js';
import { createGracefulShutdown } from '../src/config/shutdown.js';
import { forwardingGuard, requestContext, sanitizedRequestDiagnostic } from '../src/middleware/operations.js';
import { verifyDatabaseSchema, initializeDatabaseSchema, requiredIndexExists } from '../src/config/schema.js';
import { checkOperationalConfiguration } from '../scripts/check-operations.js';
import { parseSchemaArguments, runSchemaInitialization, schemaConfiguration } from '../scripts/initialize-schema.js';

const uri = 'mongodb+srv://synthetic-user:synthetic-password@approved.synthetic.test/tapandwrap_production';
const approved = { target: 'production', nodeEnv: 'production', productionDatabaseAuthorized: true,
  productionDatabaseHost: 'approved.synthetic.test' };
const logger = () => { const output = []; return { output, warn: value => output.push(value), log: value => output.push(value) }; };
function noSecrets(value) {
  const text = JSON.stringify(value);
  for (const secret of ['synthetic-user', 'synthetic-password', 'approved.synthetic.test', 'mongodb+srv://']) assert.equal(text.includes(secret), false);
}

test('production target is disabled by default and independently requires exact host, name and runtime approval', () => {
  assert.deepEqual(validateDatabaseUri(uri, approved), { target: 'production', dbName: 'tapandwrap_production', disposableTest: false });
  for (const configuration of [
    { ...approved, productionDatabaseAuthorized: false }, { ...approved, nodeEnv: 'development' },
    { ...approved, productionDatabaseHost: '' }, { ...approved, productionDatabaseHost: 'approved..synthetic.test' },
    { ...approved, productionDatabaseHost: '127.0.0.1' },
  ]) assert.throws(() => validateDatabaseUri(uri, configuration), DatabaseSafetyError);
  for (const altered of [uri.replace('tapandwrap_production', 'tapandwrap_staging'), uri.replace('approved.synthetic.test', 'wrong.synthetic.test'),
    uri.replace('synthetic-user:synthetic-password@', ''), `${uri}?tls=false`, `${uri}?dbName=tapandwrap_staging`,
    uri.replace('synthetic-password', 'REPLACE_SECRET')]) assert.throws(() => validateDatabaseUri(altered, approved), DatabaseSafetyError);
  assert.throws(() => validateDatabaseUri('mongodb://127.0.0.1/tapandwrap_dev', { nodeEnv: 'production' }), DatabaseSafetyError);
});

test('production write guard revalidates configured seed host and actual database before each operation', () => {
  const configuration = { ...approved, databaseTarget: 'production', mongoUri: uri };
  const connection = { readyState: 1, name: 'tapandwrap_production', host: 'replica.synthetic.test' };
  assert.equal(assertDatabaseWriteAllowed(connection, configuration).dbName, 'tapandwrap_production');
  assert.throws(() => assertDatabaseWriteAllowed({ ...connection, name: 'tapandwrap_staging' }, configuration), DatabaseSafetyError);
  assert.throws(() => assertDatabaseWriteAllowed(connection, { ...configuration, mongoUri: uri.replace('approved.synthetic.test', 'wrong.synthetic.test') }), DatabaseSafetyError);
  assert.throws(() => assertDatabaseWriteAllowed(connection, { ...configuration, productionDatabaseAuthorized: false }), DatabaseSafetyError);
});

test('offline operational matrix covers local, staging, production, missing and mismatched targets without network access', () => {
  const local = checkOperationalConfiguration({ MONGODB_URI: 'mongodb://127.0.0.1/tapandwrap_dev' });
  assert.equal(local.connected, false); assert.equal(local.writes, false); assert.equal(local.target, 'local');
  const sameSite = { NODE_ENV: 'production', AUTH_DEPLOYMENT_MODE: 'same-site', AUTH_TOPOLOGY_APPROVED: 'true',
    CLIENT_ORIGIN: 'https://shop.synthetic.test', API_PUBLIC_ORIGIN: 'https://api.shop.synthetic.test', AUTH_SITE_DOMAIN: 'shop.synthetic.test' };
  assert.equal(checkOperationalConfiguration({ ...sameSite, DATABASE_TARGET: 'staging', MONGODB_URI: uri.replace('tapandwrap_production', 'tapandwrap_staging') }).target, 'staging');
  const production = checkOperationalConfiguration({ ...sameSite, DATABASE_TARGET: 'production', MONGODB_URI: uri,
    PRODUCTION_DATABASE_AUTHORIZED: 'true', PRODUCTION_DATABASE_HOST: 'approved.synthetic.test' });
  assert.equal(production.database, 'tapandwrap_production'); noSecrets(production);
  for (const config of [{}, { MONGODB_URI: uri }, { DATABASE_TARGET: 'staging', MONGODB_URI: uri },
    { ...sameSite, DATABASE_TARGET: 'production', MONGODB_URI: uri }]) assert.throws(() => checkOperationalConfiguration(config));
});

test('cookie-compatible topology rejects unapproved cross-site hosts and accepts reviewed same-origin or apex/API sites', () => {
  const configuration = { nodeEnv: 'production', authTopologyApproved: true, clientOrigin: 'https://shop.synthetic.test',
    apiPublicOrigin: 'https://api.shop.synthetic.test', authSiteDomain: 'shop.synthetic.test', authDeploymentMode: 'same-site' };
  assert.deepEqual(validateAuthTopology(configuration), { mode: 'same-site', secureCookies: true, sameSite: 'lax', hostOnly: true, domainOwnershipReviewRequired: true });
  assert.equal(validateAuthTopology({ ...configuration, authDeploymentMode: 'same-origin', apiPublicOrigin: configuration.clientOrigin }).mode, 'same-origin');
  for (const patch of [{ authTopologyApproved: false }, { apiPublicOrigin: 'https://api.onrender.com' },
    { clientOrigin: 'https://preview.workers.dev' }, { clientOrigin: 'http://shop.synthetic.test' },
    { clientOrigin: 'https://shop.synthetic.test/path' }, { authSiteDomain: 'synthetic.test' },
    { authDeploymentMode: 'local' }, { authDeploymentMode: 'same-origin' }, { nodeEnv: 'development' }]) assert.throws(() => validateAuthTopology({ ...configuration, ...patch }));
  assert.throws(() => validateAuthTopology({ ...configuration, authSiteDomain: 'co.uk', clientOrigin: 'https://co.uk', apiPublicOrigin: 'https://api.co.uk' }));
});

test('trusted proxy configuration accepts only bounded explicit addresses or CIDRs', () => {
  assert.deepEqual(validateTrustedProxies(''), []);
  assert.deepEqual(validateTrustedProxies('127.0.0.1,10.20.0.0/16,2001:db8::/48'), ['127.0.0.1', '10.20.0.0/16', '2001:db8::/48']);
  for (const value of ['true', '1', '*', '0.0.0.0/0', '::/0', '10.0.0.0/7', 'bad/24', '10.0.0.0/33',
    '127.0.0.1,127.0.0.1', '10.0.0.0/24/x', 'loopback', '']) {
    if (value) assert.throws(() => validateTrustedProxies(value));
  }
  assert.throws(() => runtimeSettings({ DATABASE_CONNECT_ATTEMPTS: '99' }));
  assert.throws(() => runtimeSettings({ SHUTDOWN_TIMEOUT_MS: '-1' }));
});

async function proxyServer(t, proxies) {
  const app = express(); app.set('trust proxy', proxies.length ? proxies : false);
  app.use(requestContext, forwardingGuard);
  app.use(rateLimit({ windowMs: 60000, limit: 2, standardHeaders: false, legacyHeaders: false }));
  app.get('/', (req, res) => res.json({ ip: req.ip, diagnostic: sanitizedRequestDiagnostic(req), origin: req.headers.origin || null }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  return headers => fetch(`http://127.0.0.1:${server.address().port}/`, { headers });
}

test('untrusted forwarding headers cannot evade shared-IP rate limits or inject request correlation identifiers', async t => {
  const request = await proxyServer(t, []);
  const first = await request({ 'X-Forwarded-For': '198.51.100.1', 'X-Request-Id': 'password-secret', Forwarded: 'for=198.51.100.1' });
  const second = await request({ 'X-Forwarded-For': '198.51.100.2', 'X-Forwarded-Proto': 'https' });
  assert.equal(first.status, 200); assert.equal(second.status, 200);
  const body = await first.json(); assert.equal(body.ip, '127.0.0.1'); assert.match(body.diagnostic.requestId, /^[0-9a-f-]{36}$/);
  assert.equal(first.headers.get('X-Request-Id'), body.diagnostic.requestId); assert.equal(JSON.stringify(body).includes('password-secret'), false);
  assert.equal((await request({ 'X-Forwarded-For': '198.51.100.3' })).status, 429);
});

test('verified immediate proxies separate real clients and stop at the nearest untrusted forwarding hop', async t => {
  const request = await proxyServer(t, ['127.0.0.1']);
  assert.equal((await request({ 'X-Forwarded-For': '198.51.100.1' })).status, 200);
  assert.equal((await request({ 'X-Forwarded-For': '198.51.100.2' })).status, 200);
  const actual = await request({ 'X-Forwarded-For': '203.0.113.123, 198.51.100.1' });
  assert.equal((await actual.json()).ip, '198.51.100.1');
  assert.equal((await request({ 'X-Forwarded-For': '203.0.113.124, 198.51.100.1' })).status, 429);
  assert.equal((await request({ 'X-Forwarded-For': '198.51.100.2' })).status, 200);
});

test('malformed or excessive trusted forwarding chains fail before rate-limit accounting', async t => {
  const request = await proxyServer(t, ['127.0.0.1']);
  for (const headers of [{ 'X-Forwarded-For': 'unknown' }, { 'X-Forwarded-For': '198.51.100.1:443' },
    { 'X-Forwarded-For': Array(17).fill('198.51.100.1').join(',') }, { 'X-Forwarded-Proto': 'https,http' }]) {
    const result = await request(headers); assert.equal(result.status, 400); assert.equal((await result.json()).error.code, 'INVALID_FORWARDING');
  }
  assert.equal((await request({ 'X-Forwarded-For': '198.51.100.1' })).status, 200);
});

test('DNS override is development-only explicit SRV process configuration with no lookup or OS mutation', () => {
  const configuration = { nodeEnv: 'development', databaseTarget: 'staging', mongoDnsOverrideEnabled: true,
    mongoDnsServers: '1.1.1.1,1.0.0.1', mongoUri: uri.replace('tapandwrap_production', 'tapandwrap_staging') };
  const observed = []; assert.deepEqual(initializeDatabaseDns(configuration, { setServers: values => observed.push(values) }), { overrideEnabled: true, resolverCount: 2 });
  assert.deepEqual(observed, [['1.1.1.1', '1.0.0.1']]);
  assert.deepEqual(validateDatabaseDns({}), []);
  for (const patch of [{ nodeEnv: 'production' }, { databaseTarget: 'local' }, { mongoDnsOverrideEnabled: false },
    { mongoDnsServers: '' }, { mongoDnsServers: '1.1.1.1,1.1.1.1' }, { mongoDnsServers: 'https://1.1.1.1' },
    { mongoDnsServers: '0.0.0.0' }, { mongoUri: 'mongodb://127.0.0.1/tapandwrap_staging' }]) {
    assert.throws(() => initializeDatabaseDns({ ...configuration, ...patch }, { setServers: () => assert.fail('Invalid DNS must not be applied') }));
  }
});

function fakeConnection(t) {
  const state = { readyState: 0, name: 'tapandwrap_staging', host: 'fixture.synthetic.test' };
  for (const field of Object.keys(state)) {
    const descriptor = Object.getOwnPropertyDescriptor(mongoose.connection, field);
    Object.defineProperty(mongoose.connection, field, { configurable: true, get: () => state[field] });
    t.after(() => { if (descriptor) Object.defineProperty(mongoose.connection, field, descriptor); else delete mongoose.connection[field]; });
  }
  return state;
}
const startupConfiguration = { nodeEnv: 'development', databaseTarget: 'staging', mongoUri: uri.replace('tapandwrap_production', 'tapandwrap_staging'), databaseConnectAttempts: 3, databaseRetryBaseMs: 10 };

test('startup retries transient failures with bounded backoff and initializes DNS before driver calls without DDL', async t => {
  const state = fakeConnection(t); const observed = []; const logs = logger(); let count = 0;
  const result = await connectDatabase({ configuration: startupConfiguration, logger: logs, random: () => 0,
    initializeDns: () => { observed.push('dns'); return { overrideEnabled: true, resolverCount: 2 }; },
    connect: async () => { observed.push('connect'); if (++count < 3) throw { name: 'MongoNetworkError', message: uri }; state.readyState = 1; },
    disconnect: async () => { state.readyState = 0; observed.push('disconnect'); },
    sleep: async ms => observed.push(ms), verifySchema: async () => observed.push('verify-read-only') });
  assert.deepEqual(result, { connected: true, code: 'DATABASE_READY', attempts: 3 });
  assert.deepEqual(observed, ['dns', 'connect', 'disconnect', 10, 'connect', 'disconnect', 20, 'connect', 'verify-read-only']); noSecrets(logs.output);
});

test('unsafe targets, authentication, TLS, missing schema and invalid retry settings never loop', async t => {
  fakeConnection(t);
  for (const failure of [{ name: 'MongoAuthenticationError', code: 18 }, { name: 'MongoServerSelectionError', cause: { code: 'CERT_HAS_EXPIRED' } },
    { name: 'MongoNetworkError', cause: { code: 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY' } },
    { name: 'MongoNetworkError', cause: { code: 'ERR_SSL_SSLV3_ALERT_HANDSHAKE_FAILURE' } },
    new DatabaseSafetyError('DATABASE_SCHEMA_NOT_READY')]) {
    let calls = 0; const logs = logger(); const result = await connectDatabase({ configuration: startupConfiguration, logger: logs,
      initializeDns: () => ({ overrideEnabled: false }), connect: async () => { calls += 1; throw failure; },
      disconnect: async () => {}, sleep: () => assert.fail('Unsafe failures must not retry') });
    assert.equal(calls, 1); assert.equal(result.connected, false); noSecrets(logs.output);
  }
  for (const configuration of [{ ...startupConfiguration, mongoUri: uri }, { ...startupConfiguration, databaseConnectAttempts: 6 },
    { ...startupConfiguration, mongoUri: '' }]) {
    const result = await connectDatabase({ configuration, logger: logger(), connect: () => assert.fail('Unsafe config must not connect'), initializeDns: () => ({ overrideEnabled: false }) });
    assert.equal(result.attempts, 0); assert.equal(result.connected, false);
  }
});

test('exhausted connection attempts and aborted backoff fail honestly without unsafe additional work', async t => {
  fakeConnection(t); let calls = 0; let waits = 0;
  const result = await connectDatabase({ configuration: startupConfiguration, logger: logger(), initializeDns: () => ({ overrideEnabled: false }),
    connect: async () => { calls += 1; throw { name: 'MongoServerSelectionError' }; }, disconnect: async () => {}, sleep: async () => { waits += 1; } });
  assert.equal(result.attempts, 3); assert.equal(calls, 3); assert.equal(waits, 2);
  calls = 0; const controller = new AbortController();
  const aborted = await connectDatabase({ configuration: startupConfiguration, logger: logger(), signal: controller.signal,
    initializeDns: () => ({ overrideEnabled: false }), connect: async () => { calls += 1; throw { name: 'MongoNetworkError' }; },
    disconnect: async () => {}, sleep: async () => { controller.abort(); throw new Error('Abort'); } });
  assert.equal(aborted.connected, false); assert.equal(calls, 1);
  assert.equal(retryableDatabaseFailure({ name: 'MongoServerSelectionError', reason: { servers: new Map([['secret-host', { error: { code: 18 } }]]) } }), false);
});

test('uncertain database cleanup cannot hang initial recovery or initiate another connection', async t => {
  fakeConnection(t); let calls = 0; const started = performance.now();
  const result = await connectDatabase({ configuration: startupConfiguration, logger: logger(), disconnectTimeoutMs: 10,
    initializeDns: () => ({ overrideEnabled: false }), connect: async () => { calls += 1; throw { name: 'MongoNetworkError' }; },
    disconnect: () => new Promise(() => {}), sleep: () => assert.fail('Uncertain disconnect must stop recovery') });
  assert.equal(calls, 1); assert.equal(result.code, 'DATABASE_DISCONNECT_UNCERTAIN'); assert.ok(performance.now() - started < 500);
});

test('required indexes include uniqueness, TTL, partial filters and text fields rather than names alone', () => {
  const actual = { key: { token: 1 }, name: 'token_1', unique: true, expireAfterSeconds: 0 };
  assert.equal(requiredIndexExists({ token: 1 }, { unique: true, expireAfterSeconds: 0 }, [actual]), true);
  assert.equal(requiredIndexExists({ token: 1 }, { unique: true }, [actual]), false, 'unexpected TTL must not silently delete records');
  assert.equal(requiredIndexExists({ token: 1 }, { unique: true }, [{ key: { token: 1 }, unique: true }]), true);
  assert.equal(requiredIndexExists({ token: 1 }, { unique: true }, [{ key: { token: 1 }, unique: false }]), false);
  assert.equal(requiredIndexExists({ token: 1 }, { unique: true, expireAfterSeconds: 0 }, [{ ...actual, expireAfterSeconds: 3600 }]), false);
  assert.equal(requiredIndexExists({ name: 'text' }, { name: 'product_name_search' }, [{ key: { _fts: 'text', _ftsx: 1 }, weights: { name: 1 }, name: 'product_name_search' }]), true);
  assert.equal(requiredIndexExists({ name: 'text' }, {}, [{ key: { _fts: 'text', _ftsx: 1 }, weights: { description: 1 } }]), false);
});

test('schema initialization is explicitly authorized and rechecks targets before every DDL write', async () => {
  const state = { readyState: 1, name: 'tapandwrap_staging', host: 'fixture.synthetic.test' }; const writes = [];
  const Model = { db: state, schema: { indexes: () => [[{ token: 1 }, { unique: true }]] },
    createCollection: async () => { writes.push('collection'); }, createIndexes: async () => writes.push('index'),
    collection: { listIndexes: () => ({ toArray: async () => [{ key: { token: 1 }, unique: true }] }) } };
  await assert.rejects(initializeDatabaseSchema(startupConfiguration, { models: [Model] }), /not approved/);
  assert.deepEqual(writes, []);
  await initializeDatabaseSchema(startupConfiguration, { authorized: true, models: [Model] }); assert.deepEqual(writes, ['collection', 'index']);
  writes.length = 0; Model.createCollection = async () => { writes.push('collection'); state.name = 'tapandwrap_production'; };
  await assert.rejects(initializeDatabaseSchema(startupConfiguration, { authorized: true, models: [Model] }), { code: 'DATABASE_NAME_REJECTED' });
  assert.deepEqual(writes, ['collection']);
});

test('schema read verification rejects missing required indexes and never attempts automatic repairs', async () => {
  const Model = { db: { readyState: 1, name: 'tapandwrap_staging', host: 'fixture.synthetic.test' }, schema: { indexes: () => [[{ token: 1 }, { unique: true }]] },
    collection: { listIndexes: () => ({ toArray: async () => [] }) }, createIndexes: () => assert.fail('No runtime DDL') };
  await assert.rejects(verifyDatabaseSchema(startupConfiguration, { models: [Model] }), { code: 'DATABASE_SCHEMA_NOT_READY' });
});

test('schema verification bounds stalled reads and passes remaining driver command/network deadlines', async () => {
  let options; let closed = 0; const started = performance.now();
  const Model = { db: { readyState: 1, name: 'tapandwrap_staging', host: 'fixture.synthetic.test' }, schema: { indexes: () => [] },
    collection: { listIndexes: value => { options = value; return { toArray: () => new Promise(() => {}), close: async () => { closed += 1; } }; } } };
  await assert.rejects(verifyDatabaseSchema(startupConfiguration, { models: [Model], timeoutMs: 15 }), { code: 'DATABASE_SCHEMA_TIMEOUT' });
  assert.ok(options.timeoutMS > 0 && options.timeoutMS <= 15); assert.equal(options.maxTimeMS, options.timeoutMS);
  assert.ok(performance.now() - started < 500); await Promise.resolve(); assert.equal(closed, 1);
});

test('stalled startup connect or schema adapters fail closed, disconnect once and never retry an uncertain attempt', async t => {
  const state = fakeConnection(t);
  for (const stage of ['connect', 'schema']) {
    state.readyState = 0; let connected = 0; let disconnected = 0; const started = performance.now(); const logs = logger();
    const result = await connectDatabase({ configuration: startupConfiguration, logger: logs, connectTimeoutMs: 15, schemaTimeoutMs: 15,
      initializeDns: () => ({ overrideEnabled: false }), connect: async () => { connected += 1;
        if (stage === 'connect') return new Promise(() => {}); state.readyState = 1;
      }, verifySchema: () => new Promise(() => {}), disconnect: async () => { disconnected += 1; state.readyState = 0; },
      sleep: () => assert.fail('Uncertain timed-out attempts must not retry') });
    assert.equal(result.connected, false); assert.equal(result.code, stage === 'connect' ? 'DATABASE_STARTUP_TIMEOUT' : 'DATABASE_SCHEMA_TIMEOUT');
    assert.equal(connected, 1); assert.equal(disconnected, 1); assert.equal(state.readyState, 0); assert.ok(performance.now() - started < 500); noSecrets(logs.output);
  }
});

test('schema CLI is offline by default and requires separate production write confirmation', async () => {
  assert.equal((await runSchemaInitialization(parseSchemaArguments([]))).writes, false);
  assert.throws(() => parseSchemaArguments(['--apply', '--target', 'staging']), DatabaseSafetyError);
  assert.throws(() => parseSchemaArguments(['--apply', '--target', 'production', '--confirm-schema-writes']), DatabaseSafetyError);
  const options = parseSchemaArguments(['--apply', '--target', 'production', '--confirm-schema-writes', '--confirm-production-schema']);
  assert.throws(() => schemaConfiguration(options, { NODE_ENV: 'production', DATABASE_TARGET: 'production', MONGODB_URI: uri }), DatabaseSafetyError);
  assert.throws(() => schemaConfiguration({ ...options, target: 'staging' }, { DATABASE_TARGET: 'local', MONGODB_URI: uri }), DatabaseSafetyError);
});

test('graceful shutdown preserves accepted request completion then disconnects once on duplicate signals', async t => {
  const application = express(); let release; let entered; const started = new Promise(resolve => { entered = resolve; });
  application.get('/', async (req, res) => { entered(); await new Promise(resolve => { release = resolve; }); res.json({ completed: true }); });
  const server = application.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const response = fetch(`http://127.0.0.1:${server.address().port}/`); await started;
  const actions = []; const shutdown = createGracefulShutdown({ server, timeoutMs: 500, logger: logger(), beginDrain: () => actions.push('drain'),
    abortStartup: () => actions.push('abort-startup'), disconnect: async () => actions.push('disconnect') });
  const first = shutdown('SIGTERM'); assert.equal(shutdown('SIGINT'), first);
  release(); assert.deepEqual(await (await response).json(), { completed: true });
  assert.deepEqual(await first, { forced: false, disconnected: true }); assert.deepEqual(actions, ['drain', 'abort-startup', 'disconnect']);
});

test('stuck requests and disconnects have bounded shutdown deadlines and honest forced diagnostics', async () => {
  let forced = 0; const before = performance.now();
  const shutdown = createGracefulShutdown({ server: { close: () => {}, closeAllConnections: () => { forced += 1; } },
    timeoutMs: 25, logger: logger(), beginDrain: () => {}, disconnect: () => new Promise(() => {}) });
  assert.deepEqual(await shutdown(), { forced: true, disconnected: false }); assert.equal(forced, 1); assert.ok(performance.now() - before < 500);
});

test('unready APIs fail before database operations while liveness/status/CSRF remain sanitized and available', async t => {
  const { app } = await import('../src/app.js');
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${base}/health/live`)).status, 200);
  assert.equal((await fetch(`${base}/api/v1/status`)).status, 200);
  assert.equal((await fetch(`${base}/api/v1/auth/csrf`)).status, 200);
  const ready = await fetch(`${base}/health/ready`); assert.equal(ready.status, 503); assert.equal(ready.headers.get('Cache-Control'), 'no-store');
  noSecrets(await ready.json());
  for (const [path, method] of [['/api/v1/public/products', 'GET'], ['/api/v1/admin/products', 'PATCH'], ['/api/v1/commerce/checkout', 'POST']]) {
    const response = await fetch(`${base}${path}`, { method }); assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, 'DATABASE_NOT_CONNECTED');
  }
});

test('unready APIs preserve rejected target diagnostics and still block valid targets awaiting schema readiness', async t => {
  const state = fakeConnection(t);
  state.readyState = 1; state.name = 'tapandwrap_production'; state.host = '127.0.0.1';
  const { app } = await import('../src/app.js');
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const [path, method] of [['/api/v1/public/products', 'GET'], ['/api/v1/admin/products', 'PATCH']]) {
    const response = await fetch(`${base}${path}`, { method }); assert.equal(response.status, 503);
    const body = await response.json(); assert.equal(body.error.code, 'DATABASE_NAME_REJECTED'); noSecrets(body);
  }
  // Metadata is synthetic: no database connection is opened or mutated here.
  state.name = 'tap_wrap_catalog_test';
  const response = await fetch(`${base}/api/v1/public/products`); assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, 'DATABASE_NOT_READY');
});
