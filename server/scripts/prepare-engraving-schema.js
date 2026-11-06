import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { schemaConfiguration } from './initialize-schema.js';
import { assertDatabaseWriteAllowed, databaseDiagnostic, DatabaseSafetyError } from '../src/config/database-safety.js';

const CONFIG = 'engravingserviceconfigurations';
const ORDERS = 'orders';
const definitions = [
  { collection: CONFIG, key: { typeId: 1, version: 1 }, name: 'typeId_1_version_1', unique: true },
  { collection: CONFIG, key: { typeId: 1 }, name: 'typeId_1', unique: true, partialFilterExpression: { current: true } },
  { collection: ORDERS, key: { owner: 1, 'cartAddOperations.key': 1 }, name: 'owner_1_cartAddOperations.key_1' },
];
const fail = code => { throw new DatabaseSafetyError(code); };
const sameKey = (a, b) => isDeepStrictEqual(Object.entries(a || {}), Object.entries(b || {}));

export function parseEngravingSchemaArguments(args = []) {
  const result = { apply: false, inspect: false, target: null, confirmWrites: false, confirmProduction: false };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--apply') result.apply = true;
    else if (args[i] === '--inspect') result.inspect = true;
    else if (args[i] === '--target') result.target = args[++i];
    else if (args[i] === '--confirm-engraving-schema-writes') result.confirmWrites = true;
    else if (args[i] === '--confirm-production-schema') result.confirmProduction = true;
    else fail('DATABASE_SCHEMA_ARGUMENT_INVALID');
  }
  if (result.target !== null && !['local', 'staging', 'production'].includes(result.target)) fail('DATABASE_TARGET_REJECTED');
  if (result.apply && (result.inspect || !result.confirmWrites || !result.target
    || (result.target === 'production' && !result.confirmProduction))) fail('DATABASE_SCHEMA_AUTHORIZATION_REQUIRED');
  if (result.inspect && !result.target) fail('DATABASE_TARGET_REJECTED');
  return result;
}

function compatible(required, actual) {
  return sameKey(required.key, actual.key) && Boolean(required.unique) === Boolean(actual.unique)
    && !actual.sparse && actual.expireAfterSeconds === undefined
    && isDeepStrictEqual(required.partialFilterExpression, actual.partialFilterExpression)
    && actual.collation === undefined && !actual.hidden && !actual.prepareUnique;
}

/** Only metadata and an existence probe; never returns customer/configuration documents. */
export async function inspectEngravingSchema(db) {
  const missing = [];
  const collections = await db.listCollections({ name: { $in: [CONFIG, ORDERS] } }, { nameOnly: false, maxTimeMS: 5000 }).toArray();
  if (!collections.some(c => c.name === ORDERS)) fail('ENGRAVING_ORDERS_COLLECTION_MISSING');
  for (const name of [CONFIG, ORDERS]) {
    const metadata = collections.find(c => c.name === name);
    if (!metadata) { missing.push({ collection: name }); continue; }
    if (metadata.type !== 'collection' || Object.keys(metadata.options || {}).length) fail('ENGRAVING_COLLECTION_OPTIONS_MISMATCH');
    if (name === CONFIG) {
      const cursor = db.collection(CONFIG).find({}, { projection: { _id: 1 }, limit: 1, maxTimeMS: 5000 });
      try { if (await cursor.hasNext()) fail('ENGRAVING_CONFIGURATION_RECORDS_PRESENT'); }
      finally { await cursor.close(); }
    }
    const indexes = await db.collection(name).listIndexes({ maxTimeMS: 5000 }).toArray();
    const required = definitions.filter(d => d.collection === name);
    for (const definition of required) {
      const candidates = indexes.filter(index => index.name === definition.name || sameKey(index.key, definition.key));
      if (candidates.some(index => !compatible(definition, index))) fail('ENGRAVING_INDEX_MISMATCH');
      if (!candidates.length) missing.push(definition);
    }
    if (name === CONFIG && indexes.some(index => index.name !== '_id_'
      && !required.some(definition => compatible(definition, index)))) fail('ENGRAVING_UNEXPECTED_INDEX');
  }
  // A missing collection also needs both declared indexes.
  if (!collections.some(c => c.name === CONFIG)) missing.push(...definitions.filter(d => d.collection === CONFIG));
  return { status: missing.length ? 'MISSING_SCHEMA' : 'SCHEMA_READY', missing: structuredClone(missing) };
}

export async function prepareEngravingSchema(connection, settings, { authorized = false } = {}) {
  assertDatabaseWriteAllowed(connection, settings);
  const before = await inspectEngravingSchema(connection.db);
  if (!authorized) return { ...before, writes: false };
  // Recheck the complete bounded preflight before any persistent operation.
  assertDatabaseWriteAllowed(connection, settings);
  const plan = await inspectEngravingSchema(connection.db);
  for (const operation of plan.missing) {
    assertDatabaseWriteAllowed(connection, settings);
    if (!operation.key) await connection.db.createCollection(CONFIG);
    else {
      const { collection, key, ...options } = operation;
      await connection.db.collection(collection).createIndex(key, options);
    }
  }
  return { ...await inspectEngravingSchema(connection.db), writes: plan.missing.length > 0 };
}

export async function runEngravingSchema(options, configuration = process.env) {
  if (!options.apply && !options.inspect) return { mode: 'offline-dry-run', connected: false, writes: false, definitions: structuredClone(definitions) };
  if (options.apply && (!options.confirmWrites || !options.target
    || (options.target === 'production' && !options.confirmProduction))) fail('DATABASE_SCHEMA_AUTHORIZATION_REQUIRED');
  const settings = schemaConfiguration(options, configuration); // terminal only; never dotenv
  const { default: mongoose } = await import('mongoose');
  const connection = mongoose.createConnection();
  try {
    await connection.openUri(settings.mongoUri, { dbName: settings.databaseTarget === 'production' ? 'tapandwrap_production'
      : settings.databaseTarget === 'staging' ? 'tapandwrap_staging' : undefined,
    autoCreate: false, autoIndex: false, maxPoolSize: 1, serverSelectionTimeoutMS: 6000, connectTimeoutMS: 6000 });
    return { mode: options.apply ? 'authorized-narrow-apply' : 'read-only-inspection', connected: true,
      ...await prepareEngravingSchema(connection, settings, { authorized: options.apply === true }) };
  } finally { await connection.close(); }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try { console.log(JSON.stringify(await runEngravingSchema(parseEngravingSchemaArguments(process.argv.slice(2))), null, 2)); }
  catch (error) { console.error(JSON.stringify({ ok: false, error: databaseDiagnostic(error) })); process.exitCode = 1; }
}
