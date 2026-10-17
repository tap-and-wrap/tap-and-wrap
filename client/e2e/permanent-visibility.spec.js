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
