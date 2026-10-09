import { test, expect } from '@playwright/test';
import { mockCommerce, cartWithProduct, commerceOrder, commerceProduct, fillCheckout, isolatedImageFile } from './commerce-fixtures.js';

test('restricted session storage cannot block checkout or hide an accepted order after cart refresh fails', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'sessionStorage', { get() { throw new DOMException('Synthetic restricted storage.', 'SecurityError'); } }));
  const fixture = await mockCommerce(page, { checkoutEnabled: true, cart: cartWithProduct(), failCartRefreshAfterOrder: true });
  await page.goto('/checkout'); await fillCheckout(page);
  await page.getByRole('button', { name: 'Place Order', exact: true }).click();
  await expect(page.getByRole('heading', { name: `Order #${commerceOrder.orderNumber}`, exact: true })).toBeVisible();
  expect(fixture.orders).toHaveLength(1);
  expect(fixture.calls.filter(call => call.path === '/commerce/orders' && call.method === 'POST')).toHaveLength(1);
});

test('lost accepted InstaPay response survives refresh and resolves by owned key without reupload or another order', async ({ page }) => {
  const fixture = await mockCommerce(page, { checkoutEnabled: true, cart: cartWithProduct(), loseFirstOrderResponse: true });
  await page.goto('/checkout'); await fillCheckout(page);
  await page.getByLabel('InstaPay — full payment', { exact: true }).check();
  await page.getByLabel('InstaPay payment proof', { exact: false }).setInputFiles(isolatedImageFile('synthetic-proof.png'));
  await page.getByRole('button', { name: 'Place Order', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Check your order submission' })).toBeVisible();
  expect(fixture.orders).toHaveLength(1); expect(fixture.uploads).toHaveLength(1);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Check your order submission' })).toBeVisible();
  await page.getByRole('button', { name: 'Check submission status', exact: true }).click();
  await expect(page.getByRole('heading', { name: `Order #${commerceOrder.orderNumber}`, exact: true })).toBeVisible();
  expect(fixture.calls.filter(call => call.path === '/commerce/orders' && call.method === 'POST')).toHaveLength(1);
  expect(fixture.uploads).toHaveLength(1);
});

test('unconfirmed submission retains immutable retry payload and a null status never starts a new order automatically', async ({ page }) => {
  const options = { checkoutEnabled: true, cart: cartWithProduct(), rejectOrder: true };
  const fixture = await mockCommerce(page, options);
  await page.goto('/checkout'); await fillCheckout(page);
  await page.getByRole('button', { name: 'Place Order', exact: true }).click();
  await expect(page.getByLabel('Full name', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Check submission status', exact: true }).click();
  await expect(page.getByText(/An earlier request may still be processing/)).toBeVisible();
  expect(fixture.calls.filter(call => call.path === '/commerce/orders' && call.method === 'POST')).toHaveLength(1);
  options.rejectOrder = false;
  await page.getByRole('button', { name: 'Retry same submission', exact: true }).click();
  await expect(page.getByRole('heading', { name: `Order #${commerceOrder.orderNumber}`, exact: true })).toBeVisible();
  const requests = fixture.calls.filter(call => call.path === '/commerce/orders' && call.method === 'POST');
  expect(requests).toHaveLength(2); expect(requests[0].body).toEqual(requests[1].body); expect(fixture.orders).toHaveLength(1);
});

test('direct private upload has a bounded deadline, is discarded, and never adds an incomplete item', async ({ page }) => {
  const product = { ...commerceProduct, requiresOptions: true, personalization: { fields: [{ key: 'photo', label: 'Private photo', type: 'image', required: true, minFiles: 1, maxFiles: 1 }] } };
  const fixture = await mockCommerce(page, { product });
  let pending;
  await page.route('https://private-upload.example.test/**', route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': 'http://127.0.0.1:5191', 'access-control-allow-methods': 'PUT,OPTIONS', 'access-control-allow-headers': 'content-type' } });
    pending = route;
  });
  await page.goto(`/products/${product.slug}`);
  await page.clock.install();
  await page.getByLabel('Private photo', { exact: false }).setInputFiles(isolatedImageFile());
  await page.getByRole('button', { name: 'Add to Cart', exact: true }).first().click();
  await expect.poll(() => Boolean(pending)).toBe(true);
  await page.clock.runFor(60_100);
  await expect(page.getByText(/private upload timed out/).first()).toBeVisible();
  await expect.poll(() => fixture.calls.some(call => call.method === 'DELETE' && call.path.startsWith('/commerce/uploads/'))).toBe(true);
  expect(fixture.calls.filter(call => call.path === '/commerce/cart/items')).toHaveLength(0);
  expect(fixture.state.cart.items).toHaveLength(0);
  await pending.abort().catch(() => {});
});

test('expired cart attachments expose replacement guidance without private keys and disable checkout', async ({ page }) => {
  const cart = cartWithProduct();
  Object.assign(cart.items[0], { valid: false, error: 'Private files are no longer available.', attachments: { status: 'unavailable', replacementRequired: true, fieldKeys: ['photo'], expiresAt: null } });
  await mockCommerce(page, { cart, checkoutEnabled: true }); await page.goto('/cart');
  await expect(page.getByRole('link', { name: 'Review product and replace files' })).toHaveAttribute('href', `/products/${commerceProduct.slug}`);
  await expect(page.getByRole('button', { name: 'Checkout unavailable' })).toBeDisabled();
});

test('rejected proof displays only explicit customer guidance and offers no unapproved replacement or refund transition', async ({ page }) => {
  await mockCommerce(page, { order: { ...commerceOrder, paymentMethod: 'instapay', paymentState: 'rejected', canCancel: false, paymentAttention: { code: 'PAYMENT_PROOF_REJECTED', message: 'Contact the store before making another transfer.', publicReason: 'Synthetic public explanation.', receiptReplacementEnabled: false } } });
  await page.goto(`/orders/${commerceOrder.id}`);
  await expect(page.getByRole('heading', { name: 'Payment requires attention' })).toBeVisible();
  await expect(page.getByText('Synthetic public explanation.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Contact the store about this order' })).toHaveAttribute('href', '/contact');
  await expect(page.getByRole('button', { name: /replace.*proof|refund/i })).toHaveCount(0);
});

test('rotating the guest cart identity clears only the old opaque checkout marker from the new guest interface', async ({ page }) => {
  const options = { checkoutEnabled: true, cart: cartWithProduct(), rejectOrder: true };
  const fixture = await mockCommerce(page, options);
  await page.goto('/checkout'); await fillCheckout(page);
  await page.getByRole('button', { name: 'Place Order', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Check your order submission' })).toBeVisible();
  const oldKey = fixture.calls.find(call => call.path === '/commerce/orders' && call.method === 'POST').body.checkoutKey;
  options.guestOwnerKey = 'a'.repeat(64); options.rejectOrder = false;
  await page.reload(); await fillCheckout(page);
  await expect(page.getByRole('heading', { name: 'Check your order submission' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Place Order', exact: true }).click();
  await expect(page.getByRole('heading', { name: `Order #${commerceOrder.orderNumber}`, exact: true })).toBeVisible();
  const requests = fixture.calls.filter(call => call.path === '/commerce/orders' && call.method === 'POST');
  expect(requests).toHaveLength(2); expect(requests[1].body.checkoutKey).not.toBe(oldKey);
});
