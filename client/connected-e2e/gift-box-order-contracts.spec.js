import { expect, test } from '@playwright/test';

const api = `http://127.0.0.1:${process.env.TAP_WRAP_CONTRACT_API_PORT || 4092}`;
const secret = 'PRIVATE_CONNECTED_GIFT_ORDER_MESSAGE';
test.beforeEach(async ({ context }) => context.route('**/*', route => {
  const url = new URL(route.request().url());
  return ['127.0.0.1', 'localhost'].includes(url.hostname) || ['data:', 'blob:'].includes(url.protocol) ? route.continue() : route.abort();
}));
async function fixture(request) {
  const response = await request.get(`${api}/__fixture/state`, { headers: { 'x-fixture-key': 'connected-fixture-only' } });
  expect(response.ok()).toBeTruthy(); return response.json();
}
async function login(page, account, destination) {
  await page.goto(`/login?returnTo=${encodeURIComponent(destination)}`);
  await page.getByLabel('Email Address').fill(`${account}@connected.example.test`);
  await page.getByLabel('Password', { exact: true }).fill('isolated-fixture-password');
  await page.getByRole('button', { name: 'Log In', exact: true }).click();
  // Customer login intentionally uses the account home; admin may restore an
  // authorized private destination. Read the owned order only after verification.
  await expect(page).toHaveURL(account === 'admin' ? destination : '/my-orders');
  if (account !== 'admin') await page.goto(destination);
}

test('real internally-created mixed order is readable by its owner, uses immutable gift amounts and keeps arrangement details private', async ({ page, context, request }, info) => {
  const data = await fixture(request), id = data.giftBoxV2.orderId;
  await login(page, 'alice', `/orders/${id}`);
  const response = await context.request.get(`${api}/api/v1/commerce/orders/${id}`);
  expect(response.status()).toBe(200);
  const order = (await response.json()).data.order;
  expect(order.lines.map(line => line.kind)).toEqual(['product', 'gift_box_v2']);
  expect(order.totals.totalPiastres).toBe(107000); expect(order.totals.shippingPiastres).toBeNull();
  expect(order.allowedPaymentMethods).toEqual(['instapay']);
  const gift = order.lines[1]; expect(gift.lineTotalPiastres).toBe(99000);
  expect(gift.giftBox.giftCard.message).toBe(secret);
  for (const key of ['configuration', 'configurationId', 'inventoryClaims', 'fulfillment']) expect(gift.giftBox[key]).toBeUndefined();
  expect(gift.giftBox.components.every(component => component.inventory === undefined && component.priceApprovedBy === undefined)).toBeTruthy();
  const article = page.getByRole('article', { name: 'Build Your Gift Box', exact: true });
  await expect(article.getByRole('heading', { name: 'Build Your Gift Box' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Connected generic product' })).toBeVisible();
  await expect(article.getByText('Synthetic rose-red × 3', { exact: true })).toBeVisible();
  await expect(article.getByText(secret, { exact: true })).toBeHidden();
  await article.getByText('View gift-card message', { exact: true }).click();
  await expect(article.getByText(secret, { exact: true })).toBeVisible();
  await article.getByText('View gift-card message', { exact: true }).click();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: info.outputPath(`connected-gift-order-${width}.png`), fullPage: true });
  }
  const summary = (await (await context.request.get(`${api}/api/v1/commerce/orders`)).json()).data.orders;
  expect(JSON.stringify(summary)).not.toContain(secret);
});

test('real order ownership prevents Bob and an unrelated guest from obtaining a private gift-card message', async ({ page, context, request, browser }) => {
  const data = await fixture(request), id = data.giftBoxV2.orderId;
  await login(page, 'bob', `/orders/${id}`);
  const response = await context.request.get(`${api}/api/v1/commerce/orders/${id}`);
  expect(response.status()).toBe(404); expect(await response.text()).not.toContain(secret);
  await expect(page.getByText('Order details unavailable', { exact: true })).toBeVisible();
  await expect(page.getByText(secret, { exact: true })).toHaveCount(0);
  const guest = await browser.newContext();
  const denied = await guest.request.get(`${api}/api/v1/commerce/orders/${id}`);
  expect(denied.status()).toBe(404); expect(await denied.text()).not.toContain(secret);
  await guest.close();
});

test('real admin order response and page retain purchased arrangement, fulfillment reference and independent builder source claims', async ({ page, context, request }) => {
  const data = await fixture(request), id = data.giftBoxV2.orderId;
  await login(page, 'admin', `/admin/commerce/orders/${id}`);
  const response = await context.request.get(`${api}/api/v1/admin/commerce/orders/${id}`);
  expect(response.status()).toBe(200);
  const order = (await response.json()).data.order, gift = order.lines[1].giftBox;
  expect(gift.configuration.placements).toHaveLength(5);
  expect(gift.fulfillment.policyReference.policyId).toBe('isolated-cart-policy');
  expect(gift.components.every(item => item.inventory.owner === 'GiftBoxComponentSetting')).toBeTruthy();
  expect(order.inventoryClaims.some(claim => claim.kind === 'gift_box_component' && claim.sourceId === 'chocolate-1')).toBeTruthy();
  const article = page.getByRole('article', { name: 'Build Your Gift Box', exact: true });
  await article.getByText('Component prices at purchase', { exact: true }).click();
  await expect(article.getByText('Inventory: GiftBoxComponentSetting · Tracked · 3 required · 3 consumed', { exact: true })).toBeVisible();
  await article.getByText('Saved arrangement and fulfillment policy', { exact: true }).click();
  await expect(article.getByText('isolated-cart-policy · fixture-v1', { exact: true })).toBeVisible();
  await expect(article.getByText(/They do not certify physical fit/)).toBeVisible();
  await expect(article.getByText(secret, { exact: true })).toBeHidden();
});
