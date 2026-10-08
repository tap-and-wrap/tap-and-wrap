import { pathToFileURL } from 'node:url';
import {
  databaseDiagnostic,
  DatabaseSafetyError,
  validateDatabaseUri,
} from '../src/config/database-safety.js';

/** Validate explicit environment configuration offline; never load .env or connect. */
export function checkStagingConfiguration(configuration = process.env) {
  const nodeEnv = configuration.NODE_ENV ?? 'development';
  const runtimeUri = configuration.MONGODB_URI;
  const importUri = configuration.CATALOG_IMPORT_STAGING_URI;
  const runtimeConfigured = typeof runtimeUri === 'string' && runtimeUri.length > 0;
  const importConfigured = typeof importUri === 'string' && importUri.length > 0;
  if (!runtimeConfigured && !importConfigured) throw new DatabaseSafetyError('STAGING_CONFIGURATION_MISSING');
  if (runtimeConfigured && configuration.DATABASE_TARGET !== 'staging') {
    throw new DatabaseSafetyError('DATABASE_TARGET_REJECTED');
  }
  if (importConfigured && nodeEnv === 'production') {
    throw new DatabaseSafetyError('STAGING_IMPORT_PRODUCTION_DISABLED');
  }
  const previewFlag = configuration.STAGING_PREVIEW_ENABLED;
  if (previewFlag !== undefined && !['true', 'false'].includes(previewFlag)) {
    throw new DatabaseSafetyError('STAGING_PREVIEW_CONFIGURATION_INVALID');
  }
  const checks = {};
  if (runtimeConfigured) {
    validateDatabaseUri(runtimeUri, { target: 'staging', nodeEnv });
    checks.runtimeTargetValidated = true;
  }
  if (importConfigured) {
    validateDatabaseUri(importUri, { target: 'staging', nodeEnv });
    checks.importTargetValidated = true;
  }
  return {
    target: 'staging',
    dbName: 'tapandwrap_staging',
    runtimeConfigured,
    importConfigured,
    previewEnabled: previewFlag === 'true',
    checks,
  };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    process.stdout.write(`${JSON.stringify({ ok: true, ...checkStagingConfiguration() }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: databaseDiagnostic(error) })}\n`);
    process.exitCode = 1;
  }
}
