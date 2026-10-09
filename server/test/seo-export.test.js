import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSeoExportArguments, resolveSeoExportOutput, exportCategoryDto, exportProductDto, exportApprovedContent, buildApprovedSeoExport, runSeoCatalogExport, approvedMediaOrigin } from '../scripts/export-seo-catalog.js';
import { buildSeoPlan } from '../../client/scripts/seo/generator.js';
import { productSeoSignature } from '../../client/src/seo/metadata.js';
import { publicProductDetail } from '../src/catalog/public-presentation.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const main = { _id: '111111111111111111111111', name: 'Isolated Gifts', slug: 'isolated-gifts', active: true, parentId: null, imageKey: 'Fixtures/category.webp' };
const child = { _id: '222222222222222222222222', name: 'Isolated Keepsakes', slug: 'isolated-keepsakes', active: true, parentId: main._id };
const product = { _id: '333333333333333333333333', name: 'Isolated Gift', slug: 'isolated-gift', description: 'Isolated test content only.', categoryId: main._id, subcategoryId: child._id, status: 'ready', published: true, reviewRequired: false, pricePiastres: 12345, priceApproved: true, inventory: { mode: 'tracked', quantity: 10, approved: true, available: true }, variants: [], mainImageKey: 'Fixtures/main.webp', galleryKeys: ['Private/customer-file.webp'], personalization: { customerSecret: 'do-not-export-customer' }, customization: { internalConfiguration: 'do-not-export-template' }, merchantReviewNotes: 'do-not-export-source-notes', updatedAt: new Date('2026-10-09T12:00:00Z') };
const categories = new Map([main, child].map((category) => [category._id, exportCategoryDto(category)]));

function pagedFixture(rows, calls) {
  return async ({ after, limit }) => {
    calls.push({ after: after ? String(after) : null, limit });
    const offset = after ? rows.findIndex((row) => String(row._id) === String(after)) + 1 : 0;
    return rows.slice(offset, offset + limit);
  };
}

function sourceFixture(products = [product]) {
  const calls = { main: [], children: [], products: [] };
  let closed = 0;
  return { calls, source: { readMainCategoryPage: pagedFixture([main], calls.main), readSubcategoryPage: pagedFixture([child], calls.children), readProductPage: pagedFixture(products, calls.products), readSiteContent: async () => null, close: async () => { closed += 1; } }, closed: () => closed };
}

test('default export command is offline and does not load dotenv, connect, or write files', async () => {
  let connections = 0; let writes = 0; const logs = [];
  const result = await runSeoCatalogExport([], { environment: { MONGODB_URI: 'mongodb+srv://secret-user:secret-password@not-contacted.example/production' }, log: (message) => logs.push(message), openSource: async () => { connections += 1; }, writeOutput: async () => { writes += 1; } });
  assert.equal(result.mode, 'dry-run');
  assert.equal(result.databaseConnected, false);
  assert.equal(result.dotenvLoaded, false);
  assert.equal(connections, 0);
  assert.equal(writes, 0);
  assert.equal(logs.join('').includes('secret'), false);
});

test('argument parser rejects production, unconfirmed reads, duplicates and ambiguous modes', () => {
  assert.throws(() => parseSeoExportArguments(['--target', 'production']), /local or staging/);
  assert.throws(() => parseSeoExportArguments(['--confirm-read']), /Reading requires/);
  assert.throws(() => parseSeoExportArguments(['--target', 'staging', '--confirm-read', '--output', 'local-data/file.json', '--dry-run']), /Reading requires/);
  assert.throws(() => parseSeoExportArguments(['--dry-run', '--dry-run']), /Duplicate/);
});

test('export output cannot escape local-data or use credentials/project files', () => {
  for (const output of ['../other-project/export.json', 'server/.env', 'client/index.html', 'local-data/../server/export.json', 'local-data/export.txt']) assert.throws(() => resolveSeoExportOutput(output), /local-data|JSON file/);
  assert.equal(resolveSeoExportOutput('local-data/seo/approved.json'), path.join(projectRoot, 'local-data', 'seo', 'approved.json'));
});

test('confirmed reads reject production database names and production runtime before connecting', async () => {
  let connections = 0;
  const args = ['--target', 'staging', '--confirm-read', '--output', 'local-data/seo-export-test-not-written.json'];
  await assert.rejects(runSeoCatalogExport(args, { environment: { MONGODB_URI: 'mongodb+srv://user:password@fixture.example/tapandwrap_production', NODE_ENV: 'development' }, openSource: async () => { connections += 1; } }), { code: 'DATABASE_NAME_REJECTED' });
  await assert.rejects(runSeoCatalogExport(args, { environment: { MONGODB_URI: 'mongodb+srv://user:password@fixture.example/tapandwrap_staging', NODE_ENV: 'production' }, openSource: async () => { connections += 1; } }), /Production SEO/);
  assert.equal(connections, 0);
});

test('product DTO preserves stable public identity while dropping galleries, private configuration and source notes', () => {
  const dto = exportProductDto(product, categories, 'https://public-media.example/catalog');
  assert.equal(dto._id, product._id);
  assert.equal(dto.slug, product.slug);
  assert.equal(dto.description, product.description);
  assert.equal(dto.mainImageUrl, 'https://public-media.example/catalog/Fixtures/main.webp');
  assert.equal(dto.pricePiastres, 12345);
  assert.equal(dto.updatedAt, '2026-10-09T12:00:00.000Z');
  for (const value of ['galleryKeys', 'personalization', 'customization', 'merchantReviewNotes', 'do-not-export', 'Private/customer']) assert.equal(JSON.stringify(dto).includes(value), false);
});

test('drafts, provisional prices/inventory, unresolved reviews and category mismatches cannot be exported', () => {
  for (const change of [{ status: 'draft' }, { published: false }, { priceApproved: false }, { pricePiastres: null }, { inventory: { ...product.inventory, approved: false } }, { reviewRequired: true }, { subcategoryId: 'missing' }]) assert.equal(exportProductDto({ ...product, ...change }, categories), null);
  assert.equal(exportProductDto(product, new Map([[main._id, { ...categories.get(main._id), active: false }], [child._id, categories.get(child._id)]])), null);
  assert.equal(exportProductDto(product, new Map([[main._id, categories.get(main._id)], [child._id, { ...categories.get(child._id), parentId: 'wrong-main' }]])), null);
});

test('variant price approval and independent variant stock remain authoritative', () => {
  const variant = { key: 'rose', attributes: [{ name: 'Color', value: 'Rose' }], pricePiastres: 15000, priceApproved: true, inventory: { mode: 'tracked', quantity: 2, available: true, approved: true } };
  const dto = exportProductDto({ ...product, inventory: { ...product.inventory, quantity: 0 }, variants: [variant] }, categories);
  assert.equal(dto.orderingAvailable, true);
  assert.equal(dto.variants[0].pricePiastres, 15000);
  assert.equal(exportProductDto({ ...product, variants: [{ ...variant, priceApproved: false }] }, categories), null);
});

test('media mapping rejects unsafe origins and local filesystem paths', () => {
  assert.equal(approvedMediaOrigin('https://cdn.example/catalog'), 'https://cdn.example');
  for (const invalid of ['http://cdn.example', 'https://user:password@cdn.example', 'https://cdn.example?token=secret', 'C:/private/files']) assert.equal(approvedMediaOrigin(invalid), null);
  assert.equal(exportProductDto({ ...product, mainImageKey: 'C:/private/image.webp' }, categories, 'https://cdn.example').mainImageUrl, null);
});

test('bounded keyset pages are capped at 20 and include complete category relationships/counts', async () => {
  const products = Array.from({ length: 41 }, (_, index) => ({ ...product, _id: String(index + 1).padStart(24, '0'), slug: `isolated-gift-${index + 1}` }));
  const fixture = sourceFixture(products);
  const result = await buildApprovedSeoExport(fixture.source, { CATALOG_MEDIA_BASE_URL: 'https://cdn.example', CHECKOUT_ENABLED: 'true', COMMERCE_LAUNCH_AUTHORIZED: 'false' });
  assert.equal(result.catalog.products.length, 41);
  assert.equal(result.catalog.categories[0].productCount, 41);
  assert.equal(result.catalog.categories[1].parentId, main._id);
  assert.equal(result.catalog.checkoutEnabled, false);
  assert.deepEqual(fixture.calls.products.map((call) => call.limit), [20, 20, 20]);
  assert.equal(fixture.calls.products[1].after, products[19]._id);
});

test('incomplete, oversized or non-advancing pages abort rather than publishing a partial export', async () => {
  const fixture = sourceFixture(Array.from({ length: 20 }, (_, index) => ({ ...product, _id: String(index + 1).padStart(24, '0'), slug: `isolated-${index}` })));
  await assert.rejects(buildApprovedSeoExport(fixture.source, {}, { maximumPages: 1 }), /bounded page limit/);
  const oversized = sourceFixture();
  oversized.source.readProductPage = async () => Array.from({ length: 21 }, () => product);
  await assert.rejects(buildApprovedSeoExport(oversized.source), /20-record page limit/);
});

test('approved owner content exports plain text and excludes unapproved policies/notes', () => {
  const result = exportApprovedContent({ about: { approved: true, title: 'Isolated About', body: 'Approved fixture paragraph.\n\nSecond fixture paragraph.', updatedAt: new Date('2026-10-09T12:00:00Z') }, privacyPolicy: { approved: false, title: 'Unapproved', body: 'Do not publish.' }, contact: { approved: true, email: 'fixture@example.test', body: 'Owner-provided fixture contact.' }, updatedBy: 'private-admin-id', featuredReviews: [{ sourceNote: 'private-review-source' }] });
  assert.deepEqual(Object.keys(result.routes).sort(), ['/about', '/contact']);
  assert.equal(result.routes['/about'].paragraphs.length, 2);
  assert.equal(result.routes['/contact'].paragraphs.includes('Email: fixture@example.test'), true);
  assert.equal(JSON.stringify(result).includes('private'), false);
  assert.equal(JSON.stringify(result).includes('Do not publish'), false);
});

test('confirmed isolated export closes its source and writes only sanitized explicit output DTOs', async () => {
  const fixture = sourceFixture(); const writes = []; const logs = [];
  const result = await runSeoCatalogExport(['--target', 'local', '--confirm-read', '--output', 'local-data/seo-export-test-not-written.json', '--content-output', 'local-data/seo-content-test-not-written.json'], { environment: { MONGODB_URI: 'mongodb://127.0.0.1:27017/tapandwrap_dev', NODE_ENV: 'development' }, openSource: async (_uri, settings) => { assert.equal(settings.dbName, 'tapandwrap_dev'); return fixture.source; }, writeOutput: async (destination, value) => writes.push({ destination, value }), log: (message) => logs.push(message) });
  assert.equal(result.databaseWrites, false);
  assert.equal(result.indexesCreated, false);
  assert.equal(fixture.closed(), 1);
  assert.equal(writes.length, 2);
  assert.equal(writes[0].value.source, 'approved-public-catalog');
  assert.equal(logs.join('').includes('mongodb:'), false);
});

test('CLI rejection logs never include URI credentials or arbitrary driver detail', () => {
  const result = spawnSync(process.execPath, ['scripts/export-seo-catalog.js', '--target', 'staging', '--confirm-read', '--output', 'local-data/never-written-seo-test.json'], { cwd: path.join(projectRoot, 'server'), encoding: 'utf8', env: { ...process.env, MONGODB_URI: 'mongodb+srv://DO-NOT-LOG-USER:DO-NOT-LOG-PASSWORD@fixture.example/production', NODE_ENV: 'development' } });
  assert.equal(result.status, 1);
  assert.equal(result.stderr.includes('DO-NOT-LOG'), false);
  assert.equal(result.stderr.includes('mongodb'), false);
  assert.match(result.stderr, /DATABASE_NAME_REJECTED/);
});

test('actual exporter DTOs require separate current media attestation before generator indexing', async () => {
  const now = new Date('2026-10-09T12:00:00Z');
  const fixture = sourceFixture();
  const configuration = { CATALOG_MEDIA_BASE_URL: 'https://public-media.example/catalog', CHECKOUT_ENABLED: 'false', COMMERCE_LAUNCH_AUTHORIZED: 'false' };
  const unverified = await buildApprovedSeoExport(fixture.source, configuration, { now });
  assert.equal(unverified.report.verifiedProductImages, 0);
  assert.equal(unverified.report.unverifiedProductImages, 1);
  assert.equal(buildSeoPlan({ catalog: unverified.catalog, siteOrigin: 'https://shop.example', publish: true, now }).routes.get('/products/isolated-gift').indexable, false);
  const mediaVerification = { version: 1, source: 'authorized-media-object-verification', objects: [{ approved: true, url: 'https://public-media.example/catalog/Fixtures/main.webp', sha256: 'a'.repeat(64), sizeBytes: 10000, width: 900, height: 900, contentType: 'image/webp', objectVersion: 'fixture-version', verifiedAt: '2026-10-09T11:00:00Z', validUntil: '2026-10-09T14:00:00Z' }] };
  const result = await buildApprovedSeoExport(sourceFixture().source, configuration, { now, mediaVerification });
  assert.equal(result.report.verifiedProductImages, 1);
  assert.equal(result.catalog.products[0].inventoryMode, 'tracked');
  const plan = buildSeoPlan({ catalog: result.catalog, siteOrigin: 'https://shop.example', publish: true, now });
  assert.equal(plan.routes.get('/products/isolated-gift').indexable, true);
  assert.equal(plan.routes.get('/products/isolated-gift').structuredData[0].offers, undefined);
  assert.equal(plan.routes.get('/categories/isolated-gifts').indexable, false);
});

test('SEO export distinguishes configured made-to-order and independently tracked variant inventory', () => {
  const made = exportProductDto({ ...product, inventory: { mode: 'made_to_order', available: true, approved: true } }, categories);
  assert.equal(made.inventoryMode, 'made_to_order');
  assert.equal(made.orderingAvailable, true);
  const variant = { key: 'tracked', pricePiastres: 12000, priceApproved: true, inventory: { mode: 'tracked', quantity: 0, available: true, approved: true } };
  const dto = exportProductDto({ ...product, variants: [variant] }, categories);
  assert.equal(dto.variants[0].inventoryMode, 'tracked');
  assert.equal(dto.variants[0].orderingAvailable, false);
});

test('real exporter and public product-detail serializers produce the same allowlisted SEO signature', () => {
  const variants = [{ key: 'rose', attributes: [{ name: 'Color', value: 'Rose' }], pricePiastres: 16000, priceApproved: true, inventory: { mode: 'made_to_order', available: true, approved: true } }];
  const fixture = { ...product, variants };
  const exported = exportProductDto(fixture, categories, 'https://public-media.example/catalog');
  const live = { ...publicProductDetail({ ...fixture, categoryId: main, subcategoryId: child }), mainImageUrl: exported.mainImageUrl };
  assert.equal(productSeoSignature(exported), productSeoSignature(live));
  for (const privateValue of ['personalization', 'customization', 'galleryKeys', 'do-not-export', 'merchantReviewNotes']) assert.equal(productSeoSignature(live).includes(privateValue), false);
});
