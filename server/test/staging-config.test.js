import assert from 'node:assert/strict';
import test from 'node:test';
import { checkStagingConfiguration } from '../scripts/check-staging.js';
import { databaseDiagnostic } from '../src/config/database-safety.js';

const stagingUri = 'mongodb+srv://fixture-user:fixture-secret@fixture.mongodb.net/tapandwrap_staging?retryWrites=true&w=majority';

function rejected(configuration, code) {
  assert.throws(() => checkStagingConfiguration(configuration), (error) => {
    assert.equal(error.statusCode, 503);
    assert.equal(error.code, code);
    const diagnostic = JSON.stringify(databaseDiagnostic(error));
    for (const privateValue of ['fixture-user', 'fixture-secret', 'fixture.mongodb.net', stagingUri]) {
      assert.equal(`${error.message}${diagnostic}`.includes(privateValue), false);
    }
    return true;
  });
}

test('staging checker validates explicit runtime and importer targets without exposing URI values', () => {
  const result = checkStagingConfiguration({
    DATABASE_TARGET: 'staging', MONGODB_URI: stagingUri,
    CATALOG_IMPORT_STAGING_URI: stagingUri, STAGING_PREVIEW_ENABLED: 'true',
  });
  assert.deepEqual(result, {
    target: 'staging', dbName: 'tapandwrap_staging', runtimeConfigured: true,
    importConfigured: true, previewEnabled: true,
    checks: { runtimeTargetValidated: true, importTargetValidated: true },
  });
  for (const secret of ['fixture-user', 'fixture-secret', 'fixture.mongodb.net', 'mongodb+srv://']) {
    assert.equal(JSON.stringify(result).includes(secret), false);
  }
});

test('an import-only configuration never falls back to a runtime connection string', () => {
  const importOnly = checkStagingConfiguration({ CATALOG_IMPORT_STAGING_URI: stagingUri });
  assert.equal(importOnly.runtimeConfigured, false);
  assert.equal(importOnly.importConfigured, true);
  assert.equal(importOnly.previewEnabled, false);
  const runtimeOnly = checkStagingConfiguration({ DATABASE_TARGET: 'staging', MONGODB_URI: stagingUri });
  assert.equal(runtimeOnly.importConfigured, false);
  assert.deepEqual(runtimeOnly.checks, { runtimeTargetValidated: true });
});

test('missing explicit configuration and non-staging runtime targets fail safely', () => {
  rejected({}, 'STAGING_CONFIGURATION_MISSING');
  rejected({ MONGODB_URI: '', CATALOG_IMPORT_STAGING_URI: '' }, 'STAGING_CONFIGURATION_MISSING');
  for (const target of [undefined, 'local', 'production', 'another_staging']) {
    rejected({ DATABASE_TARGET: target, MONGODB_URI: stagingUri }, 'DATABASE_TARGET_REJECTED');
  }
});

test('production-runtime staging settings are allowed, while production-mode import configuration is rejected', () => {
  assert.equal(checkStagingConfiguration({
    NODE_ENV: 'production', DATABASE_TARGET: 'staging', MONGODB_URI: stagingUri,
  }).runtimeConfigured, true);
  rejected({ NODE_ENV: 'production', CATALOG_IMPORT_STAGING_URI: stagingUri }, 'STAGING_IMPORT_PRODUCTION_DISABLED');
  rejected({ NODE_ENV: 'production', DATABASE_TARGET: 'staging', MONGODB_URI: stagingUri, CATALOG_IMPORT_STAGING_URI: stagingUri }, 'STAGING_IMPORT_PRODUCTION_DISABLED');
});

test('both URI settings must target the exact staging database and cannot override it through query options', () => {
  for (const setting of ['MONGODB_URI', 'CATALOG_IMPORT_STAGING_URI']) {
    for (const name of ['tapandwrap_production', 'another_staging', 'tapandwrap_dev']) {
      rejected({ DATABASE_TARGET: 'staging', [setting]: stagingUri.replace('tapandwrap_staging', name) }, 'DATABASE_NAME_REJECTED');
    }
    rejected({ DATABASE_TARGET: 'staging', [setting]: `${stagingUri}&dbName=production` }, 'DATABASE_QUERY_TARGET_REJECTED');
  }
});

test('preview configuration defaults to disabled and requires an explicit boolean string', () => {
  assert.equal(checkStagingConfiguration({ CATALOG_IMPORT_STAGING_URI: stagingUri, STAGING_PREVIEW_ENABLED: 'false' }).previewEnabled, false);
  for (const value of ['yes', '1', '', true]) {
    rejected({ CATALOG_IMPORT_STAGING_URI: stagingUri, STAGING_PREVIEW_ENABLED: value }, 'STAGING_PREVIEW_CONFIGURATION_INVALID');
  }
});
