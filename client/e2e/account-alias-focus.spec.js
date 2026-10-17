import { test, expect } from '@playwright/test';
import { mockCatalog, detail } from './catalog-fixtures.js';
import { mockCommerce, commerceProduct } from './commerce-fixtures.js';

test.beforeEach(async ({ page }) => { page.on('pageerror', error => { throw error; }); });

for (const width of [320, 1440]) {
  test(`account content, top back link and underlined account actions at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 });
    await mockCatalog(page);
    for (const path of ['/login', '/signup', '/forgot-password']) {
      await page.goto(path);
      const account = page.locator('.account-page');
      const form = account.locator('form');
      await expect(form).toBeVisible();
      const box = await form.boundingBox();
      expect(Math.abs(box.x + box.width / 2 - width / 2)).toBeLessThan(1);
      if (width > 600) expect(box.width).toBeGreaterThanOrEqual(440);
      const back = account.getByRole('link', { name: '← Back to Home' });
      await expect(back).toHaveCount(1); await expect(back).toHaveAttribute('href', '/');
      const [backBox, headingBox] = await Promise.all([back.boundingBox(), account.locator('h1').boundingBox()]);
      expect(backBox.y + backBox.height).toBeLessThan(headingBox.y);
      expect(Math.abs(backBox.x - box.x)).toBeLessThan(1);
      const links = path === '/login' ? ['Sign Up', 'Forgot your password?'] : ['Log In'];
      for (const name of links) {
        const link = account.getByRole('link', { name, exact: true });
        await expect(link).toHaveCSS('text-decoration-line', 'underline');
        await link.focus(); await expect(link).toBeFocused();
      }
      if (path === '/login' && width > 600) {
        const [left, right] = await Promise.all(links.map(name => account.getByRole('link', { name, exact: true }).boundingBox()));
        const textTops = await Promise.all(links.map(name => account.getByRole('link', { name, exact: true }).evaluate(element => { const range = document.createRange(); range.selectNodeContents(element); return range.getBoundingClientRect().top; })));
        expect(Math.abs(textTops[0] - textTops[1])).toBeLessThan(1);
        expect(right.x).toBeGreaterThan(left.x + left.width);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await account.screenshot({ path: `test-results/account-${path.slice(1)}-${width}.png` });
    }
    await page.goto('/reset-password');
    await expect(page.locator('.account-page [role=alert]')).toContainText('missing or invalid');
    await page.goto('/verify-email');
    await expect(page.locator('.account-page [role=alert]')).toContainText('missing or invalid');
  });
}

test('recovery submission and confirmation retain the centered account shell', async ({ page }) => {
  await mockCatalog(page);
  let submitted;
  await page.route('**/api/v1/auth/forgot-password', route => {
    submitted = route.request().postDataJSON();
    return route.fulfill({ headers: { 'Access-Control-Allow-Origin': 'http://127.0.0.1:5191', 'Access-Control-Allow-Credentials': 'true' }, json: { ok: true, data: { message: 'If an eligible account exists, a request has been queued.' } } });
  });
  await page.goto('/forgot-password');
  await page.getByLabel('Email address', { exact: true }).fill('isolated@example.test');
  await page.getByRole('button', { name: 'Request reset link' }).click();
  await expect(page.locator('.account-page [role=status]')).toContainText('request has been queued');
  expect(submitted).toEqual({ email: 'isolated@example.test' });
  await expect(page.locator('.account-page .page-back')).toHaveCount(1);
});

test('ordinary responsive resizing keeps skip link hidden and preserves input focus', async ({ page }) => {
  await mockCatalog(page);
  await page.goto('/login');
  await page.getByRole('heading', { name: 'Welcome back' }).click();
  const skip = page.getByRole('link', { name: 'Skip to main content' });
  for (const width of [320, 1440, 390, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    expect(await skip.evaluate(element => element.getBoundingClientRect().bottom < 0)).toBe(true);
  }
  const email = page.getByLabel('Email Address', { exact: true });
  await email.fill('draft@example.test');
  await page.setViewportSize({ width: 320, height: 950 });
  await page.setViewportSize({ width: 1440, height: 950 });
  await expect(email).toBeFocused(); await expect(email).toHaveValue('draft@example.test');
  expect(await skip.evaluate(element => element.getBoundingClientRect().bottom < 0)).toBe(true);
});

test('intentional keyboard skip focus remains visible across resizing and reaches main content', async ({ page }) => {
  await mockCatalog(page);
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to main content' });
  await expect(skip).toBeFocused();
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    await expect(skip).toBeFocused();
    expect(await skip.evaluate(element => element.matches(':focus-visible') && element.getBoundingClientRect().top >= 0)).toBe(true);
  }
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
});

test('canonical product links, legacy replacement, direct refresh and WhatsApp preserve identity', async ({ page }) => {
  const publicPath = '/products/fixture-friendly-gift';
  const product = { ...detail, publicPath, browseOnly: true, priceApproved: false, pricePiastres: null, orderingAvailable: false };
  await mockCatalog(page, { product });
  await page.route('**/api/v1/public/products?**', route => route.fulfill({ json: { ok: true, data: { products: [product], pagination: { page: 1, limit: 20, total: 1, pages: 1 } } } }));
  await page.goto('/shop');
  await expect(page.locator('.catalog-card h3 a')).toHaveAttribute('href', publicPath);
  const enquiry = page.locator('.catalog-card a[href*="wa.me"]');
  expect(decodeURIComponent(await enquiry.getAttribute('href'))).toContain(`https://tapandwrap.net${publicPath}`);
  await page.goto(`/products/${detail.slug}?variant=small-rose&from=share`);
  await expect(page).toHaveURL(`${publicPath}?variant=small-rose&from=share`);
  await expect(page.getByRole('heading', { name: product.name, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add to Cart', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: product.name, exact: true })).toBeVisible();
  await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', /noindex/);
});

test('legacy customization paths and service selections retain canonical URLs and product IDs', async ({ page }) => {
  const publicPath = '/products/friendly-configured-gift';
  const product = { ...commerceProduct, publicPath };
  const fixture = await mockCommerce(page, { product });
  await page.goto(`/products/${product.slug}/customize?from=share`);
  await expect(page).toHaveURL(`${publicPath}/customize?from=share`);
  await expect(page.getByRole('link', { name: 'View product details' })).toHaveAttribute('href', publicPath);
  await page.reload();
  await expect(page.getByRole('heading', { name: product.name, exact: true })).toBeVisible();
  await page.goto(`/customize/gift-box?product=${product.slug}&page=2`);
  // The service is request-first: it retains the supplied reference in the query,
  // while permanent identity redirects apply to product-detail URLs only.
  await expect(page).toHaveURL(`/customize/gift-box?product=${product.slug}&page=2`);
  await expect(page.getByRole('heading', { name: 'Build Your Gift Box', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Gift box type / size' })).toHaveCount(0);
  expect(fixture.calls.some(call => call.path === '/commerce/cart/items')).toBe(false);
});
