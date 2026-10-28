import { test, expect } from '@playwright/test';

const api = 'http://127.0.0.1:' + (process.env.TAP_WRAP_CONTRACT_API_PORT || 4092);
const web = 'http://127.0.0.1:' + (process.env.TAP_WRAP_CONTRACT_WEB_PORT || 5192);
async function restrictNetwork(context) {
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return ['127.0.0.1', 'localhost'].includes(url.hostname) || ['data:', 'blob:'].includes(url.protocol) ? route.continue() : route.abort();
  });
}
test.beforeEach(async ({ context }) => restrictNetwork(context));
async function fixture(request) {
  const response = await request.get(`${api}/__fixture/state`, { headers: { 'x-fixture-key': 'connected-fixture-only' } });
  expect(response.ok()).toBeTruthy(); return response.json();
}
async function csrf(context) {
  const response = await context.request.get(`${api}/api/v1/auth/csrf`);
  expect(response.ok()).toBeTruthy(); return { Origin: web, 'x-csrf-token': (await response.json()).data.csrfToken };
}
async function add(context, data) {
  const response = await context.request.post(`${api}/api/v1/commerce/cart/items`, { headers: await csrf(context), data });
  expect(response.status(), JSON.stringify(await response.json())).toBe(201);
  return (await response.json()).data.cart;
}
async function currentCart(context) { return (await (await context.request.get(`${api}/api/v1/commerce/cart`)).json()).data.cart; }
const input = configuration => ({ kind: 'gift_box_v2', configuration, quantity: 1, operationKey: crypto.randomUUID() });
async function login(page, account) {
  await page.goto('/login?returnTo=%2Fcart');
  await page.getByLabel('Email Address').fill(`${account}@connected.example.test`);
  await page.getByLabel('Password', { exact: true }).fill('isolated-fixture-password');
  await page.getByRole('button', { name: 'Log In', exact: true }).click();
  await expect(page).toHaveURL('/my-orders');
  await page.goto('/cart');
}

test('real mixed cart persists one configured gift, updates quantities and keeps checkout closed at mobile and desktop', async ({ page, context, request }, info) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const before = await fixture(request), payload = input(before.giftBoxV2.configuration);
  await add(context, { productId: before.giftBoxV2.ordinaryProductId, quantity: 1 });
  await add(context, payload); const repeated = await add(context, payload);
  expect(repeated.items).toHaveLength(2); expect(repeated.subtotalPiastres).toBe(107000);
  await page.goto('/cart');
  const gift = page.getByRole('article', { name: 'Build Your Gift Box' });
  await expect(gift.getByRole('heading', { name: 'Build Your Gift Box' })).toBeVisible();
  await expect(gift.getByText(/Synthetic rose-red/)).toBeVisible();
  await expect(gift.getByText(/Synthetic chocolate-1/)).toBeVisible();
  await expect(gift.getByText('Gift box preview unavailable')).toBeVisible();
  await expect(gift.getByText('Private fixture message', { exact: true })).toBeHidden();
  await gift.getByText('View gift-card message', { exact: true }).click();
  await expect(gift.getByText('Private fixture message', { exact: true })).toBeVisible();
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await page.screenshot({ path: info.outputPath(`connected-mixed-cart-${width}.png`), fullPage: true });
  }
  await gift.getByRole('combobox', { name: 'Quantity for Build Your Gift Box' }).selectOption('2');
  await expect.poll(async () => (await currentCart(context)).subtotalPiastres).toBe(206000);
  await expect(page.getByRole('button', { name: 'Checkout unavailable', exact: true })).toBeDisabled();
  const denied = await context.request.post(`${api}/api/v1/commerce/checkout/quote`, { headers: await csrf(context),
    data: { checkoutKey: crypto.randomUUID(), paymentMethod: 'instapay', governorate: 'cairo' } });
  expect(denied.status()).toBe(403); expect((await denied.json()).error.code).toBe('CHECKOUT_DISABLED');
  const after = await fixture(request);
  expect(after.giftBoxV2.settingQuantities).toEqual(before.giftBoxV2.settingQuantities);
  expect(after.orderCount).toBe(before.orderCount);
  await gift.getByRole('button', { name: 'Remove Build Your Gift Box', exact: true }).click();
  await expect.poll(async () => (await currentCart(context)).items.length).toBe(1);
  await expect(page.getByRole('heading', { name: 'Connected generic product', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('real login merge keeps different private gift configurations and account messages isolated', async ({ page, context, request, browser }) => {
  const data = await fixture(request);
  await login(page, 'alice');
  await context.request.delete(`${api}/api/v1/commerce/cart`, { headers: await csrf(context) });
  const accountConfiguration = structuredClone(data.giftBoxV2.configuration);
  accountConfiguration.selection.giftCard.message = 'ALICE_ACCOUNT_ONLY_GIFT';
  await add(context, input(accountConfiguration));
  const guestContext = await browser.newContext(); await restrictNetwork(guestContext);
  const guestConfiguration = structuredClone(data.giftBoxV2.configuration);
  guestConfiguration.selection.giftCard.message = 'ALICE_GUEST_ONLY_GIFT';
  await add(guestContext, input(guestConfiguration));
  const guestPage = await guestContext.newPage();
  await login(guestPage, 'alice');
  await expect.poll(async () => (await currentCart(guestContext)).items.length).toBe(2);
  const merged = await currentCart(guestContext);
  expect(JSON.stringify(merged)).toContain('ALICE_ACCOUNT_ONLY_GIFT'); expect(JSON.stringify(merged)).toContain('ALICE_GUEST_ONLY_GIFT');
  const retry = await guestContext.request.post(`${api}/api/v1/commerce/cart/merge`, { headers: await csrf(guestContext), data: {} });
  expect(retry.status()).toBe(200); expect((await retry.json()).data.cart.items).toHaveLength(2);
  const bobContext = await browser.newContext(); await restrictNetwork(bobContext);
  const bobPage = await bobContext.newPage(); await login(bobPage, 'bob');
  const bob = await currentCart(bobContext);
  expect(JSON.stringify(bob)).not.toContain('ALICE_ACCOUNT_ONLY_GIFT'); expect(JSON.stringify(bob)).not.toContain('ALICE_GUEST_ONLY_GIFT');
  expect(bob.items).toHaveLength(0);
  await bobContext.close(); await guestContext.close();
});

test('real cart endpoint rejects malformed gift configuration, client prices and unknown line kinds', async ({ context, request }) => {
  const { giftBoxV2 } = await fixture(request), base = input(giftBoxV2.configuration);
  const malformed = structuredClone(base); malformed.configuration.placements.pop();
  for (const body of [malformed, { ...base, unitPricePiastres: 1 }, { ...base, configurationId: 'forged' },
    { ...base, fulfillmentPolicy: { status: 'approved' } }, { ...base, kind: 'unrecognized' }]) {
    const response = await context.request.post(`${api}/api/v1/commerce/cart/items`, { headers: await csrf(context), data: body });
    expect(response.status()).toBe(400);
  }
  expect((await currentCart(context)).items).toHaveLength(0);
});
