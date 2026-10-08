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
  const manifest = { version: 1, origin: 'https://shop.example', indexingEnabled: true, publicRoutes: ['/', '/shop', '/products/approved-product', '/categories/approved-category'], productSlugs: ['approved-product'], categorySlugs: ['approved-category'] };
  const assets = new Map([['/seo-manifest.json', JSON.stringify(manifest)], ['/index.html', '<html><h1>Fixture homepage</h1></html>'], ['/shop.html', '<html><h1>Fixture shop</h1></html>'], ['/cart.html', '<html><h1>Private cart shell</h1></html>'], ['/admin.html', '<html><h1>Private admin shell</h1></html>'], ['/my-orders.html', '<html><h1>Private orders shell</h1></html>'], ['/customize.html', '<html><h1>Customization shell</h1></html>'], ['/products/approved-product.html', '<html><h1>Approved Product</h1></html>'], ['/categories/approved-category.html', '<html><h1>Approved Category</h1></html>'], ['/404.html', '<html><h1>Page not found</h1></html>'], ['/sitemap.xml', '<urlset><url>Fixture sitemap</url></urlset>'], ['/assets/app.js', 'fixture-js']]);
  return { seen, env: { SEO_INDEXING_ENABLED: 'true', ASSETS: { fetch: async (request) => { const pathname = new URL(request.url).pathname; seen.push(pathname); return new Response(assets.get(pathname) || 'Not found', { status: assets.has(pathname) ? 200 : 404, headers: { 'Content-Type': pathname.endsWith('.json') ? 'application/json' : pathname.endsWith('.js') ? 'text/javascript' : 'text/html' } }); } } } };
}

test('Cloudflare router serves approved static product/category HTML without an API request', async () => {
  const { env, seen } = fixtureEnv();
  const response = await handleSeoRequest(new Request('https://shop.example/products/approved-product'), env);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Approved Product/);
  assert.equal(response.headers.get('X-Robots-Tag'), null);
  assert.deepEqual(seen, ['/seo-manifest.json', '/products/approved-product.html']);
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
