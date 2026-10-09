import { test, expect } from '@playwright/test';
import { mockCatalog, cards, detail } from './catalog-fixtures.js';
import { mockCommerce } from './commerce-fixtures.js';

const content = {
  about: { title: 'An Isolated About Page', body: 'Owner-approved content fixture only.', updatedAt: '2026-10-09T10:00:00.000Z' },
  contact: { email: 'isolated@example.test', phone: '01012345678', whatsapp: '01012345678', instagram: 'https://www.instagram.com/isolated_fixture', address: 'Isolated test address', body: 'Approved contact fixture only.' },
  policies: { privacyPolicy: { title: 'Isolated Privacy Policy', body: '<script>Never execute this fixture</script>\nPolicy fixture only.' } },
  faq: [{ question: 'Is this a real merchant claim?', answer: 'No. This is an isolated browser test.' }],
  featuredReviews: [{ id: 'isolated-review', rating: 4, text: 'Approved review fixture only.', authorLabel: 'Isolated reviewer' }],
};
const apiHeaders = { 'access-control-allow-origin': 'http://127.0.0.1:5191', 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type,x-csrf-token,x-tracking-consent', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
const browserErrors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const errors = []; browserErrors.set(page, errors); page.on('pageerror', error => errors.push(error.message));
});
test.afterEach(async ({ page }) => { expect(browserErrors.get(page), 'Uncaught browser errors').toEqual([]); });
async function respond(page, path, data, record) {
  await page.route(`**/api/v1${path}`, async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: apiHeaders });
    record?.push({ method: route.request().method(), body: route.request().postDataJSON(), headers: route.request().headers() });
    return route.fulfill({ headers: apiHeaders, json: { ok: true, data } });
  });
}

test('homepage orders actual sections and displays only approved fixture content', async ({ page }) => {
  await mockCatalog(page);
  await respond(page, '/public/site-content', content);
  await respond(page, '/public/bundles', { bundles: [{ id: 'bundle-fixture', name: 'Isolated Bundle', description: 'Approved fixture only.', discountKind: 'fixed', discountValue: 100, products: [{ ...cards[0], bundleQuantity: 2 }] }] });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Makes someone’s heart flap with Tap & Wrap.');
  await expect(page.locator('.home-product-grid > article')).toHaveCount(8);
  const headings = await page.locator('main h2').allTextContents();
  expect(headings).toEqual(['Gift Bundles', 'Shop by Category', 'Best Sellers', 'A gift as unique as them', 'What Our Customers Say', 'Frequently Asked Questions']);
  await expect(page.getByText('Approved review fixture only.')).toBeVisible();
  await page.getByText('Is this a real merchant claim?').click();
  await expect(page.getByText('No. This is an isolated browser test.')).toBeVisible();
  await expect(page.locator('main video')).toHaveCount(0);
  await expect(page.getByText(/Owner-approved hero footage is awaiting delivery/)).toBeVisible();
});

test('missing public information is explicitly pending and never fabricates policies', async ({ page }) => {
  await mockCatalog(page);
  for (const path of ['/about', '/contact', '/privacy-policy', '/refund-policy', '/shipping-policy', '/terms-of-service']) {
    await page.goto(path);
    await expect(page.getByText(/Owner-approved .* information is awaiting publication/)).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page.locator('main form')).toHaveCount(0);
  }
});

test('homepage waits for exactly eight eligible selections rather than inventing or padding cards', async ({ page }) => {
  await mockCatalog(page);
  await page.route('**/api/v1/public/products?*', route => route.fulfill({ headers: apiHeaders, json: { ok: true, data: { products: cards.filter(card => card.orderingAvailable).slice(0, 7), pagination: { page: 1, limit: 8, total: 7, pages: 1 } } } }));
  await page.goto('/');
  await expect(page.getByText('The eight owner-selected gifts are being finalized.')).toBeVisible();
  await expect(page.locator('.home-product-grid')).toHaveCount(0);
  await expect(page.getByRole('contentinfo').getByRole('link', { name: 'WhatsApp', exact: true })).toHaveCount(0);
});

test('approved about and legal copy is escaped and has page-specific metadata', async ({ page }) => {
  await mockCatalog(page);
  await respond(page, '/public/site-content', content);
  await page.goto('/about');
  await expect(page.getByRole('heading', { level: 1, name: 'An Isolated About Page' })).toBeVisible();
  await expect(page).toHaveTitle('An Isolated About Page | Tap & Wrap');
  await page.goto('/privacy-policy');
  await expect(page.getByText(/Never execute this fixture/)).toBeVisible();
  await expect(page.locator('main script')).toHaveCount(0);
  await expect(page).toHaveTitle('Isolated Privacy Policy | Tap & Wrap');
});

test('contact uses approved working contact links without a fake submission', async ({ page }) => {
  const fixture = await mockCatalog(page);
  await respond(page, '/public/site-content', content);
  await page.goto('/contact');
  await expect(page.getByRole('main').getByRole('link', { name: 'Email Tap & Wrap', exact: true })).toHaveAttribute('href', 'mailto:isolated@example.test');
  await expect(page.getByRole('link', { name: 'Call Tap & Wrap' })).toHaveAttribute('href', 'tel:01012345678');
  await expect(page.getByRole('main').getByRole('link', { name: 'WhatsApp', exact: true })).toHaveAttribute('rel', /noreferrer/);
  await expect(page.getByRole('main').getByRole('link', { name: 'WhatsApp', exact: true })).toHaveAttribute('href', 'https://wa.me/201012345678');
  await expect(page.getByRole('contentinfo').getByRole('link', { name: 'WhatsApp', exact: true })).toHaveAttribute('href', 'https://wa.me/201012345678');
  await expect(page.locator('main form')).toHaveCount(0);
  expect(fixture.requests.some(request => request.method === 'POST')).toBe(false);
});

test('product reviews are read-only, paginated and request twenty at most', async ({ page }) => {
  await mockCatalog(page);
  const reviewCalls = [];
  await page.route('**/api/v1/public/products/*/reviews?*', async route => {
    const query = new URL(route.request().url()).searchParams;
    reviewCalls.push(Object.fromEntries(query));
    return route.fulfill({ headers: apiHeaders, json: { ok: true, data: { reviews: [{ id: `review-${query.get('page')}`, rating: 5, authorLabel: 'Isolated reviewer', text: `Review fixture page ${query.get('page')}` }], pagination: { page: Number(query.get('page')), limit: 20, total: 21, pages: 2 } } } });
  });
  await page.goto(`/products/${detail.slug}`);
  await expect(page.getByText('Review fixture page 1')).toBeVisible();
  await expect(page.getByRole('button', { name: /submit.*review/i })).toHaveCount(0);
  await page.getByRole('navigation', { name: 'Review pages' }).getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Review fixture page 2')).toBeVisible();
  expect(reviewCalls.every(call => Number(call.limit) === 20)).toBe(true);
});

test('forgot password reports the generic queued result and uses CSRF', async ({ page }) => {
  await mockCatalog(page);
  const calls = [];
  await respond(page, '/auth/forgot-password', { message: 'If an eligible account exists, a request has been queued. Delivery may be unavailable.' }, calls);
  await page.goto('/login');
  await page.getByRole('link', { name: 'Forgot your password?' }).click();
  await page.getByLabel('Email address', { exact: true }).fill('isolated@example.test');
  await page.getByRole('button', { name: 'Request reset link' }).click();
  await expect(page.locator('.website-recovery [role="status"]')).toContainText('Delivery may be unavailable');
  expect(calls).toHaveLength(1);
  expect(calls[0].headers['x-csrf-token']).toBeTruthy();
  expect(calls[0].body).toEqual({ email: 'isolated@example.test' });
});

test('password reset strips the secret fragment and submits only explicitly', async ({ page }) => {
  await mockCatalog(page);
  const calls = [];
  await respond(page, '/auth/reset-password', { passwordReset: true, signInRequired: true }, calls);
  const token = `${'a'.repeat(41)}_-`;
  const response = await page.goto(`/reset-password#token=${token}`);
  await expect(page).toHaveURL(/\/reset-password$/);
  expect(response.headers()['cache-control']).toBe('private, no-store');
  expect(response.headers()['x-robots-tag']).toContain('noindex');
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer');
  expect(calls).toHaveLength(0);
  await page.getByLabel('New password').fill('IsolatedSecurePassword42');
  await page.getByRole('button', { name: 'Reset password', exact: true }).click();
  await expect(page.locator('.website-recovery [role="status"]')).toContainText('Sign in again');
  expect(calls).toHaveLength(1);
  expect(calls[0].body).toEqual({ token, newPassword: 'IsolatedSecurePassword42' });
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('missing or invalid');
  expect(calls).toHaveLength(1);
});

test('email verification is single explicit interaction, never an automatic effect', async ({ page }) => {
  await mockCatalog(page);
  const calls = [];
  await respond(page, '/auth/verify-email', { emailVerified: true }, calls);
  await page.goto(`/verify-email#token=${'b'.repeat(43)}`);
  await expect(page.getByRole('button', { name: 'Verify email', exact: true })).toBeVisible();
  expect(calls).toHaveLength(0);
  await page.getByRole('button', { name: 'Verify email', exact: true }).click();
  await expect(page.locator('.website-recovery [role="status"]')).toContainText('has been verified');
  expect(calls).toHaveLength(1);
});

test('customer account offers real logout and honest unavailable verification', async ({ page }) => {
  const fixture = await mockCommerce(page, { role: 'customer' });
  await page.goto('/my-orders');
  await expect(page.getByRole('button', { name: 'Send verification link' })).toBeDisabled();
  expect(fixture.calls.some(call => call.path === '/auth/request-verification')).toBe(false);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(fixture.calls.some(call => call.path === '/auth/logout' && call.method === 'POST')).toBe(true);
});

for (const width of [320, 768, 1440]) {
  test(`public content, navigation and logo remain stable at ${width}px`, async ({ page }) => {
    await mockCatalog(page);
    await respond(page, '/public/site-content', content);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main h1')).toBeVisible();
    const logo = page.locator('header img[src="/tap-wrap-logo.webp"]');
    await expect(logo).toHaveAttribute('width', '2000');
    await expect(logo).toHaveAttribute('height', '667');
    const box = await logo.boundingBox();
    if (width >= 1024) {
      expect(box.x).toBeLessThan(width / 4);
      await expect(page.locator('.desktop-navigation')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Open menu', exact: true })).toBeHidden();
    } else {
      await expect(page.getByRole('button', { name: 'Open menu', exact: true })).toBeVisible();
      expect(box.x).toBeLessThan(width / 2);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const name of ['Contact', 'Privacy Policy']) {
      await page.getByRole('contentinfo').getByRole('link', { name, exact: true }).click();
      await expect(page.locator('main h1')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.goto('/forgot-password', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main h1')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
