import { test, expect } from '@playwright/test';

const api = 'http://127.0.0.1:4092';
test.beforeEach(async ({ context }) => {
  // Real API validation/serializers are used; only external network is denied.
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return ['127.0.0.1', 'localhost'].includes(url.hostname) || ['data:', 'blob:'].includes(url.protocol) ? route.continue() : route.abort();
  });
});
async function state(request) {
  const response = await request.get(`${api}/__fixture/state`, { headers: { 'x-fixture-key': 'connected-fixture-only' } });
  expect(response.ok()).toBeTruthy(); return response.json();
}
async function csrf(context) {
  const response = await context.request.get(`${api}/api/v1/auth/csrf`); expect(response.ok()).toBeTruthy();
  return { Origin: 'http://127.0.0.1:5192', 'x-csrf-token': (await response.json()).data.csrfToken };
}

test('real Gift Box React selection, normalized component availability, quantities and required message preserve quote/cart contracts with checkout disabled', async ({ page, context, request }) => {
  const errors = [], cartPosts = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith('/commerce/cart/items')) cartPosts.push(request.postDataJSON()); });
  const before = await state(request);
  await page.goto('/customize/gift-box');
  await expect(page.getByRole('heading', { name: 'Build Your Gift Box', exact: true })).toBeVisible();
  const selected = page.waitForResponse(response => response.url().endsWith('/customization/products/connected-gift-box-product'));
  await page.getByLabel('Gift box type / size', { exact: true }).selectOption('connected-gift-box-product');
  const response = await selected; expect(response.status()).toBe(200);
  const normalized = (await response.json()).data;
  expect(normalized.template.kind).toBe('gift_box'); expect(normalized.template.fields).toHaveLength(1);
  expect(normalized.template.fields[0]).toMatchObject({ key: 'gift-message', required: true, maxChars: 80 });
  expect(normalized.template.groups[0].options.find(option => option.key === 'chocolates')).toMatchObject({ available: true, componentPricePiastres: 1550, priceAdjustmentPiastres: 50, maxQuantity: 3 });
  expect(normalized.template.groups[0].options.find(option => option.key === 'flowers').available).toBe(false);
  await expect(page.getByRole('checkbox', { name: /Unavailable flowers/ })).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Configured chocolates', exact: true }).check();
  await page.locator('.commerce-option-quantity input').fill('2');
  await expect(page.getByText(/112[,.]00.*each/)).toBeVisible();
  const add = page.getByRole('button', { name: 'Add to Cart', exact: true });
  await expect(add).toBeEnabled(); await add.click();
  const message = page.getByLabel('Gift box message *', { exact: true });
  await expect(message).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('This field is required.', { exact: true })).toBeVisible();
  expect(cartPosts).toHaveLength(0);
  await message.fill('A thoughtful synthetic gift');
  await page.locator('.commerce-configurator .commerce-field input[type="number"]').fill('2');
  await expect(add).toBeEnabled();
  const accepted = page.waitForResponse(response => response.url().endsWith('/commerce/cart/items') && response.request().method() === 'POST');
  await add.click(); const saved = await accepted; expect(saved.status()).toBe(201);
  await expect(page.getByRole('status').filter({ hasText: 'Added to your cart.' })).toBeVisible();
  expect(cartPosts).toHaveLength(1);
  const cartResponse = await context.request.get(`${api}/api/v1/commerce/cart`); expect(cartResponse.ok()).toBeTruthy();
  const cart = (await cartResponse.json()).data.cart;
  expect(cart.items).toHaveLength(1); expect(cart.subtotalPiastres).toBe(22400);
  expect(cart.items[0]).toMatchObject({ productId: before.giftBox.productId, quantity: 2, unitPricePiastres: 11200, lineTotalPiastres: 22400,
    customization: { templateId: before.giftBox.templateId, kind: 'gift_box', fields: { 'gift-message': 'A thoughtful synthetic gift' } } });
  expect(cart.items[0].customization.selections[0]).toMatchObject({ groupKey: 'contents', optionKey: 'chocolates', quantity: 2, unitAdjustmentPiastres: 1600, componentId: before.giftBox.componentId });
  const headers = await csrf(context);
  const quote = selections => context.request.post(`${api}/api/v1/commerce/customization/quote`, { headers, data: { productId: before.giftBox.productId,
    customization: { templateId: before.giftBox.templateId, version: 1, selections, fields: { 'gift-message': 'Synthetic validation' } } } });
  expect((await quote([{ groupKey: 'contents', optionKey: 'chocolates', quantity: 4 }])).status()).toBe(400);
  expect((await quote([{ groupKey: 'contents', optionKey: 'unconfigured', quantity: 1 }])).status()).toBe(400);
  const unavailable = await quote([{ groupKey: 'contents', optionKey: 'flowers', quantity: 1 }]); expect(unavailable.status()).toBe(409);
  expect((await unavailable.json()).error.code).toBe('COMPONENT_UNAVAILABLE');
  const missing = await context.request.post(`${api}/api/v1/commerce/cart/items`, { headers, data: { productId: before.giftBox.productId, quantity: 1,
    customization: { templateId: before.giftBox.templateId, version: 1, selections: [{ groupKey: 'contents', optionKey: 'chocolates', quantity: 1 }], fields: {} } } });
  expect(missing.status()).toBe(400);
  await page.goto('/cart'); await expect(page.getByRole('heading', { name: 'Your Cart', exact: true })).toBeVisible();
  await expect(page.getByText(/224[,.]00/).first()).toBeVisible();
  await page.goto('/checkout'); await expect(page.getByRole('heading', { name: 'Ordering is not enabled yet' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Place Order' })).toHaveCount(0);
  const blocked = await context.request.post(`${api}/api/v1/commerce/checkout/quote`, { headers, data: { checkoutKey: crypto.randomUUID(), paymentMethod: 'cod', governorate: 'cairo' } });
  expect(blocked.status()).toBe(403); expect((await blocked.json()).error.code).toBe('CHECKOUT_DISABLED');
  const after = await state(request); expect(after.orderCount).toBe(before.orderCount); expect(after.puts).toBe(before.puts);
  expect(after.giftBox.componentQuantity).toBe(20); expect(errors).toEqual([]);
});
