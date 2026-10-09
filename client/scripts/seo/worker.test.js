import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { handleSeoRequest } from '../../worker/seo-worker.js';

test('default Cloudflare configuration routes documents through the reviewed private-safe worker', async () => {
  const config = JSON.parse(await readFile(new URL('../../wrangler.jsonc', import.meta.url), 'utf8'));
  assert.equal(config.main, './worker/seo-worker.js');
  assert.equal(config.assets.directory, './dist');
  assert.equal(config.assets.binding, 'ASSETS');
  assert.equal(config.assets.html_handling, 'none');
  assert.equal(config.assets.not_found_handling, '404-page');
  assert.deepEqual(config.assets.run_worker_first, ['/*', '!/assets/*', '!/tap-wrap-logo.webp']);
  assert.equal(config.vars.SEO_INDEXING_ENABLED, 'false');
});

function fixtureEnv() {
  const seen = [];
  const publicRoutes = ['/', '/shop', '/products/approved-product', '/categories/approved-category'];
  const allRoutes = [...publicRoutes, '/cart', '/admin', '/my-orders', '/customize', '/404'];
  const id = 'a'.repeat(64);
  const createdAt = Date.now();
  const routeFiles = Object.fromEntries(allRoutes.map((pathname) => [pathname, `/seo-pages/${id}/${pathname === '/' ? 'index' : pathname.slice(1)}.html`]));
  const manifest = { version: 2, origin: 'https://shop.example', indexingEnabled: true, publicRoutes, indexableRoutes: publicRoutes, productSlugs: ['approved-product'], categorySlugs: ['approved-category'], routeFiles, publication: { version: 1, id, maximumAgeSeconds: 3600, generatedAt: new Date(createdAt).toISOString(), expiresAt: new Date(createdAt + 3600 * 1000).toISOString(), routes: publicRoutes.map((pathname) => ({ pathname, hash: id, indexable: true })) } };
  const assets = new Map([['/seo-manifest.json', JSON.stringify(manifest)], ['/index.html', '<html><h1>Fixture homepage</h1></html>'], ['/shop.html', '<html><h1>Fixture shop</h1></html>'], ['/cart.html', '<html><h1>Private cart shell</h1></html>'], ['/admin.html', '<html><h1>Private admin shell</h1></html>'], ['/my-orders.html', '<html><h1>Private orders shell</h1></html>'], ['/customize.html', '<html><h1>Customization shell</h1></html>'], ['/products/approved-product.html', '<html><h1>Approved Product</h1></html>'], ['/categories/approved-category.html', '<html><h1>Approved Category</h1></html>'], ['/404.html', '<html><h1>Page not found</h1></html>'], ['/sitemap.xml', '<urlset><url>Fixture sitemap</url></urlset>'], ['/assets/app.js', 'fixture-js']]);
  for (const pathname of allRoutes) assets.set(routeFiles[pathname], assets.get(pathname === '/' ? '/index.html' : `${pathname}.html`));
  return { seen, manifest, assets, env: { SEO_INDEXING_ENABLED: 'true', SEO_EXPECTED_PUBLICATION_ID: id, ASSETS: { fetch: async (request) => { const pathname = new URL(request.url).pathname; seen.push(pathname); return new Response(assets.get(pathname) || 'Not found', { status: assets.has(pathname) ? 200 : 404, headers: { 'Content-Type': pathname.endsWith('.json') ? 'application/json' : pathname.endsWith('.js') ? 'text/javascript' : 'text/html' } }); } } } };
}

test('Cloudflare router serves approved static product/category HTML without an API request', async () => {
  const { env, seen } = fixtureEnv();
  const response = await handleSeoRequest(new Request('https://shop.example/products/approved-product'), env);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Approved Product/);
  assert.equal(response.headers.get('X-Robots-Tag'), null);
  assert.deepEqual(seen, ['/seo-manifest.json', `/seo-pages/${'a'.repeat(64)}/products/approved-product.html`]);
  const category = await handleSeoRequest(new Request('https://shop.example/categories/approved-category'), env);
  assert.equal(category.status, 200);
});

test('unknown, draft and deleted product routes return actual 404 with noindex', async () => {
  const { env } = fixtureEnv();
  for (const pathname of ['/products/draft-product', '/products/deleted-product', '/unknown', '/products/missing/customize']) {
    const response = await handleSeoRequest(new Request(`https://shop.example${pathname}`), env);
    assert.equal(response.status, 404);
    assert.match(response.headers.get('X-Robots-Tag'), /noindex/);
    assert.match(await response.text(), /Page not found/);
  }
});

test('admin/account/checkout/tracking documents return private no-store shells', async () => {
  const { env } = fixtureEnv();
  for (const pathname of ['/admin/products', '/cart', '/checkout', '/orders/fixture-id', '/track-order', '/products/approved-product/customize']) {
    const response = await handleSeoRequest(new Request(`https://shop.example${pathname}`), env);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    assert.match(response.headers.get('X-Robots-Tag'), /noindex, nofollow, noarchive/);
  }
});

test('preview hostname and disabled indexing never expose indexable headers or sitemap', async () => {
  const { env } = fixtureEnv();
  const preview = await handleSeoRequest(new Request('https://preview.workers.dev/products/approved-product'), env);
  assert.match(preview.headers.get('X-Robots-Tag'), /noindex/);
  const sitemap = await handleSeoRequest(new Request('https://preview.workers.dev/sitemap.xml'), env);
  assert.equal((await sitemap.text()).includes('Fixture sitemap'), false);
  env.SEO_INDEXING_ENABLED = 'false';
  const robots = await handleSeoRequest(new Request('https://shop.example/robots.txt'), env);
  assert.equal(await robots.text(), 'User-agent: *\nDisallow: /\n');
});

test('query filters are noindex and trailing-slash canonical redirects preserve queries', async () => {
  const { env } = fixtureEnv();
  const filtered = await handleSeoRequest(new Request('https://shop.example/shop?q=fixture'), env);
  assert.match(filtered.headers.get('X-Robots-Tag'), /noindex/);
  const redirect = await handleSeoRequest(new Request('https://shop.example/shop/?q=fixture'), env);
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get('Location'), 'https://shop.example/shop?q=fixture');
});

test('immutable static assets bypass manifest parsing and mutation methods are rejected', async () => {
  const { env, seen } = fixtureEnv();
  assert.equal((await handleSeoRequest(new Request('https://shop.example/assets/app.js'), env)).status, 200);
  assert.deepEqual(seen, ['/assets/app.js']);
  assert.equal((await handleSeoRequest(new Request('https://shop.example/shop', { method: 'POST' }), env)).status, 405);
});

test('missing bindings and manifest fail closed without indexing', async () => {
  assert.equal((await handleSeoRequest(new Request('https://shop.example/'), {})).status, 503);
  const env = { ASSETS: { fetch: async () => new Response('Shell', { status: 200 }) }, SEO_INDEXING_ENABLED: 'true' };
  const response = await handleSeoRequest(new Request('https://shop.example/products/unknown'), env);
  assert.match(response.headers.get('X-Robots-Tag'), /noindex/);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
});

test('expired or unreviewed publication IDs never serve stale product prices or structured data', async () => {
  for (const expired of [true, false]) {
    const { env, manifest, assets } = fixtureEnv();
    if (expired) { manifest.publication.expiresAt = '2026-01-01T00:00:00Z'; assets.set('/seo-manifest.json', JSON.stringify(manifest)); }
    else env.SEO_EXPECTED_PUBLICATION_ID = 'b'.repeat(64);
    const response = await handleSeoRequest(new Request('https://shop.example/products/approved-product'), env);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.match(response.headers.get('X-Robots-Tag'), /noindex/);
    assert.equal((await response.text()).includes('Approved Product'), false);
    const sitemap = await handleSeoRequest(new Request('https://shop.example/sitemap.xml'), env);
    assert.equal((await sitemap.text()).includes('/products/approved-product'), false);
  }
});

test('explicit withdrawal overrides the current snapshot and removes its sitemap discovery', async () => {
  const { env } = fixtureEnv();
  env.SEO_WITHDRAWN_PATHS = '/products/approved-product';
  const response = await handleSeoRequest(new Request('https://shop.example/products/approved-product'), env);
  assert.equal(response.status, 404);
  assert.equal((await response.text()).includes('Approved Product'), false);
  const sitemap = await handleSeoRequest(new Request('https://shop.example/sitemap.xml'), env);
  const xml = await sitemap.text();
  assert.equal(xml.includes('/products/approved-product'), false);
  assert.equal(xml.includes('/categories/approved-category'), true);
  env.SEO_WITHDRAWN_PATHS = '/admin/private';
  assert.equal((await handleSeoRequest(new Request('https://shop.example/shop'), env)).status, 503);
});

test('thin-category noindex is a per-route contract and immutable generation URLs are not browseable', async () => {
  const { env, manifest, assets } = fixtureEnv();
  manifest.indexableRoutes = manifest.indexableRoutes.filter((pathname) => !pathname.startsWith('/categories/'));
  assets.set('/seo-manifest.json', JSON.stringify(manifest));
  const category = await handleSeoRequest(new Request('https://shop.example/categories/approved-category'), env);
  assert.equal(category.status, 200);
  assert.match(category.headers.get('X-Robots-Tag'), /noindex/);
  assert.equal((await (await handleSeoRequest(new Request('https://shop.example/sitemap.xml'), env)).text()).includes('/categories/'), false);
  assert.equal((await handleSeoRequest(new Request(`https://shop.example${manifest.routeFiles['/products/approved-product']}`), env)).status, 404);
});

test('every document, private shell, redirect and asset gets baseline browser security headers', async () => {
  const { env } = fixtureEnv();
  for (const pathname of ['/shop', '/admin/products', '/shop/', '/unknown', '/assets/app.js', '/sitemap.xml']) {
    const response = await handleSeoRequest(new Request(`https://shop.example${pathname}`), env);
    assert.equal(response.headers.get('X-Frame-Options'), 'DENY', pathname);
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.ok(response.headers.has('Content-Security-Policy-Report-Only'));
    assert.equal(response.headers.has('Content-Security-Policy'), false);
  }
});

test('Worker policy invalid origins fail closed, with no credential-bearing diagnostic body', async () => {
  const { env } = fixtureEnv();
  env.BROWSER_API_ORIGINS = 'https://private-user:private-password@api.example';
  const response = await handleSeoRequest(new Request('https://shop.example/shop'), env);
  assert.equal(response.status, 503);
  assert.equal((await response.text()).includes('private-password'), false);
});
