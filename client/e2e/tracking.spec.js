import { test, expect } from '@playwright/test';
import { mockCommerce, commerceProduct, cartWithProduct } from './commerce-fixtures.js';

const receipt = (name, id = '12345678-1234-4234-8234-123456789abc') => ({ id, name, parameters: { currency: 'EGP', value: 250, content_type: 'product', content_ids: [commerceProduct._id], contents: [{ id: commerceProduct._id, quantity: 1, item_price: 250 }], num_items: 1 } });
async function setup(page, { consent = false, rejectAdd = false, gpc = false, failFirstAcknowledgement = false } = {}) {
  await mockCommerce(page);
  const events = [], choices = [], scripts = [], acknowledgements = [];
  if (gpc) await page.addInitScript(() => Object.defineProperty(navigator, 'globalPrivacyControl', { get: () => true }));
  await page.route('https://www.facebook.com/**', route => route.abort());
  await page.route('https://connect.facebook.net/**', async route => {
    scripts.push(route.request().url());
    await route.fulfill({ contentType: 'application/javascript', body: 'window.__pixelCalls=window.__pixelCalls||[];const old=window.fbq?.queue||[];window.fbq=(...args)=>window.__pixelCalls.push(args);for(const args of old)window.fbq(...args);' });
  });
  const headers = { 'access-control-allow-origin': 'http://127.0.0.1:5191', 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type,x-csrf-token,x-tracking-consent', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
  await page.route('**/api/v1/tracking/**', async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const path = new URL(route.request().url()).pathname;
    const reply = data => route.fulfill({ headers, json: { ok: true, data } });
    if (path.endsWith('/config')) return reply({ enabled: true, pixelId: '123456789', policyVersion: 'isolated-v1', consent });
    const body = route.request().postDataJSON();
    if (path.endsWith('/consent')) { choices.push(body); consent = body.granted; return reply({ consent }); }
    if (path.endsWith('/ack')) {
      acknowledgements.push(body);
      if (failFirstAcknowledgement && acknowledgements.length === 1) return route.fulfill({ status: 503, headers, json: { ok: false, error: { message: 'Isolated acknowledgement outage.' } } });
      return reply({ acknowledged: true });
    }
    events.push(body); return reply({ tracking: { id: body.eventId, name: body.name, parameters: {} } });
  });
  await page.route('**/api/v1/commerce/cart/items', async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (rejectAdd) return route.fulfill({ status: 409, headers, json: { ok: false, error: { message: 'This isolated product is unavailable.' } } });
    return route.fulfill({ headers, json: { ok: true, data: { cart: cartWithProduct(), tracking: [receipt('AddToCart')] } } });
  });
  return { events, choices, scripts, acknowledgements };
}
const pixelEvents = async page => page.evaluate(() => (window.__pixelCalls || []).filter(call => ['track', 'trackCustom'].includes(call[0])));

test('optional tracking loads only after explicit consent and emits one server-identified PageView', async ({ page }) => {
  const state = await setup(page); await page.goto('/shop');
  await expect(page.getByRole('heading', { name: 'Optional marketing cookies' })).toBeVisible();
  expect(state.scripts).toHaveLength(0); expect(state.events).toHaveLength(0);
  await page.getByRole('button', { name: 'Accept optional tracking', exact: true }).click();
  await expect.poll(() => state.events.length).toBe(1);
  await expect.poll(() => state.scripts.length).toBe(1);
  await expect.poll(async () => (await pixelEvents(page)).length).toBe(1);
  const calls = await pixelEvents(page);
  expect(calls[0]).toEqual(['track', 'PageView', {}, { eventID: state.events[0].eventId }]);
  expect(state.events[0].path).toBe('/shop');
  expect(await page.evaluate(() => window.__pixelCalls.some(call => call[0] === 'set' && call[1] === 'autoConfig' && call[2] === false))).toBe(true);
});

test('rejected preference persists across refresh and can be changed through accessible preferences', async ({ page }) => {
  const state = await setup(page); await page.goto('/shop');
  await page.getByRole('button', { name: 'Reject optional tracking', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Optional marketing cookies' })).toBeHidden();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Tracking preferences', exact: true })).toBeVisible();
  expect(state.scripts).toHaveLength(0); expect(state.events).toHaveLength(0);
  await page.getByRole('button', { name: 'Tracking preferences', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Optional marketing cookies' })).toBeFocused();
  await page.getByRole('button', { name: 'Accept optional tracking', exact: true }).click();
  await expect.poll(() => state.events.length).toBe(1);
});

test('successful AddToCart consumes a sanitized receipt once across repeats and refreshes', async ({ page }) => {
  await setup(page, { consent: true }); await page.goto('/shop');
  await page.getByRole('button', { name: /^Add to Cart:/ }).click();
  await expect.poll(async () => (await pixelEvents(page)).filter(call => call[1] === 'AddToCart').length).toBe(1);
  await page.getByRole('button', { name: /^Add to Cart:/ }).click();
  await page.reload();
  await page.getByRole('button', { name: /^Add to Cart:/ }).click();
  expect((await pixelEvents(page)).filter(call => call[1] === 'AddToCart')).toHaveLength(0);
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('tw-meta-seen-v1')).includes('12345678-1234-4234-8234-123456789abc'))).toBe(true);
});

test('a failed cart add emits no AddToCart and malformed/private receipt fields are ignored', async ({ page }) => {
  await setup(page, { consent: true, rejectAdd: true }); await page.goto('/shop');
  await page.getByRole('button', { name: /^Add to Cart:/ }).click();
  await expect(page.getByText('This isolated product is unavailable.').first()).toBeVisible();
  await page.evaluate(async () => { const module = await import('/src/tracking/client.js'); module.emitTracking({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Purchase', parameters: { currency: 'EGP', value: 1, proof: 'private-file', email: 'private@example.test' } }); });
  expect((await pixelEvents(page)).some(call => ['AddToCart', 'Purchase'].includes(call[1]))).toBe(false);
});

test('browser privacy signal revokes existing consent without loading any SDK or events', async ({ page }) => {
  const state = await setup(page, { consent: true, gpc: true }); await page.goto('/shop');
  await expect(page.getByRole('button', { name: 'Tracking preferences', exact: true })).toBeVisible();
  await expect.poll(() => state.choices.length).toBe(1);
  expect(state.choices[0]).toEqual({ granted: false }); expect(state.scripts).toHaveLength(0); expect(state.events).toHaveLength(0);
});

test('private routes emit no PageView or SDK and mobile preferences cause no overflow', async ({ page }) => {
  const state = await setup(page, { consent: true }); await page.goto('/my-orders');
  await expect(page.getByRole('heading', { name: /my orders/i })).toBeVisible();
  expect(state.events).toHaveLength(0); expect(state.scripts).toHaveLength(0);
  await page.setViewportSize({ width: 320, height: 800 }); await page.goto('/shop');
  await page.getByRole('button', { name: 'Tracking preferences', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Optional marketing cookies' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Turn off optional tracking', exact: true }).click();
  expect(state.choices.at(-1)).toEqual({ granted: false });
});

test('Purchase receipts are acknowledged once and remain deduplicated after ordinary IDs are evicted', async ({ page }) => {
  const state = await setup(page, { consent: true, failFirstAcknowledgement: true }); await page.goto('/shop');
  const purchase = receipt('Purchase', 'abcd1234-abcd-4234-8234-abcdef123456');
  await page.evaluate(async value => { const module = await import('/src/tracking/client.js'); module.emitTracking(value); module.emitTracking(value); }, purchase);
  await expect.poll(() => state.acknowledgements.length).toBe(1);
  await expect.poll(async () => (await pixelEvents(page)).filter(call => call[1] === 'Purchase').length).toBe(1);
  await page.evaluate(() => sessionStorage.setItem('tw-meta-seen-v1', JSON.stringify([])));
  await page.reload();
  await expect(page.getByRole('button', { name: 'Tracking preferences', exact: true })).toBeVisible();
  await page.evaluate(async value => { const module = await import('/src/tracking/client.js'); module.emitTracking(value); }, purchase);
  await expect.poll(() => state.acknowledgements.length).toBe(2);
  expect((await pixelEvents(page)).some(call => call[1] === 'Purchase')).toBe(false);
});

test('search events represent explicit submissions, not URL loads, sorting, pagination or refetches', async ({ page }) => {
  await setup(page, { consent: true });
  const actions = [];
  const headers = { 'access-control-allow-origin': 'http://127.0.0.1:5191', 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type,x-tracking-consent,x-search-event-id', 'access-control-allow-methods': 'GET,OPTIONS' };
  await page.route('**/api/v1/public/products?**', route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const id = route.request().headers()['x-search-event-id'];
    if (id) actions.push(id);
    return route.fulfill({ headers, json: { ok: true, data: { products: [commerceProduct], pagination: { page: 1, pages: 1, total: 1, limit: 20 }, tracking: id ? receipt('Search', id) : null } } });
  });
  await page.goto('/shop?q=Old');
  await expect(page.getByRole('heading', { name: commerceProduct.name })).toBeVisible();
  expect(actions).toHaveLength(0);
  await page.getByLabel('Sort by').selectOption('price_asc');
  await page.getByLabel('Search products by name').fill('New');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect.poll(() => actions.length).toBe(1);
  await expect.poll(async () => (await pixelEvents(page)).filter(call => call[1] === 'Search').length).toBe(1);
  await page.getByLabel('Sort by').selectOption('newest');
  await expect(page).toHaveURL(/sort=newest/);
  await page.goBack();
  await expect(page).toHaveURL(/sort=price_asc/);
  expect(actions).toHaveLength(1);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect.poll(() => actions.length).toBe(2);
  expect(new Set(actions).size).toBe(2);
});

test('blocked browser storage and failed cookie revocation still suppress future marketing events', async ({ page }) => {
  await page.addInitScript(() => {
    for (const name of ['localStorage', 'sessionStorage']) Object.defineProperty(window, name, { get() { throw new DOMException('Synthetic storage restriction.', 'SecurityError'); } });
  });
  await setup(page, { consent: true });
  await page.route('**/api/v1/tracking/consent', route => {
    const headers = { 'access-control-allow-origin': 'http://127.0.0.1:5191', 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type,x-csrf-token,x-tracking-consent', 'access-control-allow-methods': 'POST,OPTIONS' };
    return route.fulfill({ status: route.request().method() === 'OPTIONS' ? 204 : 503, headers, json: { ok: false, error: { message: 'Synthetic revocation outage.' } } });
  });
  await page.goto('/shop');
  await page.getByRole('button', { name: 'Tracking preferences', exact: true }).click();
  await page.getByRole('button', { name: 'Turn off optional tracking', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Optional tracking is off in this browser. The server preference could not be saved; please try again.');
  const result = await page.evaluate(async () => {
    const module = await import('/src/tracking/client.js');
    return { choice: module.trackingChoice(), emitted: module.emitTracking({ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', name: 'AddToCart', parameters: { currency: 'EGP', value: 1 } }) };
  });
  expect(result.choice.choice).toBe('declined'); expect(result.emitted).toBe(false);
});

test('browser receipts reject fractional piastres and unsafe amounts while preserving exact EGP decimals', async ({ page }) => {
  await setup(page, { consent: true }); await page.goto('/shop');
  await expect(page.getByRole('button', { name: 'Tracking preferences', exact: true })).toBeVisible();
  const results = await page.evaluate(async () => {
    const module = await import('/src/tracking/client.js');
    return [1.001, -1, Number.MAX_SAFE_INTEGER, 1.29].map(value => module.emitTracking({ id: crypto.randomUUID(), name: 'AddToCart', parameters: { currency: 'EGP', value } }));
  });
  expect(results).toEqual([false, false, false, true]);
});
