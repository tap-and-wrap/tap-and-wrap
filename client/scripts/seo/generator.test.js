import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import { canonicalOrigin, canonicalUrl, publicImageUrl, productMetadata, serializeJsonLd, privatePageTitle } from '../../src/seo/metadata.js';
import { buildSeoPlan, renderRouteHtml, sitemapXml, robotsText, validateCatalog, writeSeoOutput, CLIENT_DIRECTORY } from './generator.js';

const origin = 'https://shop.example';
const template = '<!doctype html><html lang="en"><head><title>Old title</title><meta name="robots" content="noindex"><meta name="description" content="Old"><link rel="canonical" href="https://old.example"><script type="module" src="/assets/app-123.js"></script></head><body><div id="root"></div></body></html>';
const root = { _id: 'category-main', slug: 'fixture-gifts', name: 'Fixture Gifts', parentId: null, active: true, productCount: 1 };
const child = { _id: 'category-child', slug: 'fixture-keepsakes', name: 'Fixture Keepsakes', parentId: root._id, active: true, productCount: 1 };
const product = { _id: 'product-one', slug: 'fixture-product', name: 'Fixture Product', description: 'An isolated fixture description.', pricePiastres: 12345, priceApproved: true, orderingAvailable: true, category: root, subcategory: child, mainImageUrl: 'https://media.example/approved/main.webp', galleryUrls: ['https://media.example/private/secret.webp'], galleryKeys: ['private/secret'], personalization: { secret: 'PRIVATE-CUSTOMER-DATA' }, customization: { privateConfig: true }, updatedAt: '2026-10-09T12:00:00.000Z', seoEligibility: { status: 'ready', published: true, inventoryApproved: true, reviewRequired: false, categoriesActive: true } };
function catalog(patch = {}) { return { version: 1, source: 'approved-public-catalog', mediaOrigins: ['https://media.example'], products: [structuredClone(product)], categories: [structuredClone(root), structuredClone(child)], checkoutEnabled: false, ...patch }; }

test('canonical origin rejects credentials, HTTP, paths, queries and local targets', () => {
  assert.equal(canonicalOrigin(origin), origin);
  for (const invalid of ['http://shop.example', 'https://secret:password@shop.example', 'https://shop.example/path', 'https://shop.example/?secret=1', 'https://shop.example/#x', 'https://localhost', 'https://127.0.0.1']) assert.equal(canonicalOrigin(invalid), null);
  assert.equal(canonicalUrl(origin, '/shop/'), `${origin}/shop`);
  assert.equal(canonicalUrl(origin, '//evil.example'), null);
  assert.equal(canonicalUrl(origin, '/shop?secret=1'), null);
});

test('only an explicit approved export enables product generation and indexing', () => {
  assert.throws(() => buildSeoPlan({ publish: true, siteOrigin: origin }), /explicit approved catalog/);
  assert.throws(() => buildSeoPlan({ catalog: { products: [], categories: [] } }), /approved-public-catalog/);
  const plan = buildSeoPlan({ catalog: catalog(), siteOrigin: origin });
  assert.equal(plan.report.indexingEnabled, false);
  assert.equal(plan.report.indexableRoutes, 0);
  assert.equal(robotsText(plan), 'User-agent: *\nDisallow: /\n');
});

test('no-export builds identify development placeholders without asserting live catalog availability', () => {
  const development = buildSeoPlan();
  for (const pathname of ['/', '/shop']) {
    const route = development.routes.get(pathname);
    assert.equal(route.indexable, false);
    assert.match(route.body, /Development placeholder: an approved catalog export has not been provided/);
    assert.equal(route.body.includes('currently available'), false);
  }
  const emptyExport = buildSeoPlan({ catalog: catalog({ products: [] }), siteOrigin: origin, publish: true });
  assert.match(emptyExport.routes.get('/shop').body, /No eligible products are included in this approved export/);
  assert.equal(emptyExport.routes.get('/shop').body.includes('Development placeholder'), false);
});

test('draft, provisional, review-flagged and inactive-category products are excluded', () => {
  const products = [structuredClone(product), ...['status', 'published', 'inventoryApproved', 'reviewRequired', 'categoriesActive'].map((key, index) => ({ ...structuredClone(product), slug: `rejected-${index}`, seoEligibility: { ...product.seoEligibility, [key]: key === 'status' ? 'draft' : key === 'reviewRequired' ? true : false } })), { ...structuredClone(product), slug: 'unapproved-price', priceApproved: false }, { ...structuredClone(product), slug: 'fractional-price', pricePiastres: 12.5 }];
  const validated = validateCatalog(catalog({ products }));
  assert.equal(validated.products.length, 1);
  assert.equal(validated.report.excludedProducts.length, 7);
  const inactive = validateCatalog(catalog({ categories: [{ ...root, active: false }, child] }));
  assert.equal(inactive.products.length, 0);
  assert.equal(inactive.categories.length, 0);
});

test('mismatched category relationships and unapproved variants are rejected', () => {
  assert.equal(validateCatalog(catalog({ products: [{ ...product, subcategory: { ...child, _id: 'wrong' } }] })).products.length, 0);
  assert.equal(validateCatalog(catalog({ products: [{ ...product, variants: [{ pricePiastres: 12345, priceApproved: false }] }] })).products.length, 0);
});

test('duplicate slugs and traversal routes fail before writing', () => {
  assert.throws(() => validateCatalog(catalog({ products: [product, product] })), /Duplicate product/);
  assert.throws(() => validateCatalog(catalog({ categories: [root, root] })), /Duplicate category/);
  assert.equal(validateCatalog(catalog({ products: [{ ...product, slug: '../../private' }] })).products.length, 0);
});

test('private fields and image galleries never enter prerender data', () => {
  const plan = buildSeoPlan({ catalog: catalog(), siteOrigin: origin, publish: true });
  const serialized = JSON.stringify(plan.catalog.products);
  for (const privateValue of ['galleryKeys', 'galleryUrls', 'PRIVATE-CUSTOMER-DATA', 'privateConfig', 'secret.webp']) assert.equal(serialized.includes(privateValue), false);
  assert.equal(publicImageUrl('https://media.example/private/image.webp', ['https://media.example']), null);
  assert.equal(publicImageUrl('https://other.example/public.webp', ['https://media.example']), null);
  assert.equal(publicImageUrl('C:/private/image.webp'), null);
  assert.equal(publicImageUrl('https://media.example/approved/main.webp?token=secret'), null);
});

test('published product HTML has unique metadata, visible information and crawlable links', () => {
  const plan = buildSeoPlan({ catalog: catalog(), siteOrigin: origin, publish: true });
  const html = renderRouteHtml(template, plan.routes.get('/products/fixture-product'), origin);
  assert.match(html, /<title>Fixture Product \| Tap &amp; Wrap<\/title>/);
  assert.match(html, /<h1>Fixture Product<\/h1>/);
  assert.match(html, /EGP 123\.45/);
  assert.match(html, /href="\/categories\/fixture-gifts"/);
  assert.match(html, /https:\/\/shop.example\/products\/fixture-product/);
  assert.match(html, /og:title/);
  assert.equal((html.match(/rel="canonical"/g) || []).length, 1);
  assert.equal((html.match(/name="robots"/g) || []).length, 1);
  const repeated = renderRouteHtml(html, plan.routes.get('/products/fixture-product'), origin);
  assert.equal((repeated.match(/href="\/seo-static.css"/g) || []).length, 1);
  assert.equal((repeated.match(/<h1>/g) || []).length, 1);
  assert.match(html, /\/assets\/app-123\.js/);
});

test('HTML and JSON-LD escape script-breaking product strings', () => {
  const malicious = { ...product, description: '</script><script>window.BAD=true</script> & "quote"', name: 'Fixture <img src=x onerror=alert(1)>' };
  const plan = buildSeoPlan({ catalog: catalog({ products: [malicious] }), siteOrigin: origin, publish: true });
  const html = renderRouteHtml(template, plan.routes.get('/products/fixture-product'), origin);
  assert.equal(html.includes('<script>window.BAD'), false);
  assert.equal(html.includes('onerror='), false);
  assert.equal(serializeJsonLd({ text: '</script>&' }).includes('</script>'), false);
  assert.match(serializeJsonLd({ text: '</script>&' }), /\\u003c/);
});

test('checkout-disabled product metadata does not advertise an offer or invented review', () => {
  const data = productMetadata(product, origin, { checkoutEnabled: false });
  const schema = data.structuredData.find((entry) => entry['@type'] === 'Product');
  assert.equal(schema.offers, undefined);
  assert.equal(schema.aggregateRating, undefined);
  assert.equal(schema.review, undefined);
});

test('runtime metadata rejects explicit drafts/previews and gives private pages useful non-personal titles', () => {
  for (const change of [{ status: 'draft' }, { published: false }, { reviewRequired: true }, { preview: { enabled: true } }, { inventory: { approved: false } }]) {
    const metadata = productMetadata({ ...product, ...change }, origin);
    assert.equal(metadata.indexable, false);
    assert.equal(metadata.structuredData.length, 0);
  }
  assert.equal(privatePageTitle('/checkout'), 'Checkout | Tap & Wrap');
  assert.equal(privatePageTitle('/products/isolated/customize'), 'Customize This Product | Tap & Wrap');
  assert.equal(privatePageTitle('/orders/private-order-id'), 'Order Details | Tap & Wrap');
});

test('subcategory metadata and crawlable HTML preserve the active parent breadcrumb', () => {
  const plan = buildSeoPlan({ catalog: catalog(), siteOrigin: origin, publish: true });
  const route = plan.routes.get('/categories/fixture-keepsakes');
  const crumb = route.structuredData.find((entry) => entry['@type'] === 'BreadcrumbList');
  assert.deepEqual(crumb.itemListElement.map((entry) => entry.name), ['Home', 'Shop', root.name, child.name]);
  assert.match(route.body, /aria-label="Parent category"/);
  assert.match(route.body, /href="\/categories\/fixture-gifts"/);
});

test('approved launch export yields exact EGP offers and configured variant range', () => {
  const variants = [{ pricePiastres: 11000, orderingAvailable: true }, { pricePiastres: 12500, orderingAvailable: true }];
  const plan = buildSeoPlan({ catalog: catalog({ checkoutEnabled: true, products: [{ ...product, variants }] }), siteOrigin: origin, publish: true });
  const route = plan.routes.get('/products/fixture-product');
  const offer = route.structuredData.find((entry) => entry['@type'] === 'Product').offers;
  assert.deepEqual({ currency: offer.priceCurrency, low: offer.lowPrice, high: offer.highPrice, count: offer.offerCount }, { currency: 'EGP', low: '110.00', high: '125.00', count: 2 });
  assert.match(route.body, /Configured variant prices: EGP 110\.00, EGP 125\.00/);
});

test('sitemap includes only canonical eligible routes and genuine source dates', () => {
  const plan = buildSeoPlan({ catalog: catalog(), siteOrigin: origin, publish: true });
  const xml = sitemapXml(plan);
  assert.match(xml, /https:\/\/shop.example\/products\/fixture-product/);
  assert.match(xml, /2026-10-09T12:00:00.000Z/);
  for (const excluded of ['/admin', '/cart', '/checkout', '/track-order', '/my-orders', '/privacy-policy', '/404']) assert.equal(xml.includes(`<loc>${origin}${excluded}</loc>`), false);
  assert.match(robotsText(plan), /Sitemap: https:\/\/shop.example\/sitemap.xml/);
});

test('policies remain marked development placeholders until explicitly owner approved', () => {
  const plan = buildSeoPlan({ catalog: catalog(), siteOrigin: origin, publish: true });
  assert.equal(plan.routes.get('/refund-policy').indexable, false);
  assert.match(plan.routes.get('/refund-policy').body, /Development placeholder/);
  const approved = buildSeoPlan({ catalog: catalog(), siteOrigin: origin, publish: true, content: { routes: { '/privacy-policy': { approved: true, title: 'Fixture privacy', description: 'Isolated owner content fixture.', heading: 'Fixture Privacy', paragraphs: ['Isolated approved content for testing only.'] } } } });
  assert.equal(approved.routes.get('/privacy-policy').indexable, true);
  assert.match(approved.routes.get('/privacy-policy').body, /Isolated approved content/);
});

test('category/shop HTML lists at most 20 products while sitemap discovers the complete eligible set', () => {
  const products = Array.from({ length: 25 }, (_, index) => ({ ...product, _id: `product-${index}`, slug: `fixture-${index}`, name: `Fixture ${index}` }));
  const plan = buildSeoPlan({ catalog: catalog({ products }), siteOrigin: origin, publish: true });
  assert.equal((plan.routes.get('/shop').body.match(/<li>/g) || []).length, 21); // 1 category + 20 products
  assert.equal((plan.routes.get('/categories/fixture-gifts').body.match(/<li>/g) || []).length, 20);
  assert.match(sitemapXml(plan), /\/products\/fixture-24/);
});

test('repeat generation removes deleted product HTML and retains unrelated build files', async () => {
  const base = path.join(CLIENT_DIRECTORY, 'test-results', 'seo-unit');
  await mkdir(base, { recursive: true });
  const outputDirectory = await mkdtemp(path.join(base, 'isolated-'));
  try {
    await writeFile(path.join(outputDirectory, 'merchant-unrelated.txt'), 'preserve');
    await writeSeoOutput({ outputDirectory, template, catalog: catalog(), siteOrigin: origin, publish: true });
    const output = await readFile(path.join(outputDirectory, 'products', 'fixture-product.html'), 'utf8');
    assert.match(output, /Fixture Product/);
    await writeSeoOutput({ outputDirectory, template, catalog: catalog({ products: [] }), siteOrigin: origin, publish: true });
    await assert.rejects(readFile(path.join(outputDirectory, 'products', 'fixture-product.html')), { code: 'ENOENT' });
    assert.equal(await readFile(path.join(outputDirectory, 'merchant-unrelated.txt'), 'utf8'), 'preserve');
    assert.equal((await readFile(path.join(outputDirectory, 'sitemap.xml'), 'utf8')).includes('fixture-product'), false);
  } finally { await rm(outputDirectory, { recursive: true, force: true }); }
});

test('write rejects output beyond the client workspace and unsafe cleanup manifests', async () => {
  await assert.rejects(writeSeoOutput({ outputDirectory: path.dirname(CLIENT_DIRECTORY), template }), /within the client/);
  const base = path.join(CLIENT_DIRECTORY, 'test-results', 'seo-unit');
  await mkdir(base, { recursive: true });
  const outputDirectory = await mkdtemp(path.join(base, 'unsafe-'));
  try {
    await writeFile(path.join(outputDirectory, '.seo-generated-files.json'), '["../outside.html"]');
    await assert.rejects(writeSeoOutput({ outputDirectory, template }), /unsafe path/);
  } finally { await rm(outputDirectory, { recursive: true, force: true }); }
});

test('resolved output guards reject a linked product directory before touching its target', async () => {
  const base = path.join(CLIENT_DIRECTORY, 'test-results', 'seo-unit');
  await mkdir(base, { recursive: true });
  const outputDirectory = await mkdtemp(path.join(base, 'linked-output-'));
  const otherDirectory = await mkdtemp(path.join(base, 'preserved-target-'));
  try {
    await writeFile(path.join(otherDirectory, 'fixture-product.html'), 'preserve existing target');
    await symlink(otherDirectory, path.join(outputDirectory, 'products'), 'junction');
    await assert.rejects(writeSeoOutput({ outputDirectory, template, catalog: catalog(), siteOrigin: origin, publish: true }), /outside its allowed directory/);
    assert.equal(await readFile(path.join(otherDirectory, 'fixture-product.html'), 'utf8'), 'preserve existing target');
  } finally {
    assert.ok(outputDirectory.startsWith(`${base}${path.sep}`));
    assert.ok(otherDirectory.startsWith(`${base}${path.sep}`));
    await rm(outputDirectory, { recursive: true, force: true });
    await rm(otherDirectory, { recursive: true, force: true });
  }
});
