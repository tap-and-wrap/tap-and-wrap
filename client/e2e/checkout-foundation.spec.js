import { chooseImageFiles } from './media-helpers.js';
import { test, expect } from '@playwright/test';
import { mockCommerce, cartWithProduct, commerceOrder, fillCheckout, isolatedImageFile } from './commerce-fixtures.js';

const headers = { 'Access-Control-Allow-Origin': 'http://127.0.0.1:5191', 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'content-type,x-csrf-token', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS' };
async function foundation(page, { role, loseFirst = false } = {}) {
  const fixture = await mockCommerce(page, { role, checkoutEnabled: true, cart: cartWithProduct() });
  const operations = [], submissions = [];
  const order = { ...structuredClone(commerceOrder), revision: 0, accountingVersion: 1, orderChannel: 'website', paymentState: 'unpaid', paymentMethod: 'cod',
    totals: { subtotalPiastres: 25000, discountPiastres: 0, shippingPiastres: null, totalPiastres: 25000, applied: [] },
    shipping: { id: 'shipping', state: 'pending', amountPiastres: null },
    accounting: { merchandisePiastres: 25000, merchandisePayablePiastres: 25000, agreedTotalPiastres: 25000, merchandiseCollectedPiastres: 0, collectedPiastres: 0, refundedPiastres: 0, outstandingPiastres: 25000, overpaymentPiastres: 0, unresolvedCharges: 1, settlements: [], charges: [{ id: 'shipping', kind: 'shipping', label: 'Delivery', state: 'pending', amountPiastres: null, pricing: 'quote_required', allowedPaymentMethods: [] }] },
    quotation: { text: 'Tap & Wrap | Order #681243\nMerchandise: EGP 250.00\nDelivery: Pending Confirmation', url: 'https://wa.me/201012345678?text=Isolated', deliveryConfirmed: false }, inventoryClaims: [{ kind: 'product', quantity: 1, mode: 'tracked' }] };
  const reply = (route, data, status = 200) => route.fulfill({ status, headers, json: status < 400 ? { ok: true, data } : { ok: false, error: data } });
  await page.route('**/api/v1/commerce/checkout/quote', async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    return reply(route, { totals: order.totals, fingerprint: 'fixture', expiresAt: new Date(Date.now() + 600000).toISOString() });
  });
  await page.route('**/api/v1/**/orders**', async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const path = new URL(route.request().url()).pathname.replace('/api/v1', ''), method = route.request().method();
    if (path === '/commerce/orders' && method === 'POST') {
      const body = route.request().postDataJSON(); submissions.push(body);
      order.paymentMethod = body.paymentMethod; order.paymentState = body.paymentMethod === 'instapay' ? 'awaiting_transfer' : 'unpaid';
      if (body.paymentMethod === 'instapay') order.paymentInstructions = { destination: '01060673073', amountPiastres: 25000, orderReference: order.orderNumber };
      if (loseFirst && submissions.length === 1) return route.abort('failed');
      return reply(route, { order });
    }
    if (path.endsWith('/accounting')) {
      const input = route.request().postDataJSON(); operations.push(input);
      if (input.revision !== order.revision) return reply(route, { code: 'ORDER_CHANGED', message: 'Reload order before saving.' }, 409);
      const charge = order.accounting.charges.find(entry => entry.id === input.chargeId);
      if (input.action === 'submit_proof') order.paymentState = 'awaiting_verification';
      if (input.action === 'quote_charge') Object.assign(charge, { state: 'offered', pricing: input.pricing, amountPiastres: input.amountPiastres, collectionMethod: input.collectionMethod });
      if (input.action === 'accept_charge') Object.assign(charge, { state: 'accepted', acceptanceChannel: 'whatsapp' });
      if (input.action === 'collection') { order.accounting.collectedPiastres += input.amountPiastres; order.accounting.settlements.push({ id: 'fixture-payment', direction: 'collection', scope: input.scope, amountPiastres: input.amountPiastres, method: input.method, reference: input.reference }); order.paymentState = 'paid'; }
      if (input.action === 'refund') { order.accounting.refundedPiastres += input.amountPiastres; order.accounting.settlements.push({ id: 'fixture-refund', direction: 'refund', allocations: input.allocations, amountPiastres: input.amountPiastres, method: input.method, reference: input.reference, refundOf: input.refundOf }); }
      order.revision++; return reply(route, { order });
    }
    if (path === `/commerce/orders/${order.id}` || path === `/admin/commerce/orders/${order.id}`) return reply(route, { order });
    return route.fallback();
  });
  return { ...fixture, order, operations, submissions };
}
test('COD mobile checkout shows merchandise-only amount and Pending Confirmation delivery', async ({ page }) => {
  const fixture = await foundation(page); const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/checkout'); await fillCheckout(page);
  await expect(page.getByText('Pending Confirmation', { exact: true })).toBeVisible();
  await expect(page.getByText('Price awaiting approval', { exact: true })).toHaveCount(0);
  await expect(page.locator('.commerce-total')).toContainText('250.00');
  await expect(page.getByText(/Payable now: EGP 0.00/)).toBeVisible();
  await page.setViewportSize({ width: 320, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/batch3-checkout-320.png', fullPage: true });
  await page.getByRole('button', { name: 'Place Order', exact: true }).click();
  await expect(page).toHaveURL(/\/orders\//); expect(fixture.submissions).toHaveLength(1);
  expect(fixture.uploads).toHaveLength(0); expect(fixture.submissions[0].paymentProofId).toBeUndefined();
  expect(errors).toEqual([]);
});
test('InstaPay creates order before revealing instructions or uploading order-bound proof', async ({ page }) => {
  const fixture = await foundation(page);
  await page.goto('/checkout'); await fillCheckout(page);
  await page.getByRole('radio', { name: /InstaPay/ }).check();
  await expect(page.getByText('01060673073', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel(/^InstaPay payment proof/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Place Order', exact: true }).click();
  await expect(page.getByText('01060673073', { exact: true })).toBeVisible();
  expect(fixture.submissions).toHaveLength(1); expect(fixture.uploads).toHaveLength(0);
  await chooseImageFiles(page, page, /^InstaPay payment proof/, isolatedImageFile());
  await page.getByRole('button', { name: 'Submit proof for this order', exact: true }).click();
  await expect(page.getByText('Proof submitted. Payment awaits account reconciliation.', { exact: true })).toBeVisible();
  expect(fixture.uploads[0].orderId).toBe(fixture.order.id);
  expect(fixture.operations[0].action).toBe('submit_proof'); expect(fixture.order.paymentState).toBe('awaiting_verification');
});
test('uncertain order response retries the identical order-first request without proof or second transfer', async ({ page }) => {
  const fixture = await foundation(page, { loseFirst: true });
  await page.goto('/checkout'); await fillCheckout(page);
  await page.getByRole('radio', { name: /InstaPay/ }).check();
  await page.getByRole('button', { name: 'Place Order', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry same submission' })).toBeVisible();
  await page.getByRole('button', { name: 'Retry same submission' }).click();
  await expect(page).toHaveURL(/\/orders\//);
  expect(fixture.submissions[0]).toEqual(fixture.submissions[1]); expect(fixture.uploads).toHaveLength(0);
});
test('admin quotes shipping, opens saved WhatsApp text and records explicit acceptance and real collection', async ({ page }) => {
  const fixture = await foundation(page, { role: 'admin' });
  await page.goto(`/admin/commerce/orders/${fixture.order.id}`);
  await page.getByText('Saved WhatsApp quotation', { exact: true }).click();
  await expect(page.getByRole('link', { name: 'Open prefilled WhatsApp quotation' })).toHaveAttribute('href', /^https:\/\/wa.me\//);
  await page.getByLabel('Actual amount (EGP)', { exact: true }).fill('90');
  await page.getByRole('button', { name: 'Record operation', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Review order operation' })).toBeVisible();
  expect(fixture.operations).toHaveLength(0);
  await page.getByRole('button', { name: 'Keep editing', exact: true }).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Close review order operation' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Record operation', exact: true })).toBeFocused();
  expect(fixture.operations).toHaveLength(0);
  await page.getByRole('button', { name: 'Record operation', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm and record operation', exact: true }).click();
  await expect.poll(() => fixture.order.revision).toBe(1);
  await page.getByRole('combobox', { name: 'Operation', exact: true }).selectOption('accept_charge');
  await page.getByLabel('Private reconciliation / WhatsApp acceptance evidence', { exact: true }).fill('Customer accepted EGP 90 by WhatsApp');
  await page.getByRole('checkbox', { name: /I confirmed the actual account/ }).check();
  await page.getByRole('button', { name: 'Record operation', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm and record operation', exact: true }).click();
  await expect.poll(() => fixture.order.revision).toBe(2);
  expect(fixture.operations[1].customerConfirmed).toBe(true);
  expect(fixture.order.totals.shippingPiastres).toBeNull();
  await page.setViewportSize({ width: 320, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('admin records one completed transfer with merchandise and delivery refund allocations on mobile', async ({ page }) => {
  const fixture = await foundation(page, { role: 'admin' });
  Object.assign(fixture.order.accounting, { collectedPiastres: 54000, merchandisePiastres: 45000, settlements: [{ id: 'fixture-combined', direction: 'collection', scope: 'all_agreed', method: 'cod', reference: 'ACTUAL-COLLECTION', amountPiastres: 54000, allocations: [{ scope: 'merchandise', amountPiastres: 45000 }, { scope: 'shipping', amountPiastres: 9000 }] }] });
  await page.setViewportSize({ width: 320, height: 900 }); await page.goto(`/admin/commerce/orders/${fixture.order.id}`);
  await page.getByRole('combobox', { name: 'Operation', exact: true }).selectOption('refund');
  await page.getByRole('combobox', { name: 'Original collection', exact: true }).selectOption('fixture-combined');
  await expect(page.getByLabel('Actual amount (EGP)', { exact: true })).toHaveValue('540.00');
  await expect(page.getByLabel(/^Original merchandise refund/)).toHaveValue('450.00');
  await expect(page.getByLabel(/^Delivery refund/)).toHaveValue('90.00');
  await page.getByRole('combobox', { name: 'Collection/payment method', exact: true }).selectOption('instapay');
  await page.getByLabel('Actual bank transfer or COD collection reference', { exact: true }).fill('ONE-REAL-REFUND');
  await page.getByLabel('Private reconciliation / WhatsApp acceptance evidence', { exact: true }).fill('Completed actual combined refund reconciled independently');
  await page.getByRole('checkbox', { name: /I confirmed the actual account/ }).check();
  await page.getByLabel(/^Delivery refund/).fill('80');
  await page.getByRole('button', { name: 'Record operation', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm and record operation', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Refund allocations must equal the actual transfer amount'); expect(fixture.operations).toHaveLength(0);
  await page.getByLabel(/^Delivery refund/).fill('90');
  await page.getByRole('button', { name: 'Record operation', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm and record operation', exact: true }).click();
  await expect.poll(() => fixture.operations.length).toBe(1);
  expect(fixture.operations[0]).toMatchObject({ action: 'refund', reference: 'ONE-REAL-REFUND', refundOf: 'fixture-combined', amountPiastres: 54000, allocations: [{ scope: 'merchandise', amountPiastres: 45000 }, { scope: 'shipping', amountPiastres: 9000 }] });
  await expect(page.getByText('Operation recorded. Financial history is preserved.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
