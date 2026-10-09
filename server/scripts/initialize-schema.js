import { pathToFileURL } from 'node:url';
import { validateDatabaseUri, databaseDiagnostic, DatabaseSafetyError } from '../src/config/database-safety.js';
import { runtimeSettings } from '../src/config/deployment.js';

export function parseSchemaArguments(args = []) {
  const options = { apply: false, target: null, confirmWrites: false, confirmProduction: false };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === '--apply') options.apply = true;
    else if (value === '--target') options.target = args[++index];
    else if (value === '--confirm-schema-writes') options.confirmWrites = true;
    else if (value === '--confirm-production-schema') options.confirmProduction = true;
    else throw new DatabaseSafetyError('DATABASE_SCHEMA_ARGUMENT_INVALID');
  }
  if (options.target !== null && !['local', 'staging', 'production'].includes(options.target)) throw new DatabaseSafetyError('DATABASE_TARGET_REJECTED');
  if (options.apply && (!options.target || !options.confirmWrites
    || (options.target === 'production' && !options.confirmProduction))) throw new DatabaseSafetyError('DATABASE_SCHEMA_AUTHORIZATION_REQUIRED');
  return options;
}

export function schemaConfiguration(options, configuration = process.env) {
  if (configuration.DATABASE_TARGET !== options.target) throw new DatabaseSafetyError('DATABASE_TARGET_REJECTED');
  const settings = { ...runtimeSettings(configuration), nodeEnv: configuration.NODE_ENV || 'development',
    databaseTarget: options.target, mongoUri: configuration.MONGODB_URI || '' };
  validateDatabaseUri(settings.mongoUri, { target: settings.databaseTarget, nodeEnv: settings.nodeEnv,
    productionDatabaseAuthorized: settings.productionDatabaseAuthorized, productionDatabaseHost: settings.productionDatabaseHost });
  return settings;
}

export async function runSchemaInitialization(options, configuration = process.env) {
  if (!options.apply) return { mode: 'offline-dry-run', connected: false, writes: false, operation: 'create-declared-collections-and-indexes', dropsExistingIndexes: false };
  if (!options.confirmWrites || !options.target || (options.target === 'production' && !options.confirmProduction)) {
    throw new DatabaseSafetyError('DATABASE_SCHEMA_AUTHORIZATION_REQUIRED');
  }
  const settings = schemaConfiguration(options, configuration);
  process.env.TAP_WRAP_SKIP_DOTENV = 'true';
  const { default: mongoose } = await import('mongoose');
  const { databaseModels, initializeDatabaseSchema } = await import('../src/config/schema.js');
  const { initializeDatabaseDns } = await import('../src/config/database-dns.js');
  if (mongoose.connection.readyState !== 0) throw new DatabaseSafetyError('DATABASE_CONNECTION_ALREADY_PRESENT');
  try {
    initializeDatabaseDns(settings);
    await mongoose.connect(settings.mongoUri, { dbName: validateDatabaseUri(settings.mongoUri, {
      target: settings.databaseTarget, nodeEnv: settings.nodeEnv,
      productionDatabaseAuthorized: settings.productionDatabaseAuthorized, productionDatabaseHost: settings.productionDatabaseHost,
    }).dbName, autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 6000, maxPoolSize: 2 });
    const result = await initializeDatabaseSchema(settings, { authorized: true, models: databaseModels });
    return { mode: 'authorized-schema-initialization', writes: true, ...result };
  } finally { await mongoose.disconnect(); }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try { console.log(JSON.stringify(await runSchemaInitialization(parseSchemaArguments(process.argv.slice(2))), null, 2)); }
  catch (error) { console.error(JSON.stringify({ ok: false, error: databaseDiagnostic(error) })); process.exitCode = 1; }
}
