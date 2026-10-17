import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import { canonicalOrigin, canonicalUrl, publicImageUrl, productMetadata, serializeJsonLd, privatePageTitle } from '../../src/seo/metadata.js';
import { buildSeoPlan, renderRouteHtml, sitemapXml, robotsText, validateCatalog, writeSeoOutput, CLIENT_DIRECTORY } from './generator.js';
import { handleSeoRequest } from '../../worker/seo-worker.js';

const origin = 'https://shop.example';
const template = '<!doctype html><html lang="en"><head><title>Old title</title><meta name="robots" content="noindex"><meta name="description" content="Old"><link rel="canonical" href="https://old.example"><script type="module" src="/assets/app-123.js"></script></head><body><div id="root"></div></body></html>';
const root = { _id: 'category-main', slug: 'fixture-gifts', name: 'Fixture Gifts', parentId: null, active: true, productCount: 1 };
const child = { _id: 'category-child', slug: 'fixture-keepsakes', name: 'Fixture Keepsakes', parentId: root._id, active: true, productCount: 1 };
const product = { routingVersion: 'fixture-owned-revision-v1', _id: 'product-one', slug: 'fixture-product', name: 'Fixture Product', description: 'An isolated fixture description.', pricePiastres: 12345, priceApproved: true, orderingAvailable: true, category: root, subcategory: child, mainImageUrl: 'https://media.example/approved/main.webp', galleryUrls: ['https://media.example/private/secret.webp'], galleryKeys: ['private/secret'], personalization: { secret: 'PRIVATE-CUSTOMER-DATA' }, customization: { privateConfig: true }, updatedAt: '2026-10-09T12:00:00.000Z', seoEligibility: { status: 'ready', published: true, inventoryApproved: true, reviewRequired: false, categoriesActive: true } };
const mediaVerification = { version: 1, source: 'authorized-media-object-verification', objects: [{ approved: true, url: product.mainImageUrl, sha256: 'a'.repeat(64), sizeBytes: 18000, width: 900, height: 900, contentType: 'image/webp', objectVersion: 'fixture-v1', verifiedAt: '2026-01-01T00:00:00Z', validUntil: '2099-01-01T00:00:00Z' }] };
function catalog(patch = {}) { return { version: 1, source: 'approved-public-catalog', generatedAt: new Date().toISOString(), mediaOrigins: ['https://media.example'], mediaVerification: structuredClone(mediaVerification), products: [structuredClone(product)], categories: [structuredClone(root), structuredClone(child)], checkoutEnabled: false, ...patch }; }

function compatibility() {
  return { version: 1, source: 'reviewed-registered-public-product-addresses', origin, generatedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 3600_000).toISOString(), products: [{ canonicalPath: '/products/draft-gift', aliases: ['/products/draft-gift-123'] }] };
}

test('index publication requires current routing revisions and rejects zero-price product approvals', () => {
  const old = catalog(); delete old.products[0].routingVersion;
  assert.throws(() => buildSeoPlan({ catalog: old, siteOrigin: origin, publish: true }), /newly reviewed export with routing revisions/);
  const zero = catalog({ products: [{ ...product, pricePiastres: 0 }] });
  const plan = buildSeoPlan({ catalog: zero, siteOrigin: origin, publish: true });
  assert.equal(plan.catalog.products.length, 0); assert.doesNotMatch(sitemapXml(plan), /products\/fixture-product/);
});

test('prelaunch mapping remains separate from approved SEO data and works through generated Worker manifest', async () => {
  const base = path.join(CLIENT_DIRECTORY, 'test-results', 'seo-unit');
  await mkdir(base, { recursive: true });
  const outputDirectory = await mkdtemp(path.join(base, 'compatibility-'));
  try {
    const productCompatibility = compatibility();
    const source = catalog({ products: [product, { ...product, _id: 'draft', slug: 'draft-gift-123', publicPath: '/products/draft-gift', seoEligibility: { ...product.seoEligibility, status: 'draft' } }] });
    const plan = buildSeoPlan({ catalog: source, productCompatibility, siteOrigin: origin });
    assert.equal(plan.catalog.products.length, 1);
    assert.equal(plan.routes.has('/products/draft-gift'), false);
    assert.equal(plan.report.indexableRoutes, 0);
    assert.equal(plan.report.checkoutOffersEnabled, false);
    assert.doesNotMatch(sitemapXml(plan), /draft-gift/);
    await writeSeoOutput({ outputDirectory, template, catalog: source, productCompatibility, siteOrigin: origin });
    const manifest = JSON.parse(await readFile(path.join(outputDirectory, 'seo-manifest.json'), 'utf8'));
    assert.deepEqual(manifest.productCompatibility, productCompatibility);
    assert.equal(manifest.indexingEnabled, false);
    assert.deepEqual(manifest.indexableRoutes, []);
    assert.equal(manifest.publicRoutes.includes('/products/draft-gift'), false);
    assert.equal(manifest.productSlugs.includes('draft-gift'), false);
    assert.equal(manifest.productRedirects['/products/draft-gift-123'], undefined);
    assert.equal(await readFile(path.join(outputDirectory, 'robots.txt'), 'utf8'), 'User-agent: *\nDisallow: /\n');
    const env = { SEO_INDEXING_ENABLED: 'false', ADDRESS_SERVICE: { fetch: async input => Response.json({ ok: true, data: { version: 1, products: new URL(input).searchParams.get('slugs').split(',').map(slug => ({ requestedPath: `/products/${slug}`, canonicalPath: '/products/draft-gift', seoSignature: null })) } }) }, ASSETS: { fetch: async request => {
      try { return new Response(await readFile(path.join(outputDirectory, new URL(request.url).pathname.slice(1)), 'utf8')); }
      catch { return new Response('Not found', { status: 404 }); }
    } } };
    const response = await handleSeoRequest(new Request(`${origin}/products/draft-gift-123?ref=one%2Btwo`), env);
    assert.equal(response.status, 308);
    assert.equal(response.headers.get('location'), `${origin}/products/draft-gift?ref=one%2Btwo`);
    const friendly = await handleSeoRequest(new Request(`${origin}/products/draft-gift`), env);
    assert.equal(friendly.status, 200);
    assert.match(friendly.headers.get('x-robots-tag'), /noindex/);
    const friendlyHtml = await friendly.text();
    assert.doesNotMatch(friendlyHtml, /application\/ld\+json|Offer|pricePiastres/);
    assert.match(friendlyHtml, /rel="canonical" href="https:\/\/shop\.example\/products\/draft-gift"/);
    await writeSeoOutput({ outputDirectory, template, siteOrigin: origin });
    const ordinary = JSON.parse(await readFile(path.join(outputDirectory, 'seo-manifest.json'), 'utf8'));
    assert.deepEqual(ordinary.productRouting, { version: 1, authority: 'catalog-api', cacheSeconds: 0 });
    assert.doesNotMatch(await readFile(path.join(outputDirectory, 'spa.html'), 'utf8'), /application\/ld\+json|Fixture Product|pricePiastres/);
    assert.equal((await handleSeoRequest(new Request(`${origin}/products/draft-gift`), env)).status, 200);
    assert.equal((await handleSeoRequest(new Request(`${origin}/products/draft-gift-123`), env)).status, 308);
    const changes = JSON.parse(await readFile(path.join(outputDirectory, 'seo-change-report.json'), 'utf8'));
    assert.equal(changes.productCompatibilityChanged, true);
    assert.equal(changes.requiresDeployment, true);
    assert.equal(JSON.parse(await readFile(path.join(outputDirectory, 'seo-manifest.json'), 'utf8')).productCompatibility, undefined);
  } finally { await rm(outputDirectory, { recursive: true, force: true }); }
});

test('prelaunch mapping rejects proposals, private details, conflicts, unsafe paths, excessive bounds and expired evidence', () => {
  const invalid = [
    map => { map.source = 'workbook-proposal'; },
    map => { map.origin = 'https://other.example'; },
    map => { map.products[0].pricePiastres = 12345; },
    map => { map.products[0].aliases = ['/products/../../private']; },
    map => { map.products[0].aliases = ['/products/draft-gift']; },
    map => { map.products.push({ canonicalPath: '/products/other', aliases: ['/products/draft-gift-123'] }); },
    map => { map.products.push({ canonicalPath: '/products/draft-gift-123', aliases: [] }); },
    map => { map.products[0].aliases = ['/products/fixture-product']; },
    map => { map.products[0].aliases = Array.from({ length: 101 }, (_, i) => `/products/a-${i}`); },
    map => { map.products = Array(10_001).fill(map.products[0]); },
    map => { map.expiresAt = new Date(Date.now() + 86401_000).toISOString(); },
    map => { map.generatedAt = new Date(Date.now() - 7200_000).toISOString(); map.expiresAt = new Date(Date.now() - 1000).toISOString(); },
  ];
  for (const change of invalid) {
    const productCompatibility = compatibility(); change(productCompatibility);
    assert.throws(() => buildSeoPlan({ catalog: catalog(), siteOrigin: origin, productCompatibility }), /SEO product compatibility/);
  }
  assert.throws(() => buildSeoPlan({ catalog: catalog(), siteOrigin: origin, productCompatibility: compatibility(), publish: true }), /disabled indexing/);
  assert.throws(() => buildSeoPlan({ productCompatibility: compatibility() }), /canonical origin/);
});

test('permanent product paths govern static canonicals, links and sitemap while identities stay unchanged', () => {
  const source = catalog();
  source.products[0].publicPath = '/products/readable-gift';
  source.products[0].publicAliases = ['historic-gift'];
  const plan = buildSeoPlan({ catalog: source, siteOrigin: origin, publish: true });
  const route = plan.routes.get('/products/readable-gift');
  assert.ok(route); assert.equal(plan.routes.has('/products/fixture-product'), false);
  assert.match(renderRouteHtml(template, route, origin), /rel="canonical" href="https:\/\/shop.example\/products\/readable-gift"/);
  assert.match(plan.routes.get('/shop').body, /href="\/products\/readable-gift"/);
  assert.match(sitemapXml(plan), /\/products\/readable-gift/);
  assert.equal(plan.catalog.products[0].slug, 'fixture-product');
  const duplicate = { ...source.products[0], _id: 'another-product', slug: 'another-stored-slug' };
  assert.throws(() => validateCatalog({ ...source, products: [...source.products, duplicate] }), /Conflicting product addresses/);
  assert.throws(() => validateCatalog({ ...source, products: [{ ...source.products[0], publicPath: 'https://untrusted.example' }] }), /Invalid public product path/);
});

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

test('static navigation follows public primary links without guessing authenticated order destinations', () => {
  const plan = buildSeoPlan({ catalog: catalog(), siteOrigin: origin, publish: true });
  const html = renderRouteHtml(template, plan.routes.get('/shop'), origin);
  const navigation = html.match(/<nav aria-label="Main navigation">([\s\S]*?)<\/nav>/)[1];
  for (const [href, label] of [['/', 'Home'], ['/shop', 'Shop'], ['/customize', 'Customize'], ['/about', 'About Us']]) {
    assert.ok(navigation.includes(`href="${href}"`), label);
  }
  for (const href of ['/contact', '/track-order', '/my-orders', '/admin']) assert.equal(navigation.includes(`href="${href}"`), false);
  assert.match(html.match(/<footer[\s\S]*?<\/footer>/)[0], /href="\/contact"/);
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
  const route = plan.routes.get('/categories/fixture-gifts/fixture-keepsakes');
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

test('fixed pages are complete but noindex until source approval; database content cannot override', () => {
  const plan = buildSeoPlan({ catalog: catalog(), siteOrigin: origin, publish: true, content: { routes: { '/privacy-policy': { approved: true, title: 'Injected legacy text', paragraphs: ['Unreviewed override'] } } } });
  for (const slug of ['about', 'contact', 'privacy-policy', 'refund-policy', 'shipping-policy', 'terms-of-service']) {
    const route = plan.routes.get('/' + slug);
    assert.equal(route.indexable, false);
    assert.doesNotMatch(route.body, /Development placeholder|Unreviewed override/);
    assert.ok(route.body.length > 1000);
  }
  assert.match(plan.routes.get('/refund-policy').body, /14 days/);
  assert.match(plan.routes.get('/shipping-policy').body, /Pending Confirmation/);
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
