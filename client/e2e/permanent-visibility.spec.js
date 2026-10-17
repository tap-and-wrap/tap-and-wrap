import { test, expect } from '@playwright/test';
import { mockCommerce, commerceProduct } from './commerce-fixtures.js';
import { mockCatalog, adminProduct } from './catalog-fixtures.js';
import { publicProductDetail } from '../../server/src/catalog/public-presentation.js';

function product(patch = {}) {
  return publicProductDetail({ ...commerceProduct, visibility: 'public', status: 'ready', published: true, reviewRequired: false,
    publicPath: '/products/permanent-gift', categoryId: commerceProduct.category, mainImageKey: 'fixtures/gift.webp', galleryKeys: [],
    inventory: { mode: 'tracked', quantity: 2, approved: true, available: true }, ...patch });
}

test('confirmed prices remain visible with WhatsApp-only unavailable products on desktop, tablet and mobile', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const fixture = await mockCommerce(page, { checkoutEnabled: true, product: product({ inventory: { mode: 'tracked', quantity: 0, approved: true, available: true } }) });
  for (const width of [1440, 768, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/products/permanent-gift');
    await expect(page.locator('.product-price')).toContainText('250.00');
    await expect(page.getByRole('link', { name: 'Enquire on WhatsApp', exact: true }).first()).toHaveAttribute('href', /permanent-gift/);
    await expect(page.getByRole('button', { name: 'Add to Cart', exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    if (width === 320) await page.screenshot({ path: 'test-results/batch1-product-320.png', fullPage: true });
  }
  expect(fixture.calls.some(call => call.path === '/commerce/cart/items' && call.method === 'POST')).toBe(false);
  expect(errors).toEqual([]);
});

test('approved draft price is displayed but an unapproved amount is never disclosed', async ({ page }) => {
  await mockCommerce(page, { checkoutEnabled: true, product: product({ status: 'draft', published: false }) });
  await page.goto('/products/permanent-gift');
  await expect(page.locator('.product-price')).toContainText('250.00');
  await expect(page.getByRole('link', { name: 'Enquire on WhatsApp', exact: true }).first()).toBeVisible();
  await page.unroute('**/api/v1/**');
  await mockCommerce(page, { checkoutEnabled: true, product: product({ priceApproved: false, pricePiastres: 987654321 }) });
  await page.reload();
  await expect(page.locator('.product-price')).toHaveText('Price on request');
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('9876543');
});

test('variant stock and Made by Request control the actual selected purchase option', async ({ page }) => {
  await mockCommerce(page, { checkoutEnabled: true, product: product({ variants: [
    { key: 'empty', attributes: [{ name: 'Size', value: 'Small' }], pricePiastres: 10000, priceApproved: true, inventory: { mode: 'tracked', quantity: 0, approved: true, available: true } },
    { key: 'made', attributes: [{ name: 'Size', value: 'Large' }], pricePiastres: 20000, priceApproved: true, inventory: { mode: 'made_to_order', quantity: null, approved: true, available: true } },
  ] }) });
  await page.goto('/products/permanent-gift');
  await page.getByLabel('Choose size / color').selectOption('empty');
  await expect(page.locator('.product-price')).toContainText('100.00');
  await expect(page.getByRole('button', { name: 'Add to Cart', exact: true })).toHaveCount(0);
  await page.getByLabel('Choose size / color').selectOption('made');
  await expect(page.locator('.product-price')).toContainText('200.00');
  await expect(page.locator('.product-stock-status')).toHaveText('Made by Request');
  await expect(page.getByRole('button', { name: 'Add to Cart', exact: true })).toBeEnabled();
});

test('admin approves display without confirming imported placeholder stock or changing permanent identities', async ({ page }) => {
  const fixture = await mockCatalog(page, { role: 'admin', adminProduct: { ...adminProduct, visibility: 'hidden', pricePiastres: null, compareAtPiastres: null, priceApproved: false, inventory: { mode: 'tracked', quantity: 10, approved: false, available: true } } });
  await page.goto(`/admin/products/${adminProduct._id}/edit`);
  for (const width of [1440, 768, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole('combobox', { name: 'Public display', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.screenshot({ path: 'test-results/batch1-admin-320.png', fullPage: true });
  await page.getByRole('combobox', { name: 'Public display', exact: true }).selectOption('public');
  await page.getByRole('textbox', { name: /^Price \(EGP\)/ }).fill('123.45');
  await expect(page.getByLabel('Product quantity', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect.poll(() => fixture.saves.length).toBe(1);
  const payload = fixture.saves[0].payload;
  expect(payload.visibility).toBe('public'); expect(payload.pricePiastres).toBe(12345);
  expect(payload.priceApproved).toBe(true); expect(payload.inventory.approved).toBe(false);
  expect(payload.inventory.quantity).toBe(10); expect(payload.slug).toBe(adminProduct.slug);
  expect(payload.expectedRevision).toBe(0);
});


test('unpriced public draft and hold products retain names, canonical WhatsApp enquiries and image previews', async ({ page }) => {
  for (const status of ['draft', 'hold']) {
    const p = product({ name: 'Inherited ' + status + ' gift', status, reviewRequired: status === 'hold', published: false, priceApproved: false, pricePiastres: null,
      inventory: { mode: 'tracked', quantity: 10, approved: false, available: true } });
    p.mainImageUrl = 'https://fixture.invalid/inherited.svg'; p.galleryUrls = [p.mainImageUrl];
    await mockCommerce(page, { checkoutEnabled: false, product: p });
    await page.route('https://fixture.invalid/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="white"/></svg>' }));
    await page.goto('/products/permanent-gift');
    await expect(page.getByRole('heading', { name: p.name, exact: true })).toBeVisible();
    await expect(page.locator('.product-price')).toHaveText('Price on request');
    const enquiry = page.getByRole('link', { name: 'Enquire on WhatsApp', exact: true }).first();
    const url = new URL(await enquiry.getAttribute('href'));
    expect(url.searchParams.get('text')).toContain(p.name);
    expect(url.searchParams.get('text')).toContain('https://tapandwrap.net/products/permanent-gift');
    await expect(page.getByRole('button', { name: 'Add to Cart', exact: true })).toHaveCount(0);
    await expect.poll(() => page.locator('.product-gallery img').first().evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
    await page.unroute('**/api/v1/**');
  }
});


test('homepage fallback and Shop render unpriced public Draft and Hold cards without owner picks', async ({ page }) => {
  await mockCatalog(page);
  const products = ['draft', 'hold'].map((status, index) => ({ ...product({ name: 'Browse ' + status + ' gift', status, reviewRequired: status === 'hold', published: false, priceApproved: false }),
    _id: String(index + 900).padStart(24, '0'), slug: 'browse-' + status, publicPath: '/products/browse-' + status, bestSeller: false,
    mainImageUrl: 'https://fixture.invalid/browse.svg' }));
  await page.route('**/api/v1/public/products?*', route => {
    const url = new URL(route.request().url()), rows = url.searchParams.get('bestSeller') === 'true' ? [] : products;
    return route.fulfill({ json: { ok: true, data: { products: rows, pagination: { page: 1, limit: 20, total: rows.length, pages: rows.length ? 1 : 0 }, priceRange: { min: null, max: null } } } });
  });
  for (const path of ['/', '/shop']) {
    await page.goto(path);
    const grid = page.locator(path === '/' ? '.home-product-grid' : '.catalog-grid').first();
    await expect(grid.locator('.catalog-card')).toHaveCount(2);
    for (const p of products) {
      const card = grid.locator('.catalog-card').filter({ has: page.getByRole('heading', { name: p.name, exact: true }) });
      await expect(card).toContainText('Price on request');
      const enquiry = card.getByRole('link', { name: 'Enquire on WhatsApp about ' + p.name });
      const url = new URL(await enquiry.getAttribute('href'));
      expect(url.searchParams.get('text')).toContain(p.name); expect(url.searchParams.get('text')).toContain('https://tapandwrap.net' + p.publicPath);
      await expect(card.getByRole('button', { name: /Add to Cart/ })).toHaveCount(0);
      await card.scrollIntoViewIfNeeded(); await expect.poll(() => card.locator('img').evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
    }
  }
});
