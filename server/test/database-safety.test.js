import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertConnectedDatabase,
  assertDatabaseWriteAllowed,
  databaseDiagnostic,
  DatabaseSafetyError,
  validateDatabaseUri,
} from '../src/config/database-safety.js';

const stagingUri = 'mongodb+srv://fixture-user:fixture-secret@fixture.mongodb.net/tapandwrap_staging?retryWrites=true&w=majority';

function rejectsSafely(action, code) {
  assert.throws(action, (error) => {
    assert.ok(error instanceof DatabaseSafetyError);
    assert.equal(error.status, 503);
    assert.equal(error.statusCode, 503);
    if (code) assert.equal(error.code, code);
    const serialized = `${error.message} ${JSON.stringify(error)}`;
    for (const secret of ['fixture-user', 'fixture-secret', 'mongodb.net', 'mongodb://', 'mongodb+srv://']) {
      assert.equal(serialized.includes(secret), false);
    }
    return true;
  });
}

test('staging URI validation is offline, exact, TLS-safe and credential-free', () => {
  assert.deepEqual(validateDatabaseUri(stagingUri, { target: 'staging' }), {
    dbName: 'tapandwrap_staging', target: 'staging', disposableTest: false,
  });
  assert.equal(validateDatabaseUri(stagingUri, { target: 'staging', nodeEnv: 'production' }).dbName, 'tapandwrap_staging');
  assert.equal(validateDatabaseUri(`${stagingUri}&authSource=admin`, { target: 'staging' }).dbName, 'tapandwrap_staging');
  assert.equal(validateDatabaseUri('mongodb://fixture.mongodb.net/tapandwrap_staging?tls=true', { target: 'staging' }).dbName, 'tapandwrap_staging');
});

test('database names cannot select production, another project, suffix aliases or the default database', () => {
  for (const name of ['production', 'tapandwrap_production', 'tapandwrap_prod', 'darb_staging', 'another_staging', 'tapandwrap_staging_extra', '', 'tapandwrap_staging/other']) {
    rejectsSafely(() => validateDatabaseUri(`mongodb+srv://fixture-user:fixture-secret@fixture.mongodb.net/${name}`, { target: 'staging' }), 'DATABASE_NAME_REJECTED');
  }
  for (const target of ['production', 'prod', 'unknown', '', '__proto__']) {
    rejectsSafely(() => validateDatabaseUri(stagingUri, { target }), 'DATABASE_TARGET_REJECTED');
  }
});

test('ambiguous URI options, overriding database names and foreign auth databases are rejected', () => {
  for (const option of ['dbName=production', 'DBNAME=production', 'database=production', 'databaseName=production', 'target=production', 'db%4Eame=production']) {
    rejectsSafely(() => validateDatabaseUri(`${stagingUri}&${option}`, { target: 'staging' }), 'DATABASE_QUERY_TARGET_REJECTED');
  }
  rejectsSafely(() => validateDatabaseUri(`${stagingUri}&retryWrites=false`, { target: 'staging' }), 'DATABASE_QUERY_AMBIGUOUS');
  rejectsSafely(() => validateDatabaseUri(`${stagingUri}&TLS=true&tls=false`, { target: 'staging' }), 'DATABASE_QUERY_AMBIGUOUS');
  rejectsSafely(() => validateDatabaseUri(`${stagingUri}&authSource=production`, { target: 'staging' }), 'DATABASE_AUTH_SOURCE_REJECTED');
  rejectsSafely(() => validateDatabaseUri(`${stagingUri}#production`, { target: 'staging' }), 'DATABASE_URI_INVALID');
  rejectsSafely(() => validateDatabaseUri('mongodb://a.example:27017,b.example:27017/tapandwrap_staging?tls=true', { target: 'staging' }), 'DATABASE_URI_INVALID');
});

test('remote connections cannot disable TLS or use unencrypted MongoDB URLs', () => {
  for (const uri of [
    `${stagingUri}&tls=false`, `${stagingUri}&ssl=false`, `${stagingUri}&tls=FALSE`,
    `${stagingUri}&tlsInsecure=true`, `${stagingUri}&tlsAllowInvalidCertificates=true`, `${stagingUri}&tlsAllowInvalidHostnames=true`,
    'mongodb://fixture.mongodb.net/tapandwrap_staging',
    'mongodb://fixture.mongodb.net/tapandwrap_staging?ssl=true',
  ]) rejectsSafely(() => validateDatabaseUri(uri, { target: 'staging' }), 'DATABASE_TLS_REQUIRED');
});

test('local mode permits only loopback and the exact development name', () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]']) {
    assert.equal(validateDatabaseUri(`mongodb://${host}:27017/tapandwrap_dev`).dbName, 'tapandwrap_dev');
  }
  rejectsSafely(() => validateDatabaseUri('mongodb://remote.example/tapandwrap_dev?tls=true'), 'DATABASE_HOST_REJECTED');
  rejectsSafely(() => validateDatabaseUri('mongodb://127.0.0.1/tapandwrap_staging'), 'DATABASE_NAME_REJECTED');
  rejectsSafely(() => validateDatabaseUri('mongodb+srv://localhost/tapandwrap_dev'), 'DATABASE_HOST_REJECTED');
});

test('disposable test exception requires test mode, 127.0.0.1 and the exact test name', () => {
  const fixtureUri = 'mongodb://127.0.0.1:29999/tap_wrap_catalog_test';
  assert.equal(validateDatabaseUri(fixtureUri, { nodeEnv: 'test' }).disposableTest, true);
  rejectsSafely(() => validateDatabaseUri(fixtureUri), 'DATABASE_NAME_REJECTED');
  rejectsSafely(() => validateDatabaseUri('mongodb://localhost:29999/tap_wrap_catalog_test', { nodeEnv: 'test' }), 'DATABASE_NAME_REJECTED');
  rejectsSafely(() => validateDatabaseUri('mongodb://127.0.0.1:29999/tap_wrap_other_test', { nodeEnv: 'test' }), 'DATABASE_NAME_REJECTED');
  rejectsSafely(() => validateDatabaseUri(fixtureUri, { target: 'staging', nodeEnv: 'test' }), 'DATABASE_NAME_REJECTED');
});

test('malformed credentials and URI parsing errors never expose sensitive input', () => {
  for (const uri of [
    'mongodb+srv://fixture-user:fixture-secret%@fixture.mongodb.net/tapandwrap_staging',
    'mongodb+srv://fixture-user:fixture-secret%FF@fixture.mongodb.net/tapandwrap_staging',
    'mongodb+srv://fixture-user:fixture-secret@/tapandwrap_staging',
    'https://fixture-user:fixture-secret@fixture.mongodb.net/tapandwrap_staging',
    ` ${stagingUri}`, undefined,
  ]) rejectsSafely(() => validateDatabaseUri(uri, { target: 'staging' }), 'DATABASE_URI_INVALID');
});

test('connected write guard rejects changed targets and disconnected databases', () => {
  const staging = { readyState: 1, name: 'tapandwrap_staging', host: 'fixture.mongodb.net' };
  assert.equal(assertDatabaseWriteAllowed(staging, { databaseTarget: 'staging', nodeEnv: 'production' }).dbName, 'tapandwrap_staging');
  assert.equal(assertConnectedDatabase({ readyState: 1, name: 'tapandwrap_dev', host: '127.0.0.1' }).dbName, 'tapandwrap_dev');
  assert.equal(assertConnectedDatabase({ readyState: 1, name: 'tapandwrap_dev', host: '::1' }).dbName, 'tapandwrap_dev');
  for (const name of ['tapandwrap_production', 'another_staging', 'tapandwrap_dev']) {
    rejectsSafely(() => assertConnectedDatabase({ ...staging, name }, { target: 'staging' }), 'DATABASE_NAME_REJECTED');
  }
  rejectsSafely(() => assertConnectedDatabase({ ...staging, readyState: 0 }, { target: 'staging' }), 'DATABASE_NOT_CONNECTED');
  rejectsSafely(() => assertConnectedDatabase({ readyState: 1, name: 'tapandwrap_dev', host: 'remote.example' }), 'DATABASE_HOST_REJECTED');
  rejectsSafely(() => assertConnectedDatabase(staging, { target: 'production' }), 'DATABASE_TARGET_REJECTED');
});

test('connected disposable tests cannot silently become existing databases', () => {
  const fixture = { readyState: 1, name: 'tap_wrap_catalog_test', host: '127.0.0.1' };
  assert.equal(assertConnectedDatabase(fixture, { nodeEnv: 'test' }).disposableTest, true);
  assert.equal(assertConnectedDatabase(fixture, { target: 'staging', nodeEnv: 'test' }).disposableTest, true);
  rejectsSafely(() => assertConnectedDatabase(fixture), 'DATABASE_NAME_REJECTED');
  rejectsSafely(() => assertConnectedDatabase({ ...fixture, host: 'localhost' }, { nodeEnv: 'test' }), 'DATABASE_NAME_REJECTED');
  rejectsSafely(() => assertConnectedDatabase({ ...fixture, name: 'tap_wrap_other_test' }, { nodeEnv: 'test' }), 'DATABASE_NAME_REJECTED');
});

test('connection diagnostics only expose stable categories, never driver messages', () => {
  const error = new Error(`fixture-user fixture-secret ${stagingUri}`);
  assert.deepEqual(databaseDiagnostic(error), { code: 'DATABASE_UNAVAILABLE' });
  assert.deepEqual(databaseDiagnostic({ name: 'MongoServerSelectionError', message: error.message }), { code: 'DATABASE_CONNECTION_FAILED' });
  assert.deepEqual(databaseDiagnostic({ name: 'MongoAuthenticationError', message: error.message }), { code: 'DATABASE_AUTHENTICATION_FAILED' });
  assert.deepEqual(databaseDiagnostic({ name: 'MongoServerError', code: 18, message: error.message }), { code: 'DATABASE_AUTHENTICATION_FAILED' });
  assert.deepEqual(databaseDiagnostic(new DatabaseSafetyError('DATABASE_NAME_REJECTED')), { code: 'DATABASE_NAME_REJECTED' });
});
