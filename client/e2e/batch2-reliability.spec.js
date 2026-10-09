import { expect, test } from '@playwright/test';
import { mockCatalog } from './catalog-fixtures.js';
import { commerceProduct, cartWithProduct, isolatedImageFile, mockCommerce } from './commerce-fixtures.js';

const headers = { 'access-control-allow-origin': 'http://127.0.0.1:5191', 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type,x-csrf-token,x-tracking-consent', 'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS' };
async function expectLinkedError(control, text) {
  await expect(control).toHaveAttribute('aria-invalid', 'true');
  const description = await control.evaluate((node) => (node.getAttribute('aria-describedby') || '').split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' '));
  expect(description).toContain(text);
}

test('skip navigation and route focus reach the page without focusing the sticky header', async ({ page }) => {
  await mockCatalog(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  await page.locator('.site-header').getByRole('link', { name: 'Shop', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Shop Our Gifts', exact: true })).toBeFocused();
  expect(await page.locator('.site-header').evaluate((node) => node.getBoundingClientRect().top)).toBeGreaterThanOrEqual(0);
});

test('query-only shop navigation preserves search focus and Back restores the previous page scroll', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    window.__scrollDiagnostic = [];
    const record = (type) => window.__scrollDiagnostic.push({ type, top: scrollY, url: location.pathname + location.search, key: history.state?.key, height: document.documentElement.scrollHeight, active: document.activeElement?.tagName });
    document.addEventListener('click', () => record('capture-click'), true);
    document.addEventListener('scroll', () => record('scroll'), { passive: true });
    addEventListener('popstate', () => record('popstate'));
    const scrollTo = window.scrollTo;
    window.scrollTo = (...args) => { record('before-scrollTo'); const result = scrollTo.apply(window, args); record('after-scrollTo'); return result; };
  });
  await mockCatalog(page);
  await page.goto('/shop');
  const search = page.getByRole('searchbox', { name: /Search products/i });
  await search.fill('Fixture');
  await search.press('Enter');
  await expect(page).toHaveURL(/q=Fixture/);
  await expect(search).toBeFocused();
  await page.evaluate(() => window.scrollTo(0, 620));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(600);
  await page.locator('.site-header').getByRole('link', { name: 'About Us', exact: true }).click();
  await expect(page).toHaveURL(/\/about$/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.goBack();
  await expect(page).toHaveURL(/\/shop\?q=Fixture/);
  try { await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(600); }
  finally { await testInfo.attach('isolated-scroll-lifecycle', { contentType: 'application/json', body: JSON.stringify(await page.evaluate(() => window.__scrollDiagnostic), null, 2) }); }
});

async function returnToDelayedPage(page) {
  await mockCatalog(page);
  await page.route('**/src/pages/TrackOrderPage.jsx*', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `
      const reactResource = performance.getEntriesByType('resource').find(entry => new URL(entry.name).pathname === '/node_modules/.vite/deps/react.js');
      const module = await import(reactResource.name);
      const React = module.default || module;
      export default function IsolatedDelayedPage() {
        const [ready, setReady] = React.useState(false);
        React.useEffect(() => {
          window.__completeDelayedPage = () => setReady(true);
          return () => { delete window.__completeDelayedPage; };
        }, []);
        return React.createElement('main', { className: 'page-shell' },
          React.createElement('h1', null, 'Delayed synthetic information'),
          ready ? React.createElement('section', { style: { minHeight: '1800px' }, 'aria-label': 'Isolated delayed content' }, 'Delayed content loaded') : React.createElement('p', { role: 'status' }, 'Waiting for isolated content'));
      }
    `,
  }));
  await page.goto('/track-order');
  await expect.poll(() => page.evaluate(() => typeof window.__completeDelayedPage)).toBe('function');
  await page.evaluate(() => window.__completeDelayedPage());
  await expect(page.getByText('Delayed content loaded', { exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 620));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(600);
  await page.locator('.site-header').getByRole('link', { name: 'About Us', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'About Us', exact: true })).toBeFocused();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Delayed synthetic information', exact: true })).toBeFocused();
  await expect(page.getByText('Waiting for isolated content', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThan(600);
  await expect.poll(() => page.evaluate(() => typeof window.__completeDelayedPage)).toBe('function');
}

test('Back restores the saved scroll after delayed route content becomes tall enough', async ({ page }) => {
  await returnToDelayedPage(page);
  await page.evaluate(() => window.__completeDelayedPage());
  await expect(page.getByText('Delayed content loaded', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(600);
});

test('a user key cancels pending Back restoration instead of scrolling later without consent', async ({ page }) => {
  await returnToDelayedPage(page);
  await page.keyboard.press('ArrowRight');
  await page.evaluate(() => window.__completeDelayedPage());
  await expect(page.getByText('Delayed content loaded', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(100);
  await expect(page.getByRole('heading', { name: 'Delayed synthetic information', exact: true })).toBeFocused();
});

test('a rejected page module shows a sanitized recovery screen instead of a blank storefront', async ({ page }) => {
  await mockCatalog(page);
  await page.route('**/src/pages/TrackOrderPage.jsx*', (route) => route.fulfill({ contentType: 'application/javascript', body: 'export default function BrokenFixture(){throw new Error("SYNTHETIC_PRIVATE_NOTE_DO_NOT_RENDER");}' }));
  await page.goto('/track-order');
  await expect(page.getByRole('heading', { name: 'This page couldn’t be displayed' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload page' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('SYNTHETIC_PRIVATE_NOTE_DO_NOT_RENDER');
  await expect(page.locator('.site-header')).toBeVisible();
  await page.locator('.site-header').getByRole('link', { name: 'Shop', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Shop Our Gifts', exact: true })).toBeVisible();
});

test('admin route focus waits for delayed authorization instead of focusing a temporary loading title', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const records = window.__focusLifecycle = [];
    const identities = new WeakMap(); let nextIdentity = 0;
    const id = (node) => { if (!node) return null; if (!identities.has(node)) identities.set(node, ++nextIdentity); return identities.get(node); };
    const describe = (node) => node ? { id: id(node), tag: node.tagName, text: node.tagName === 'H1' ? node.textContent : undefined, connected: node.isConnected, visible: Boolean(node.getClientRects().length) && getComputedStyle(node).visibility !== 'hidden', busy: Boolean(node.closest('[aria-busy="true"]')) } : null;
    const focus = HTMLElement.prototype.focus;
    HTMLElement.prototype.focus = function (...args) {
      const target = describe(this);
      const result = focus.apply(this, args);
      records.push({ type: 'focus', at: performance.now(), path: location.pathname, target, focused: document.activeElement === this, active: describe(document.activeElement) });
      return result;
    };
    let previous = '';
    const inspect = () => {
      const state = { path: location.pathname, headings: [...document.querySelectorAll('#main-content h1')].map(describe), active: describe(document.activeElement) };
      const key = JSON.stringify(state);
      if (key !== previous && records.length < 200) { previous = key; records.push({ type: 'heading-change', at: performance.now(), ...state }); }
    };
    addEventListener('DOMContentLoaded', () => { new MutationObserver(inspect).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['aria-busy', 'hidden', 'style', 'class'] }); inspect(); }, { once: true });
  });
  await mockCatalog(page, { role: 'admin' });
  let pendingPing;
  let releasePing;
  await page.route('**/api/v1/admin/ping', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (pendingPing) await pendingPing;
    return route.fallback();
  });
  await page.goto('/admin/products');
  await expect(page.getByRole('heading', { name: 'Products', exact: true })).toBeVisible();
  pendingPing = new Promise((resolve) => { releasePing = resolve; });
  try {
    await page.getByRole('navigation', { name: 'Administration', exact: true }).getByRole('link', { name: 'Categories', exact: true }).click();
    const temporary = page.getByRole('heading', { name: 'Checking administrator access', exact: true });
    await expect(temporary).toBeVisible();
    await expect(page.getByRole('main')).toHaveAttribute('aria-busy', 'true');
    await expect(temporary).not.toBeFocused();
    releasePing(); pendingPing = null;
    await expect(page.getByRole('heading', { name: 'Categories', exact: true })).toBeFocused();
  } finally {
    releasePing?.();
    await testInfo.attach('isolated-heading-focus-lifecycle', { contentType: 'application/json', body: JSON.stringify(await page.evaluate(() => window.__focusLifecycle), null, 2) });
  }
});

test('a reused busy heading receives focus when only its readiness and text change', async ({ page }) => {
  await mockCatalog(page);
  await page.route('**/src/pages/TrackOrderPage.jsx*', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `
      const resource = performance.getEntriesByType('resource').find(entry => new URL(entry.name).pathname === '/node_modules/.vite/deps/react.js');
      const module = await import(resource.name);
      const React = module.default || module;
      export default function IsolatedBusyPage() {
        const [ready, setReady] = React.useState(false);
        React.useEffect(() => {
          window.__completeBusyFixture = () => setReady(true);
          return () => { delete window.__completeBusyFixture; };
        }, []);
        return React.createElement('main', { className: 'page-shell', 'aria-busy': !ready },
          React.createElement('h1', null, ready ? 'Ready synthetic information' : 'Loading synthetic information'));
      }
    `,
  }));
  await page.goto('/shop');
  await page.locator('.site-header').getByRole('link', { name: 'Track Order', exact: true }).click();
  const loading = page.getByRole('heading', { name: 'Loading synthetic information', exact: true });
  await expect(loading).toBeVisible();
  await expect(loading).not.toBeFocused();
  const originalHeading = await loading.elementHandle();
  await expect.poll(() => page.evaluate(() => typeof window.__completeBusyFixture)).toBe('function');
  await page.evaluate(() => window.__completeBusyFixture());
  const ready = page.getByRole('heading', { name: 'Ready synthetic information', exact: true });
  await expect(ready).toBeFocused();
  expect(await ready.evaluate((node, original) => node === original, originalHeading)).toBe(true);
  await expect(page.getByRole('main')).toHaveAttribute('aria-busy', 'false');
});

async function openFocusReplacementFixture(page, mode = 'replace') {
  await mockCatalog(page);
  await page.route('**/src/pages/TrackOrderPage.jsx*', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `
      const resource = performance.getEntriesByType('resource').find(entry => new URL(entry.name).pathname === '/node_modules/.vite/deps/react.js');
      const module = await import(resource.name);
      const React = module.default || module;
      const mode = ${JSON.stringify(mode)};
      export default function IsolatedFocusReplacement() {
        const [phase, setPhase] = React.useState('initial');
        const [draft, setDraft] = React.useState('');
        React.useEffect(() => {
          window.__setFocusFixturePhase = setPhase;
          return () => { delete window.__setFocusFixturePhase; };
        }, []);
        const hidden = mode === 'hidden' && phase === 'initial';
        const title = mode === 'hidden' ? 'Revealed synthetic heading' : phase === 'busy' ? 'Loading replacement information' : phase === 'final' ? 'Final synthetic heading' : 'Initial synthetic heading';
        return React.createElement('main', { className: 'page-shell', 'aria-busy': phase === 'busy' },
          React.createElement('h1', { key: mode === 'hidden' ? 'fixed-heading' : phase, style: hidden ? { display: 'none' } : undefined }, title),
          React.createElement('label', { htmlFor: 'stable-focus-fixture' }, 'Stable synthetic input'),
          React.createElement('input', { id: 'stable-focus-fixture', value: draft, onChange: event => setDraft(event.target.value) }));
      }
    `,
  }));
  await page.goto('/shop');
  await page.locator('.site-header').getByRole('link', { name: 'Track Order', exact: true }).click();
  await expect.poll(() => page.evaluate(() => typeof window.__setFocusFixturePhase)).toBe('function');
}

test('a hidden destination heading gets focus when revealed by a style-only change', async ({ page }) => {
  await openFocusReplacementFixture(page, 'hidden');
  const hidden = page.locator('#main-content h1');
  await expect(hidden).toBeHidden();
  await expect(hidden).not.toBeFocused();
  const original = await hidden.elementHandle();
  await page.evaluate(() => window.__setFocusFixturePhase('final'));
  const ready = page.getByRole('heading', { name: 'Revealed synthetic heading', exact: true });
  await expect(ready).toBeFocused();
  expect(await ready.evaluate((node, previous) => node === previous, original)).toBe(true);
});

test('route focus follows a ready heading replaced by loading and a new final heading', async ({ page }) => {
  await openFocusReplacementFixture(page);
  await expect(page.getByRole('heading', { name: 'Initial synthetic heading', exact: true })).toBeFocused();
  await page.evaluate(() => window.__setFocusFixturePhase('busy'));
  const loading = page.getByRole('heading', { name: 'Loading replacement information', exact: true });
  await expect(loading).toBeVisible();
  await expect(loading).not.toBeFocused();
  await page.evaluate(() => window.__setFocusFixturePhase('final'));
  await expect(page.getByRole('heading', { name: 'Final synthetic heading', exact: true })).toBeFocused();
});

test('a loading replacement preserves input focus and typed drafts after deliberate user interaction', async ({ page }) => {
  await openFocusReplacementFixture(page);
  await expect(page.getByRole('heading', { name: 'Initial synthetic heading', exact: true })).toBeFocused();
  const input = page.getByLabel('Stable synthetic input', { exact: true });
  await input.click();
  await input.pressSequentially('Kept draft');
  await expect(input).toBeFocused();
  await page.evaluate(() => window.__setFocusFixturePhase('busy'));
  await expect(page.getByRole('heading', { name: 'Loading replacement information', exact: true })).toBeVisible();
  await expect(input).toBeFocused();
  await page.evaluate(() => window.__setFocusFixturePhase('final'));
  await expect(page.getByRole('heading', { name: 'Final synthetic heading', exact: true })).toBeVisible();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('Kept draft');
});

test('mobile drawer navigation focuses a delayed destination after closing and unlocking scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockCatalog(page);
  await page.route('**/src/pages/TrackOrderPage.jsx*', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `
      const resource = performance.getEntriesByType('resource').find(entry => new URL(entry.name).pathname === '/node_modules/.vite/deps/react.js');
      const module = await import(resource.name);
      const React = module.default || module;
      export default function IsolatedMobileDestination() {
        const [ready, setReady] = React.useState(false);
        React.useEffect(() => {
          window.__completeMobileDestination = () => setReady(true);
          return () => { delete window.__completeMobileDestination; };
        }, []);
        return React.createElement('main', { className: 'page-shell', 'aria-busy': !ready },
          React.createElement('h1', null, ready ? 'Ready mobile destination' : 'Waiting for mobile destination'));
      }
    `,
  }));
  await page.goto('/shop');
  await expect(page.getByRole('heading', { name: 'Shop Our Gifts', exact: true })).toBeVisible();
  const originalOverflow = await page.locator('body').evaluate(node => node.style.overflow);
  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Explore Tap & Wrap', exact: true });
  await expect(drawer).toBeVisible();
  await drawer.getByRole('link', { name: 'Track Order', exact: true }).click();
  await expect(drawer).toHaveCount(0);
  await expect(page).toHaveURL(/\/track-order$/);
  await expect.poll(() => page.locator('body').evaluate(node => node.style.overflow)).toBe(originalOverflow);
  expect(await page.evaluate(() => !document.activeElement.closest('dialog'))).toBe(true);
  const waiting = page.getByRole('heading', { name: 'Waiting for mobile destination', exact: true });
  await expect(waiting).toBeVisible();
  await expect(page.getByRole('main')).toHaveAttribute('aria-busy', 'true');
  await expect(waiting).not.toBeFocused();
  await expect.poll(() => page.evaluate(() => typeof window.__completeMobileDestination)).toBe('function');
  await page.evaluate(() => window.__completeMobileDestination());
  await expect(page.getByRole('heading', { name: 'Ready mobile destination', exact: true })).toBeFocused();
  await expect(page.getByRole('main')).toHaveAttribute('aria-busy', 'false');
});

test('signup field errors are linked, focus the first invalid field and issue no request', async ({ page }) => {
  const fixture = await mockCommerce(page);
  await page.goto('/signup');
  await page.getByRole('button', { name: 'Create Account', exact: true }).click();
  const name = page.getByLabel('Your Name', { exact: true });
  await expect(name).toBeFocused();
  await expectLinkedError(name, 'fill out');
  await expectLinkedError(page.getByLabel('Email Address', { exact: true }), 'fill out');
  expect(fixture.calls.filter((call) => call.path === '/auth/signup')).toHaveLength(0);
  await name.fill('Isolated Person');
  await page.getByLabel('Email Address', { exact: true }).fill('fixture@example.test');
  await page.getByLabel('Password', { exact: true }).fill('🎁'.repeat(20));
  await page.getByRole('button', { name: 'Create Account', exact: true }).click();
  await expectLinkedError(page.getByLabel('Password', { exact: true }), '72');
  expect(fixture.calls.filter((call) => call.path === '/auth/signup')).toHaveLength(0);
});

test('tracking fields report accessible errors without attempting an order lookup', async ({ page }) => {
  const fixture = await mockCommerce(page);
  await page.goto('/track-order');
  await page.getByRole('button', { name: 'Track Order', exact: true }).click();
  await expect(page.getByLabel('Order number', { exact: true })).toBeFocused();
  await expectLinkedError(page.getByLabel('Order number', { exact: true }), 'fill out');
  await expectLinkedError(page.getByLabel('Checkout phone number', { exact: true }), 'fill out');
  expect(fixture.calls.filter((call) => call.path === '/commerce/orders/track')).toHaveLength(0);
});

test('a verified administrator signing in goes to the dashboard instead of customer order history', async ({ page }) => {
  const fixture = await mockCommerce(page);
  await page.route('**/api/v1/auth/login', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    fixture.state.user = { id: '710000000000000000000050', name: 'Isolated Administrator', role: 'admin' };
    return route.fulfill({ headers, json: { ok: true, data: { user: fixture.state.user } } });
  });
  await page.goto('/login');
  await page.getByLabel('Email Address', { exact: true }).fill('admin-fixture@example.test');
  await page.getByLabel('Password', { exact: true }).fill('isolated-password-only');
  await page.getByRole('button', { name: 'Log In', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/website\/overview$/);
  await expect(page.locator('header.site-header').getByRole('link', { name: 'Account', exact: true })).toHaveAttribute('href', '/admin');
  expect(fixture.calls.filter((call) => call.path === '/commerce/orders')).toHaveLength(0);
});

test('personalization errors associate with their controls and selecting/removing files stays local', async ({ page }) => {
  const product = { ...commerceProduct, requiresOptions: true, personalization: { fields: [{ key: 'name', label: 'Recipient name', type: 'short_text', required: true, maxLength: 20 }, { key: 'photo', label: 'Recipient photo', type: 'image', required: true, minFiles: 1, maxFiles: 1, acceptedMimeTypes: ['image/png'] }] } };
  const fixture = await mockCommerce(page, { product });
  await page.goto(`/products/${product.slug}`);
  await page.getByRole('button', { name: 'Add to Cart', exact: true }).first().click();
  await expect(page.getByLabel('Recipient name', { exact: false })).toBeFocused();
  await expectLinkedError(page.getByLabel('Recipient name', { exact: false }), 'required');
  await expectLinkedError(page.getByLabel('Recipient photo', { exact: false }), 'exactly 1');
  await page.getByLabel('Recipient photo', { exact: false }).setInputFiles(isolatedImageFile('local-preview.png'));
  await expect(page.getByRole('img', { name: 'Selected recipient photo 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Remove local-preview.png', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Selected recipient photo 1' })).toHaveCount(0);
  expect(fixture.uploads).toHaveLength(0);
  expect(fixture.calls.filter((call) => call.path === '/commerce/cart/items')).toHaveLength(0);
});

test('failed private storage preserves local selections and a deliberate retry can succeed', async ({ page }) => {
  const product = { ...commerceProduct, requiresOptions: true, personalization: { fields: [{ key: 'photo', label: 'Customer photo', type: 'image', required: true, minFiles: 1, maxFiles: 1 }] } };
  const fixture = await mockCommerce(page, { product });
  let first = true;
  await page.route('**/api/v1/commerce/uploads/sign', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (!first) return route.fallback();
    first = false;
    return route.fulfill({ status: 503, headers, json: { ok: false, error: { code: 'STORAGE_UNAVAILABLE', message: 'Isolated storage is unavailable. Nothing was uploaded.' } } });
  });
  await page.goto(`/products/${product.slug}`);
  await page.getByLabel('Customer photo', { exact: false }).setInputFiles(isolatedImageFile('retry-photo.png'));
  await page.getByRole('button', { name: 'Add to Cart', exact: true }).first().click();
  await expect(page.getByText('Isolated storage is unavailable. Nothing was uploaded.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove retry-photo.png', exact: true })).toBeVisible();
  expect(fixture.state.cart.items).toHaveLength(0);
  await page.getByRole('button', { name: 'Add to Cart', exact: true }).first().click();
  await expect.poll(() => fixture.state.cart.items.length).toBe(1);
  expect(fixture.uploads).toHaveLength(1);
});

test('a verified customer can retry an unavailable order list without being redirected to login', async ({ page }) => {
  await mockCommerce(page, { role: 'customer' });
  let attempts = 0;
  await page.route('**/api/v1/commerce/orders?*', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    attempts += 1;
    if (attempts > 1) return route.fallback();
    return route.fulfill({ status: 503, headers, json: { ok: false, error: { code: 'UNAVAILABLE', message: 'Isolated order service unavailable.' } } });
  });
  await page.goto('/my-orders');
  await expect(page.getByText('Isolated order service unavailable.', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in to view your orders' })).toHaveCount(0);
  await page.getByRole('main').getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('heading', { name: '#681243', exact: true })).toBeVisible();
  expect(attempts).toBe(2);
});

test('customization product loading offers a deliberate bounded retry', async ({ page }) => {
  await mockCommerce(page);
  let attempts = 0;
  await page.route('**/api/v1/commerce/customization/services/gift_box/products?*', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    attempts += 1;
    if (attempts > 1) return route.fallback();
    return route.fulfill({ status: 503, headers, json: { ok: false, error: { code: 'UNAVAILABLE', message: 'Isolated customization service unavailable.' } } });
  });
  await page.goto('/customize/gift-box');
  await expect(page.getByText('Isolated customization service unavailable.', { exact: true })).toBeVisible();
  await page.getByRole('main').getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByLabel('Gift box type / size', { exact: true })).toBeVisible();
  expect(attempts).toBe(2);
});

test('adding during session checking announces the guard and requires an explicit retry after verification', async ({ page }) => {
  const fixture = await mockCommerce(page);
  let releaseVerification;
  let deferred = true;
  const verification = new Promise((resolve) => { releaseVerification = resolve; });
  await page.route('**/api/v1/auth/me', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (deferred) await verification;
    return route.fallback();
  });
  const additions = () => fixture.calls.filter((call) => call.path === '/commerce/cart/items' && call.method === 'POST');
  try {
    await page.goto('/shop');
    await expect(page.getByRole('button', { name: 'Checking account', exact: true })).toBeVisible();
    const add = page.getByRole('button', { name: `Add to Cart: ${commerceProduct.name}`, exact: true });
    await add.click();
    await expect(page.locator('.commerce-announcement')).toContainText('Please wait while your session is verified.');
    expect(additions()).toHaveLength(0);
    expect(fixture.state.cart.quantity).toBe(0);
    await expect(page.locator('body > img[aria-hidden="true"]')).toHaveCount(0);
    await expect(page.locator('.commerce-announcement')).not.toContainText('Added to your cart.');
    deferred = false; releaseVerification();
    await expect(page.locator('.site-header').getByRole('link', { name: 'Account', exact: true })).toBeVisible();
    await expect.poll(() => fixture.calls.filter((call) => call.path === '/commerce/cart' && call.method === 'GET').length).toBeGreaterThan(0);
    expect(additions()).toHaveLength(0);
    await add.click();
    await expect(page.locator('.commerce-announcement')).toContainText('Added to your cart.');
    expect(additions()).toHaveLength(1);
    expect(fixture.state.cart.quantity).toBe(1);
  } finally { releaseVerification(); }
});

test('failed session verification gives actionable cart feedback and safe recovery never replays the add', async ({ page }) => {
  const fixture = await mockCommerce(page);
  let verificationAvailable = false;
  await page.route('**/api/v1/auth/me', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (verificationAvailable) return route.fallback();
    return route.fulfill({ status: 503, headers, json: { ok: false, error: { code: 'UNAVAILABLE', message: 'Isolated verification unavailable.' } } });
  });
  const additions = () => fixture.calls.filter((call) => call.path === '/commerce/cart/items' && call.method === 'POST');
  await page.goto('/shop');
  await expect(page.getByRole('button', { name: 'Account unavailable', exact: true })).toBeVisible();
  await page.getByRole('button', { name: `Add to Cart: ${commerceProduct.name}`, exact: true }).click();
  await expect(page.locator('.commerce-announcement')).toContainText('Your session could not be verified. Open the cart and choose Try again, then retry this action.');
  expect(additions()).toHaveLength(0);
  expect(fixture.state.cart.quantity).toBe(0);
  await expect(page.locator('body > img[aria-hidden="true"]')).toHaveCount(0);
  await page.locator('.site-header').getByRole('link', { name: 'Cart', exact: true }).click();
  const retry = page.getByRole('main').getByRole('button', { name: 'Try again', exact: true });
  await expect(retry).toBeVisible();
  verificationAvailable = true;
  await retry.click();
  await expect(page.getByText('Your cart is empty.', { exact: true })).toBeVisible();
  await expect(page.locator('.site-header').getByRole('link', { name: 'Account', exact: true })).toBeVisible();
  expect(additions()).toHaveLength(0);
  await page.locator('.site-header').getByRole('link', { name: 'Shop', exact: true }).click();
  await page.getByRole('button', { name: `Add to Cart: ${commerceProduct.name}`, exact: true }).click();
  await expect(page.locator('.commerce-announcement')).toContainText('Added to your cart.');
  expect(additions()).toHaveLength(1);
  expect(fixture.state.cart.quantity).toBe(1);
});

test('a late initial cart read cannot replace the successful add snapshot', async ({ page }) => {
  const fixture = await mockCommerce(page);
  let firstRead = true;
  let heldRequest;
  let terminal = false;
  let handlerFinished = false;
  let releaseRead;
  const heldRead = new Promise((resolve) => { releaseRead = resolve; });
  const finish = (request) => { if (request === heldRequest) terminal = true; };
  page.on('requestfinished', finish); page.on('requestfailed', finish);
  await page.route('**/api/v1/commerce/cart', async (route) => {
    if (route.request().method() !== 'GET' || !firstRead) return route.fallback();
    firstRead = false; heldRequest = route.request();
    const captured = { cart: structuredClone(fixture.state.cart), checkoutEnabled: false };
    try {
      await heldRead;
      await route.fulfill({ headers, json: { ok: true, data: captured } });
    } catch (error) { if (!heldRequest.failure()) throw error; }
    finally { handlerFinished = true; }
  });
  try {
    await page.goto('/shop');
    await expect.poll(() => Boolean(heldRequest)).toBe(true);
    await page.getByRole('button', { name: `Add to Cart: ${commerceProduct.name}`, exact: true }).click();
    const cartLink = page.locator('.site-header').getByRole('link', { name: 'Cart, 1 items', exact: true });
    await expect(cartLink).toBeVisible();
    expect(fixture.calls.filter((call) => call.path === '/commerce/cart/items' && call.method === 'POST')).toHaveLength(1);
    releaseRead();
    await expect.poll(() => terminal && handlerFinished).toBe(true);
    await expect(cartLink).toBeVisible();
    await cartLink.click();
    await expect(page.getByRole('heading', { name: commerceProduct.name, exact: true })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Quantity', exact: true })).toHaveValue('1');
    expect(fixture.state.cart.quantity).toBe(1);
  } finally { releaseRead(); page.off('requestfinished', finish); page.off('requestfailed', finish); }
});

test('cart feedback can be dismissed without another mutation and restores focus to the successful action', async ({ page }) => {
  const fixture = await mockCommerce(page);
  await page.goto('/shop');
  const add = page.getByRole('button', { name: `Add to Cart: ${commerceProduct.name}`, exact: true });
  await add.click();
  await expect(page.getByRole('status').filter({ hasText: 'Added to your cart.' })).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss cart feedback', exact: true }).click();
  await expect(page.locator('.commerce-announcement')).toBeHidden();
  await expect(add).toBeFocused();
  expect(fixture.calls.filter((call) => call.path === '/commerce/cart/items' && call.method === 'POST')).toHaveLength(1);
  expect(fixture.state.cart.quantity).toBe(1);
});

test('sticky Choose Options scrolls below one header offset rather than adding two header gaps', async ({ page }) => {
  const product = { ...commerceProduct, requiresOptions: true, description: 'Isolated long product information. '.repeat(180), personalization: { fields: [{ key: 'name', label: 'Recipient name', type: 'short_text', required: true, maxLength: 40 }] } };
  await mockCommerce(page, { product });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/products/${product.slug}`);
  await expect(page.getByLabel('Recipient name', { exact: false })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 1400));
  const options = page.getByRole('button', { name: 'Choose Options', exact: true });
  await expect(options).toBeVisible();
  await options.click();
  await expect(page.getByLabel('Recipient name', { exact: false })).toBeFocused();
  const gap = await page.evaluate(() => document.querySelector('.product-purchase-section').getBoundingClientRect().top - document.querySelector('.site-header').getBoundingClientRect().bottom);
  expect(gap).toBeGreaterThanOrEqual(8);
  expect(gap).toBeLessThanOrEqual(32);
});

test('checkout links invalid delivery fields and preserves the globally disabled gate', async ({ page }) => {
  const options = { cart: cartWithProduct(), checkoutEnabled: true };
  const fixture = await mockCommerce(page, options);
  await page.goto('/checkout');
  await page.getByLabel('Governorate', { exact: true }).selectOption('cairo');
  await expect(page.getByRole('button', { name: 'Place Order', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Place Order', exact: true }).click();
  await expect(page.getByLabel('Full name', { exact: true })).toBeFocused();
  await expectLinkedError(page.getByLabel('Full name', { exact: true }), 'fill out');
  await expectLinkedError(page.getByLabel('Delivery address', { exact: true }), 'fill out');
  expect(fixture.orders).toHaveLength(0);
  expect(fixture.calls.filter((call) => call.path === '/commerce/orders' && call.method === 'POST')).toHaveLength(0);
  options.checkoutEnabled = false;
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Ordering is not enabled yet' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Place Order', exact: true })).toHaveCount(0);
});

test('nested native dialogs retain focus and scroll locking until the final dialog closes', async ({ page }) => {
  await mockCatalog(page);
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/shop');
  const opener = page.getByRole('button', { name: 'Filters', exact: false });
  await opener.click();
  const first = page.getByRole('dialog');
  const minimum = first.getByLabel('Minimum price (EGP)', { exact: false });
  await minimum.focus();
  await page.evaluate(async () => {
    const optimizedModule = (name) => performance.getEntriesByType('resource').find((entry) => new URL(entry.name).pathname === `/node_modules/.vite/deps/${name}`)?.name || `/node_modules/.vite/deps/${name}`;
    const ReactModule = await import(optimizedModule('react.js'));
    const React = ReactModule.default || ReactModule;
    const module = await import(optimizedModule('react-dom_client.js'));
    const createRoot = module.createRoot || module.default.createRoot;
    const { default: CatalogDialog } = await import('/src/components/CatalogDialog.jsx');
    const holder = document.createElement('div'); document.body.append(holder);
    const root = createRoot(holder);
    root.render(React.createElement(CatalogDialog, { title: 'Nested file details', onClose: () => { root.unmount(); holder.remove(); } }, React.createElement('button', { type: 'button' }, 'Inner action')));
  });
  await expect(page.locator('dialog[open]')).toHaveCount(2);
  for (let index = 0; index < 6; index += 1) {
    await page.keyboard.press(index < 3 ? 'Tab' : 'Shift+Tab');
    expect(await page.getByRole('dialog', { name: 'Nested file details' }).evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await expect(minimum).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  const bounds = await first.boundingBox();
  await page.mouse.click(bounds.x + 1, bounds.y + 1);
  await expect(first).toBeVisible();
  await page.mouse.click(bounds.x - 16, 180);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(opener).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
});

test('blocked product media retains a stable gallery fallback at a 200 percent zoom equivalent viewport', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 720, height: 500 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const product = { ...commerceProduct, mainImageUrl: 'https://fixture.invalid/blocked-product.webp', galleryUrls: ['https://fixture.invalid/blocked-product.webp'] };
  await mockCommerce(page, { product });
  await page.route('https://fixture.invalid/**', (route) => route.abort());
  await page.goto(`/products/${product.slug}`);
  await expect(page.locator('.product-main-image .catalog-image-placeholder')).toBeVisible();
  const gallery = await page.locator('.product-main-image').boundingBox();
  expect(Math.abs(gallery.width - gallery.height)).toBeLessThan(2);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  await expect(page.getByRole('button', { name: 'Add to Cart', exact: true }).first()).toBeVisible();
  await context.close();
});
