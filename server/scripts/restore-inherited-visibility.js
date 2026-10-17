import mongoose from 'mongoose';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { schemaConfiguration } from './initialize-schema.js';
import { assertDatabaseWriteAllowed, databaseDiagnostic } from '../src/config/database-safety.js';
import { isSafeImageReference } from '../src/catalog/fields.js';
import { displayProductFilter } from '../src/catalog/product-policy.js';

const HOST = 'taw-production.oialf4z.mongodb.net';
const COUNT = 1595;
const fail = code => { throw Object.assign(new Error(code), { code }); };
const id = value => String(value ?? '');
function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])]));
  return value;
}
export const digest = value => createHash('sha256').update(JSON.stringify(sorted(mongoose.mongo.BSON.EJSON.serialize(value, { relaxed: false })))).digest('hex');

// Raw driver documents deliberately avoid Mongoose defaults, setters and save hooks.
export function planVisibility(products, categories, addresses) {
  if (products.length !== COUNT || addresses.length !== COUNT * 2) fail('INHERITED_COUNT_MISMATCH');
  const roots = new Map(categories.map(category => [id(category._id), category]));
  const owners = new Map(), slugs = new Set(), names = new Set();
  for (const address of addresses) {
    if (typeof address.slug !== 'string' || address.slug.length > 300 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(address.slug) || slugs.has(address.slug) || typeof address.canonical !== 'boolean') fail('ADDRESS_INVALID');
    slugs.add(address.slug);
    const list = owners.get(id(address.productId)) || []; list.push(address); owners.set(id(address.productId), list);
  }
  let drafts = 0, holds = 0;
  const entries = products.map(product => {
    if (Object.hasOwn(product, 'visibility')) fail('VISIBILITY_ALREADY_SET');
    if (product.status === 'draft' && product.reviewRequired === false) drafts++;
    else if (product.status === 'hold' && product.reviewRequired === true) holds++;
    else fail('STATUS_REVIEW_MISMATCH');
    if (product.priceApproved !== false || product.inventory?.mode !== 'tracked' || product.inventory.quantity !== 10
      || product.inventory.available !== true || product.inventory.approved !== false) fail('APPROVAL_OR_STOCK_DRIFT');
    if (typeof product.name !== 'string' || !product.name.trim() || typeof product.slug !== 'string' || product.slug.length > 300 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product.slug) || names.has(product.slug)) fail('PRODUCT_IDENTITY_INVALID');
    names.add(product.slug);
    const category = roots.get(id(product.categoryId)), sub = product.subcategoryId ? roots.get(id(product.subcategoryId)) : null;
    if (category?.active !== true || category.parentId || (product.subcategoryId && (sub?.active !== true || id(sub.parentId) !== id(category._id)))) fail('CATEGORY_INVALID');
    if (!product.mainImageKey || !isSafeImageReference(product.mainImageKey) || !Array.isArray(product.galleryKeys)
      || product.galleryKeys.length < 1 || product.galleryKeys.length > 23 || product.galleryKeys[0] !== product.mainImageKey
      || new Set(product.galleryKeys).size !== product.galleryKeys.length || !product.galleryKeys.every(key => typeof key === 'string' && isSafeImageReference(key))) fail('IMAGE_REFERENCE_INVALID');
    const reserved = owners.get(id(product._id)) || [];
    if (reserved.length !== 2 || reserved.filter(address => address.canonical).length !== 1 || !reserved.some(address => address.slug === product.slug)) fail('ADDRESS_OWNERSHIP_INVALID');
    if (addresses.some(address => address.slug === product.slug && id(address.productId) !== id(product._id))) fail('ADDRESS_OWNERSHIP_INVALID');
    return { id: id(product._id), before: digest(product), after: digest({ ...product, visibility: 'public' }) };
  }).sort((a, b) => a.id.localeCompare(b.id));
  if (drafts !== 1257 || holds !== 338 || new Set(entries.map(entry => entry.id)).size !== COUNT) fail('DISTRIBUTION_MISMATCH');
  const evidence = { version: 1, database: 'tapandwrap_production', host: HOST, entries,
    categories: digest([...categories].sort((a, b) => id(a._id).localeCompare(id(b._id)))),
    addresses: digest([...addresses].sort((a, b) => id(a._id).localeCompare(id(b._id)))) };
  return { ...evidence, digest: digest(evidence) };
}

export function operatorSettings(configuration) {
  if (configuration.PRODUCTION_DATABASE_HOST !== HOST || configuration.CHECKOUT_ENABLED !== 'false'
    || configuration.COMMERCE_LAUNCH_AUTHORIZED !== 'false') fail('PRODUCTION_CONTEXT_REJECTED');
  return schemaConfiguration({ target: 'production' }, configuration);
}

export async function snapshot(connection, session) {
  const options = { session, maxTimeMS: 15000 };
  // Bounded reads: unexpected larger catalogs must stop, not consume unbounded memory.
  const products = await connection.collection('products').find({}, options).limit(COUNT + 1).toArray();
  const categories = await connection.collection('categories').find({}, options).limit(10001).toArray();
  const addresses = await connection.collection('productaddresses').find({}, options).limit(COUNT * 2 + 1).toArray();
  if (categories.length > 10000) fail('CATEGORY_COUNT_EXCEEDED');
  return { products, categories, addresses };
}

// Never retries a transaction or an uncertain commit. The prepared journal survives
// ambiguity and contains only IDs/hashes, not product details or credentials.
export async function applyVisibility(connection, settings, plan) {
  const session = await connection.startSession();
  try {
    session.startTransaction({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    assertDatabaseWriteAllowed(connection, settings);
    const state = await snapshot(connection, session);
    if (state.products.length === COUNT && state.products.every(product => plan.entries.find(entry => entry.id === id(product._id))?.after === digest(product))) {
      await session.abortTransaction();
      return { matched: COUNT, modified: 0 };
    }
    if (planVisibility(state.products, state.categories, state.addresses).digest !== plan.digest) fail('REVIEWED_PLAN_DRIFT');
    assertDatabaseWriteAllowed(connection, settings);
    const result = await connection.collection('products').bulkWrite(plan.entries.map(entry => ({ updateOne: {
      filter: { _id: new mongoose.Types.ObjectId(entry.id), visibility: { $exists: false } }, update: { $set: { visibility: 'public' } }, upsert: false,
    } })), { session, ordered: true });
    if (result.matchedCount !== COUNT || result.modifiedCount !== COUNT) fail('VISIBILITY_WRITE_CONFLICT');
    await session.commitTransaction();
    return { matched: plan.entries.length, modified: result.modifiedCount };
  } finally { if (session.inTransaction()) await session.abortTransaction(); await session.endSession(); }
}

export async function rollbackVisibility(connection, settings, plan) {
  const session = await connection.startSession();
  try {
    session.startTransaction({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    assertDatabaseWriteAllowed(connection, settings);
    const products = await connection.collection('products').find({ _id: { $in: plan.entries.map(entry => new mongoose.Types.ObjectId(entry.id)) } }, { session, maxTimeMS: 15000 }).toArray();
    const revert = plan.entries.filter(entry => { const product = products.find(product => id(product._id) === entry.id); return product && digest(product) === entry.after; });
    assertDatabaseWriteAllowed(connection, settings);
    if (revert.length) {
      const result = await connection.collection('products').bulkWrite(revert.map(entry => ({ updateOne: {
        filter: { _id: new mongoose.Types.ObjectId(entry.id), visibility: 'public' }, update: { $unset: { visibility: '' } }, upsert: false,
      } })), { session, ordered: true });
      if (result.modifiedCount !== revert.length) fail('ROLLBACK_CONFLICT');
    }
    await session.commitTransaction();
    const after = await connection.collection('products').find({ _id: { $in: revert.map(entry => new mongoose.Types.ObjectId(entry.id)) } }, { maxTimeMS: 15000 }).toArray();
    if (revert.some(entry => { const product = after.find(product => id(product._id) === entry.id); return !product || digest(product) !== entry.before; })) fail('ROLLBACK_VERIFICATION_FAILED');
    return { reverted: revert.length, skipped: plan.entries.length - revert.length };
  } finally { if (session.inTransaction()) await session.abortTransaction(); await session.endSession(); }
}

export function parseArguments(args) {
  const options = { mode: 'offline', plan: null, journal: null, confirm: false };
  let selected = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (['--inspect', '--apply', '--rollback'].includes(arg)) {
      if (selected) fail('ARGUMENT_INVALID'); selected = true; options.mode = arg.slice(2);
    } else if (arg === '--plan' || arg === '--journal') options[arg.slice(2)] = args[++index];
    else if (arg === '--confirm-only-inherited-visibility-1595') options.confirm = true;
    else fail('ARGUMENT_INVALID');
  }
  if (options.mode !== 'offline' && !options.journal || ['apply', 'rollback'].includes(options.mode) && (!options.confirm || !options.plan)) fail('AUTHORIZATION_REQUIRED');
  return options;
}
const localRoot = fileURLToPath(new URL('../../local-data/', import.meta.url));
function journalPath(value) {
  const resolved = path.resolve(value), relative = path.relative(localRoot, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || !resolved.endsWith('.json')) fail('JOURNAL_PATH_REJECTED');
  return resolved;
}
function validatePlan(plan) {
  const { digest: recorded, ...evidence } = plan;
  if (evidence.version !== 1 || evidence.database !== 'tapandwrap_production' || evidence.host !== HOST
    || evidence.entries?.length !== COUNT || new Set(evidence.entries.map(entry => entry.id)).size !== COUNT
    || evidence.entries.some(entry => !/^[a-f\d]{24}$/.test(entry.id) || !/^[a-f\d]{64}$/.test(entry.before) || !/^[a-f\d]{64}$/.test(entry.after))
    || digest(evidence) !== recorded) fail('PLAN_INVALID');
}
export async function main(args, configuration = process.env) {
  const options = parseArguments(args);
  if (options.mode === 'offline') return { mode: 'offline-dry-run', connected: false, writes: false, requiredProducts: COUNT, update: { visibility: 'public' } };
  const settings = operatorSettings(configuration), journal = journalPath(options.journal);
  let plan;
  if (options.plan) {
    const source = JSON.parse(await readFile(journalPath(options.plan), 'utf8'));
    if (options.mode === 'rollback' && (source.mode !== 'apply' || source.state !== 'committed-verified')) fail('COMMITTED_JOURNAL_REQUIRED');
    plan = source.plan; validatePlan(plan);
  }
  await mkdir(path.dirname(journal), { recursive: true });
  // Reserve an exclusive journal before connecting or writing; never overwrite evidence.
  const record = { operationId: randomUUID(), mode: options.mode, state: 'prepared', createdAt: new Date().toISOString(), plan };
  await writeFile(journal, JSON.stringify(record, null, 2), { flag: 'wx', mode: 0o600 });
  if (mongoose.connection.readyState !== 0) fail('DATABASE_CONNECTION_ALREADY_PRESENT');
  try {
    await mongoose.connect(settings.mongoUri, { autoCreate: false, autoIndex: false, maxPoolSize: 2, serverSelectionTimeoutMS: 6000 });
    assertDatabaseWriteAllowed(mongoose.connection, settings);
    if (options.mode === 'inspect') {
      const state = await snapshot(mongoose.connection);
      record.plan = planVisibility(state.products, state.categories, state.addresses);
      record.result = { matched: COUNT, modified: 0 }; record.state = 'review-required';
    } else if (options.mode === 'apply') {
      record.result = await applyVisibility(mongoose.connection, settings, plan);
      // Independent fresh reads must show exactly the planned post-images.
      const state = await snapshot(mongoose.connection);
      if (state.products.length !== COUNT || state.products.some(product => plan.entries.find(entry => entry.id === id(product._id))?.after !== digest(product))) fail('POST_WRITE_VERIFICATION_FAILED');
      planVisibility(state.products.map(({ visibility: _visibility, ...product }) => product), state.categories, state.addresses);
      record.result.publicBrowseRecords = await mongoose.connection.collection('products').countDocuments(displayProductFilter(), { maxTimeMS: 15000 });
      if (record.result.publicBrowseRecords !== COUNT) fail('PUBLIC_COUNT_VERIFICATION_FAILED');
      record.state = 'committed-verified';
    } else { record.result = await rollbackVisibility(mongoose.connection, settings, plan); record.state = 'rollback-committed'; }
    await writeFile(journal, JSON.stringify(record, null, 2), { mode: 0o600 });
    return { mode: options.mode, state: record.state, ...record.result };
  } finally { await mongoose.disconnect(); }
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try { console.log(JSON.stringify(await main(process.argv.slice(2)))); }
  catch (error) { console.error(JSON.stringify({ ok: false, code: /^[A-Z0-9_]+$/.test(error.code || '') ? error.code : databaseDiagnostic(error).code, instruction: 'Stop. Reconcile the journal and current state; do not blindly retry.' })); process.exitCode = 1; }
}
