import { expect, test } from '@playwright/test';
import { giftBoxFixture, beginGiftBox } from './gift-box-fixtures.js';
import { cartWithProduct, fillCheckout } from './commerce-fixtures.js';

// Isolated browser journey. All /api/v1 requests are Playwright fixtures;
// no production endpoint, DB, payment provider or real order is contacted.
const headers = {
  'access-control-allow-origin': 'http://127.0.0.1:5191',
  'access-control-allow-credentials': 'true',
  'access-control-allow-headers': 'content-type,x-csrf-token,x-tracking-consent',
  'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS',
};
const reply = (route, data, status = 200) => route.fulfill({ status, headers,
  contentType: 'application/json', body: JSON.stringify({ ok: true, data }) });
const failed = (route, code, message) => route.fulfill({ status: 409, headers,
  contentType: 'application/json', body: JSON.stringify({ ok: false, error: { code, message } }) });
const isOptions = route => route.request().method() === 'OPTIONS';
const ensureLocal = route => expect(new URL(route.request().url()).hostname).toBe('127.0.0.1');

async function localCheckoutFixture(page, { initialCart, rejectAdd = false } = {}) {
  const fixture = await giftBoxFixture(page, {
    directCommerceEnabled: true, checkoutEnabled: true,
    ...(initialCart ? { cart: initialCart } : {}),
  });
  const audit = { adds: [], quotes: [], orders: [] };
  const savedConfigurations = new Map();
  const lookup = id => fixture.components.find(component => component.componentId === id);
  let created = null;
  await page.route('**/api/v1/commerce/cart/items', async route => {
    ensureLocal(route);
    if (isOptions(route)) return route.fulfill({ status: 204, headers });
    const body = route.request().postDataJSON(); audit.adds.push(body);
    expect(body.kind).toBe('gift_box_v2');
    expect(body.operationKey).toMatch(/^[0-9a-f-]{36}$/i);
    expect(body.quantity).toBe(1);
    expect(JSON.stringify(body)).not.toMatch(/pricePiastres|approvedBy|inventoryQuantity|physicalFitApproved/);
    if (rejectAdd) return failed(route, 'GIFT_BOX_COMPONENT_UNAVAILABLE', 'An approved gift component is no longer available.');
    const { selection } = body.configuration;
    expect(selection.boxId).toBe('box-2');
    const selected = [{ componentId: selection.boxId, quantity: 1 },
      ...selection.items,
      ...(selection.ribbonId ? [{ componentId: selection.ribbonId, quantity: 1 }] : []),
      ...(selection.giftCard ? [{ componentId: selection.giftCard.componentId, quantity: 1 }] : [])];
    const amount = selected.reduce((value, item) => {
      const component = lookup(item.componentId);
      expect(component?.availableForEstimate).toBe(true);
      expect(Number.isSafeInteger(component.pricePiastres)).toBe(true);
      return value + component.pricePiastres * item.quantity;
    }, 0);
    const summary = {
      box: { componentId: selection.boxId, displayName: lookup(selection.boxId).displayName },
      items: selection.items.map(item => ({ ...item, category: lookup(item.componentId).category,
        displayName: lookup(item.componentId).displayName })),
      ribbon: selection.ribbonId ? { componentId: selection.ribbonId,
        displayName: lookup(selection.ribbonId).displayName,
        colorHex: lookup(selection.ribbonId).approvedColorHex } : null,
      giftCard: selection.giftCard ? { selected: true, message: selection.giftCard.message } : { selected: false },
      artwork: { status: 'unavailable' },
    };
    const line = { id: '10000000-0000-4000-8000-000000000099', kind: 'gift_box_v2',
      name: 'Build Your Gift Box', quantity: 1, valid: true, checkoutAllowed: true,
      unitPricePiastres: amount, lineTotalPiastres: amount, giftBox: summary };
    savedConfigurations.set(line.id, structuredClone(body.configuration));
    fixture.state.cart.items.push(line);
    fixture.state.cart.quantity = fixture.state.cart.items.reduce((n, item) => n + item.quantity, 0);
    fixture.state.cart.subtotalPiastres = fixture.state.cart.items.reduce((n, item) => n + item.lineTotalPiastres, 0);
    return reply(route, { cart: fixture.state.cart });
  });
  await page.route('**/api/v1/commerce/checkout/quote', async route => {
    ensureLocal(route);
    if (isOptions(route)) return route.fulfill({ status: 204, headers });
    const body = route.request().postDataJSON(); audit.quotes.push(body);
    expect(body.paymentMethod).toBe('instapay');
    expect(body.governorate).toBe('cairo');
    const total = fixture.state.cart.subtotalPiastres;
    return reply(route, { subtotalPiastres: total, discountPiastres: 0,
      shippingPiastres: null, totalPiastres: total, shippingStatus: 'pending_confirmation' });
  });
  // The cart DTO and immutable *order* DTO have different shapes. Emulate the
  // server's public order projection instead of copying a cart summary to an order.
  // The real snapshot and transaction contracts are tested in server/test.
  function presentedOrderLine(line) {
    if (line.kind !== 'gift_box_v2') return structuredClone(line);
    const configuration = savedConfigurations.get(line.id);
    expect(configuration).toBeTruthy();
    const selection = configuration.selection;
    const selected = [
      { componentId: selection.boxId, quantity: 1 },
      ...selection.items,
      ...(selection.ribbonId ? [{ componentId: selection.ribbonId, quantity: 1 }] : []),
      ...(selection.giftCard ? [{ componentId: selection.giftCard.componentId, quantity: 1 }] : []),
    ];
    const components = selected.map(({ componentId, quantity }) => {
      const setting = lookup(componentId);
      expect(setting).toBeTruthy();
      const quantityForLine = quantity * line.quantity;
      return {
        componentId, category: setting.category, displayName: setting.displayName,
        quantityPerBox: quantity, quantityForLine,
        unitPricePiastres: setting.pricePiastres,
        perBoxSubtotalPiastres: setting.pricePiastres * quantity,
        lineSubtotalPiastres: setting.pricePiastres * quantityForLine,
      };
    });
    expect(components.reduce((sum, part) => sum + part.lineSubtotalPiastres, 0)).toBe(line.lineTotalPiastres);
    const box = components.find(part => part.category === 'box');
    const ribbon = components.find(part => part.category === 'ribbon');
    return { ...structuredClone(line), giftBox: {
      snapshotVersion: 'gift-box-order-v1',
      box: { componentId: box.componentId, displayName: box.displayName,
        quantityPerBox: 1, quantityForLine: line.quantity },
      items: components.filter(part => ['flower', 'plush', 'chocolate'].includes(part.category))
        .map(({ componentId, category, displayName, quantityPerBox, quantityForLine }) =>
          ({ componentId, category, displayName, quantityPerBox, quantityForLine })),
      ribbon: ribbon ? { componentId: ribbon.componentId, displayName: ribbon.displayName,
        quantityPerBox: 1, quantityForLine: line.quantity,
        colorHex: lookup(ribbon.componentId).approvedColorHex } : null,
      giftCard: selection.giftCard ? { selected: true, message: selection.giftCard.message } : { selected: false },
      components, artwork: { status: 'unavailable' },
    } };
  }
  await page.route('**/api/v1/commerce/orders', async route => {
    ensureLocal(route);
    if (isOptions(route)) return route.fulfill({ status: 204, headers });
    const body = route.request().postDataJSON(); audit.orders.push(body);
    expect(body.paymentMethod).toBe('instapay');
    expect(body.customer.governorate).toBe('cairo');
    if (!created) {
      const subtotal = fixture.state.cart.subtotalPiastres;
      created = { ...fixture.state.order, lines: fixture.state.cart.items.map(presentedOrderLine),
        accountingVersion: 1, personalized: true, orderChannel: 'website',
        paymentMethod: 'instapay', paymentState: 'awaiting_transfer',
        allowedPaymentMethods: ['instapay'], checkoutKey: body.checkoutKey,
        customer: body.customer, shipping: { amountPiastres: null },
        totals: { subtotalPiastres: subtotal, discountPiastres: 0,
          shippingPiastres: null, totalPiastres: subtotal },
        paymentInstructions: null, canCancel: false };
      fixture.state.order = created;
      fixture.state.cart = { items: [], subtotalPiastres: 0, quantity: 0 };
    }
    expect(body.checkoutKey).toBe(created.checkoutKey);
    return reply(route, { order: created });
  });
  return { fixture, audit, savedOrder: () => created };
}

async function review(page) {
  await page.getByRole('button', { name: 'Finishing Touches', exact: false }).click();
  await page.getByRole('button', { name: 'Next: Review', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review your gift' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add completed gift to cart' })).toBeEnabled();
}

const errors = new WeakMap();
test.beforeEach(({ page }) => { const caught = []; errors.set(page, caught); page.on('pageerror', error => caught.push(error.message)); });
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));

test('priced flexible gift with roses, chocolate and no ribbon goes from builder to InstaPay order', async ({ page }) => {
  const { audit, savedOrder } = await localCheckoutFixture(page);
  await beginGiftBox(page);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Add Fixture rose-red', exact: true }).click();
  await page.getByRole('button', { name: 'Add Fixture rose-red', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Add Fixture chocolate-1', exact: true }).click();
  await review(page);
  await expect(page.locator('.gb-review-estimate strong')).toContainText('40.00');
  await page.getByRole('button', { name: 'Add completed gift to cart' }).click();
  await expect(page).toHaveURL(/\/cart$/);
  const gift = page.getByRole('article', { name: 'Build Your Gift Box' });
  await expect(gift).toContainText('Fixture rose-red × 2');
  await expect(gift).toContainText('Fixture chocolate-1 × 1');
  await expect(gift).toContainText('No ribbon selected');
  await expect(gift).toContainText('40.00');
  expect(audit.adds).toHaveLength(1);
  expect(audit.adds[0].configuration.selection.ribbonId).toBeNull();
  expect(audit.adds[0].configuration.placements).toHaveLength(3);
  await page.getByRole('link', { name: 'Proceed to Checkout' }).click();
  await fillCheckout(page);
  await expect(page.getByRole('radio', { name: /InstaPay/ })).toBeChecked();
  await expect(page.getByRole('radio', { name: /Cash on Delivery/ })).toBeDisabled();
  await expect(page.locator('.commerce-summary')).toContainText('40.00');
  await page.getByRole('button', { name: 'Place Order' }).click();
  await expect(page).toHaveURL(/\/orders\/710000000000000000000040$/);
  await expect(page.getByRole('heading', { name: 'Order #681243' })).toBeVisible();
  await expect(page.getByText(/Payment: awaiting transfer · InstaPay/)).toBeVisible();
  await expect(page.locator('.commerce-gift-order-item')).toContainText('Fixture chocolate-1 × 1');
  expect(audit.quotes.length).toBeGreaterThan(0);
  expect(audit.orders).toHaveLength(1);
  expect(savedOrder().totals.totalPiastres).toBe(4000);
  expect(savedOrder().lines).toHaveLength(1);
  expect(savedOrder().lines[0].giftBox.components).toEqual(expect.arrayContaining([
    expect.objectContaining({ componentId: 'box-2', quantityPerBox: 1, unitPricePiastres: 1000 }),
    expect.objectContaining({ componentId: 'rose-red', quantityPerBox: 2, unitPricePiastres: 1000 }),
    expect.objectContaining({ componentId: 'chocolate-1', quantityPerBox: 1, unitPricePiastres: 1000 }),
  ]));
  expect(savedOrder().lines[0].giftBox.components).toHaveLength(3);
});

test('box-only no-ribbon gift can check out alongside an ordinary priced product', async ({ page }) => {
  const { audit, savedOrder } = await localCheckoutFixture(page, { initialCart: cartWithProduct() });
  await beginGiftBox(page);
  await review(page);
  await page.getByRole('button', { name: 'Add completed gift to cart' }).click();
  await expect(page).toHaveURL(/\/cart$/);
  await expect(page.getByRole('article', { name: 'Build Your Gift Box' })).toContainText('10.00');
  await expect(page.getByRole('heading', { name: 'Isolated Commerce Gift' })).toBeVisible();
  await page.getByRole('link', { name: 'Proceed to Checkout' }).click();
  await fillCheckout(page);
  await expect(page.locator('.commerce-summary')).toContainText('260.00');
  await page.getByRole('button', { name: 'Place Order' }).click();
  await expect(page.getByRole('heading', { name: 'Order #681243' })).toBeVisible();
  expect(audit.adds[0].configuration.selection.items).toEqual([]);
  expect(audit.adds[0].configuration.selection.ribbonId).toBeNull();
  expect(savedOrder().lines).toHaveLength(2);
  expect(savedOrder().totals.totalPiastres).toBe(26000);
});

test('rejected server cart pricing leaves the customer on review without creating an order', async ({ page }) => {
  const { audit, fixture } = await localCheckoutFixture(page, { rejectAdd: true });
  await beginGiftBox(page);
  await review(page);
  await page.getByRole('button', { name: 'Add completed gift to cart' }).click();
  await expect(page).toHaveURL(/\/customize\/gift-box$/);
  await expect(page.locator('.gb-announcement')).toContainText('no longer available');
  expect(audit.adds).toHaveLength(1);
  expect(audit.orders).toHaveLength(0);
  expect(fixture.state.cart.items).toHaveLength(0);
});
