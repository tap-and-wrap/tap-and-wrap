import { test, expect } from '@playwright/test';
import { mockCatalog, adminProduct, previewProduct } from './catalog-fixtures.js';

const previewPath = `/admin/products/${adminProduct._id}/preview`;
const draftRequests = (requests) => requests.filter((request) => request.path.endsWith('/preview'));

test('signed-out and customer visitors cannot load draft preview data', async ({ page }) => {
  const anonymous = await mockCatalog(page);
  const response = await page.goto(previewPath);
  expect(response.headers()['x-robots-tag']).toContain('noindex');
  expect(response.headers()['x-robots-tag']).toContain('noarchive');
  expect(response.headers()['cache-control']).toContain('no-store');
  await expect(page.getByRole('heading', { name: 'Administrator sign in' })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow, noarchive');
  expect(draftRequests(anonymous.requests)).toHaveLength(0);
  await page.unroute('**/api/v1/**');
  const customer = await mockCatalog(page, { role: 'customer' });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Access denied' })).toBeVisible();
  expect(draftRequests(customer.requests)).toHaveLength(0);
  await expect(page.getByText(previewProduct.externalCatalogId, { exact: true })).toHaveCount(0);
});

test('server administrator denial keeps the preview component unmounted', async ({ page }) => {
  const { requests } = await mockCatalog(page, { role: 'admin', denyAdmin: true });
  await page.goto(previewPath);
  await expect(page.getByRole('heading', { name: 'Access denied' })).toBeVisible();
  expect(draftRequests(requests)).toHaveLength(0);
});

test('authorized draft preview preserves numbered image positions without publishing or showing provisional prices', async ({ page }) => {
  const { requests, saves } = await mockCatalog(page, { role: 'admin' });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(previewPath);
  await expect(page.getByRole('heading', { name: previewProduct.name, exact: true })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Authenticated staging preview' })).toBeVisible();
  await expect(page.getByText(previewProduct.externalCatalogId, { exact: true })).toBeVisible();
  await expect(page.getByText('3 saved references · Image 1 is the selected main photo', { exact: true })).toBeVisible();
  await expect(page.locator('.product-main-image')).toHaveText('Main image · Image 1 · Media not configured');
  await page.getByRole('button', { name: 'View image 2', exact: true }).click();
  await expect(page.locator('.product-main-image')).toHaveText('Image 2 · Media not configured');
  await page.getByRole('button', { name: 'View image 1 (main)', exact: true }).click();
  await expect(page.locator('.product-main-image')).toHaveText('Main image · Image 1 · Media not configured');
  await expect(page.locator('.product-price')).toHaveText('Price awaiting approval');
  await expect(page.getByRole('button', { name: 'Ordering disabled', exact: true })).toBeDisabled();
  await expect(page.getByRole('link', { name: 'Customize This' })).toHaveCount(0);
  await expect(page.locator('input[type="file"]')).toHaveCount(1);
  await expect(page.locator('input[type="file"]')).toBeDisabled();
  await expect(page.getByLabel('Quantity', { exact: true })).toBeDisabled();
  expect(requests.some((request) => request.path.startsWith('/public/products'))).toBe(false);
  expect(saves).toHaveLength(0);
  expect(errors).toEqual([]);
});

test('preview uses safe configured gallery URLs in source order and hides provisional variant prices', async ({ page }) => {
  const fixture = {
    ...previewProduct, pricePiastres: 1000, priceApproved: true,
    mainImageUrl: 'https://fixture.invalid/main.svg', galleryUrls: ['https://fixture.invalid/main.svg', 'https://fixture.invalid/second.svg'],
    gallerySlots: [{ position: 1, url: 'https://fixture.invalid/main.svg', isMain: true }, { position: 2, url: 'https://fixture.invalid/second.svg', isMain: false }],
    variants: [{ key: 'unapproved', attributes: [{ name: 'Size', value: 'Fixture size' }], pricePiastres: 98765, priceApproved: false, inventory: { mode: 'tracked', quantity: 10, approved: false }, orderingAvailable: false }],
  };
  await mockCatalog(page, { role: 'admin', previewProduct: fixture });
  await page.goto(previewPath);
  await expect(page.locator('.product-main-image img')).toHaveAttribute('src', fixture.mainImageUrl);
  await page.getByRole('button', { name: 'View image 2', exact: true }).click();
  await expect(page.locator('.product-main-image img')).toHaveAttribute('src', fixture.gallerySlots[1].url);
  await page.getByLabel('Choose size / color').selectOption('unapproved');
  await expect(page.locator('.product-price')).toHaveText('Price awaiting approval');
  await expect(page.getByRole('button', { name: 'Ordering disabled', exact: true })).toBeDisabled();
});

test('preview readiness and session failures give safe setup feedback without public fallback', async ({ page }) => {
  const { requests } = await mockCatalog(page, { role: 'admin', previewError: 503 });
  await page.goto(previewPath);
  await expect(page.getByRole('heading', { name: 'Staging preview unavailable' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('dedicated staging database');
  await expect(page.getByText(previewProduct.externalCatalogId, { exact: true })).toHaveCount(0);
  expect(requests.some((request) => request.path.startsWith('/public/products'))).toBe(false);
  await page.unroute('**/api/v1/**');
  const expired = await mockCatalog(page, { role: 'admin', previewError: 401 });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Administrator sign in' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute('href', /returnTo=/);
  await expect(page.getByText(previewProduct.externalCatalogId, { exact: true })).toHaveCount(0);
  expect(draftRequests(expired.requests)).toHaveLength(1);
  expect(expired.requests.filter(request => request.path === '/auth/me').length).toBeGreaterThanOrEqual(2);
  expect(expired.requests.some(request => request.path.startsWith('/public/products'))).toBe(false);
});

test('product table and editor link to authenticated previews of saved records', async ({ page }) => {
  const { requests } = await mockCatalog(page, { role: 'admin' });
  await page.goto('/admin/products?page=2');
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(20);
  const firstPreview = page.locator('.admin-product-actions a').filter({ hasText: 'Preview' }).first();
  await expect(firstPreview).toHaveAttribute('href', /\/admin\/products\/[^/]+\/preview$/);
  expect(requests.some((request) => request.path === '/admin/products' && request.params.page === '2' && request.params.limit === '20')).toBe(true);
  await page.goto(`/admin/products/${adminProduct._id}/edit`);
  await expect(page.getByRole('link', { name: 'Preview saved product', exact: true })).toHaveAttribute('href', previewPath);
  await page.getByRole('link', { name: 'Preview saved product', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review saved product' })).toBeVisible();
});

test('draft preview remains readable on phones, tablets and desktop with no page overflow', async ({ page }) => {
  await mockCatalog(page, { role: 'admin' });
  await page.goto(previewPath);
  await expect(page.getByRole('heading', { name: 'Review saved product' })).toBeVisible();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
    await expect(page.getByRole('link', { name: 'Edit product', exact: true })).toBeVisible();
  }
});
