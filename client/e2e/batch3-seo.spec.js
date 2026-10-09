import { test, expect } from '@playwright/test';
import { mockCatalog, category, detail } from './catalog-fixtures.js';
import { buildSeoPlan, renderRouteHtml } from '../scripts/seo/generator.js';
import { publicationFor } from '../scripts/seo/publication.js';
import { browserSecurityHeaders } from '../worker/browser-policy.js';
import { blockExternalRequests } from './network-fixture.js';

test('real React boot keeps semantic static content through a delayed API response, then reveals one interactive route', async ({ page }) => {
  await mockCatalog(page);
  const now = new Date();
  const catalog = { version: 1, source: 'approved-public-catalog', generatedAt: now.toISOString(), checkoutEnabled: false, mediaOrigins: [], categories: [category], products: [{ ...detail, mainImageUrl: null, subcategory: null, seoEligibility: { status: 'ready', published: true, inventoryApproved: true, reviewRequired: false, categoriesActive: true } }] };
  const plan = buildSeoPlan({ catalog, siteOrigin: 'https://fixture.example', now });
  const publication = publicationFor(plan, { now });
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  await page.route(`**/api/v1/public/products/${detail.slug}`, async (route) => {
    await held;
    await route.fulfill({ headers: { 'Access-Control-Allow-Origin': 'http://127.0.0.1:5191', 'Access-Control-Allow-Credentials': 'true' }, json: { ok: true, data: { product: detail } } });
  });
  await page.route(`http://127.0.0.1:5191/products/${detail.slug}`, async (route) => {
    const template = await (await route.fetch()).text();
    await route.fulfill({ contentType: 'text/html', body: renderRouteHtml(template, plan.routes.get(`/products/${detail.slug}`), plan.origin, publication) });
  });
  try {
    await page.goto(`/products/${detail.slug}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.seo-boot-fallback')).toBeVisible();
    await expect(page.locator('.seo-boot-fallback h1')).toHaveText(detail.name);
    await expect(page.locator('#root')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    release();
    await expect(page.locator('.seo-boot-fallback')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: detail.name })).toHaveCount(1);
    await expect(page.getByRole('form', { name: 'Product options' })).toBeVisible();
    expect(await page.locator('#root').evaluate((element) => element.inert)).toBe(false);
    await expect(page.locator('script[data-seo-jsonld]')).toHaveCount(0);
  } finally { release(); }
});

test('a failed catalog revalidation removes the old fallback and never preserves a purchasable stale product form', async ({ page }) => {
  await mockCatalog(page);
  const now = new Date();
  const plan = buildSeoPlan({ catalog: { version: 1, source: 'approved-public-catalog', products: [{ ...detail, mainImageUrl: null, subcategory: null, seoEligibility: { status: 'ready', published: true, inventoryApproved: true, reviewRequired: false, categoriesActive: true } }], categories: [category], mediaOrigins: [], checkoutEnabled: false }, now });
  const publication = publicationFor(plan, { now });
  await page.route(`**/api/v1/public/products/${detail.slug}`, (route) => route.fulfill({ status: 404, headers: { 'Access-Control-Allow-Origin': 'http://127.0.0.1:5191', 'Access-Control-Allow-Credentials': 'true' }, json: { ok: false, error: { message: 'Product unavailable' } } }));
  await page.route(`http://127.0.0.1:5191/products/${detail.slug}`, async (route) => route.fulfill({ contentType: 'text/html', body: renderRouteHtml(await (await route.fetch()).text(), plan.routes.get(`/products/${detail.slug}`), plan.origin, publication) }));
  await page.goto(`/products/${detail.slug}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Product not found' })).toBeVisible();
  await expect(page.locator('.seo-boot-fallback')).toHaveCount(0);
  await expect(page.getByRole('form', { name: 'Product options' })).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
});

test('isolated enforced browser CSP allows local code and blocks inline scripts, forbidden connections and foreign scripts', async ({ page }) => {
  let forbiddenRequests = 0;
  await page.route('https://forbidden.invalid/**', (route) => { forbiddenRequests += 1; return route.abort(); });
  await page.route('**/isolated-policy-script.js', (route) => route.fulfill({ contentType: 'text/javascript', body: `window.allowedPolicyScript = true; window.policyViolations = []; document.addEventListener('securitypolicyviolation', event => window.policyViolations.push(event.effectiveDirective)); fetch('https://forbidden.invalid/private').catch(() => { window.blockedPolicyFetch = true; });` }));
  await page.route('**/isolated-policy', (route) => route.fulfill({ contentType: 'text/html', headers: browserSecurityHeaders({ BROWSER_CSP_MODE: 'enforce' }), body: '<!doctype html><html><body><h1>Isolated browser policy</h1><script src="/isolated-policy-script.js"></script><script>window.forbiddenInlineScript=true</script><script src="https://forbidden.invalid/foreign.js"></script></body></html>' }));
  await page.goto('/isolated-policy');
  await expect.poll(() => page.evaluate(() => window.allowedPolicyScript)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.blockedPolicyFetch)).toBe(true);
  expect(await page.evaluate(() => window.forbiddenInlineScript)).toBeUndefined();
  await expect.poll(() => page.evaluate(() => window.policyViolations.some((entry) => entry.startsWith('script-src')))).toBe(true);
  await expect.poll(() => page.evaluate(() => window.policyViolations.includes('connect-src'))).toBe(true);
  expect(forbiddenRequests).toBe(0);
});

test('actual PageMetadata stops indexing changed API media, prices and stock despite a previously verified static product', async ({ page }) => {
  await blockExternalRequests(page);
  // Vite HMR is unnecessary in this one-module harness. Intercept WebSockets
  // before navigation too, so the invented HTTPS hostname cannot cause DNS or
  // provider requests that ordinary HTTP route interception does not cover.
  await page.routeWebSocket(/.*/, (socket) => socket.close());
  const pageErrors = [];
  const failedModules = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => { if (request.resourceType() === 'script') failedModules.push({ url: request.url(), error: request.failure()?.errorText }); });
  const fixtureOrigin = 'https://metadata.fixture.invalid';
  const now = new Date();
  const product = { ...detail, subcategory: null, variants: [] };
  const mediaVerification = { version: 1, source: 'authorized-media-object-verification', objects: [{ approved: true, url: product.mainImageUrl, sha256: 'a'.repeat(64), objectVersion: 'synthetic-v1', contentType: 'image/webp', sizeBytes: 15000, width: 900, height: 900, verifiedAt: new Date(now.valueOf() - 1000).toISOString(), validUntil: new Date(now.valueOf() + 7200000).toISOString() }] };
  const plan = buildSeoPlan({ catalog: { version: 1, source: 'approved-public-catalog', generatedAt: now.toISOString(), products: [{ ...product, seoEligibility: { status: 'ready', published: true, inventoryApproved: true, reviewRequired: false, categoriesActive: true } }], categories: [category], mediaOrigins: [new URL(product.mainImageUrl).origin], mediaVerification, checkoutEnabled: true }, publish: true, siteOrigin: fixtureOrigin, now });
  const publication = publicationFor(plan, { now });
  const pathname = `/products/${product.slug}`;
  const html = renderRouteHtml('<!doctype html><html><head></head><body><div id="root"></div><script type="module" src="/isolated-metadata-harness.js"></script></body></html>', plan.routes.get(pathname), fixtureOrigin, publication);
  // This synthetic HTTPS origin never leaves interception. Only explicit Vite
  // module paths are proxied to loopback; the actual component is compiled by
  // Vite, with public test-only indexing/origin flags, not merchant configuration.
  await page.route(`${fixtureOrigin}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === pathname) return route.fulfill({ contentType: 'text/html', body: html });
    if (url.pathname === '/isolated-metadata-harness.js') return route.fulfill({ contentType: 'text/javascript', body: `import React from '/node_modules/.vite/deps/react.js'; import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js'; import { initializePrerender } from '/src/seo/boot.js'; import * as RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>type=>type; window.__vite_plugin_react_preamble_installed__=true; const {ProductMetadata}=await import('/src/seo/PageMetadata.jsx'); const element=document.getElementById('root'); initializePrerender(element); const root=ReactDOM.createRoot(element); window.originalPublicProduct=${JSON.stringify(product)}; window.renderPublicProduct=product=>root.render(React.createElement(React.Fragment,null,React.createElement(ProductMetadata,{product,checkoutEnabled:true}),React.createElement('main',null,React.createElement('h1',null,product.name)))); window.renderPublicProduct(window.originalPublicProduct);` });
    if (!/^\/(?:src\/seo\/|node_modules\/\.vite\/deps\/|node_modules\/vite\/dist\/client\/env\.mjs$|@vite\/|@react-refresh$|seo-static\.css$|tap-wrap-logo\.webp$)/.test(url.pathname)) return route.abort();
    const local = new URL(url.pathname + url.search, 'http://127.0.0.1:5191');
    const response = await route.fetch({ url: local.href });
    if (url.pathname === '/src/seo/PageMetadata.jsx') {
      let body = await response.text();
      expect(body).toContain('import.meta.env.VITE_SITE_URL');
      expect(body).toContain('import.meta.env.VITE_SEO_INDEXING_ENABLED');
      body = body.replaceAll('import.meta.env.VITE_SITE_URL', JSON.stringify(fixtureOrigin)).replaceAll('import.meta.env.VITE_SEO_INDEXING_ENABLED', '"true"');
      return route.fulfill({ response, body });
    }
    return route.fulfill({ response });
  });
  await page.goto(`${fixtureOrigin}${pathname}`);
  try { await expect.poll(() => page.evaluate(() => typeof window.renderPublicProduct)).toBe('function'); }
  catch (error) { console.error(`Isolated metadata harness diagnostics: ${JSON.stringify({ pageErrors, failedModules })}`); throw error; }
  expect(pageErrors).toEqual([]);
  await expect(page.locator('.seo-boot-fallback')).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /^index,/);
  await expect(page.locator('script[data-seo-jsonld]')).toHaveCount(1);
  for (const change of [{ mainImageUrl: 'https://fixture.invalid/changed-unverified.webp' }, { pricePiastres: product.pricePiastres + 100 }, { orderingAvailable: false }]) {
    await page.evaluate((change) => window.renderPublicProduct({ ...window.originalPublicProduct, ...change }), change);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /^noindex,/);
    await expect(page.locator('script[data-seo-jsonld]')).toHaveCount(0);
    await page.evaluate(() => window.renderPublicProduct(window.originalPublicProduct));
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /^index,/);
    await expect(page.locator('script[data-seo-jsonld]')).toHaveCount(1);
  }
  expect(pageErrors).toEqual([]);
});

for (const width of [320, 390, 768, 1440]) {
  test(`blocked-font and synthetic local-font handoff preserve intrinsic logo/image geometry at ${width}px`, async ({ page }, testInfo) => {
    await mockCatalog(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/products/${detail.slug}`);
    await expect(page.getByRole('heading', { level: 1, name: detail.name })).toBeVisible();
    const logo = page.locator('header .site-logo img');
    // Use the image directly; its 2000 x 667 intrinsic aspect ratio must stay fixed.
    const actualLogo = logo;
    const picture = page.locator('.product-main-image');
    const before = { logo: await actualLogo.boundingBox(), picture: await picture.boundingBox() };
    await page.addStyleTag({ content: '@font-face { font-family:"DM Sans";src:local("Arial");font-display:optional } @font-face { font-family:"Cormorant Garamond";src:local("Georgia");font-display:optional }' });
    await page.evaluate(() => document.fonts.ready);
    const after = { logo: await actualLogo.boundingBox(), picture: await picture.boundingBox() };
    for (const part of ['logo', 'picture']) {
      expect(before[part]).not.toBeNull();
      expect(after[part].width).toBeCloseTo(before[part].width, 0);
      expect(after[part].height).toBeCloseTo(before[part].height, 0);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    console.info(`Isolated font geometry: ${JSON.stringify({ width, before, after, realFontDeliveryVerified: false })}`);
    await testInfo.attach('isolated-font-geometry', { body: JSON.stringify({ width, before, after, realFontDeliveryVerified: false }), contentType: 'application/json' });
  });
}
