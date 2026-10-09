import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildSeoPlan, validateCatalog, sitemapXml, renderRouteHtml, writeSeoOutput, CLIENT_DIRECTORY } from './generator.js';
import { publicationFor, comparePublications } from './publication.js';
import { productMetadata, offerAvailability, productSeoSignature } from '../../src/seo/metadata.js';
import { verifiedMediaEntries } from '../../src/seo/media-verification.js';
import { browserSecurityHeaders } from '../../worker/browser-policy.js';
import { readBootSnapshot, bootMetadataDecision, expireBootMetadata } from '../../src/seo/boot.js';

const now = new Date('2026-10-09T12:00:00Z');
const root = { _id: 'root', name: 'Fixture gifts', slug: 'fixture-gifts', active: true, parentId: null, productCount: 999 };
const item = { _id: 'product', name: 'Fixture gift', slug: 'fixture-gift', description: 'An isolated gift fixture.', category: root, subcategory: null, priceApproved: true, pricePiastres: 10500, orderingAvailable: true, inventoryMode: 'tracked', mainImageUrl: 'https://media.example/catalog/fixture.webp', variants: [], seoEligibility: { status: 'ready', published: true, inventoryApproved: true, reviewRequired: false, categoriesActive: true } };
const object = { url: item.mainImageUrl, approved: true, sha256: 'a'.repeat(64), sizeBytes: 18000, width: 1200, height: 900, contentType: 'image/webp', objectVersion: 'fixture-v1', verifiedAt: '2026-10-09T11:00:00Z', validUntil: '2026-10-09T14:00:00Z' };
const verification = { version: 1, source: 'authorized-media-object-verification', objects: [object] };
function catalog(patch = {}) { return { version: 1, source: 'approved-public-catalog', generatedAt: now.toISOString(), mediaOrigins: ['https://media.example'], mediaVerification: structuredClone(verification), checkoutEnabled: false, products: [structuredClone(item)], categories: [structuredClone(root)], ...patch }; }
function plan(patch = {}, options = {}) { return buildSeoPlan({ catalog: catalog(patch), siteOrigin: 'https://shop.example', publish: true, now, ...options }); }
const template = '<!doctype html><html><head><title>Fixture</title></head><body><div id="root"></div></body></html>';

test('a valid HTTPS image address alone never qualifies a product for indexing', () => {
  const result = plan({ mediaVerification: undefined });
  assert.equal(result.catalog.products.length, 1);
  assert.equal(result.routes.get('/products/fixture-gift').indexable, false);
  assert.equal(sitemapXml(result).includes('/products/fixture-gift'), false);
  assert.equal(result.report.mediaUnverifiedProducts.length, 1);
  assert.equal(plan({ products: [{ ...item, mainImageUrl: null }] }).routes.get('/products/fixture-gift').indexable, false);
});

test('media verification rejects expired, future, private, wrong-origin and malformed assertions', () => {
  for (const change of [{ approved: false }, { sha256: 'bad' }, { sizeBytes: 0 }, { width: 0 }, { contentType: 'image/svg+xml' }, { validUntil: now.toISOString() }, { verifiedAt: '2027-01-01' }, { url: 'https://media.example/private/proof.webp' }, { url: 'https://other.example/catalog/a.webp' }, { objectVersion: 'token?secret=1' }]) {
    const candidate = { ...verification, objects: [{ ...object, ...change }] };
    assert.equal([...verifiedMediaEntries(candidate, ['https://media.example'], now).values()].filter(Boolean).length, 0, JSON.stringify(change));
  }
  assert.equal(plan().routes.get('/products/fixture-gift').indexable, true);
});

test('duplicate media assertions are ambiguous and fail closed without replacing originals', () => {
  const duplicate = { ...verification, objects: [object, { ...object, sha256: 'b'.repeat(64) }, object] };
  assert.equal(verifiedMediaEntries(duplicate, ['https://media.example'], now).get(item.mainImageUrl), null);
  assert.equal(validateCatalog(catalog({ mediaVerification: duplicate }), { now }).products[0].mediaVerified, false);
});

test('empty and thin categories retain HTML/URLs/hierarchy but do not enter the sitemap', () => {
  for (const count of [0, 1, 2]) {
    const products = Array.from({ length: count }, (_, index) => ({ ...item, _id: `p-${index}`, slug: `fixture-${index}` }));
    const result = plan({ products });
    assert.ok(result.routes.has('/categories/fixture-gifts'));
    assert.equal(result.routes.get('/categories/fixture-gifts').indexable, false);
    assert.equal(sitemapXml(result).includes('/categories/fixture-gifts'), false);
  }
  const products = Array.from({ length: 3 }, (_, index) => ({ ...item, _id: `p-${index}`, slug: `fixture-${index}` }));
  assert.equal(plan({ products }).routes.get('/categories/fixture-gifts').indexable, true);
  assert.equal(plan({ products, mediaVerification: undefined }).routes.get('/categories/fixture-gifts').indexable, false);
  assert.throws(() => plan({}, { minimumCategoryProducts: 0 }), /category minimum/);
});

test('Made by Request, tracked and sold-out offers have truthful distinct availability', () => {
  assert.equal(offerAvailability({ orderingAvailable: true, inventoryMode: 'made_to_order' }), 'https://schema.org/PreOrder');
  assert.equal(offerAvailability({ orderingAvailable: true, inventoryMode: 'tracked' }), 'https://schema.org/InStock');
  assert.equal(offerAvailability({ orderingAvailable: false, inventoryMode: 'tracked' }), 'https://schema.org/OutOfStock');
  assert.equal(offerAvailability({ orderingAvailable: true }), null);
  for (const [mode, available, expected] of [['tracked', true, 'InStock'], ['made_to_order', true, 'PreOrder'], ['tracked', false, 'OutOfStock']]) {
    const data = productMetadata({ ...item, inventoryMode: mode, orderingAvailable: available }, 'https://shop.example', { checkoutEnabled: true });
    assert.equal(data.structuredData[0].offers.availability, `https://schema.org/${expected}`);
    assert.equal(data.structuredData[0].offers.price, '105.00');
  }
});

test('actual category metadata uses the reviewed indexing threshold when current public counts become thin', () => {
  const products = Array.from({ length: 3 }, (_, index) => ({ ...item, _id: `p-${index}`, slug: `fixture-${index}` }));
  const result = plan({ products });
  const publication = publicationFor(result, { now });
  const route = result.routes.get('/categories/fixture-gifts');
  const html = renderRouteHtml(template, route, result.origin, publication);
  const raw = JSON.parse(html.match(/<script type="application\/json" data-seo-bootstrap="true">([\s\S]*?)<\/script>/)[1]);
  const boot = readBootSnapshot({ querySelector: () => ({ textContent: JSON.stringify(raw) }) }, now.valueOf());
  const options = { pathname: route.pathname, currentOrigin: result.origin, configuredOrigin: result.origin, indexingEnabled: true, indexable: true, pending: false, now: now.valueOf() };
  assert.equal(boot.minimumCategoryProducts, 3);
  for (const count of [0, 1, 2, undefined, '3', 3.5]) assert.equal(bootMetadataDecision(boot, { ...options, categoryProductCount: count }).canIndex, false);
  assert.equal(bootMetadataDecision(boot, { ...options, categoryProductCount: 3 }).canIndex, true);
  assert.equal(bootMetadataDecision({ ...boot, minimumCategoryProducts: 1 }, { ...options, categoryProductCount: 1 }).canIndex, true);
  assert.equal(bootMetadataDecision({ ...boot, minimumCategoryProducts: null }, { ...options, categoryProductCount: 3 }).canIndex, false);
});

test('mixed variant stock modes do not advertise a false common InStock claim', () => {
  const data = productMetadata({ ...item, variants: [{ pricePiastres: 10000, orderingAvailable: true, inventoryMode: 'tracked' }, { pricePiastres: 12000, orderingAvailable: true, inventoryMode: 'made_to_order' }] }, 'https://shop.example', { checkoutEnabled: true });
  assert.equal(data.structuredData[0].offers.availability, undefined);
  assert.equal(data.structuredData[0].offers.lowPrice, '100.00');
  assert.equal(data.structuredData[0].offers.highPrice, '120.00');
  assert.equal(productMetadata(item, 'https://shop.example', { checkoutEnabled: false }).structuredData[0].offers, undefined);
});

test('global unavailability overrides individually available variant schema states', () => {
  const data = productMetadata({ ...item, orderingAvailable: false, variants: [{ pricePiastres: 11000, orderingAvailable: true, inventoryMode: 'tracked' }] }, 'https://shop.example', { checkoutEnabled: true });
  assert.equal(data.structuredData[0].offers.availability, 'https://schema.org/OutOfStock');
  assert.equal(data.structuredData[0].offers.price, '110.00');
});

test('an initial verified product snapshot cannot confer indexing on later changed public DTO media, prices or stock', () => {
  const snapshotProduct = plan().catalog.products[0];
  const signature = productSeoSignature(snapshotProduct);
  assert.equal(signature, productSeoSignature(item));
  const boot = { version: 1, pathname: '/products/fixture-gift', origin: 'https://shop.example', indexable: true, productSignature: signature, expiresAt: '2026-10-09T13:00:00Z' };
  const options = { pathname: boot.pathname, currentOrigin: boot.origin, configuredOrigin: boot.origin, indexingEnabled: true, indexable: true, pending: false, now: now.valueOf() };
  assert.equal(bootMetadataDecision(boot, { ...options, productSignature: productSeoSignature(item) }).canIndex, true);
  for (const change of [{ mainImageUrl: 'https://media.example/catalog/new-unverified.webp' }, { pricePiastres: 12000 }, { orderingAvailable: false }, { inventoryMode: 'made_to_order' }, { description: 'Changed public description' }]) assert.equal(bootMetadataDecision(boot, { ...options, productSignature: productSeoSignature({ ...item, ...change }) }).canIndex, false, JSON.stringify(change));
  assert.equal(bootMetadataDecision({ ...boot, productSignature: null }, { ...options, productSignature: signature }).canIndex, false);
});

test('publication diffs identify changed price/stock/media and withdrawn approval or slug', () => {
  const before = publicationFor(plan(), { now });
  for (const patch of [{ products: [{ ...item, pricePiastres: 11500 }] }, { products: [{ ...item, orderingAvailable: false }] }, { mediaVerification: { ...verification, objects: [{ ...object, sha256: 'b'.repeat(64), objectVersion: 'fixture-v2' }] } }]) {
    const diff = comparePublications(before, publicationFor(plan(patch), { now }));
    assert.ok(diff.changed.includes('/products/fixture-gift'));
  }
  for (const patch of [{ products: [{ ...item, priceApproved: false }] }, { products: [{ ...item, slug: 'renamed-gift' }] }, { mediaVerification: undefined }]) {
    assert.ok(comparePublications(before, publicationFor(plan(patch), { now })).withdrawn.includes('/products/fixture-gift'));
  }
});

test('source and media freshness bound publication; invalid or expired exports cannot publish', () => {
  const result = publicationFor(plan(), { now, maximumAgeSeconds: 3600 });
  assert.equal(result.expiresAt, '2026-10-09T13:00:00.000Z');
  assert.equal(publicationFor(plan({ mediaVerification: { ...verification, objects: [{ ...object, validUntil: '2026-10-09T12:10:00Z' }] } }), { now }).expiresAt, '2026-10-09T12:10:00.000Z');
  assert.throws(() => publicationFor(plan({ generatedAt: '2026-10-08T12:00:00Z' }), { now }), /expired/);
  assert.throws(() => publicationFor(plan({ generatedAt: '2026-10-10T12:00:00Z' }), { now }), /future/);
  assert.throws(() => plan({ generatedAt: undefined }), /timestamp is required/);
  for (const seconds of [0, 59, 86401, 1.5]) assert.throws(() => publicationFor(plan(), { now, maximumAgeSeconds: seconds }), /lifetime/);
});

test('interrupted generation preserves the last committed immutable publication and records no false success', async () => {
  const base = path.join(CLIENT_DIRECTORY, 'test-results', 'seo-unit');
  await mkdir(base, { recursive: true });
  const outputDirectory = await mkdtemp(path.join(base, 'publication-'));
  try {
    await writeSeoOutput({ outputDirectory, template, catalog: catalog(), siteOrigin: 'https://shop.example', publish: true, now });
    const old = await readFile(path.join(outputDirectory, 'seo-manifest.json'), 'utf8');
    const manifest = JSON.parse(old);
    const previousHtml = await readFile(path.join(outputDirectory, manifest.routeFiles['/products/fixture-gift'].slice(1)), 'utf8');
    await assert.rejects(writeSeoOutput({ outputDirectory, template, catalog: catalog({ products: [{ ...item, pricePiastres: 12000 }] }), siteOrigin: 'https://shop.example', publish: true, now, beforeCommit: () => { throw new Error('Synthetic interrupted build'); } }), /Synthetic interrupted build/);
    assert.equal(await readFile(path.join(outputDirectory, 'seo-manifest.json'), 'utf8'), old);
    assert.equal(await readFile(path.join(outputDirectory, manifest.routeFiles['/products/fixture-gift'].slice(1)), 'utf8'), previousHtml);
    await assert.rejects(readFile(path.join(outputDirectory, '.seo-generation.lock')), { code: 'ENOENT' });
    const updated = await writeSeoOutput({ outputDirectory, template, catalog: catalog({ products: [] }), siteOrigin: 'https://shop.example', publish: true, now });
    assert.ok(updated.changes.withdrawn.includes('/products/fixture-gift'));
    assert.equal((await readFile(path.join(outputDirectory, 'sitemap.xml'), 'utf8')).includes('/products/fixture-gift'), false);
  } finally { assert.ok(outputDirectory.startsWith(`${base}${path.sep}`)); await rm(outputDirectory, { recursive: true, force: true }); }
});

test('cleanup manifests cannot claim non-HTML secrets or unrelated build files', async () => {
  const base = path.join(CLIENT_DIRECTORY, 'test-results', 'seo-unit');
  await mkdir(base, { recursive: true });
  const outputDirectory = await mkdtemp(path.join(base, 'unowned-'));
  try {
    await writeFile(path.join(outputDirectory, 'preserve.txt'), 'synthetic preserved content');
    await writeFile(path.join(outputDirectory, '.seo-generated-files.json'), '["preserve.txt"]');
    await assert.rejects(writeSeoOutput({ outputDirectory, template }), /unowned/);
    assert.equal(await readFile(path.join(outputDirectory, 'preserve.txt'), 'utf8'), 'synthetic preserved content');
  } finally { assert.ok(outputDirectory.startsWith(`${base}${path.sep}`)); await rm(outputDirectory, { recursive: true, force: true }); }
});

test('browser security policy defaults to report-only with bounded exact provider origins', () => {
  const headers = browserSecurityHeaders({ BROWSER_API_ORIGINS: 'https://api.example', BROWSER_MEDIA_ORIGINS: 'https://media.example', BROWSER_UPLOAD_ORIGINS: 'https://uploads.example' });
  const csp = headers['Content-Security-Policy-Report-Only'];
  assert.equal(headers['Content-Security-Policy'], undefined);
  assert.match(csp, /connect-src 'self' https:\/\/api.example https:\/\/uploads.example/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.equal(csp.includes('connect.facebook.net'), false);
  assert.equal(csp.includes('report-uri'), false);
  assert.equal(headers['X-Frame-Options'], 'DENY');
  assert.equal(headers['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.match(headers['Permissions-Policy'], /camera=\(\)/);
  assert.ok(browserSecurityHeaders({ BROWSER_CSP_MODE: 'enforce', BROWSER_TRACKING_ALLOWED: 'true' })['Content-Security-Policy'].includes('https://connect.facebook.net'));
  for (const value of ['*', 'https://user:secret@api.example', 'http://api.example', 'https://api.example/path', 'https://127.0.0.1']) assert.throws(() => browserSecurityHeaders({ BROWSER_API_ORIGINS: value }));
});

test('boot snapshots reject expired and malformed publication data without trusting index flags alone', () => {
  const value = { version: 1, pathname: '/products/fixture-gift', origin: 'https://shop.example', publicationId: 'a'.repeat(64), expiresAt: '2026-10-09T13:00:00Z', indexable: true };
  const documentFixture = (record) => ({ querySelector: () => ({ textContent: JSON.stringify(record) }) });
  assert.equal(readBootSnapshot(documentFixture(value), now.valueOf()).indexable, true);
  for (const change of [{ expiresAt: now.toISOString() }, { publicationId: 'bad' }, { pathname: '//evil.example' }, { version: 2 }]) assert.equal(readBootSnapshot(documentFixture({ ...value, ...change }), now.valueOf()), null);
});

test('the actual metadata decision preserves only a matching approved initial snapshot, never flags alone/private/query/stale data', () => {
  const boot = { version: 1, pathname: '/products/fixture-gift', origin: 'https://shop.example', indexable: true, productSignature: productSeoSignature(item), expiresAt: '2026-10-09T13:00:00Z' };
  const options = { pathname: boot.pathname, currentOrigin: boot.origin, configuredOrigin: boot.origin, indexingEnabled: true, indexable: true, pending: true, productSignature: boot.productSignature, now: now.valueOf() };
  assert.deepEqual(bootMetadataDecision(boot, options), { preservePending: true, canIndex: true });
  assert.deepEqual(bootMetadataDecision(null, options), { preservePending: false, canIndex: false });
  for (const change of [{ indexingEnabled: false }, { search: '?q=fixture' }, { pathname: '/products/another' }, { currentOrigin: 'https://preview.example' }, { configuredOrigin: 'https://other.example' }, { now: Date.parse(boot.expiresAt) }]) assert.equal(bootMetadataDecision(boot, { ...options, ...change }).canIndex, false, JSON.stringify(change));
  assert.equal(bootMetadataDecision(boot, { ...options, indexable: false, pending: false }).canIndex, false);
  assert.equal(bootMetadataDecision({ ...boot, indexable: false }, options).canIndex, false);
  assert.deepEqual(bootMetadataDecision({ ...boot, pathname: '/admin/products' }, { ...options, pathname: '/admin/products' }), { preservePending: false, canIndex: false });
  let robotValue; let removed = 0;
  expireBootMetadata({ head: { querySelector: () => ({ setAttribute: (_name, value) => { robotValue = value; } }), querySelectorAll: () => [{ remove: () => { removed++; } }] } });
  assert.equal(robotValue, 'noindex, nofollow, noarchive'); assert.equal(removed, 1);
});

test('brand fonts are discovered in HTML without a nested CSS-import waterfall or invented font assets', async () => {
  const html = await readFile(path.join(CLIENT_DIRECTORY, 'index.html'), 'utf8');
  const css = await readFile(path.join(CLIENT_DIRECTORY, 'src', 'design-system.css'), 'utf8');
  assert.match(html, /rel="preconnect" href="https:\/\/fonts.gstatic.com" crossorigin/);
  assert.match(html, /family=Cormorant\+Garamond.*family=DM\+Sans.*display=optional/);
  assert.equal(css.includes("@import url('https://fonts.googleapis.com"), false);
  assert.match(css, /--tw-font-display: 'Cormorant Garamond', Georgia, serif/);
  assert.match(css, /--tw-font-body: 'DM Sans', Arial, sans-serif/);
});

test('post-commit finalization failure reports its committed state while complete new immutable HTML remains readable', async () => {
  const base = path.join(CLIENT_DIRECTORY, 'test-results', 'seo-unit');
  await mkdir(base, { recursive: true });
  const outputDirectory = await mkdtemp(path.join(base, 'finalization-'));
  try {
    await assert.rejects(writeSeoOutput({ outputDirectory, template, catalog: catalog(), siteOrigin: 'https://shop.example', publish: true, now, afterCommit: () => { throw new Error('Synthetic finalization failure with private diagnostics'); } }), (error) => {
      assert.equal(error.code, 'SEO_OUTPUT_FINALIZATION_FAILED');
      assert.equal(error.publicationCommitted, true);
      assert.equal(error.message.includes('private diagnostics'), false);
      return true;
    });
    const manifest = JSON.parse(await readFile(path.join(outputDirectory, 'seo-manifest.json'), 'utf8'));
    assert.match(await readFile(path.join(outputDirectory, manifest.routeFiles['/products/fixture-gift'].slice(1)), 'utf8'), /Fixture gift/);
    await assert.rejects(readFile(path.join(outputDirectory, '.seo-generation.lock')), { code: 'ENOENT' });
  } finally { assert.ok(outputDirectory.startsWith(`${base}${path.sep}`)); await rm(outputDirectory, { recursive: true, force: true }); }
});

test('concurrent generation refuses the same output lock instead of mixing releases', async () => {
  const base = path.join(CLIENT_DIRECTORY, 'test-results', 'seo-unit');
  await mkdir(base, { recursive: true });
  const outputDirectory = await mkdtemp(path.join(base, 'locked-'));
  let release;
  let prepared;
  const ready = new Promise((resolve) => { prepared = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  const first = writeSeoOutput({ outputDirectory, template, catalog: catalog(), siteOrigin: 'https://shop.example', publish: true, now, beforeCommit: async () => { prepared(); await gate; } });
  try {
    await ready;
    await assert.rejects(writeSeoOutput({ outputDirectory, template, catalog: catalog({ products: [] }), siteOrigin: 'https://shop.example', publish: true, now }), /already running/);
    release();
    await first;
    const manifest = JSON.parse(await readFile(path.join(outputDirectory, 'seo-manifest.json'), 'utf8'));
    assert.ok(manifest.publicRoutes.includes('/products/fixture-gift'));
  } finally { release(); await first.catch(() => {}); assert.ok(outputDirectory.startsWith(`${base}${path.sep}`)); await rm(outputDirectory, { recursive: true, force: true }); }
});

test('a writer delayed before lock compares and cleans the most recently committed publication', async () => {
  const base = path.join(CLIENT_DIRECTORY, 'test-results', 'seo-unit');
  await mkdir(base, { recursive: true });
  const outputDirectory = await mkdtemp(path.join(base, 'baseline-race-'));
  let release; let prepared; let delayed;
  const ready = new Promise((resolve) => { prepared = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  try {
    await writeSeoOutput({ outputDirectory, template, catalog: catalog(), siteOrigin: 'https://shop.example', publish: true, now });
    delayed = writeSeoOutput({ outputDirectory, template, catalog: catalog({ products: [] }), siteOrigin: 'https://shop.example', publish: true, now, beforeLock: async () => { prepared(); await gate; } });
    await ready;
    const added = { ...item, _id: 'later-product', slug: 'later-approved-gift' };
    const winner = await writeSeoOutput({ outputDirectory, template, catalog: catalog({ products: [item, added] }), siteOrigin: 'https://shop.example', publish: true, now });
    assert.match(await readFile(path.join(outputDirectory, 'products', `${added.slug}.html`), 'utf8'), /Fixture gift/);
    release();
    const result = await delayed;
    assert.deepEqual(result.changes.withdrawn.sort(), ['/products/fixture-gift', '/products/later-approved-gift']);
    const report = JSON.parse(await readFile(path.join(outputDirectory, 'seo-change-report.json'), 'utf8'));
    assert.equal(report.previousPublicationId, winner.publicationId);
    await assert.rejects(readFile(path.join(outputDirectory, 'products', `${added.slug}.html`)), { code: 'ENOENT' });
  } finally {
    release(); await delayed?.catch(() => {});
    assert.ok(outputDirectory.startsWith(`${base}${path.sep}`)); await rm(outputDirectory, { recursive: true, force: true });
  }
});

test('offline reconciliation command reports changed and withdrawn URLs without writing or contacting providers', async () => {
  const base = path.join(CLIENT_DIRECTORY, 'test-results', 'seo-unit');
  await mkdir(base, { recursive: true });
  const fixtureDirectory = await mkdtemp(path.join(base, 'reconcile-'));
  try {
    const previous = catalog({ generatedAt: new Date().toISOString() });
    previous.mediaVerification.objects[0].verifiedAt = new Date(Date.now() - 1000).toISOString();
    previous.mediaVerification.objects[0].validUntil = new Date(Date.now() + 7200000).toISOString();
    const next = structuredClone(previous); next.products = [];
    const oldFile = path.join(fixtureDirectory, 'previous.json'), nextFile = path.join(fixtureDirectory, 'next.json');
    await writeFile(oldFile, JSON.stringify(previous)); await writeFile(nextFile, JSON.stringify(next));
    const workspace = path.dirname(CLIENT_DIRECTORY);
    const inherited = ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP'].filter((key) => process.env[key] !== undefined);
    const result = spawnSync(process.execPath, ['scripts/reconcile-seo.js', '--previous', path.relative(workspace, oldFile), '--input', path.relative(workspace, nextFile), '--site-origin', 'https://shop.example'], { cwd: CLIENT_DIRECTORY, encoding: 'utf8', env: { ...Object.fromEntries(inherited.map((key) => [key, process.env[key]])), NODE_OPTIONS: '' } });
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.databaseConnections, false);
    assert.equal(report.networkRequests, false);
    assert.equal(report.filesWritten, false);
    assert.ok(report.withdrawn.includes('/products/fixture-gift'));
    assert.ok(report.changed.includes('/shop'));
  } finally { assert.ok(fixtureDirectory.startsWith(`${base}${path.sep}`)); await rm(fixtureDirectory, { recursive: true, force: true }); }
});
