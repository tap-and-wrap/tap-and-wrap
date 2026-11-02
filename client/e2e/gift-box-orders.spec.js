import { expect, test } from '@playwright/test';
import { commerceOrder, commerceProduct, mockCommerce } from './commerce-fixtures.js';

const message = 'Private purchased message <b>literal text</b> 🌹';
function giftBoxSnapshot({ admin = false } = {}) {
  const components = [
    ['box-2', 'box', 'Purchased Box Two', 1, 20000, 'tracked'],
    ['rose-red', 'flower', 'Purchased Red Rose', 3, 3000, 'tracked'],
    ['plush-1', 'plush', 'Purchased Plush One', 1, 50000, 'made_to_order'],
    ['chocolate-1', 'chocolate', 'Purchased Chocolate One', 1, 10000, 'tracked'],
    ['ribbon-navy', 'ribbon', 'Purchased Navy Ribbon', 1, 5000, 'status_only'],
    ['gift-card-1', 'gift_card', 'Purchased Gift Card', 1, 5000, 'tracked'],
  ].map(([componentId, category, displayName, quantityPerBox, unitPricePiastres, mode]) => ({ componentId, category, displayName, quantityPerBox,
    quantityForLine: quantityPerBox * 2, unitPricePiastres, perBoxSubtotalPiastres: quantityPerBox * unitPricePiastres,
    lineSubtotalPiastres: quantityPerBox * unitPricePiastres * 2,
    ...(admin ? { settingsRevision: 4, priceApproval: 'paid', priceApprovedAt: '2026-10-28T08:00:00Z',
      inventory: { owner: 'GiftBoxComponentSetting', mode, requiredQuantity: quantityPerBox * 2, trackedDemand: mode === 'tracked' ? quantityPerBox * 2 : 0 } } : {}) }));
  return { snapshotVersion: 'gift-box-order-v1', components,
    box: components[0], ribbon: { ...components[4], colorHex: '#203356' }, giftCard: { selected: true, message }, artwork: { status: 'historical_unavailable' },
    ...(admin ? { fulfillment: { policyReference: { policyId: 'synthetic-order-policy', policyVersion: 'fixture-v1', approvedAt: '2026-10-28T08:00:00Z' } },
      configuration: { catalogVersion: 'gift-box-v2.3', assetVersion: '2026-10-28.2', geometryVersion: 'gift-box-geometry-v1-draft', draftGeometryVersion: 'gift-box-photo-study-2026-10-28.1',
        placements: [{ instanceId: '10000000-0000-4000-8000-000000000001', componentId: 'rose-red', x: .3, y: .4, zone: 'inside', regionId: 'synthetic-inside', layer: 0 }] } } : {}) };
}
function mixedOrder(admin = false) {
  return { ...commerceOrder, accountingVersion: 1, orderChannel: 'website', paymentMethod: 'instapay', paymentState: 'awaiting_transfer', canCancel: false,
    allowedPaymentMethods: ['instapay'], lines: [...commerceOrder.lines,
      { kind: 'gift_box_v2', name: 'Build Your Gift Box', quantity: 2, unitPricePiastres: 99000, lineTotalPiastres: 198000, giftBox: giftBoxSnapshot({ admin }) }],
    totals: { subtotalPiastres: 223000, discountPiastres: 0, shippingPiastres: null, totalPiastres: 223000 },
    shipping: { state: 'pending_confirmation', amountPiastres: null },
    accounting: { merchandisePiastres: 223000, agreedTotalPiastres: 223000, collectedPiastres: 0, refundedPiastres: 0,
      outstandingPiastres: 223000, overpaymentPiastres: 0, charges: [], settlements: [], unresolvedCharges: 1 } };
}
const errors = new WeakMap();
test.beforeEach(({ page }) => { const collected = []; errors.set(page, collected); page.on('pageerror', error => collected.push(error.message)); });
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));

for (const width of [320, 390, 768, 1440]) test(`customer purchased mixed order uses immutable gift details and private literal message at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 1000 });
  const fixture = await mockCommerce(page, { order: mixedOrder(), role: 'customer' });
  await page.goto(`/orders/${commerceOrder.id}`);
  const gift = page.getByRole('article', { name: 'Build Your Gift Box', exact: true });
  await expect(gift.getByRole('heading', { name: 'Build Your Gift Box' })).toBeVisible();
  await expect(page.getByRole('heading', { name: commerceProduct.name })).toBeVisible();
  for (const text of ['Completed gift boxes: 2', 'Purchased Red Rose × 3', 'Purchased Plush One × 1', 'Purchased Chocolate One × 1', 'Gift box preview unavailable']) await expect(gift.getByText(text, { exact: true })).toBeVisible();
  await expect(gift.getByRole('definition').filter({ hasText: 'Purchased Box Two' })).toBeVisible();
  await expect(gift.getByRole('definition').filter({ hasText: 'Purchased Navy Ribbon' })).toBeVisible();
  await expect(gift.getByText(message, { exact: true })).toBeHidden();
  await gift.getByText('View gift-card message', { exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(gift.getByText(message, { exact: true })).toBeVisible(); await expect(gift.locator('b')).toHaveCount(0);
  await page.keyboard.press('Enter'); await expect(gift.getByText(message, { exact: true })).toBeHidden();
  await gift.getByText('Component prices at purchase', { exact: true }).click();
  await expect(gift.getByText('3 × EGP 30.00 = EGP 90.00 per box', { exact: true })).toBeVisible();
  await expect(gift.getByText('6 units · EGP 180.00 for this order line', { exact: true })).toBeVisible();
  await expect(gift.getByText('Saved arrangement and fulfillment policy')).toHaveCount(0);
  await expect(gift.locator('img')).toHaveCount(0);
  await expect(page.getByText('Pending Confirmation', { exact: true })).toBeVisible();
  await expect(page.getByText('EGP 2,230.00', { exact: true }).first()).toBeVisible();
  expect(fixture.calls.filter(call => ['POST', 'PATCH', 'DELETE'].includes(call.method))).toHaveLength(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: info.outputPath(`customer-gift-order-${width}.png`), fullPage: true });
});

for (const width of [320, 390, 768, 1440]) test(`admin purchased mixed order shows saved source modes and arrangement at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 1000 });
  const fixture = await mockCommerce(page, { order: mixedOrder(true), role: 'admin' });
  await page.goto(`/admin/commerce/orders/${commerceOrder.id}`);
  const gift = page.getByRole('article', { name: 'Build Your Gift Box', exact: true });
  await expect(gift.getByRole('heading', { name: 'Build Your Gift Box' })).toBeVisible();
  await gift.getByText('Component prices at purchase', { exact: true }).click();
  await expect(gift.getByText('Inventory: GiftBoxComponentSetting · Tracked · 6 required · 6 consumed', { exact: true })).toBeVisible();
  await expect(gift.getByText('Inventory: GiftBoxComponentSetting · Made to Order · 2 required · no numeric stock consumed', { exact: true })).toBeVisible();
  await expect(gift.getByText('Inventory: GiftBoxComponentSetting · Status only · 2 required · no numeric stock consumed', { exact: true })).toBeVisible();
  await gift.getByText('Saved arrangement and fulfillment policy', { exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(gift.getByText('synthetic-order-policy · fixture-v1', { exact: true })).toBeVisible();
  await expect(gift.getByText('Purchased Red Rose: inside · region synthetic-inside · x 0.3, y 0.4 · layer 0', { exact: true })).toBeVisible();
  await expect(gift.getByText(/They do not certify physical fit/)).toBeVisible();
  await expect(gift.getByText(message, { exact: true })).toBeHidden();
  expect(fixture.calls.filter(call => call.path.includes('/proof') || call.path.includes('/files/'))).toHaveLength(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: info.outputPath(`admin-gift-order-${width}.png`), fullPage: true });
});

test('admin inspected return can restore tracked builder units and submits zero for Made-to-Order and ribbon sources', async ({ page }) => {
  const order = { ...mixedOrder(true), fulfillmentState: 'returned', inventoryClaims: [
    { sourceId: 'rose-red', kind: 'gift_box_component', label: 'Purchased red roses', mode: 'tracked', quantity: 6, consumedQuantity: 6 },
    { sourceId: 'plush-1', kind: 'gift_box_component', label: 'Purchased plush', mode: 'made_to_order', quantity: 2, consumedQuantity: 0 },
    { sourceId: 'ribbon-navy', kind: 'gift_box_component', label: 'Purchased ribbon', mode: 'status_only', quantity: 2, consumedQuantity: 0 },
  ] };
  await mockCommerce(page, { order, role: 'admin' });
  const submitted = [];
  await page.route(`**/api/v1/admin/commerce/orders/${order.id}/accounting`, route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: {
      'access-control-allow-origin': 'http://127.0.0.1:5191', 'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'content-type,x-csrf-token,x-tracking-consent', 'access-control-allow-methods': 'POST,OPTIONS',
    } });
    submitted.push(route.request().postDataJSON());
    return route.fulfill({ json: { ok: true, data: { order } }, headers: { 'access-control-allow-origin': 'http://127.0.0.1:5191', 'access-control-allow-credentials': 'true' } });
  });
  await page.goto(`/admin/commerce/orders/${order.id}`);
  await page.getByRole('combobox', { name: 'Operation', exact: true }).selectOption('inventory_return');
  await page.getByRole('spinbutton', { name: /Inspected resellable units: Purchased red roses/ }).fill('2');
  for (const name of ['Purchased plush', 'Purchased ribbon']) {
    const input = page.getByRole('spinbutton', { name: new RegExp(`Inspected resellable units: ${name}`) });
    await expect(input).toBeDisabled(); await expect(input).toHaveValue('0'); await expect(input).toHaveAttribute('max', '0');
  }
  await page.getByLabel('Private reconciliation / WhatsApp acceptance evidence', { exact: true }).fill('Synthetic inspected return; only two roses can be resold.');
  await page.getByRole('checkbox', { name: /I confirmed the actual account transaction/ }).check();
  await page.getByRole('button', { name: 'Record operation', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm and record operation', exact: true }).click();
  await expect.poll(() => submitted.length).toBe(1);
  expect(submitted[0]).toMatchObject({ action: 'inventory_return', inspected: true, quantities: [2, 0, 0] });
});
