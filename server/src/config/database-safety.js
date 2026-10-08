const DATABASE_NAMES = Object.freeze({ local: 'tapandwrap_dev', staging: 'tapandwrap_staging' });
const TEST_DATABASE_NAME = 'tap_wrap_catalog_test';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const TARGET_QUERY_KEYS = new Set(['dbname', 'database', 'databasename', 'target']);

export class DatabaseSafetyError extends Error {
  constructor(code = 'DATABASE_TARGET_REJECTED') {
    super('Database access is unavailable because its configured target is not approved.');
    this.name = 'DatabaseSafetyError';
    this.code = code;
    this.status = 503;
    this.statusCode = 503;
  }
}

function reject(code) {
  throw new DatabaseSafetyError(code);
}

function resolveTarget(target) {
  if (!Object.hasOwn(DATABASE_NAMES, target)) reject('DATABASE_TARGET_REJECTED');
  return DATABASE_NAMES[target];
}

/** Inspect configuration only. Never connect, log the URI, or return credentials. */
export function validateDatabaseUri(uri, { target = 'local', nodeEnv = 'development' } = {}) {
  const expectedName = resolveTarget(target);
  if (typeof uri !== 'string' || !uri || /\s/.test(uri) || /%(?![0-9a-f]{2})/i.test(uri)) {
    reject('DATABASE_URI_INVALID');
  }
  let parsed;
  try {
    parsed = new URL(uri);
    decodeURIComponent(uri);
    if (parsed.username) decodeURIComponent(parsed.username);
    if (parsed.password) decodeURIComponent(parsed.password);
  } catch {
    reject('DATABASE_URI_INVALID');
  }
  if (!['mongodb:', 'mongodb+srv:'].includes(parsed.protocol)
    || !parsed.hostname || parsed.hash || parsed.hostname.includes(',')) reject('DATABASE_URI_INVALID');
  const actualName = parsed.pathname.slice(1);
  const disposableTest = nodeEnv === 'test' && target === 'local'
    && actualName === TEST_DATABASE_NAME && parsed.protocol === 'mongodb:'
    && parsed.hostname === '127.0.0.1';
  if (actualName !== expectedName && !disposableTest) reject('DATABASE_NAME_REJECTED');
  const queryKeys = new Set();
  for (const [key, value] of parsed.searchParams.entries()) {
    const normalizedKey = key.toLowerCase();
    if (queryKeys.has(normalizedKey)) reject('DATABASE_QUERY_AMBIGUOUS');
    queryKeys.add(normalizedKey);
    if (TARGET_QUERY_KEYS.has(normalizedKey)) reject('DATABASE_QUERY_TARGET_REJECTED');
    if (normalizedKey === 'authsource' && !['admin', actualName].includes(value)) {
      reject('DATABASE_AUTH_SOURCE_REJECTED');
    }
  }
  const remote = !LOOPBACK_HOSTS.has(parsed.hostname);
  const options = Object.fromEntries([...parsed.searchParams].map(([key, value]) => [key.toLowerCase(), value]));
  if (remote && (options.tls === 'false' || options.ssl === 'false'
    || (parsed.protocol === 'mongodb:' && options.tls !== 'true')
    || (options.tls !== undefined && !['true', 'false'].includes(options.tls))
    || (options.ssl !== undefined && !['true', 'false'].includes(options.ssl)))) {
    reject('DATABASE_TLS_REQUIRED');
  }
  if (remote && ['tlsinsecure', 'tlsallowinvalidcertificates', 'tlsallowinvalidhostnames']
    .some((key) => options[key] !== undefined && options[key] !== 'false')) {
    reject('DATABASE_TLS_REQUIRED');
  }
  if (target === 'local' && (parsed.protocol !== 'mongodb:' || !LOOPBACK_HOSTS.has(parsed.hostname))) {
    reject('DATABASE_HOST_REJECTED');
  }
  if (parsed.protocol === 'mongodb+srv:' && parsed.port) reject('DATABASE_URI_INVALID');
  return { dbName: actualName, target, disposableTest };
}

/** Recheck the live connection immediately before a write or index operation. */
export function assertConnectedDatabase(connection, { target = 'local', nodeEnv = 'development' } = {}) {
  const expectedName = resolveTarget(target);
  if (!connection || connection.readyState !== 1) reject('DATABASE_NOT_CONNECTED');
  if (typeof connection.host !== 'string' || !connection.host) reject('DATABASE_HOST_REJECTED');
  const disposableTest = nodeEnv === 'test' && connection.name === TEST_DATABASE_NAME
    && connection.host === '127.0.0.1';
  if (connection.name !== expectedName && !disposableTest) reject('DATABASE_NAME_REJECTED');
  if (target === 'local' && !disposableTest && !LOOPBACK_HOSTS.has(connection.host)) {
    reject('DATABASE_HOST_REJECTED');
  }
  return { dbName: connection.name, target, disposableTest };
}

export function assertDatabaseWriteAllowed(connection, env = {}) {
  return assertConnectedDatabase(connection, {
    target: env.databaseTarget ?? 'local',
    nodeEnv: env.nodeEnv ?? process.env.NODE_ENV ?? 'development',
  });
}

/** Stable diagnostics deliberately exclude driver messages, URIs and hosts. */
export function databaseDiagnostic(error) {
  if (error instanceof DatabaseSafetyError) return { code: error.code };
  const name = typeof error?.name === 'string' ? error.name : '';
  if (error?.code === 18 || name.includes('Authentication')) return { code: 'DATABASE_AUTHENTICATION_FAILED' };
  if (name.includes('ServerSelection') || name.includes('Network')) return { code: 'DATABASE_CONNECTION_FAILED' };
  return { code: 'DATABASE_UNAVAILABLE' };
}
