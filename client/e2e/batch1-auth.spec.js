import { test, expect } from '@playwright/test';
import { commerceProduct, isolatedImageFile, mockCommerce } from './commerce-fixtures.js';
import { QueryClient, hashKey } from '@tanstack/react-query';
import { scopeLegacyPrivateQueries } from '../src/auth/cache.js';

const headers = { 'access-control-allow-origin': 'http://127.0.0.1:5191', 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type,x-csrf-token,x-tracking-consent', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'access-control-expose-headers': 'X-Session-Expired' };
const userA = { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Account A', role: 'customer', email: 'a@example.test' };
const userB = { id: 'bbbbbbbbbbbbbbbbbbbbbbbb', name: 'Account B', role: 'customer', email: 'b@example.test' };
const emptyCart = { items: [], quantity: 0, subtotalPiastres: 0 };

async function fixture(context) {
  const state = { user: { ...userA }, csrf: 'csrf-one', calls: [], hold: null, forceCsrf: false, failNetwork: false, rejectOrigin: false };
  await context.route(/^https:\/\//, route => route.abort());
  await context.route('**/api/v1/**', async route => {
    const request = route.request(); const path = new URL(request.url()).pathname.replace('/api/v1', ''); const method = request.method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const payload = method === 'POST' ? request.postDataJSON() : null;
    state.calls.push({ path, method, token: request.headers()['x-csrf-token'], payload });
    const reply = (data, status = 200, code, extraHeaders = {}) => route.fulfill({ headers: { ...headers, ...extraHeaders }, status, json: status < 400 ? { ok: true, data } : { ok: false, error: { code: code || 'UNAUTHORIZED', message: code || 'Sign in required.' } } });
    if (path === '/auth/me') return state.meFailure ? reply({}, 503, 'ACCOUNT_UNAVAILABLE') : state.user ? reply({ user: state.user }) : reply({}, 401);
    if (path === '/auth/csrf') { if (state.hold?.path === path) { state.hold.started(); await state.hold.wait; } return reply({ csrfToken: state.csrf }); }
    if (path === '/auth/login' || path === '/auth/signup') {
      if (state.loginHold && payload.email === userA.email) { state.loginHold.started(); await state.loginHold.wait; }
      state.user = { ...(payload.email === userA.email ? userA : userB) };
      return reply({ user: state.user });
    }
    if (path === '/auth/logout') { state.user = null; return reply({ loggedOut: true }); }
    if (path === '/auth/account-status') return state.user ? reply({ emailVerified: false, emailDeliveryConfigured: false }) : reply({}, 401);
    if (path === '/tracking/config') return reply({ enabled: false });
    if (path === '/public/site-content') return reply({ policies: {}, faq: [], featuredReviews: [] });
    if (path === '/public/bundles') return reply({ bundles: [] });
    if (path === '/public/categories') return reply({ categories: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } });
    if (path === '/public/products') return reply({ products: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } });
    if (path === '/commerce/cart' || path === '/commerce/cart/merge') {
      const expired = state.cartExpiryHeader; state.cartExpiryHeader = false;
      return reply({ cart: emptyCart, checkoutEnabled: false }, 200, undefined, expired ? { 'x-session-expired': '1' } : {});
    }
    if (path === '/commerce/uploads/sign') return reply({ upload: { id: 'isolated-upload-id' }, uploadUrl: 'http://127.0.0.1:5191/isolated-upload', headers: { 'Content-Type': 'image/png' } });
    if (path === '/commerce/uploads/isolated-upload-id/complete') return reply({ uploaded: true });
    if (path === '/admin/ping') return state.user?.role === 'admin' ? reply({ authorized: true }) : reply({}, 403, 'FORBIDDEN');
    if (path === '/admin/products') {
      if (state.user?.role !== 'admin') return reply({}, 403, 'FORBIDDEN');
      const owner = { ...state.user };
      if (state.hold?.path === path && owner.id === userA.id) { state.hold.started(); await state.hold.wait; }
      return reply({ products: [{ _id: owner.id, name: `Private admin ${owner.name}`, slug: 'isolated-admin-record', status: 'draft', priceApproved: false, inventory: { approved: false, mode: 'tracked', quantity: 10, available: true }, revision: 0 }], pagination: { page: 1, limit: 20, total: 1, pages: 1 } });
    }
    if (path === '/admin/categories') return reply({ categories: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } });
    if (path === '/commerce/orders' && method === 'GET') {
      if (!state.user) return reply({}, 401);
      const owner = { ...state.user };
      if (state.hold?.path === path && owner.id === userA.id) {
        state.hold.started(); await state.hold.wait;
      }
      return reply({ orders: [{ id: `${owner.id}-order`, orderNumber: owner.id === userA.id ? '111111' : '222222', fulfillmentState: 'received', totalPiastres: 100, createdAt: '2026-10-09T12:00:00.000Z' }], pagination: { page: 1, limit: 20, total: 1, pages: 1 } });
    }
    if (path === '/commerce/cart/items' || path === '/commerce/orders') {
      if (state.failNetwork) return route.abort('failed');
      if (state.rejectOrigin) return reply({}, 403, 'INVALID_ORIGIN');
      if (state.forceCsrf || request.headers()['x-csrf-token'] !== state.csrf) return reply({}, 403, 'INVALID_CSRF');
      if (state.hold?.path === path) { state.hold.started(); await state.hold.wait; }
      return reply({ cart: { ...emptyCart, quantity: 8 }, marker: 'OLD_PRIVATE_RESPONSE' });
    }
    return reply({}, 404, 'NOT_FOUND');
  });
  return state;
}
async function spa(page, path) { await page.evaluate(value => { history.pushState({}, '', value); window.dispatchEvent(new PopStateEvent('popstate')); }, path); }
async function signIn(page) {
  await page.getByLabel('Email Address', { exact: true }).fill(userB.email);
  await page.getByLabel('Password', { exact: true }).fill('valid-isolated-password');
  await page.getByRole('button', { name: 'Log In', exact: true }).click();
  await expect(page).toHaveURL(/\/my-orders$/);
}
function held(path) {
  let release, started;
  const wait = new Promise(resolve => { release = resolve; });
  const begun = new Promise(resolve => { started = resolve; });
  return { path, wait, begun, release, started };
}

test('A to B switching isolates cached orders and preserves public catalog caching', async ({ page, context }) => {
  const state = await fixture(context);
  await page.goto('/shop'); await expect(page.getByRole('heading', { name: 'No products found' })).toBeVisible();
  const publicCalls = state.calls.filter(call => call.path === '/public/categories').length;
  await spa(page, '/my-orders'); await expect(page.getByRole('heading', { name: '#111111' })).toBeVisible();
  await spa(page, '/login'); await signIn(page);
  await expect(page.getByRole('heading', { name: '#222222' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '#111111' })).toHaveCount(0);
  await spa(page, '/shop'); await expect(page.getByRole('heading', { name: 'No products found' })).toBeVisible();
  expect(state.calls.filter(call => call.path === '/public/categories')).toHaveLength(publicCalls);
});

test('late account A mutation responses cannot enter account B state', async ({ page, context }) => {
  const state = await fixture(context); state.hold = held('/commerce/cart/items');
  await page.goto('/my-orders'); await expect(page.getByRole('heading', { name: '#111111' })).toBeVisible();
  await page.evaluate(() => {
    window.isolatedPendingMutation = import('/src/services/api.js').then(({ safePost }) => safePost('/commerce/cart/items', { productId: 'isolated', quantity: 1 }))
      .then(() => 'UNSAFE_SUCCESS', error => error.code);
  });
  await state.hold.begun;
  await spa(page, '/login'); await signIn(page); await expect(page.getByRole('heading', { name: '#222222' })).toBeVisible();
  state.hold.release();
  expect(await page.evaluate(() => window.isolatedPendingMutation)).toBe('ERR_CANCELED');
  await expect(page.getByRole('link', { name: 'Cart', exact: true })).toBeVisible();
  await expect(page.getByText('OLD_PRIVATE_RESPONSE')).toHaveCount(0);
});

test('cross-tab account changes invalidate another tab’s customer cache', async ({ page, context }) => {
  const state = await fixture(context);
  await page.goto('/my-orders'); await expect(page.getByRole('heading', { name: '#111111' })).toBeVisible();
  const second = await context.newPage(); await second.goto('/login'); await signIn(second);
  await expect(page.getByRole('heading', { name: '#222222' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '#111111' })).toHaveCount(0);
  await second.close();
  expect(state.calls.filter(call => call.path === '/auth/me').length).toBeGreaterThan(2);
});

test('a delayed account A order query is cancelled during account switching', async ({ page, context }) => {
  const state = await fixture(context); state.hold = held('/commerce/orders');
  await page.goto('/my-orders'); await state.hold.begun;
  await spa(page, '/login'); await signIn(page);
  await expect(page.getByRole('heading', { name: '#222222' })).toBeVisible();
  state.hold.release();
  await expect(page.getByRole('heading', { name: '#111111' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '#222222' })).toBeVisible();
});

test('private mutation awaiting CSRF is cancelled before dispatch when authentication changes', async ({ page, context }) => {
  const state = await fixture(context); state.hold = held('/auth/csrf');
  await page.goto('/my-orders'); await expect(page.getByRole('heading', { name: '#111111' })).toBeVisible();
  await page.evaluate(() => {
    window.waitingForCsrf = import('/src/services/api.js').then(({ safePost }) => safePost('/commerce/cart/items', {})).then(() => 'UNSAFE_SUCCESS', error => error.code);
  });
  await state.hold.begun; await spa(page, '/login');
  await page.getByLabel('Email Address').fill(userB.email); await page.getByLabel('Password', { exact: true }).fill('valid-isolated-password');
  await page.getByRole('button', { name: 'Log In', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Please wait…', exact: true })).toBeDisabled();
  state.hold.release();
  expect(await page.evaluate(() => window.waitingForCsrf)).toBe('ERR_CANCELED');
  await expect(page.getByRole('heading', { name: '#222222' })).toBeVisible();
  expect(state.calls.some(call => call.path === '/commerce/cart/items')).toBe(false);
});

test('superseded cross-tab login responses force cookie-owner verification in every tab', async ({ page, context }) => {
  const state = await fixture(context); state.loginHold = held('/auth/login');
  await page.goto('/login'); await page.getByLabel('Email Address').fill(userA.email);
  await page.getByLabel('Password', { exact: true }).fill('valid-isolated-password');
  await page.getByRole('button', { name: 'Log In', exact: true }).click(); await state.loginHold.begun;
  const second = await context.newPage(); await second.goto('/login'); await signIn(second);
  await expect(second.getByRole('heading', { name: '#222222' })).toBeVisible();
  state.loginHold.release();
  await expect(page.getByRole('alert')).toContainText('account changed in another window');
  await expect(second.getByText('Signed in as Account A.')).toBeVisible();
  await expect(second.getByRole('heading', { name: '#111111' })).toBeVisible();
  await expect(second.getByRole('heading', { name: '#222222' })).toHaveCount(0);
  const identities = await Promise.all([page, second].map(tab => tab.evaluate(() => import('/src/auth/session.js').then(({ sessionSnapshot }) => sessionSnapshot().user.id))));
  expect(identities).toEqual([userA.id, userA.id]); await second.close();
});

test('session verification failures show an honest cart error instead of indefinite loading', async ({ page, context }) => {
  const state = await fixture(context); state.meFailure = true;
  await page.goto('/cart'); await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByText('Loading your cart…')).toHaveCount(0);
});

test('revocation observed by a session probe invalidates pending private mutation generations', async ({ page, context }) => {
  const state = await fixture(context); state.hold = held('/commerce/cart/items');
  await page.goto('/my-orders'); await expect(page.getByRole('heading', { name: '#111111' })).toBeVisible();
  await page.evaluate(() => {
    window.revokedMutation = import('/src/services/api.js').then(({ safePost }) => safePost('/commerce/cart/items', {})).then(() => 'UNSAFE_SUCCESS', error => error.code);
  });
  await state.hold.begun; state.user = null;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('link', { name: 'Sign in to view your orders' })).toBeVisible();
  state.hold.release(); expect(await page.evaluate(() => window.revokedMutation)).toBe('ERR_CANCELED');
});

test('guest focus checks preserve selected browser-only personalization photos', async ({ page }) => {
  const product = { ...commerceProduct, requiresOptions: true, personalization: { fields: [{ key: 'photo', label: 'Selected photo', type: 'image', required: true, minFiles: 1, maxFiles: 1, maxBytes: 1048576, acceptedMimeTypes: ['image/png'] }] } };
  const state = await mockCommerce(page, { product });
  await page.route('**/api/v1/auth/me', route => route.fulfill({ status: 401, headers, json: { ok: false, error: { code: 'UNAUTHORIZED', message: 'Sign in required.' } } }));
  await page.goto(`/products/${product.slug}`);
  await page.getByLabel(/^Selected photo/).setInputFiles(isolatedImageFile());
  await expect(page.locator('.commerce-file-previews img')).toHaveCount(1);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('.commerce-file-previews img')).toHaveCount(1);
  expect(state.uploads).toHaveLength(0);
});

test('legacy private query hashes isolate owners and retain prefix invalidation and public defaults', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: 45678, retry: false } } });
  const adminKey = ['admin', 'products', { page: 1 }], publicKey = ['catalog', 'products', { page: 1 }];
  scopeLegacyPrivateQueries(client, 'user:A:1');
  client.setQueryData(adminKey, { marker: 'private-A' }); client.setQueryData(publicKey, { marker: 'public' });
  const first = client.getQueryCache().find({ queryKey: adminKey, exact: true });
  expect(first.queryHash).toBe(hashKey(['private', 'user:A:1', ...adminKey]));
  expect(client.defaultQueryOptions({ queryKey: adminKey }).staleTime).toBe(45678);
  scopeLegacyPrivateQueries(client, 'user:B:2');
  expect(client.getQueryData(adminKey)).toBeUndefined(); client.setQueryData(adminKey, { marker: 'private-B' });
  expect(client.getQueryData(adminKey)).toEqual({ marker: 'private-B' });
  expect(client.getQueryData(publicKey)).toEqual({ marker: 'public' });
  const explicit = ['private', 'user:B:2', 'order', 'id']; client.setQueryData(explicit, { marker: 'explicit' });
  expect(client.getQueryCache().find({ queryKey: explicit, exact: true }).queryHash).toBe(hashKey(explicit));
  await client.invalidateQueries({ queryKey: ['admin'], refetchType: 'none' });
  expect(client.getQueryCache().findAll({ queryKey: ['admin'] })).toHaveLength(2);
  expect(client.getQueryCache().findAll({ queryKey: ['admin'] }).every(query => query.state.isInvalidated)).toBe(true);
  client.removeQueries({ queryKey: ['admin'] }); expect(client.getQueryData(adminKey)).toBeUndefined();
  expect(client.getQueryData(publicKey)).toEqual({ marker: 'public' }); client.clear();
});

test('legacy delayed admin queries retain their captured owner hash after a switch', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); const key = ['admin', 'customers'];
  let release; const pending = new Promise(resolve => { release = resolve; });
  scopeLegacyPrivateQueries(client, 'user:A:1');
  const original = client.fetchQuery({ queryKey: key, queryFn: () => pending });
  scopeLegacyPrivateQueries(client, 'user:B:2'); client.setQueryData(key, { marker: 'private-B' });
  release({ marker: 'private-A' }); await original;
  expect(client.getQueryData(key)).toEqual({ marker: 'private-B' });
  const old = client.getQueryCache().get(hashKey(['private', 'user:A:1', ...key]));
  expect(old.state.data).toEqual({ marker: 'private-A' });
  client.clear();
});

test('delayed administrator A responses cannot populate administrator B’s pages', async ({ page, context }) => {
  const state = await fixture(context); state.user = { ...userA, role: 'admin' }; state.hold = held('/admin/products');
  await page.goto('/admin/products'); await state.hold.begun;
  state.user = { ...userB, role: 'admin' };
  await page.evaluate(() => { const channel = new BroadcastChannel('tap-wrap-session'); channel.postMessage('changed'); channel.close(); });
  await expect(page.locator('.admin-products-table strong').filter({ hasText: 'Private admin Account B' })).toBeVisible();
  state.hold.release(); await expect(page.getByText('Private admin Account A', { exact: true })).toHaveCount(0);
  await expect(page.locator('.admin-products-table strong').filter({ hasText: 'Private admin Account B' })).toBeVisible();
});

test('a successful expired-session guest cart response immediately removes old account views without replay', async ({ page, context }) => {
  const state = await fixture(context);
  await page.goto('/my-orders'); await expect(page.getByRole('heading', { name: '#111111' })).toBeVisible();
  await expect(page.getByText('Signed in as Account A.')).toBeVisible();
  state.user = null; state.cartExpiryHeader = true;
  const result = await page.evaluate(() => import('/src/services/api.js').then(({ api }) => api.get('/commerce/cart')).then(() => 'UNSAFE_SUCCESS', error => error.code));
  expect(result).toBe('ERR_CANCELED');
  await expect(page.getByRole('heading', { name: '#111111' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Sign in to view your orders' })).toBeVisible();
  await expect(page.getByText('Signed in as Account A.')).toHaveCount(0);
  const snapshot = await page.evaluate(() => import('/src/auth/session.js').then(({ sessionSnapshot }) => sessionSnapshot()));
  expect(snapshot.user).toBeNull(); expect(snapshot.phase).toBe('ready');
  expect(state.calls.filter(call => call.method === 'POST' && call.path.startsWith('/commerce/'))).toHaveLength(0);
});

test('account switching aborts a delayed direct upload without completing files or adding items as the next owner', async ({ page, context }) => {
  const state = await fixture(context); const upload = held('direct-put');
  await context.route('**/isolated-upload', async route => { upload.started(); await upload.wait; await route.fulfill({ status: 200, body: '' }); });
  await page.goto('/my-orders'); await expect(page.getByRole('heading', { name: '#111111' })).toBeVisible();
  await page.evaluate(() => {
    window.pendingUpload = import('/src/commerce/api.js').then(async ({ uploadConfiguredFields, commercePost, discardUploads }) => {
      const uploaded = [];
      try {
        const file = new File(['isolated bytes'], 'private.png', { type: 'image/png' });
        const values = await uploadConfiguredFields({ photo: [file, file] }, [{ key: 'photo', type: 'image' }], { productId: 'isolated-product' }, uploaded);
        await commercePost('/cart/items', { productId: 'isolated-product', personalization: values });
        return 'UNSAFE_SUCCESS';
      } catch (error) { await discardUploads(uploaded); return error.code; }
    });
  });
  await upload.begun;
  await spa(page, '/login'); await signIn(page); await expect(page.getByRole('heading', { name: '#222222' })).toBeVisible();
  expect(await page.evaluate(() => window.pendingUpload)).toBe('ERR_CANCELED');
  upload.release();
  expect(state.calls.filter(call => call.path === '/commerce/uploads/sign')).toHaveLength(1);
  expect(state.calls.some(call => call.path.endsWith('/complete'))).toBe(false);
  expect(state.calls.some(call => call.path === '/commerce/cart/items')).toBe(false);
  expect(state.calls.some(call => call.path.startsWith('/commerce/uploads/') && call.method === 'DELETE')).toBe(false);
});

test('logout and session revocation remove customer content and protected caches', async ({ page, context }) => {
  const state = await fixture(context);
  await page.goto('/my-orders'); await expect(page.getByRole('heading', { name: '#111111' })).toBeVisible();
  state.user = null;
  await page.evaluate(() => import('/src/services/api.js').then(({ api }) => api.get('/commerce/orders')).catch(() => {}));
  await expect(page.getByRole('link', { name: 'Sign in to view your orders' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '#111111' })).toHaveCount(0);
  await spa(page, '/login'); await signIn(page); await expect(page.getByRole('heading', { name: '#222222' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/); await spa(page, '/my-orders');
  await expect(page.getByRole('link', { name: 'Sign in to view your orders' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '#222222' })).toHaveCount(0);
});

test('simultaneous mutations share CSRF acquisition and expire safely with one retry', async ({ page, context }) => {
  const state = await fixture(context); await page.goto('/my-orders'); await expect(page.getByRole('heading', { name: '#111111' })).toBeVisible();
  const run = () => page.evaluate(() => import('/src/services/api.js').then(({ safePost }) => Promise.all(Array.from({ length: 3 }, () => safePost('/commerce/cart/items', {}))).then(results => results.map(result => result.status))));
  expect(await run()).toEqual([200, 200, 200]);
  expect(state.calls.filter(call => call.path === '/auth/csrf')).toHaveLength(1);
  state.csrf = 'csrf-two';
  expect(await run()).toEqual([200, 200, 200]);
  expect(state.calls.filter(call => call.path === '/auth/csrf')).toHaveLength(2);
});

test('CSRF retry is bounded and never replays Origin or uncertain order failures', async ({ page, context }) => {
  const state = await fixture(context); await page.goto('/my-orders'); await expect(page.getByRole('heading', { name: '#111111' })).toBeVisible();
  async function attempt() { return page.evaluate(() => import('/src/services/api.js').then(({ safePost }) => safePost('/commerce/orders', {})).then(() => 'success', error => error.response?.data?.error?.code || error.code)); }
  state.forceCsrf = true;
  expect(await attempt()).toBe('INVALID_CSRF');
  expect(state.calls.filter(call => call.path === '/commerce/orders' && call.method === 'POST')).toHaveLength(2);
  state.forceCsrf = false; state.rejectOrigin = true;
  expect(await attempt()).toBe('INVALID_ORIGIN');
  expect(state.calls.filter(call => call.path === '/commerce/orders' && call.method === 'POST')).toHaveLength(3);
  state.rejectOrigin = false; state.failNetwork = true;
  expect(await attempt()).toBe('ERR_NETWORK');
  expect(state.calls.filter(call => call.path === '/commerce/orders' && call.method === 'POST')).toHaveLength(4);
});

test('signup and reset block passwords above 72 UTF-8 bytes before submission', async ({ page, context }) => {
  const state = await fixture(context); state.user = null;
  await page.goto('/signup');
  await page.getByLabel('Your Name').fill('Isolated signup'); await page.getByLabel('Email Address').fill('new@example.test');
  await page.getByLabel('Password', { exact: true }).fill('ع'.repeat(37)); await page.getByRole('button', { name: 'Create Account', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('72 UTF-8 bytes');
  expect(state.calls.some(call => call.path === '/auth/signup')).toBe(false);
  await page.goto(`/reset-password#token=${'a'.repeat(43)}`);
  await page.getByLabel('New password').fill('😀'.repeat(19)); await page.getByRole('button', { name: 'Reset password', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('72 UTF-8 bytes');
  expect(state.calls.some(call => call.path === '/auth/reset-password')).toBe(false);
});
