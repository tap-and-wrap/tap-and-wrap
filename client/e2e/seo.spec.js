import { test, expect } from '@playwright/test';
import { mockCatalog, category, subcategory, detail } from './catalog-fixtures.js';
import { buildSeoPlan, renderRouteHtml } from '../scripts/seo/generator.js';

test('public pages receive unique metadata while unconfigured development indexing stays disabled', async ({ page }) => {
  await mockCatalog(page);
  await page.goto('/shop');
  await expect(page).toHaveTitle('Shop Gifts | Tap & Wrap');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', 'Shop Gifts | Tap & Wrap');
  await page.goto(`/products/${detail.slug}`);
  await expect(page).toHaveTitle(`${detail.name} | Tap & Wrap`);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', detail.description);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', detail.mainImageUrl);
  await expect(page.locator('script[data-seo-jsonld]')).toHaveCount(0);
});

test('unapproved products never expose price schema and private routes remain noindex', async ({ page }) => {
  await mockCatalog(page);
  await page.goto('/products/unapproved');
  await expect(page).toHaveTitle('Product unavailable | Tap & Wrap');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await expect(page.locator('script[data-seo-jsonld]')).toHaveCount(0);
  for (const pathname of ['/checkout', '/track-order', '/my-orders', '/login']) {
    await page.goto(pathname);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page.locator('script[data-seo-jsonld]')).toHaveCount(0);
  }
});

test('category routes use exact active-category metadata and server filtering on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  const { requests } = await mockCatalog(page);
  const headers = { 'Access-Control-Allow-Origin': 'http://127.0.0.1:5191', 'Access-Control-Allow-Credentials': 'true' };
  await page.route(`**/api/v1/public/categories/${category.slug}`, (route) => route.fulfill({ headers, json: { ok: true, data: { category } } }));
  await page.goto(`/categories/${category.slug}`);
  await expect(page).toHaveTitle(`${category.name} Gifts | Tap & Wrap`);
  await expect(page.getByRole('heading', { level: 1, name: `${category.name} Gifts` })).toBeVisible();
  await expect(page.locator('.catalog-card')).toHaveCount(20);
  expect(requests.some((request) => request.path === '/public/products' && request.params.category === category.slug && Number(request.params.limit) <= 20)).toBeTruthy();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer.getByRole('combobox', { name: 'Category', exact: true })).toBeDisabled();
  await expect(drawer.getByRole('combobox', { name: 'Category', exact: true })).toHaveValue(category.slug);
  await drawer.getByRole('combobox', { name: 'Availability', exact: true }).selectOption('available');
  await drawer.getByRole('button', { name: 'View Results' }).click();
  await expect(page).toHaveURL(new RegExp(`/categories/${category.slug}\\?availability=available`));
  expect(requests.filter((request) => request.path === '/public/products').at(-1).params.category).toBe(category.slug);
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Clear All' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'View Results' }).click();
  await expect(page).toHaveURL(`/categories/${category.slug}`);
  expect(requests.filter((request) => request.path === '/public/products').at(-1).params.category).toBe(category.slug);
});

test('subcategory pages lock both relations and retain the main-category breadcrumb without sibling requests', async ({ page }) => {
  const { requests } = await mockCatalog(page);
  const headers = { 'Access-Control-Allow-Origin': 'http://127.0.0.1:5191', 'Access-Control-Allow-Credentials': 'true' };
  await page.route(`**/api/v1/public/categories/${subcategory.slug}`, (route) => route.fulfill({ headers, json: { ok: true, data: { category: { ...subcategory, parent: category } } } }));
  await page.goto(`/categories/${subcategory.slug}?category=incorrect&subcategory=incorrect`);
  await expect(page.getByRole('heading', { level: 1, name: `${subcategory.name} Gifts` })).toBeVisible();
  const filters = page.locator('.catalog-sidebar');
  await expect(filters.getByRole('combobox', { name: 'Category', exact: true })).toBeDisabled();
  await expect(filters.getByRole('combobox', { name: 'Category', exact: true })).toHaveValue(subcategory.slug);
  await expect(filters.getByRole('combobox', { name: 'Subcategory', exact: true })).toHaveCount(0);
  await expect(filters.getByText(`Within ${category.name}`, { exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Category breadcrumb' }).getByRole('link', { name: category.name })).toHaveAttribute('href', `/categories/${category.slug}`);
  const initial = requests.filter((request) => request.path === '/public/products').at(-1).params;
  expect(initial).toMatchObject({ category: category.slug, subcategory: subcategory.slug, limit: '20' });
  expect(requests.some((request) => request.path === '/public/categories')).toBeFalsy();
  await filters.getByRole('combobox', { name: 'Availability', exact: true }).selectOption('available');
  await filters.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page).toHaveURL(`/categories/${subcategory.slug}?availability=available`);
  await filters.getByRole('button', { name: 'Clear All' }).click();
  await expect(page).toHaveURL(`/categories/${subcategory.slug}`);
  expect(requests.filter((request) => request.path === '/public/products').at(-1).params).toMatchObject({ category: category.slug, subcategory: subcategory.slug });
});

test('fixture-prerendered product information and links work without JavaScript at 320px', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 900 } });
  const page = await context.newPage();
  try {
    const plan = buildSeoPlan({ siteOrigin: 'https://fixture.example', publish: true, catalog: { version: 1, source: 'approved-public-catalog', generatedAt: new Date().toISOString(), checkoutEnabled: false, mediaOrigins: [], categories: [category], products: [{ ...detail, mainImageUrl: null, subcategory: null, seoEligibility: { status: 'ready', published: true, inventoryApproved: true, reviewRequired: false, categoriesActive: true } }] } });
    const template = '<!doctype html><html lang="en"><head><link rel="stylesheet" href="/src/styles.css"><link rel="stylesheet" href="/src/design-system.css"></head><body><div id="root"></div><script>window.UNEXPECTED_JS=true</script></body></html>';
    const html = renderRouteHtml(template, plan.routes.get(`/products/${detail.slug}`), plan.origin);
    await page.route('**/isolated-prerender', (route) => route.fulfill({ contentType: 'text/html', body: html }));
    await page.goto('http://127.0.0.1:5191/isolated-prerender');
    await expect(page.getByRole('heading', { level: 1, name: detail.name })).toBeVisible();
    await expect(page.getByText(detail.description)).toBeVisible();
    await expect(page.getByRole('link', { name: category.name, exact: true })).toHaveAttribute('href', `/categories/${category.slug}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    expect(await page.evaluate(() => window.UNEXPECTED_JS)).toBeUndefined();
  } finally { await context.close(); }
});
