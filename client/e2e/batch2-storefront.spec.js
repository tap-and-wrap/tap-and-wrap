import { test, expect } from '@playwright/test';
import { mockCatalog } from './catalog-fixtures.js';
import { publicContacts } from '../../shared/storefront-content.mjs';

const browserErrors = new WeakMap();
test.beforeEach(({ page }) => { const errors = []; browserErrors.set(page, errors); page.on('pageerror', error => errors.push(error.message)); });
test.afterEach(({ page }) => { expect(browserErrors.get(page), 'No uncaught storefront exceptions').toEqual([]); });

const headers = { 'access-control-allow-origin': 'http://127.0.0.1:5191', 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type,x-csrf-token,x-tracking-consent', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
const contact = { email: 'approved-fixture@example.test', whatsapp: '01012345678', instagram: 'https://www.instagram.com/approved_fixture' };
const claims = [
  { id: 'customers', value: 50000, scale: 1000, suffix: 'K+', label: 'Customers' },
  { id: 'returning', value: 90, scale: 1, suffix: '%+', label: 'Returning Customers' },
  { id: 'reviews', value: 10000, scale: 1000, suffix: 'K+', label: 'Reviews' },
  { id: 'years', value: 9, scale: 1, suffix: '+', label: 'Years in the Market' },
].map(item => ({ ...item, approved: true, source: 'Isolated fixture evidence, not a merchant claim', approvalEvidence: 'Synthetic test approval', approvedAt: '2026-10-09T09:00:00.000Z' }));

async function developerFixture(page, content) {
  await page.route('**/src/content/developer-content.js*', route => route.fulfill({ contentType: 'application/javascript', body: `export const developerContent = ${JSON.stringify(content)};` }));
}
async function navigationFixture(page, initialRole) {
  const catalog = await mockCatalog(page);
  let role = initialRole;
  const calls = [];
  await page.route('**/api/v1/auth/me', route => route.fulfill({ headers, json: { ok: true, data: { user: role ? { id: `synthetic-${role}`, name: 'Isolated navigation user', role } : null } } }));
  await page.route('**/api/v1/auth/logout', route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    calls.push(route.request().headers()); role = null;
    return route.fulfill({ headers, json: { ok: true, data: { signedOut: true } } });
  });
  return { catalog, calls, switchRole(next) { role = next; } };
}

for (const width of [320, 375, 390, 440, 768, 1024, 1440, 1920]) {
  test(`storefront stays contained with original logo and sticky navigation at ${width}px`, async ({ page }) => {
    await mockCatalog(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Account', exact: true })).toHaveAttribute('href', '/login');
    const logo = page.locator('header .site-logo img');
    await expect(logo).toHaveAttribute('width', '2000');
    await expect(logo).toHaveAttribute('height', '667');
    const box = await logo.boundingBox();
    expect(Math.abs(box.width / box.height - 2000 / 667)).toBeLessThan(.01);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width >= 1024) {
      await expect(page.locator('.desktop-navigation')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Open menu', exact: true })).toBeHidden();
      expect(box.x).toBeLessThan(width / 4);
      const nav = await page.locator('.desktop-navigation').boundingBox();
      const actions = await page.locator('.header-actions').boundingBox();
      expect(box.x + box.width).toBeLessThan(nav.x);
      expect(nav.x + nav.width).toBeLessThan(actions.x);
    } else {
      await expect(page.getByRole('button', { name: 'Open menu', exact: true })).toBeVisible();
      await expect(page.locator('.desktop-navigation')).toBeHidden();
      await page.getByRole('button', { name: 'Open menu', exact: true }).click();
      const drawer = page.getByRole('dialog', { name: 'Explore Tap & Wrap' });
      await expect(drawer).toBeVisible();
      expect(await drawer.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      await page.keyboard.press('Escape'); await expect(drawer).toHaveCount(0);
    }
    await page.evaluate(() => window.scrollTo(0, 700));
    await expect.poll(() => page.locator('.site-header-stack').evaluate(element => Math.round(element.getBoundingClientRect().top))).toBe(0);
    expect(await page.locator('.announcement').evaluate(element => Math.round(element.getBoundingClientRect().top))).toBe(0);
    expect(await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--site-header-height')))).toBeCloseTo((await page.locator('.site-header-stack').boundingBox()).height, 0);
    if (width === 320 || width === 1440) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect.poll(() => page.locator('.site-header-stack').evaluate(element => Math.round(element.getBoundingClientRect().top))).toBe(0);
      await page.screenshot({ path: `test-results/batch2-home-${width}.png`, fullPage: true });
    }
  });
}

for (const role of [null, 'customer', 'admin']) {
  for (const width of [390, 1440]) {
    test(`navigation follows verified ${role || 'guest'} role at ${width}px`, async ({ page }) => {
      await navigationFixture(page, role);
      await page.setViewportSize({ width, height: 900 }); await page.goto('/shop');
      await expect(page.getByRole('link', { name: 'Account', exact: true })).toHaveAttribute('href', role === 'admin' ? '/admin' : role === 'customer' ? '/my-orders' : '/login');
      if (width < 1024) await page.getByRole('button', { name: 'Open menu', exact: true }).click();
      const nav = page.getByRole('navigation', { name: 'Main navigation', exact: true });
      await expect(nav.getByRole('link', { name: 'Track Order', exact: true })).toHaveCount(role ? 0 : 1);
      await expect(nav.getByRole('link', { name: 'My Orders', exact: true })).toHaveCount(role === 'customer' ? 1 : 0);
      await expect(nav.getByRole('link', { name: 'Dashboard', exact: true })).toHaveCount(0);
      await expect(nav.getByRole('link', { name: 'Contact', exact: true })).toHaveCount(0);
      if (width < 1024) {
        const drawer = page.getByRole('dialog', { name: 'Explore Tap & Wrap' });
        await expect(drawer).toBeVisible();
        await expect(drawer.getByRole('link', { name: 'Account', exact: true })).toHaveCount(0);
        await expect(drawer.getByRole('button', { name: 'Sign out', exact: true })).toHaveCount(0);
        await page.keyboard.press('Escape');
        await expect(drawer).toHaveCount(0);
        await expect(page.locator('header').getByRole('link', { name: 'Account', exact: true })).toHaveAttribute('href', role === 'admin' ? '/admin' : role === 'customer' ? '/my-orders' : '/login');
        if (role === 'admin') {
          await expect(page.locator('header .header-signout')).toBeHidden();
        } else {
          await expect(page.locator('header').getByRole('button', { name: 'Sign out', exact: true })).toHaveCount(0);
          await page.locator('header').getByRole('link', { name: 'Account', exact: true }).click();
          await expect(page).toHaveURL(role === 'customer' ? /\/my-orders$/ : /\/login$/);
        }
      }
    });
  }
}

test('unknown sessions expose no role destinations, then account switching updates both menus and admin sign-out', async ({ page }) => {
  const fixture = await navigationFixture(page, 'admin');
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  await page.route('**/api/v1/auth/me', async route => { await pending; return route.fallback(); });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Checking account', exact: true })).toBeDisabled();
  await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: /Track Order|My Orders|Dashboard/ })).toHaveCount(0);
  release();
  await expect(page.locator('header').getByRole('link', { name: 'Account', exact: true })).toHaveAttribute('href', '/admin');
  fixture.switchRole('customer');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('header').getByRole('link', { name: 'Account', exact: true })).toHaveAttribute('href', '/my-orders');
  await expect(page.locator('.desktop-navigation')).toContainText('My Orders');
  fixture.switchRole('admin');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('.desktop-navigation')).not.toContainText('Dashboard');
  await page.locator('header').getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('header').getByRole('link', { name: 'Account', exact: true })).toHaveAttribute('href', '/login');
  await expect(page.locator('.desktop-navigation')).toContainText('Track Order');
  expect(fixture.calls).toHaveLength(1); expect(fixture.calls[0]['x-csrf-token']).toBe('isolated-fixture-token');
});

test('mobile navigation supports keyboard containment, padding, backdrop, Escape and opener restoration', async ({ page }) => {
  await navigationFixture(page, 'customer');
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/shop');
  const trigger = page.getByRole('button', { name: 'Open menu', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Explore Tap & Wrap' });
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  for (let index = 0; index < 12; index++) await page.keyboard.press('Tab');
  expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  for (let index = 0; index < 12; index++) await page.keyboard.press('Shift+Tab');
  expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await dialog.click({ position: { x: 6, y: 300 } }); await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  await trigger.click();
  const bounds = await dialog.boundingBox();
  const documentRight = await page.evaluate(() => document.documentElement.getBoundingClientRect().right);
  expect(documentRight - bounds.x - bounds.width, 'An actual clickable backdrop remains inside the document, clear of scrollbar gutters').toBeGreaterThan(0);
  const backdropX = (bounds.x + bounds.width + documentRight) / 2;
  expect(backdropX).toBeGreaterThan(bounds.x + bounds.width);
  await page.mouse.click(backdropX, 400); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
  await trigger.click(); await dialog.getByRole('link', { name: 'About Us' }).click();
  await expect(page).toHaveURL(/\/about$/); await expect(dialog).toHaveCount(0);
  await trigger.click(); await page.setViewportSize({ width: 1440, height: 900 }); await expect(dialog).toHaveCount(0);
});

test('announcement marquee repeats only one message with no search or dashboard link', async ({ page }) => {
  await mockCatalog(page, { role: 'admin' }); await page.goto('/');
  await expect(page.locator('.announcement .storefront-sr-only')).toHaveText('Unlock the Magic of Giving\u2728');
  await expect(page.locator('.announcement-message')).toHaveText(Array(2).fill('Unlock the Magic of Giving\u2728'));
  await expect(page.locator('.announcement-track')).toHaveAttribute('aria-hidden', 'true');
  expect(await page.locator('.announcement-track').evaluate(node => getComputedStyle(node).animationName)).toBe('announcement-travel');
  await expect(page.locator('.announcement-pause')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Shop and search' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Dashboard', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Account', exact: true })).toHaveAttribute('href', '/admin');
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    const logo = await page.locator('.site-logo').boundingBox();
    const header = await page.locator('.site-header').boundingBox(); expect(Math.abs((logo.x + logo.width / 2) - (header.x + header.width / 2))).toBeLessThan(1);
    const media = page.locator('.hero-film video, .hero-film-poster');
    const geometry = await media.evaluate(node => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height, ratio: Number(node.getAttribute('width')) / Number(node.getAttribute('height')) }));
    const viewportWidth = await page.evaluate(() => document.documentElement.getBoundingClientRect().width);
    expect(geometry.width).toBeCloseTo(viewportWidth, 0);
    if (width < 768) {
      await expect(media).toHaveCSS('object-fit', 'cover');
      const frame = await page.locator('.hero-film').boundingBox();
      expect(geometry.height).toBeCloseTo(frame.height, 0);
    } else expect(geometry.width / geometry.height).toBeCloseTo(geometry.ratio, 2);
    // The page can scroll while resizing between mobile/tablet viewports.
    // boundingBox().y is viewport-relative; check the hero's document bottom
    // so incidental scroll does not falsely report a shorter initial hero.
    const heroCoverage = await page.locator('.home-media-hero').evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return { documentBottom: rect.bottom + window.scrollY, viewportHeight: window.innerHeight, scrollY: window.scrollY };
    });
    expect(heroCoverage.documentBottom,
      `Hero should fill the initial viewport at ${width}px (scrollY=${heroCoverage.scrollY}, bottom=${heroCoverage.documentBottom})`
    ).toBeGreaterThanOrEqual(heroCoverage.viewportHeight - 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Explore Tap & Wrap' });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('link', { name: 'Account', exact: true })).toHaveCount(0);
  await expect(drawer.getByRole('button', { name: 'Sign out', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(page.locator('header').getByRole('link', { name: 'Account', exact: true })).toHaveAttribute('href', '/admin');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.locator('.announcement-track').evaluate(node => getComputedStyle(node).animationName)).toBe('none');
});

test('footer omits Explore and uses approved accessible icon destinations only', async ({ page }) => {
  await mockCatalog(page);
  await page.route('**/api/v1/public/site-content', route => route.fulfill({ headers, json: { ok: true, data: { contact, featuredReviews: [], faq: [], policies: {} } } }));
  await page.goto('/'); const footer = page.getByRole('contentinfo');
  await expect(footer.getByText('Explore', { exact: true })).toHaveCount(0);
  await expect(footer.getByRole('navigation', { name: 'Information' }).getByRole('link')).toHaveCount(6);
  // Fixed merchant contacts are code-managed; forged site-content contacts must
  // not replace them with the synthetic fixture's account.
  await expect(footer.getByRole('link', { name: 'Instagram', exact: true })).toHaveAttribute('href', publicContacts.instagram);
  await expect(footer.getByRole('link', { name: 'WhatsApp', exact: true })).toHaveAttribute('href', `https://wa.me/${publicContacts.whatsapp.replace('+', '')}`);
  await expect(footer.getByRole('link', { name: 'Email Tap & Wrap', exact: true })).toHaveAttribute('href', `mailto:${publicContacts.email}`);
  expect(publicContacts.instagram).not.toBe(contact.instagram);
  for (const name of ['Instagram', 'WhatsApp', 'Email Tap & Wrap']) {
    const icon = footer.getByRole('link', { name, exact: true });
    await expect(icon.locator('svg')).toHaveAttribute('aria-hidden', 'true');
    const box = await icon.boundingBox(); expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
  }
});

test('retired trust statistics cannot be reintroduced through developer content', async ({ page }) => {
  await mockCatalog(page);
  await developerFixture(page, { heroVideo: null, trustStatistics: claims });
  await page.goto('/');
  await expect(page.locator('.website-trust, .trust-statistic')).toHaveCount(0);
  const marquee = page.getByTestId('brand-icon-marquee');
  await expect(marquee).toBeVisible();
  await expect(marquee).toHaveAttribute('aria-hidden', 'true');
  await expect(marquee.locator('.brand-icon-marquee__group')).toHaveCount(2);
  await expect(page.getByText('50K+', { exact: true })).toHaveCount(0);
});

test('hero selects safe approved responsive local media and preserves an honest blocked-media fallback', async ({ page }) => {
  await mockCatalog(page);
  const video = { approved: true, src: '/media/synthetic-desktop.webm', mobileSrc: '/media/synthetic-mobile.webm', poster: '/media/synthetic-poster.webp', width: 1920, height: 1080, autoplay: true, loop: true };
  await developerFixture(page, { heroVideo: video, trustStatistics: [] });
  await page.route('**/media/**', route => route.abort());
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Make their heart flutter.');
  await expect(page.locator('.hero-film video')).toHaveAttribute('src', video.src);
  await expect(page.locator('.hero-film video')).toHaveAttribute('preload', 'none');
  expect(await page.locator('.hero-film video').evaluate(element => ({ muted: element.muted, paused: element.paused, inline: element.playsInline }))).toEqual({ muted: true, paused: true, inline: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.hero-film video')).toHaveAttribute('src', video.mobileSrc);
  const frame = await page.locator('.hero-film').boundingBox();
  await page.getByRole('button', { name: 'Play hero video' }).click();
  await expect(page.getByText('The film is unavailable. You can still explore our gifts.')).toBeVisible();
  expect((await page.locator('.hero-film').boundingBox()).height).toBeCloseTo(frame.height, 0);
  await expect(page.getByRole('link', { name: 'Shop Gifts', exact: true })).toBeVisible();
});

test('unapproved or remote hero sources cannot enter the storefront', async ({ page }) => {
  await mockCatalog(page);
  await developerFixture(page, { heroVideo: { approved: true, src: 'https://private-storage.invalid/private.webm', poster: 'https://private-storage.invalid/key' }, trustStatistics: [] });
  await page.goto('/'); await expect(page.locator('.hero-film video')).toHaveCount(0);
  await expect(page.locator('.home-service-media video')).toHaveCount(2);
});

test('configured hero playback controls and motion changes use the actual media element lifecycle', async ({ page }) => {
  await mockCatalog(page);
  await developerFixture(page, { heroVideo: { approved: true, src: '/media/synthetic-desktop.webm', autoplay: true, loop: true }, trustStatistics: [] });
  // No approved real footage exists. Only this isolated test replaces the browser
  // playback implementation; production retains real media failure handling.
  await page.addInitScript(() => {
    window.syntheticMedia = { plays: 0, pauses: 0 };
    HTMLMediaElement.prototype.play = function () { window.syntheticMedia.plays++; Object.defineProperty(this, 'paused', { configurable: true, value: false }); this.dispatchEvent(new Event('play')); return Promise.resolve(); };
    HTMLMediaElement.prototype.pause = function () { window.syntheticMedia.pauses++; Object.defineProperty(this, 'paused', { configurable: true, value: true }); this.dispatchEvent(new Event('pause')); };
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Pause hero video' })).toHaveCount(1);
  const started = await page.evaluate(() => window.syntheticMedia.plays);
  expect(started).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Pause hero video' }).click();
  await expect(page.getByRole('button', { name: 'Play hero video' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Play hero video' }).click();
  await expect(page.getByRole('button', { name: 'Pause hero video' })).toHaveCount(1);
  expect(await page.evaluate(() => window.syntheticMedia.plays)).toBe(started + 1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.getByRole('button', { name: 'Play hero video' })).toHaveCount(1);
  expect(await page.evaluate(() => window.syntheticMedia.pauses)).toBeGreaterThan(0);
});
