import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalogPlan, MASTER_HEADERS, INDEX_HEADERS, CATEGORY_HEADERS, validateImageReference } from '../src/catalog/import-workbook.js';
import { applyCatalogPlan, validateCatalogModels } from '../src/catalog/import-catalog.js';
import { parseImportArguments, validateStagingUri } from '../scripts/import-catalog.js';
import { Product } from '../src/models/Product.js';
import { ComponentOption } from '../src/models/ComponentOption.js';
import { Category } from '../src/models/Category.js';
import { startTestDatabase } from './helpers/database.js';
import { planCategoryIdentityMigration, applyCategoryIdentityMigration } from '../src/catalog/category-import-identity.js';
import { parseIdentityArguments } from '../scripts/category-identities.js';
import { writeImportReport } from '../src/catalog/import-report.js';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

function fixtureRow(overrides = {}) {
  return { 'Product ID': 'B1-TRO-001', 'Product Name': 'Custom Sports Awards Set',
    'Main Category': 'Gifts & Occasions', Subcategory: 'Trophies', Description: 'Original catalog description.',
    'Catalog Role': 'Product', Confidence: 'High', 'Publish Status': 'Draft', 'Image Count': 2,
    'Image 1 (Main)': 'Gifts & Occasions/Trophies/custom-sports-awards-set-02.webp',
    'Image 2': 'Gifts & Occasions/Trophies/custom-sports-awards-set-01.webp', ...overrides };
}

function fixtureSheets(records = [fixtureRow()]) {
  const groups = new Map();
  for (const record of records) {
    const key = `${record['Main Category']}|${record.Subcategory}`;
    const group = groups.get(key) || [record['Main Category'], record.Subcategory, 0];
    group[2] += 1;
    groups.set(key, group);
  }
  return [
    { name: 'Website Product Master', rows: [MASTER_HEADERS, ...records.map((record) => MASTER_HEADERS.map((header) => record[header] ?? null))] },
    { name: 'Image Index', rows: [INDEX_HEADERS, ...records.flatMap((record) => Array.from({ length: record['Image Count'] }, (_, index) => [
      record['Product ID'], record['Product Name'], index + 1, index === 0 ? 'Main image' : 'Secondary image',
      record[index === 0 ? 'Image 1 (Main)' : `Image ${index + 1}`],
    ]))] },
    { name: 'Category Summary', rows: [CATEGORY_HEADERS, ...groups.values()] },
  ];
}

test('default importer mode cannot write and production/staging guards are mandatory', () => {
  assert.equal(parseImportArguments([]).apply, false);
  assert.equal(parseImportArguments(['--dry-run']).apply, false);
  assert.throws(() => parseImportArguments(['--apply']), /requires/i);
  assert.throws(() => parseImportArguments(['--apply', '--target', 'production']), /Production/);
  assert.throws(() => parseImportArguments(['--batch-size', '101']), /1 to 100/);
  assert.throws(() => validateStagingUri('mongodb://127.0.0.1:27017/tap_wrap', 'test'), { code: 'DATABASE_NAME_REJECTED' });
  assert.throws(() => validateStagingUri('mongodb://127.0.0.1:27017/tap_wrap_staging', 'production'), /production/);
  assert.throws(() => validateStagingUri(undefined, 'test'), /CATALOG_IMPORT_STAGING_URI/);
  assert.throws(() => validateStagingUri('mongodb://127.0.0.1:27017/tap_wrap_staging', 'test'), { code: 'DATABASE_NAME_REJECTED' });
  assert.equal(validateStagingUri('mongodb://127.0.0.1:27017/tapandwrap_staging', 'test'), 'mongodb://127.0.0.1:27017/tapandwrap_staging');
});

test('schema preflight validates offline and write entrypoint refuses production or mixed connections before operations', async () => {
  const plan = buildCatalogPlan(fixtureSheets());
  assert.deepEqual(await validateCatalogModels(plan, { Product, Category, ComponentOption }), { valid: true, products: 1, components: 0, categories: 2 });
  assert.equal(Product.db.readyState, 0, 'offline schema validation must not connect');
  await assert.rejects(applyCatalogPlan(plan, { Product, Category, ComponentOption }), { code: 'DATABASE_NOT_CONNECTED' });
  const connection = { name: 'tapandwrap_production', readyState: 1, host: 'atlas.example.test' };
  const stub = () => {};
  stub.db = connection;
  await assert.rejects(applyCatalogPlan(plan, { Product: stub, Category: stub, ComponentOption: stub }), { code: 'DATABASE_NAME_REJECTED' });
  connection.name = 'other_staging';
  await assert.rejects(applyCatalogPlan(plan, { Product: stub, Category: stub, ComponentOption: stub }), { code: 'DATABASE_NAME_REJECTED' });
  connection.name = 'tapandwrap_staging';
  const other = () => {};
  other.db = { ...connection };
  await assert.rejects(applyCatalogPlan(plan, { Product: stub, Category: other, ComponentOption: stub }), /same dedicated staging connection/);
});

test('selected primary image and descriptions survive import without filename-based reordering', () => {
  const row = fixtureRow({ Description: '  Exact source description.\nSecond line.  ' });
  const plan = buildCatalogPlan(fixtureSheets([row]), { workbookHash: 'fixture-sha256' });
  assert.deepEqual(plan.report.invalidRows, []);
  assert.equal(plan.products[0].description, row.Description);
  assert.equal(plan.products[0].mainImageKey, row['Image 1 (Main)']);
  assert.deepEqual(plan.products[0].galleryKeys, [row['Image 1 (Main)'], row['Image 2']]);
  assert.equal(plan.products[0].pricePiastres, null);
  assert.equal(plan.products[0].priceApproved, false);
  assert.deepEqual(plan.products[0].inventory, { mode: 'tracked', quantity: 10, approved: false, available: true });
  assert.equal(plan.products[0].status, 'draft');
  assert.equal(plan.products[0].published, false);
});

test('components are separated and questionable classifications are held for merchant review', () => {
  const records = [fixtureRow(), fixtureRow({ 'Product ID': 'C1-001', 'Catalog Role': 'Customization Option' }),
    fixtureRow({ 'Product ID': 'C1-002', 'Catalog Role': 'Gift Packaging' }),
    fixtureRow({ 'Product ID': 'V1-001', 'Catalog Role': 'Variant Product', 'Variant / Customization Details': 'Grouped size options; review.' })];
  const plan = buildCatalogPlan(fixtureSheets(records));
  assert.deepEqual(plan.report.invalidRows, []);
  assert.equal(plan.products.length, 2);
  assert.equal(plan.components.length, 2);
  assert.equal(plan.components.find(({ catalogRole }) => catalogRole === 'Gift Packaging').status, 'hold');
  const variant = plan.products.find(({ catalogRole }) => catalogRole === 'Variant Product');
  assert.equal(variant.reviewRequired, true);
  assert.equal(variant.status, 'hold');
  assert.deepEqual(variant.variants, []);
  assert.equal(variant.customization.enabled, false);
  assert.equal(plan.report.counts.imageReferences, 8);
  assert.equal(plan.report.counts.categories, 2);
});

test('missing headers, duplicate IDs and unsafe paths block imports without inventing data', () => {
  const sheets = fixtureSheets();
  sheets[0].rows[0] = MASTER_HEADERS.filter((header) => header !== 'Product ID');
  assert.ok(buildCatalogPlan(sheets).report.fatalErrors.length > 0);
  const duplicate = buildCatalogPlan(fixtureSheets([fixtureRow(), fixtureRow()]));
  assert.equal(duplicate.products.length, 0);
  assert.equal(duplicate.report.invalidRows.filter(({ sheet }) => sheet === 'Website Product Master').length, 2);
  for (const path of ['../secret.webp', 'C:/other/image.webp', '/absolute.webp', 'folder\\image.webp', 'folder/%2e%2e/image.webp', 'https://example.test/image.webp']) {
    assert.ok(validateImageReference(path));
  }
  const invalid = buildCatalogPlan(fixtureSheets([fixtureRow({ 'Image 1 (Main)': '../secret.webp' })]));
  assert.equal(invalid.products.length, 0);
  assert.ok(invalid.report.invalidRows.length > 0);
  const missing = buildCatalogPlan(fixtureSheets([fixtureRow({ 'Product Name': '' })]));
  assert.equal(missing.products.length, 0);
});

test('Made by Request preserves source quantity but has no inventory deduction quantity', () => {
  const plan = buildCatalogPlan(fixtureSheets([fixtureRow({ 'Stock Status': 'Made by Request', Quantity: 7,
    'Price EGP': 125.25, 'Publish Status': 'Ready' })]));
  assert.deepEqual(plan.report.invalidRows, []);
  assert.equal(plan.products[0].inventory.mode, 'made_to_order');
  assert.equal(plan.products[0].inventory.quantity, null);
  assert.equal(plan.products[0].catalogSource.quantity, 7);
  assert.equal(plan.products[0].pricePiastres, 12525);
  assert.equal(plan.products[0].priceApproved, false);
  assert.equal(plan.products[0].status, 'draft');
});

test('workbook currency is parsed into exact piastres without rounding invalid amounts', () => {
  for (const [input, expected] of [['0.03', 3], ['1.01', 101], [125.25, 12525],
    ['90071992547409.91', Number.MAX_SAFE_INTEGER], ['', null]]) {
    const plan = buildCatalogPlan(fixtureSheets([fixtureRow({ 'Price EGP': input })]));
    assert.deepEqual(plan.report.invalidRows, [], String(input));
    assert.equal(plan.products[0].pricePiastres, expected);
    assert.equal(plan.products[0].priceApproved, false);
  }
  for (const input of ['1.001', '90071992547409.92', '-1', '1e3', Infinity, true, '1,000']) {
    const plan = buildCatalogPlan(fixtureSheets([fixtureRow({ 'Price EGP': input })]));
    assert.equal(plan.products.length, 0, String(input));
    assert.match(plan.report.invalidRows[0].issues.join(' '), /integer piastres/, String(input));
  }
});

test('insert-only reimports preserve merchant edits and timestamps and report cross-collection classification changes', async () => {
  const database = await startTestDatabase({ models: [Product, Category, ComponentOption], transactions: true });
  try {
    const records = [fixtureRow(), fixtureRow({ 'Product ID': 'C1-001', 'Catalog Role': 'Customization Option' })];
    const firstPlan = buildCatalogPlan(fixtureSheets(records));
    const invalidPlan = structuredClone(firstPlan);
    invalidPlan.products[0].name = 'x'.repeat(241);
    await assert.rejects(applyCatalogPlan(invalidPlan, { Product, Category, ComponentOption }));
    assert.equal(await Category.countDocuments({}), 0, 'schema preflight must finish before any category insert');
    assert.equal(await Product.countDocuments({}), 0);
    const first = await applyCatalogPlan(firstPlan, { Product, Category, ComponentOption, batchSize: 1 });
    assert.deepEqual(first.inserted, { products: 1, components: 1, categories: 2 });
    const product = await Product.findOne({ externalCatalogId: 'B1-TRO-001' });
    product.name = 'Merchant approved product name';
    product.pricePiastres = 12345;
    product.priceApproved = true;
    product.inventory.quantity = 3;
    product.inventory.approved = true;
    product.customization.enabled = true;
    product.customization.templateId = '507f1f77bcf86cd799439011';
    product.customization.serviceKind = 'generic';
    await product.save();
    const before = await Product.findById(product._id).lean();
    const componentBefore = await ComponentOption.findOne({ externalCatalogId: 'C1-001' }).lean();
    const categoryBefore = await Category.find({}).sort({ slug: 1 }).lean();

    const unchanged = await applyCatalogPlan(firstPlan, { Product, Category, ComponentOption });
    assert.deepEqual(unchanged.inserted, { products: 0, components: 0, categories: 0 });
    assert.deepEqual(unchanged.preserved, { products: 1, components: 1, categories: 2 });
    assert.deepEqual(await Product.findById(product._id).lean(), before);
    assert.deepEqual(await ComponentOption.findOne({ externalCatalogId: 'C1-001' }).lean(), componentBefore);
    assert.deepEqual(await Category.find({}).sort({ slug: 1 }).lean(), categoryBefore);

    const changedRecords = [fixtureRow({ 'Product Name': 'New source name', 'Price EGP': 999, Quantity: 99 }),
      fixtureRow({ 'Product ID': 'C1-001', 'Catalog Role': 'Product' })];
    const changed = await applyCatalogPlan(buildCatalogPlan(fixtureSheets(changedRecords)), { Product, Category, ComponentOption });
    assert.equal(changed.sourceChanges.length, 1);
    assert.equal(changed.classificationConflicts.length, 1);
    assert.equal(await Product.countDocuments({}), 1);
    assert.equal(await ComponentOption.countDocuments({}), 1);
    assert.deepEqual(await Product.findById(product._id).lean(), before);
    assert.deepEqual(await ComponentOption.findOne({ externalCatalogId: 'C1-001' }).lean(), componentBefore);
  } finally { await database.stop(); }
});

test('immutable category source keys preserve root/child IDs after merchant name and slug changes', async () => {
  const database = await startTestDatabase({ transactions: true });
  try {
    const plan = buildCatalogPlan(fixtureSheets(), { workbookHash: 'a'.repeat(64) });
    await applyCatalogPlan(plan, { Product, Category, ComponentOption });
    const categories = await Category.find({}).select('+importCategoryKey').sort({ parentId: 1 });
    for (const [index, category] of categories.entries()) { category.name = `Merchant category ${index}`; category.slug = `merchant-category-${index}`; category.featured = true; category.order = 90 + index; await category.save(); }
    const before = await Category.find({}).select('+importCategoryKey +nameNormalized +relationshipRevision').sort({ _id: 1 }).lean();
    const result = await applyCatalogPlan(plan, { Product, Category, ComponentOption });
    assert.deepEqual(result.inserted, { products: 0, components: 0, categories: 0 });
    assert.deepEqual(result.preserved, { products: 1, components: 0, categories: 2 });
    assert.deepEqual(await Category.find({}).select('+importCategoryKey +nameNormalized +relationshipRevision').sort({ _id: 1 }).lean(), before);
    const incoming = fixtureRow({ 'Product ID': 'B1-TRO-002', 'Product Name': 'Second source product' });
    await applyCatalogPlan(buildCatalogPlan(fixtureSheets([fixtureRow(), incoming])), { Product, Category, ComponentOption });
    const old = await Product.findOne({ externalCatalogId: 'B1-TRO-001' }).lean();
    const added = await Product.findOne({ externalCatalogId: 'B1-TRO-002' }).lean();
    assert.equal(String(added.categoryId), String(old.categoryId));
    assert.equal(String(added.subcategoryId), String(old.subcategoryId));
    assert.equal(await Category.countDocuments(), 2);
  } finally { await database.stop(); }
});

test('changed source grouping for a stable catalog ID requires review rather than creating duplicate categories', async () => {
  const database = await startTestDatabase({ transactions: true });
  try {
    const models = { Product, Category, ComponentOption };
    await applyCatalogPlan(buildCatalogPlan(fixtureSheets()), models);
    const before = await Category.find().sort({ _id: 1 }).lean();
    const plan = buildCatalogPlan(fixtureSheets([fixtureRow({ 'Main Category': 'Renamed source grouping' })]));
    const review = await planCategoryIdentityMigration(plan, models);
    assert.match(review.issues[0].reason, /Source grouping changed/);
    await assert.rejects(applyCatalogPlan(plan, models), { code: 'CATEGORY_IMPORT_IDENTITY_AMBIGUOUS' });
    assert.deepEqual(await Category.find().sort({ _id: 1 }).lean(), before);
    assert.equal(await Product.countDocuments(), 1);
  } finally { await database.stop(); }
});

test('legacy renamed categories resolve without writes and explicit identity migration preserves merchant fields', async () => {
  const database = await startTestDatabase({ transactions: true });
  try {
    const plan = buildCatalogPlan(fixtureSheets(), { workbookHash: 'a'.repeat(64) });
    await applyCatalogPlan(plan, { Product, Category, ComponentOption });
    await Category.collection.updateMany({}, { $unset: { importCategoryKey: '' } });
    const categories = await Category.find({});
    for (const [index, category] of categories.entries()) { category.name = `Renamed legacy ${index}`; category.slug = `renamed-legacy-${index}`; category.active = false; await category.save(); }
    const before = await Category.find({}).select('+importCategoryKey +nameNormalized +relationshipRevision').sort({ _id: 1 }).lean();
    const productBefore = await Product.findOne().lean();
    const result = await applyCatalogPlan(plan, { Product, Category, ComponentOption });
    assert.equal(result.legacyCategoryIdentities.length, 2);
    assert.deepEqual(await Category.find({}).select('+importCategoryKey +nameNormalized +relationshipRevision').sort({ _id: 1 }).lean(), before, 'compatibility resolution must not backfill automatically');
    const reviewed = await planCategoryIdentityMigration(plan, { Product, Category, ComponentOption });
    assert.equal(reviewed.writes, 0);
    assert.equal(reviewed.proposals.length, 2);
    assert.deepEqual(reviewed.issues, []);
    assert.ok(reviewed.proposals.every((proposal) => proposal.evidence === 'source-records'));
    await assert.rejects(applyCategoryIdentityMigration(plan, reviewed, { Product, Category, ComponentOption }), /explicitly confirmed/);
    const migrated = await applyCategoryIdentityMigration(plan, reviewed, { Product, Category, ComponentOption }, { confirm: true });
    assert.equal(migrated.updated, 2);
    const after = await Category.find({}).select('+importCategoryKey +nameNormalized +relationshipRevision').sort({ _id: 1 }).lean();
    for (let index = 0; index < before.length; index++) {
      const { importCategoryKey, __v, ...merchant } = after[index];
      const { __v: oldVersion, ...oldMerchant } = before[index];
      assert.deepEqual(merchant, oldMerchant);
      assert.equal(__v, oldVersion + 1);
      assert.ok(plan.categories.some((category) => category.key === importCategoryKey));
    }
    assert.deepEqual(await Product.findOne().lean(), productBefore);
    assert.equal((await applyCategoryIdentityMigration(plan, reviewed, { Product, Category, ComponentOption }, { confirm: true })).updated, 0, 'reapplying metadata migration is safe');
    assert.equal((await applyCatalogPlan(plan, { Product, Category, ComponentOption })).legacyCategoryIdentities.length, 0);
  } finally { await database.stop(); }
});

test('identity migration fails closed on stale review and ambiguous source relationships before metadata writes', async () => {
  const database = await startTestDatabase({ transactions: true });
  try {
    const plan = buildCatalogPlan(fixtureSheets(), { workbookHash: 'a'.repeat(64) });
    await applyCatalogPlan(plan, { Product, Category, ComponentOption });
    await Category.collection.updateMany({}, { $unset: { importCategoryKey: '' } });
    const reviewed = await planCategoryIdentityMigration(plan, { Product, Category, ComponentOption });
    const root = await Category.findOne({ parentId: null }); root.name = 'Merchant changed since review'; await root.save();
    await assert.rejects(applyCategoryIdentityMigration(plan, reviewed, { Product, Category, ComponentOption }, { confirm: true }), { code: 'CATEGORY_IMPORT_IDENTITY_AMBIGUOUS' });
    assert.equal(await Category.countDocuments({ importCategoryKey: { $exists: true } }), 0);
    const other = await Category.create({ name: 'Different root', slug: 'different-root' });
    await Product.collection.updateOne({ externalCatalogId: 'B1-TRO-001' }, { $set: { categoryId: other._id } });
    const report = await planCategoryIdentityMigration(plan, { Product, Category, ComponentOption });
    assert.ok(report.issues.length);
    await assert.rejects(applyCatalogPlan(plan, { Product, Category, ComponentOption }), { code: 'CATEGORY_IMPORT_IDENTITY_AMBIGUOUS' });
    assert.equal(await Category.countDocuments(), 3);
  } finally { await database.stop(); }
});

test('committed batches are journaled while a failed batch rolls back and resumes without duplicates', async () => {
  const database = await startTestDatabase({ transactions: true });
  const original = Product.bulkWrite;
  try {
    const plan = buildCatalogPlan(fixtureSheets([fixtureRow(), fixtureRow({ 'Product ID': 'B1-TRO-002' }), fixtureRow({ 'Product ID': 'B1-TRO-003' })]));
    const snapshots = [];
    let calls = 0;
    Product.bulkWrite = async function (operations, options) {
      if (++calls === 1) return original.call(this, operations, options);
      const result = await original.call(this, operations.slice(0, 1), options);
      throw Object.assign(new Error('SYNTHETIC_SECRET_DRIVER_MESSAGE'), { result });
    };
    let failure;
    try { await applyCatalogPlan(plan, { Product, Category, ComponentOption, batchSize: 1, onProgress: async (report) => snapshots.push(report) }); } catch (error) { failure = error; }
    assert.ok(failure);
    assert.equal(failure.importReport.status, 'failed');
    assert.equal(failure.importReport.inserted.products, 1);
    assert.equal(failure.importReport.inserted.categories, 2);
    assert.equal(failure.importReport.journal.at(-1).uncertain, false);
    assert.equal(failure.importReport.journal.at(-1).inserted, 0);
    assert.equal(failure.importReport.journal.at(-1).rolledBack, true);
    assert.equal(JSON.stringify(snapshots).includes('SYNTHETIC_SECRET_DRIVER_MESSAGE'), false);
    assert.equal(snapshots.at(-1).status, 'failed');
    const before = await Product.findOne().lean();
    Product.bulkWrite = original;
    const resumed = await applyCatalogPlan(plan, { Product, Category, ComponentOption });
    assert.deepEqual(resumed.inserted, { products: 2, components: 0, categories: 0 });
    assert.deepEqual(resumed.preserved, { products: 1, components: 0, categories: 2 });
    assert.equal(resumed.status, 'completed');
    assert.deepEqual(await Product.findById(before._id).lean(), before);
    assert.equal(await Product.countDocuments(), 3);
  } finally { Product.bulkWrite = original; await database.stop(); }
});

test('journal persistence interruption retains committed counts and pre-commit failures report rollback', async () => {
  const database = await startTestDatabase({ transactions: true });
  const original = Product.bulkWrite;
  try {
    const plan = buildCatalogPlan(fixtureSheets());
    let failure;
    try { await applyCatalogPlan(plan, { Product, Category, ComponentOption, onProgress: async (report) => { if (report.inserted.products) throw new Error('Synthetic report disk failure'); } }); } catch (error) { failure = error; }
    assert.equal(failure.importReport.inserted.products, 1);
    assert.equal(failure.importReport.status, 'failed');
    assert.equal(await Product.countDocuments(), 1);
    await Product.deleteMany({});
    Product.bulkWrite = async () => { throw new Error('Synthetic unacknowledged network failure'); };
    await assert.rejects(applyCatalogPlan(plan, { Product, Category, ComponentOption }), (error) => {
      assert.equal(error.importReport.journal.at(-1).uncertain, false);
      assert.equal(error.importReport.journal.at(-1).inserted, 0);
      assert.equal(error.importReport.journal.at(-1).rolledBack, true);
      return true;
    });
  } finally { Product.bulkWrite = original; await database.stop(); }
});

test('identity command defaults offline and report replacement remains atomic and project-scoped', async () => {
  assert.equal(parseIdentityArguments([]).inspect, undefined);
  assert.throws(() => parseIdentityArguments(['--inspect']), /requires/);
  assert.throws(() => parseIdentityArguments(['--apply', '--target', 'staging', '--confirm-staging']), /reviewed/);
  assert.throws(() => parseIdentityArguments(['--inspect', '--target', 'production', '--confirm-staging']), /Production/);
  const cache = fileURLToPath(new URL('../.cache/', import.meta.url));
  await mkdir(cache, { recursive: true });
  const directory = await mkdtemp(path.join(cache, 'import-journal-'));
  try {
    const report = path.join(directory, 'report.json');
    await writeImportReport(report, { status: 'applying', count: 1 });
    await writeImportReport(report, { status: 'failed', count: 2 });
    assert.deepEqual(JSON.parse(await readFile(report, 'utf8')), { status: 'failed', count: 2 });
    await assert.rejects(writeImportReport(path.resolve(cache, '../../../../outside.json'), {}), /inside this project/);
  } finally {
    if (!path.resolve(directory).startsWith(path.resolve(cache) + path.sep)) throw new Error('Unsafe test artifact cleanup target.');
    await rm(directory, { recursive: true, force: true });
  }
});
