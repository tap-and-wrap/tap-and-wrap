import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalogPlan, MASTER_HEADERS, INDEX_HEADERS, CATEGORY_HEADERS, validateImageReference } from '../src/catalog/import-workbook.js';
import { applyCatalogPlan, validateCatalogModels } from '../src/catalog/import-catalog.js';
import { parseImportArguments, validateStagingUri } from '../scripts/import-catalog.js';
import { Product } from '../src/models/Product.js';
import { ComponentOption } from '../src/models/ComponentOption.js';
import { Category } from '../src/models/Category.js';
import { startTestDatabase } from './helpers/database.js';

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

test('insert-only reimports preserve merchant edits and timestamps and report cross-collection classification changes', async () => {
  const database = await startTestDatabase({ models: [Product, Category, ComponentOption] });
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
