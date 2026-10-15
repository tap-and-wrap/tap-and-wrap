import { readFile, writeFile, realpath, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { planProductAddresses } from '../../shared/product-paths.mjs';
import { validateDatabaseUri, assertConnectedDatabase, assertDatabaseWriteAllowed } from '../src/config/database-safety.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const identity = products => products.map(p => ({ _id: String(p._id), name: p.name, slug: p.slug, externalCatalogId: p.externalCatalogId || null })).sort((a,b) => a._id.localeCompare(b._id, 'en'));
export const aliasIndexes = [
  { key: { slug: 1 }, name: 'product_address_unique', unique: true },
  { key: { productId: 1 }, name: 'product_canonical_unique', unique: true, partialFilterExpression: { canonical: true } },
  { key: { productId: 1, slug: 1 }, name: 'product_address_owner' },
];
export function aliasReview(products, addresses = [], target = 'offline-workbook') {
  const source = identity(products);
  const reservations = addresses.map(a => ({ slug: a.slug, productId: String(a.productId), canonical: a.canonical })).sort((a,b) => a.slug.localeCompare(b.slug, 'en'));
  return { version: 1, target, identityHash: digest(source), reviewHash: digest({ target, source, reservations }),
    productCount: source.length, indexesNeeded: aliasIndexes, ...planProductAddresses(source, reservations) };
}
export async function readAliasIdentities(Product, ProductAddress) {
  const read = async (Model, fields, maximum) => {
    const rows = []; let after;
    for (let page = 0; page <= maximum / 20; page++) {
      const batch = await Model.find(after ? { _id: { $gt: after } } : {}).select(fields).sort({ _id: 1 }).limit(20).lean().maxTimeMS(3000);
      if (rows.length + batch.length > maximum) throw new Error('Alias migration bound exceeded');
      rows.push(...batch);
      if (batch.length < 20) return rows;
      after = batch.at(-1)._id;
    }
    throw new Error('Alias migration bound exceeded');
  };
  return { products: await read(Product, '_id name slug externalCatalogId', 10_000), addresses: await read(ProductAddress, 'slug productId canonical', 100_000) };
}
export async function applyAliasReview(reviewed, { Product, ProductAddress, configuration, writersStopped = false }) {
  if (!writersStopped) throw new Error('Stop every catalog writer before backfill');
  assertDatabaseWriteAllowed(ProductAddress.db, configuration);
  const { products, addresses } = await readAliasIdentities(Product, ProductAddress);
  const current = aliasReview(products, addresses, Product.db.name);
  if (reviewed.version !== 1 || reviewed.target !== current.target || reviewed.reviewHash !== current.reviewHash
    || JSON.stringify(reviewed.entries) !== JSON.stringify(current.entries)) throw new Error('Reviewed aliases are stale or altered; inspect again');
  const bySlug = new Map(addresses.map(a => [a.slug, { productId: String(a.productId), canonical: a.canonical }]));
  for (const entry of current.entries) {
    for (const slug of [entry.legacySlug, entry.canonicalSlug]) bySlug.set(slug, { productId: entry.productId, canonical: slug === entry.canonicalSlug || bySlug.get(slug)?.canonical === true });
  }
  const rows = [...bySlug].map(([slug, owner]) => ({ slug, ...owner }));
  const journal = [];
  try {
    for (let offset = 0; offset < rows.length; offset += 100) {
      const batch = rows.slice(offset, offset + 100);
      const entry = { batch: offset / 100 + 1, attempted: batch.length, status: 'started' }; journal.push(entry);
      const session = await ProductAddress.db.startSession();
      try {
        await session.withTransaction(async () => {
          assertDatabaseWriteAllowed(ProductAddress.db, configuration);
          await ProductAddress.bulkWrite(batch.map(row => ({ updateOne: { filter: { slug: row.slug, productId: row.productId },
            update: { $setOnInsert: { slug: row.slug, productId: row.productId }, $set: { canonical: row.canonical } }, upsert: true } })), { session, ordered: true });
        }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, maxCommitTimeMS: 5000 });
        entry.status = 'committed';
      } catch (error) {
        entry.status = error.hasErrorLabel?.('UnknownTransactionCommitResult') ? 'uncertain' : 'rolled-back'; throw error;
      } finally { await session.endSession(); }
    }
    const after = await readAliasIdentities(Product, ProductAddress);
    if (digest(identity(after.products)) !== current.identityHash) throw new Error('Catalog changed during backfill; keep aliases disabled and review again');
    const owners = new Map(after.addresses.map(a => [a.slug, a]));
    for (const row of rows) {
      const actual = owners.get(row.slug);
      if (!actual || String(actual.productId) !== row.productId || actual.canonical !== row.canonical) throw new Error('Alias verification failed');
    }
    return { ...current, status: 'verified', journal, productWrites: 0 };
  } catch (error) {
    error.aliasReport = { ...current, status: 'incomplete-do-not-activate', journal, productWrites: 0 }; throw error;
  }
}

async function ownedFile(value, output = false) {
  const local = await realpath(path.join(root, 'local-data'));
  const destination = path.resolve(root, value);
  const resolved = output ? path.join(await realpath(path.dirname(destination)), path.basename(destination)) : await realpath(destination);
  const relative = path.relative(local, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || output && path.extname(destination) !== '.json') throw new Error('Alias files must remain inside local-data');
  if (output) { try { const actual = await realpath(destination); if (actual !== resolved) throw new Error('Alias output cannot be a symlink'); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
  return resolved;
}
async function save(file, data) {
  const destination = await ownedFile(file, true);
  const temporary = `${destination}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, { flag: 'wx' }); await rename(temporary, destination);
}
export async function runProductAliases(args = []) {
  const options = { file: 'local-data/TapAndWrap_Website_Product_Master.xlsx', report: 'local-data/product-alias-dry-run.json' };
  const values = new Set(['--file', '--report', '--reviewed', '--target']);
  const flags = new Set(['--dry-run', '--inspect', '--apply', '--init-indexes', '--confirm-read', '--confirm-write', '--confirm-writers-stopped', '--confirm-production']);
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i]; if (seen.has(flag)) throw new Error('Duplicate alias argument'); seen.add(flag);
    if (values.has(flag)) { const value = args[++i]; if (!value || value.startsWith('--')) throw new Error('Missing alias argument'); options[flag.slice(2)] = value; }
    else if (flags.has(flag)) options[flag.slice(2)] = true;
    else throw new Error('Unknown alias argument');
  }
  if ([options.inspect, options.apply, options['init-indexes'], options['dry-run']].filter(Boolean).length > 1) throw new Error('Choose one alias operation');
  await ownedFile(options.report, true);
  if (options.apply && options.reviewed && await ownedFile(options.reviewed) === await ownedFile(options.report, true)) throw new Error('The reviewed report must not be overwritten');
  if (!options.inspect && !options.apply && !options['init-indexes']) {
    if (options.target || options.reviewed || options['confirm-read'] || options['confirm-write']) throw new Error('Offline alias mode cannot accept database options');
    const file = await ownedFile(options.file);
    const { readCatalogWorkbook, buildCatalogPlan, workbookSha256 } = await import('../src/catalog/import-workbook.js');
    const workbookHash = await workbookSha256(file);
    const plan = buildCatalogPlan(await readCatalogWorkbook(file), { workbookHash });
    if (plan.report.fatalErrors.length || plan.report.invalidRows.length || workbookHash !== await workbookSha256(file)) throw new Error('Workbook is invalid or changed');
    const proposed = plan.products.map(p => ({ _id: p.externalCatalogId, name: p.name, slug: p.slug, externalCatalogId: p.externalCatalogId }));
    const report = { ...aliasReview(proposed), mode: 'offline-workbook-proposal', workbookHash, connectionOpened: false, databaseWrites: 0,
      limitation: 'MongoDB IDs, later merchant edits and current reservations are unverified. Never use this offline proposal to apply a database backfill.' };
    await save(options.report, report); return report;
  }
  if (!options.target || !options['confirm-read']) throw new Error('Database operations require a target and separate read authorization');
  if ((options.apply || options['init-indexes']) && (!options['confirm-write'] || !options['confirm-writers-stopped'])) throw new Error('Database writes require explicit authorization and stopped writers');
  if (options.apply && (!options.reviewed || options.reviewed === options.report)) throw new Error('Preserve a separately reviewed database inspection report');
  if (options.target === 'production' && !options['confirm-production']) throw new Error('Production requires separate explicit authorization');
  const uri = process.env.PRODUCT_ALIAS_MIGRATION_URI || '';
  const configuration = { databaseTarget: options.target, nodeEnv: process.env.NODE_ENV || 'development', mongoUri: uri,
    productionDatabaseAuthorized: process.env.PRODUCTION_DATABASE_AUTHORIZED === 'true', productionDatabaseHost: process.env.PRODUCTION_DATABASE_HOST || '' };
  const settings = { ...configuration, target: options.target };
  const { dbName } = validateDatabaseUri(uri, settings);
  process.env.TAP_WRAP_SKIP_DOTENV = 'true';
  const { default: mongoose } = await import('mongoose');
  const { Product } = await import('../src/models/Product.js');
  const { ProductAddress } = await import('../src/models/ProductAddress.js');
  try {
    await mongoose.connect(uri, { dbName, autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 5000, socketTimeoutMS: 5000 });
    assertConnectedDatabase(mongoose.connection, settings);
    const { verifyDatabaseSchema, initializeDatabaseSchema } = await import('../src/config/schema.js');
    if (options['init-indexes']) {
      await initializeDatabaseSchema(configuration, { authorized: true, models: [ProductAddress] });
      return { status: 'alias-indexes-initialized', productWrites: 0 };
    }
    if (options.apply) {
      await verifyDatabaseSchema(configuration, { models: [Product, ProductAddress] });
      const reviewed = JSON.parse(await readFile(await ownedFile(options.reviewed), 'utf8'));
      try {
        const report = await applyAliasReview(reviewed, { Product, ProductAddress, configuration, writersStopped: true });
        await save(options.report, report); return report;
      } catch (error) { if (error.aliasReport) await save(options.report, error.aliasReport); throw error; }
    }
    const data = await readAliasIdentities(Product, ProductAddress);
    const report = { ...aliasReview(data.products, data.addresses, dbName), mode: 'database-read-only', databaseWrites: 0 };
    await save(options.report, report); return report;
  } finally { await mongoose.disconnect(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const result = await runProductAliases(process.argv.slice(2)); console.log(JSON.stringify({ mode: result.mode || result.status, productCount: result.productCount, collisionCount: result.collisionCount, report: 'See the explicit local-data report; no credentials are included.' })); }
  catch { console.error('Product alias operation failed. Keep aliases disabled; inspect the guarded target, reviewed report, and any batch journal.'); process.exitCode = 1; }
}
