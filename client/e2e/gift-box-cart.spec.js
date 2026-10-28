import { expect, test } from '@playwright/test';
import { cartWithProduct, commerceProduct, mockCommerce } from './commerce-fixtures.js';
import { giftBoxFixture, beginGiftBox } from './gift-box-fixtures.js';
import { prepareGiftBoxCartPayload, prepareGiftBoxCommerceConfiguration } from '../src/gift-box/commerce-payload.mjs';

const message = 'Private fixture message <b>shown as text</b> 🌹';
const giftLine = () => ({ id: '10000000-0000-4000-8000-000000000001', kind: 'gift_box_v2', name: 'Build Your Gift Box',
  quantity: 1, valid: true, unitPricePiastres: 96000, lineTotalPiastres: 96000,
  giftBox: { box: { componentId: 'box-2', displayName: 'Fixture Box Two' },
    items: [{ componentId: 'rose-red', category: 'flower', displayName: 'Fixture Red Rose', quantity: 3 },
      { componentId: 'plush-1', category: 'plush', displayName: 'Fixture Plush One', quantity: 1 },
      { componentId: 'chocolate-1', category: 'chocolate', displayName: 'Fixture Chocolate One', quantity: 2 }],
    ribbon: { componentId: 'ribbon-navy', displayName: 'Fixture Navy Ribbon', colorHex: '#203356' },
    giftCard: { selected: true, message }, artwork: { status: 'unavailable' } } });
const mixedCart = () => ({ items: [...cartWithProduct().items, giftLine()], subtotalPiastres: commerceProduct.pricePiastres + 96000, quantity: 2 });
const errors = new WeakMap();
test.beforeEach(({ page }) => { const collected = []; errors.set(page, collected); page.on('pageerror', error => collected.push(error.message)); });
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));

for (const width of [320, 390, 768, 1440]) test(`mixed cart presents one configured gift and protects its message at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 1000 });
  await mockCommerce(page, { cart: mixedCart(), checkoutEnabled: true });
  await page.goto('/cart');
  const gift = page.getByRole('article', { name: 'Build Your Gift Box', exact: true });
  await expect(gift.getByRole('heading', { name: 'Build Your Gift Box' })).toBeVisible();
  await expect(page.getByRole('heading', { name: commerceProduct.name, exact: true })).toBeVisible();
  for (const text of ['Fixture Box Two', 'Fixture Red Rose × 3', 'Fixture Plush One × 1', 'Fixture Chocolate One × 2', 'Fixture Navy Ribbon', 'Selected']) await expect(gift.getByText(text, { exact: true })).toBeVisible();
  await expect(gift.getByText(message, { exact: true })).toBeHidden();
  const disclosure = gift.getByText('View gift-card message', { exact: true });
  await disclosure.focus(); await page.keyboard.press('Enter');
  await expect(gift.getByText(message, { exact: true })).toBeVisible();
  await expect(gift.locator('b')).toHaveCount(0);
  await page.keyboard.press('Enter');
  await expect(gift.getByText(message, { exact: true })).toBeHidden();
  await expect(gift.getByText('Gift box preview unavailable', { exact: true })).toBeVisible();
  await expect(gift.locator('img')).toHaveCount(0);
  await expect(gift.getByRole('combobox', { name: 'Quantity for Build Your Gift Box' })).toHaveValue('1');
  await expect(page.getByRole('link', { name: 'Proceed to Checkout', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Checkout unavailable', exact: true })).toBeDisabled();
  await expect(page.getByText('Gift boxes are excluded from discounts.', { exact: false })).toBeVisible();
  await expect(page.locator('.commerce-summary')).toContainText('1,210.00');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath(`mixed-cart-${width}.png`), fullPage: true });
});

test('gift quantity and removal use existing cart operations while the ordinary product remains intact', async ({ page }) => {
  const fixture = await mockCommerce(page, { cart: mixedCart(), checkoutEnabled: true });
  await page.goto('/cart');
  await page.getByRole('combobox', { name: 'Quantity for Build Your Gift Box' }).selectOption('3');
  await expect.poll(() => fixture.state.cart.items.find(item => item.kind === 'gift_box_v2').quantity).toBe(3);
  await expect(page.getByRole('article', { name: 'Build Your Gift Box' })).toContainText('EGP 2,880.00');
  await page.getByRole('button', { name: 'Remove Build Your Gift Box', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Build Your Gift Box', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: commerceProduct.name, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Proceed to Checkout', exact: true })).toBeVisible();
  expect(fixture.calls.filter(call => call.method === 'PATCH' && call.path.includes('/cart/items/')).map(call => call.body)).toEqual([{ quantity: 3 }]);
  expect(fixture.state.cart.items).toHaveLength(1);
  expect(fixture.state.cart.items[0].productId).toBe(commerceProduct._id);
});

test('unavailable saved gift remains visible without invented prices and can be removed or cleared', async ({ page }) => {
  const unavailable = { ...giftLine(), valid: false, unitPricePiastres: null, lineTotalPiastres: null,
    error: 'A selected gift component is unavailable. Review your selection.', errorCode: 'GIFT_BOX_COMPONENT_UNAVAILABLE',
    giftBox: { ...giftLine().giftBox, artwork: { status: 'historical_unavailable' } } };
  await mockCommerce(page, { cart: { ...mixedCart(), items: [...cartWithProduct().items, unavailable], subtotalPiastres: commerceProduct.pricePiastres } });
  await page.goto('/cart');
  const gift = page.getByRole('article', { name: 'Build Your Gift Box' });
  await expect(gift.getByRole('alert')).toHaveText(unavailable.error);
  await expect(gift.getByRole('combobox', { name: /^Quantity/ })).toBeDisabled();
  await expect(gift.getByText('Unavailable', { exact: true })).toBeVisible();
  await expect(gift.getByText(/per completed gift box/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear cart', exact: true }).click();
  await expect(page.getByText('Your cart is empty.', { exact: true })).toBeVisible();
});

test('ordinary historical product row keeps its original link, price and quantity control', async ({ page }) => {
  await mockCommerce(page, { cart: cartWithProduct(), checkoutEnabled: true });
  await page.goto('/cart');
  await expect(page.getByRole('link', { name: commerceProduct.name, exact: true }).filter({ has: page.getByRole('heading', { name: commerceProduct.name, exact: true }) })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Quantity', exact: true })).toBeEnabled();
  await expect(page.getByRole('link', { name: 'Proceed to Checkout', exact: true })).toBeVisible();
  await expect(page.getByText(/Gift-box checkout is unavailable/)).toHaveCount(0);
});

test('login reports unavailable guest items that could not be transferred', async ({ page }) => {
  const fixture = await mockCommerce(page, { cart: mixedCart() });
  await page.route('**/api/v1/commerce/cart/merge', route => route.fulfill({ headers: {
    'access-control-allow-origin': 'http://127.0.0.1:5191', 'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'content-type,x-csrf-token,x-tracking-consent', 'access-control-allow-methods': 'POST,OPTIONS',
  }, ...(route.request().method() === 'OPTIONS' ? { status: 204 } : { json: { ok: true, data: { cart: fixture.state.cart, skipped: 2 } } }) }));
  await page.goto('/login');
  await page.getByLabel('Email Address', { exact: true }).fill('isolated@example.test');
  await page.getByLabel('Password', { exact: true }).fill('isolated-password-for-tests');
  await page.getByRole('button', { name: 'Log In', exact: true }).click();
  await expect(page.getByText('You are signed in. 2 unavailable guest items could not be transferred. Review your cart.', { exact: true })).toBeVisible();
});

test('builder review stays closed and does not invoke cart APIs when selections are prepared', async ({ page }) => {
  const fixture = await giftBoxFixture(page);
  await beginGiftBox(page);
  await page.getByRole('button', { name: 'Finishing Touches', exact: false }).click();
  await page.getByRole('button', { name: 'Choose Fixture ribbon-cream-ivory', exact: true }).click();
  await page.getByRole('button', { name: 'Next: Review', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review your gift', exact: true })).toBeVisible();
  await expect(page.getByText('Your selections are prepared for cart review.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Request submission unavailable', exact: true })).toBeDisabled();
  expect(fixture.calls.filter(call => call.path.endsWith('/requests'))).toHaveLength(0);
  expect(fixture.state.cart.items).toHaveLength(0);
});

const arrangement = () => ({ boxId: 'box-2', ribbonId: 'ribbon-navy', cardEnabled: true, message: 'Private fixture card 🌹',
  instances: [{ id: '20000000-0000-4000-8000-000000000001', componentId: 'rose-red', x: .2, y: .3,
    height: .1, anchorOffsetY: .5, layerBase: 20, placementZone: 'inside', regionId: 'synthetic-floor', zone: 'layout-study' }] });

test('builder serializer reuses selections and individual placement associations without amounts or identity claims', () => {
  const state = arrangement(), before = structuredClone(state);
  const payload = prepareGiftBoxCartPayload(state, { cardId: 'gift-card-1', quantity: 2, operationKey: '30000000-0000-4000-8000-000000000001' });
  expect(Object.keys(payload).sort()).toEqual(['configuration', 'kind', 'operationKey', 'quantity']);
  expect(payload.kind).toBe('gift_box_v2');
  expect(payload.configuration.selection).toEqual({ boxId: 'box-2', items: [{ componentId: 'rose-red', quantity: 1 }], ribbonId: 'ribbon-navy', giftCard: { componentId: 'gift-card-1', message: state.message } });
  expect(payload.configuration.placements[0]).toMatchObject({ instanceId: state.instances[0].id, componentId: 'rose-red', zone: 'inside', regionId: 'synthetic-floor' });
  expect(payload.configuration.placements[0].x).toBeCloseTo(1 / 6);
  expect(JSON.stringify(payload)).not.toMatch(/pricePiastres|configurationId|inventoryQuantity|approved/);
  expect(state).toEqual(before);
  expect(Object.isFrozen(payload.configuration.placements[0])).toBe(true);
});

test('builder serializer rejects unfinished arrangements, absent ribbons, malformed Unicode and invalid retry envelopes', () => {
  for (const patch of [{ ribbonId: null }, { boxId: 'plush-1' }, { message: '🌹'.repeat(501) }]) expect(() => prepareGiftBoxCommerceConfiguration({ ...arrangement(), ...patch }, { cardId: 'gift-card-1' })).toThrow();
  const unplaced = arrangement(); unplaced.instances[0].x = null;
  expect(() => prepareGiftBoxCommerceConfiguration(unplaced, { cardId: 'gift-card-1' })).toThrow();
  const duplicate = arrangement(); duplicate.instances.push({ ...duplicate.instances[0] });
  expect(() => prepareGiftBoxCommerceConfiguration(duplicate, { cardId: 'gift-card-1' })).toThrow();
  for (const quantity of [0, 1.5, '2', 100]) expect(() => prepareGiftBoxCartPayload(arrangement(), { cardId: 'gift-card-1', quantity, operationKey: '30000000-0000-4000-8000-000000000001' })).toThrow();
  expect(() => prepareGiftBoxCartPayload(arrangement())).toThrow();
});
