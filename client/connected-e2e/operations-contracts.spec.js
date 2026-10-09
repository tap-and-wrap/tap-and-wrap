import { test, expect } from '@playwright/test';

const api = 'http://127.0.0.1:4092';
test.beforeEach(async ({ context }) => {
  await context.route('**/*', route => {
    const address = new URL(route.request().url());
    return ['127.0.0.1', 'localhost'].includes(address.hostname) || ['data:', 'blob:'].includes(address.protocol) ? route.continue() : route.abort();
  });
});
async function login(page, name, destination) {
  await page.goto(`/login?returnTo=${encodeURIComponent(destination)}`);
  await page.getByLabel('Email Address').fill(`${name}@connected.example.test`);
  await page.getByLabel('Password', { exact: true }).fill('isolated-fixture-password');
  await page.getByRole('button', { name: 'Log In', exact: true }).click();
  await expect(page).toHaveURL(destination);
}
async function csrfHeaders(context) {
  const response = await context.request.get(`${api}/api/v1/auth/csrf`); expect(response.ok()).toBeTruthy();
  return { Origin: 'http://127.0.0.1:5192', 'x-csrf-token': (await response.json()).data.csrfToken };
}
async function fixtureState(request) {
  const response = await request.get(`${api}/__fixture/state`, { headers: { 'x-fixture-key': 'connected-fixture-only' } });
  expect(response.ok()).toBeTruthy(); return response.json();
}

test('real readiness and correlation diagnostics preserve provider/checkout gates and guest admin denial', async ({ context, page }) => {
  const ready = await context.request.get(`${api}/health/ready`, { headers: { 'X-Request-Id': 'synthetic-secret-do-not-reflect' } });
  expect(ready.status()).toBe(200); expect(ready.headers()['cache-control']).toBe('no-store');
  expect(ready.headers()['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  expect(JSON.stringify(await ready.json())).not.toContain('synthetic-secret');
  const status = await context.request.get(`${api}/api/v1/status`);
  expect((await status.json()).data.checkoutEnabled).toBe(false);
  const checkout = await context.request.get(`${api}/api/v1/commerce/checkout/config`);
  expect((await checkout.json()).data.enabled).toBe(false);
  expect((await context.request.get(`${api}/api/v1/admin/products`)).status()).toBe(401);
  await page.goto('/admin/products');
  await expect(page.getByRole('heading', { name: 'Administrator sign in' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
});

test('real public query contract caps pages, counts filtered approvals and drives React EGP filter/history behavior', async ({ context, page }) => {
  const base = `${api}/api/v1/public/products?q=ConnectedCatalogBatch3&sort=price_asc&includePriceRange=false`;
  const first = (await (await context.request.get(`${base}&limit=99`)).json()).data;
  const second = (await (await context.request.get(`${base}&page=2&limit=20`)).json()).data;
  expect(first.pagination).toMatchObject({ page: 1, limit: 20, total: 25, pages: 2 });
  expect(first.products).toHaveLength(20); expect(second.products).toHaveLength(5);
  expect(first.products.map(product => product.pricePiastres)).toEqual(Array.from({ length: 20 }, (_, index) => 1100 + index * 100));
  expect(first.products.every(product => product.priceApproved && !product.slug.includes('private'))).toBe(true);
  for (const product of first.products) {
    expect(product.galleryKeys).toBeUndefined(); expect(product.galleryUrls).toBeUndefined(); expect(product.customization).toBeUndefined();
    expect(product.mainImageKey).toBeUndefined(); expect(product.mainImageUrl).toBeNull();
  }
  const available = (await (await context.request.get(`${base}&availability=available`)).json()).data;
  const soldOut = (await (await context.request.get(`${base}&availability=sold_out`)).json()).data;
  expect(available.pagination.total).toBe(24); expect(soldOut.pagination.total).toBe(1);
  expect(soldOut.products[0].orderingAvailable).toBe(false);
  expect((await context.request.get(`${base}&minPrice=1500&maxPrice=1200`)).status()).toBe(400);
  expect((await context.request.get(`${base}&minPrice=-1`)).status()).toBe(400);
  await page.goto('/shop?q=ConnectedCatalogBatch3&sort=price_asc');
  await expect(page.locator('.catalog-card')).toHaveCount(20);
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.locator('.catalog-card')).toHaveCount(5); await expect(page).toHaveURL(/page=2/);
  await page.goBack(); await expect(page.locator('.catalog-card')).toHaveCount(20);
  await page.getByLabel('Minimum price (EGP)', { exact: true }).fill('12.');
  await expect(page.getByLabel('Minimum price (EGP)', { exact: true })).toHaveValue('12.');
  await page.getByLabel('Maximum price (EGP)', { exact: true }).fill('14');
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await expect(page).toHaveURL(/minPrice=1200/); await expect(page).toHaveURL(/maxPrice=1400/);
  await expect(page.locator('.catalog-card')).toHaveCount(3);
  await page.getByRole('button', { name: 'Clear All', exact: true }).click();
  await expect(page.locator('.catalog-card')).toHaveCount(20);
  expect(new URL(page.url()).searchParams.get('q')).toBe('ConnectedCatalogBatch3');
  expect(new URL(page.url()).searchParams.get('sort')).toBe('price_asc');
  expect(new URL(page.url()).searchParams.has('minPrice')).toBe(false);
});

test('real admin product edit rejects stale React drafts and unapproved publication without overwriting merchant fields', async ({ page, context, request }) => {
  await login(page, 'admin', '/admin/products');
  const fixture = await fixtureState(request);
  const headers = await csrfHeaders(context);
  const created = await context.request.post(`${api}/api/v1/admin/products`, { headers, data: { name: 'Contract stale draft', slug: 'contract-stale-draft', categoryId: fixture.categoryId,
    mainImageKey: 'fixtures/stale.webp', galleryKeys: ['fixtures/stale.webp'], pricePiastres: 3, priceApproved: false, status: 'draft' } });
  expect(created.status()).toBe(201); const product = (await created.json()).data.product;
  await page.goto(`/admin/products/${product._id}/edit`);
  await expect(page.getByLabel('Product name', { exact: true })).toHaveValue('Contract stale draft');
  await page.getByLabel('Product name', { exact: true }).fill('Unsaved local merchant draft');
  const changed = await context.request.patch(`${api}/api/v1/admin/products/${product._id}`, { headers, data: { expectedRevision: product.revision, description: 'Newer synthetic admin edit' } });
  expect(changed.status()).toBe(200); const current = (await changed.json()).data.product;
  const saving = page.waitForResponse(response => response.url().endsWith(`/admin/products/${product._id}`) && response.request().method() === 'PATCH');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click(); expect((await saving).status()).toBe(409);
  await expect(page.getByText('Another editor changed this record. Your unsaved changes are still here.', { exact: false })).toBeVisible();
  await expect(page.getByLabel('Product name', { exact: true })).toHaveValue('Unsaved local merchant draft');
  const persisted = (await (await context.request.get(`${api}/api/v1/admin/products/${product._id}`)).json()).data.product;
  expect(persisted.name).toBe('Contract stale draft'); expect(persisted.description).toBe('Newer synthetic admin edit');
  expect(persisted.pricePiastres).toBe(3); expect(persisted.priceApproved).toBe(false);
  const forbidden = await context.request.patch(`${api}/api/v1/admin/products/${product._id}/publication`, { headers, data: { expectedRevision: current.revision, status: 'ready' } });
  expect(forbidden.status()).toBe(400);
  expect((await context.request.get(`${api}/api/v1/public/products/contract-stale-draft`)).status()).toBe(404);
  const invalidOrigin = await context.request.patch(`${api}/api/v1/admin/products/${product._id}`, { headers: { ...headers, Origin: 'https://unapproved.synthetic.test' }, data: { expectedRevision: current.revision, name: 'Must not persist' } });
  expect(invalidOrigin.status()).toBe(403); expect((await invalidOrigin.json()).error.code).toBe('INVALID_ORIGIN');
});

test('real category editor preserves a stale draft and immutable child relationships after a concurrent rename', async ({ page, context }) => {
  await login(page, 'admin', '/admin/website/categories');
  const headers = await csrfHeaders(context);
  const rootResponse = await context.request.post(`${api}/api/v1/admin/categories`, { headers, data: { name: 'Contract category root', slug: 'contract-category-root', active: true } });
  expect(rootResponse.status()).toBe(201); const root = (await rootResponse.json()).data.category;
  const childResponse = await context.request.post(`${api}/api/v1/admin/categories`, { headers, data: { name: 'Contract category child', slug: 'contract-category-child', parentId: root._id, active: true } });
  expect(childResponse.status()).toBe(201); const child = (await childResponse.json()).data.category;
  await page.reload();
  await page.getByRole('row').filter({ hasText: 'Contract category root' }).getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Unsaved category name');
  const renamed = await context.request.patch(`${api}/api/v1/admin/categories/${root._id}`, { headers, data: { expectedRevision: root.revision, name: 'Newer category name', slug: 'newer-category-slug' } });
  expect(renamed.status()).toBe(200);
  const saving = page.waitForResponse(response => response.url().endsWith(`/admin/categories/${root._id}`) && response.request().method() === 'PATCH');
  await page.getByRole('button', { name: 'Save category', exact: true }).click(); expect((await saving).status()).toBe(409);
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Unsaved category name');
  await expect(page.getByRole('button', { name: 'Reload latest record', exact: true })).toBeVisible();
  const childNow = (await (await context.request.get(`${api}/api/v1/admin/categories/${child._id}`)).json()).data.category;
  expect(childNow.parentId).toBe(root._id);
  const queried = await context.request.get(`${api}/api/v1/admin/categories?parent=newer-category-slug&search=Contract%20category%20child&limit=99`);
  expect(queried.status()).toBe(200); const data = (await queried.json()).data;
  expect(data.pagination.limit).toBe(20); expect(data.categories.map(category => category._id)).toEqual([child._id]);
});

test('real checkout submission lookup is owner-scoped, private and available while new checkout stays disabled', async ({ page, context, request }) => {
  const fixture = await fixtureState(request); const alice = fixture.orders.find(order => order.orderNumber === '234567');
  await login(page, 'alice', '/my-orders');
  const own = await context.request.get(`${api}/api/v1/commerce/checkout/submissions/${alice.checkoutKey}`);
  expect(own.status()).toBe(200); expect(own.headers()['cache-control']).toContain('no-store');
  const data = (await own.json()).data; expect(data.order.orderNumber).toBe('234567');
  expect(JSON.stringify(data)).not.toContain('PRIVATE_OPERATIONAL_NOTE'); expect(JSON.stringify(data)).not.toContain('PRIVATE_LEGACY_OPERATIONAL_NOTE');
  expect(data.order.owner).toBeUndefined(); expect(data.order.paymentProofId).toBeUndefined();
  await login(page, 'bob', '/my-orders');
  const denied = await context.request.get(`${api}/api/v1/commerce/checkout/submissions/${alice.checkoutKey}`);
  expect(denied.status()).toBe(200); expect((await denied.json()).data.order).toBeNull();
  const guest = await request.get(`${api}/api/v1/commerce/checkout/submissions/${alice.checkoutKey}`);
  expect(guest.status()).toBe(200); expect((await guest.json()).data.order).toBeNull();
  const before = (await fixtureState(request)).orderCount;
  const rejected = await context.request.post(`${api}/api/v1/commerce/orders`, { headers: await csrfHeaders(context), data: { checkoutKey: crypto.randomUUID(), paymentMethod: 'cod', customer: {
    name: 'Synthetic disabled customer', email: 'disabled@example.test', phone: '01012345678', governorate: 'cairo', address: '20 Synthetic Fixture Street' } } });
  expect(rejected.status()).toBe(403); expect((await rejected.json()).error.code).toBe('CHECKOUT_DISABLED');
  expect((await fixtureState(request)).orderCount).toBe(before);
});
