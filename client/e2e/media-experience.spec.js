import { test, expect } from '@playwright/test';
import { mockCommerce, commerceProduct, isolatedImageFile } from './commerce-fixtures.js';
import { mockCatalog } from './catalog-fixtures.js';
import { chooseImageFiles } from './media-helpers.js';
import { writeFile } from 'node:fs/promises';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__mediaFailures = [];
    document.addEventListener('error', event => {
      if (event.target instanceof HTMLVideoElement) window.__mediaFailures.push({ source: event.target.getAttribute('src'), code: event.target.error?.code, message: event.target.error?.message });
    }, true);
  });
});
test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  const failures = await page.evaluate(() => window.__mediaFailures).catch(() => []);
  await info.attach('local-media-failures', { body: JSON.stringify(failures), contentType: 'application/json' });
  console.log(JSON.stringify({ localMediaFailures: failures }));
});

const product = { ...commerceProduct, requiresOptions: true, personalization: { requiredBeforePurchase: true, fields: [
  { key: 'photo', label: 'Your photo', type: 'image', required: true, minFiles: 1, maxFiles: 3, maxBytes: 5242880, acceptedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'] },
  { key: 'name', label: 'Gift name', type: 'short_text', required: true, maxLength: 40 },
] } };
async function personalize(page) {
  const fixture = await mockCommerce(page, { product, checkoutEnabled: true });
  await page.goto(`/products/${product.slug}`); await page.getByRole('button', { name: 'Customize This', exact: true }).click();
  await page.getByLabel(/^Gift name/).fill('Keep this name'); return fixture;
}
test('chooser precedes native selection, traps focus, Escape/Cancel/Back preserve the parent and form at 320px', async ({ page }) => {
  await personalize(page); await page.setViewportSize({ width: 320, height: 740 });
  let native = 0; page.on('filechooser', () => native++);
  const trigger = page.getByRole('button', { name: 'Your photo: Upload Image', exact: true }); await trigger.click();
  const chooser = page.getByRole('dialog', { name: 'Choose image source', exact: true });
  await expect(chooser).toBeVisible(); expect(native).toBe(0);
  await chooser.getByRole('button', { name: 'Cancel', exact: true }).focus(); await page.keyboard.press('Tab');
  await expect(chooser.getByRole('button', { name: 'Close choose image source' })).toBeFocused();
  await page.keyboard.press('Escape'); await expect(chooser).toHaveCount(0); await expect(trigger).toBeFocused();
  await expect(page.getByRole('dialog', { name: 'Customize This', exact: true })).toBeVisible();
  await trigger.click(); await expect(chooser).toBeVisible(); await page.goBack(); await expect(chooser).toHaveCount(0);
  await expect(page.getByLabel(/^Gift name/)).toHaveValue('Keep this name');
  await trigger.click(); await expect(chooser).toBeVisible();
  await chooser.screenshot({ path: 'test-results/remediation-2/chooser-320.png' });
  await page.setViewportSize({ width: 844, height: 390 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await chooser.getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(chooser).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  await page.getByRole('button', { name: 'Keep editing later' }).click();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden'); expect(native).toBe(0);
});
test('native camera hint is exclusive, cancellation/reopen and Gallery/Files replacement preserve selections', async ({ page }) => {
  const fixture = await personalize(page);
  for (const source of ['Take a Photo', 'Choose from Gallery', 'Browse Files']) {
    await page.getByRole('button', { name: 'Your photo: Upload Image', exact: true }).click();
    const event = page.waitForEvent('filechooser'); await page.getByRole('dialog', { name: 'Choose image source' }).getByRole('button', { name: source, exact: true }).click();
    const chooser = await event; expect(await chooser.element().getAttribute('capture')).toBe(source === 'Take a Photo' ? 'environment' : null);
    expect(chooser.isMultiple()).toBe(source !== 'Take a Photo'); await chooser.setFiles([]);
    await expect(page.getByLabel(/^Gift name/)).toHaveValue('Keep this name');
  }
  await chooseImageFiles(page, page, 'Your photo', [isolatedImageFile('one.png'), isolatedImageFile('two.png')]);
  await expect(page.getByAltText('Selected your photo 1')).toBeVisible(); await expect(page.getByAltText('Selected your photo 2')).toBeVisible();
  await chooseImageFiles(page, page, 'Replace one.png', isolatedImageFile('one.png'), 'Browse Files');
  await chooseImageFiles(page, page, 'Replace one.png', isolatedImageFile('one.png'), 'Take a Photo');
  await expect(page.getByRole('button', { name: 'Remove one.png', exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Remove two.png', exact: true }).click();
  await expect(page.getByAltText('Selected your photo 2')).toHaveCount(0); expect(fixture.uploads).toHaveLength(0);
});
test('unsupported HEIC, empty and oversized selections preserve a valid draft and helpful recovery', async ({ page }) => {
  await personalize(page); await chooseImageFiles(page, page, 'Your photo', isolatedImageFile('keep.png'));
  for (const file of [{ name: 'photo.heic', mimeType: 'image/heic', buffer: Buffer.from('unsupported fixture') }, { name: 'empty.png', mimeType: 'image/png', buffer: Buffer.alloc(0) }, { name: 'large.png', mimeType: 'image/png', buffer: Buffer.alloc(5242881) }]) {
    await chooseImageFiles(page, page, 'Replace keep.png', file);
    await expect(page.getByRole('alert')).toContainText(file.name === 'large.png' ? 'MB or smaller' : 'HEIC');
    await expect(page.getByRole('button', { name: 'Remove keep.png', exact: true })).toBeVisible(); await expect(page.getByLabel(/^Gift name/)).toHaveValue('Keep this name');
  }
});
test('a broken local preview can be replaced with a valid image using the same filename', async ({ page }) => {
  const fixture = await personalize(page);
  await chooseImageFiles(page, page, 'Your photo', { name: 'same.png', mimeType: 'image/png', buffer: Buffer.from('not a valid image') });
  await expect(page.getByRole('alert')).toContainText('could not be previewed');
  await chooseImageFiles(page, page, 'Replace same.png', isolatedImageFile('same.png'));
  const preview = page.getByAltText('Selected your photo 1');
  await expect(preview).toBeVisible(); await expect.poll(() => preview.evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByRole('alert')).toHaveCount(0); expect(fixture.uploads).toHaveLength(0);
});
test('actual hero decode and mouse/keyboard controls, orientation, dynamic motion and visibility are reliable', async ({ page, browser }) => {
  const errors = [], requested = []; page.on('pageerror', e => errors.push(e.message)); page.on('request', r => { if (/hero\.mp4/.test(r.url())) requested.push(r.url().split('/').at(-1)); });
  await mockCatalog(page); await page.goto('/');
  const hero = page.locator('.hero-film video'); await expect.poll(() => hero.evaluate(v => v.videoWidth)).toBe(960);
  expect(new Set(requested)).toEqual(new Set(['tap-wrap-desktop-hero.mp4']));
  await page.getByRole('button', { name: 'Pause hero video' }).click(); await expect.poll(() => hero.evaluate(v => v.paused)).toBe(true);
  await page.getByRole('button', { name: 'Play hero video' }).focus(); await page.keyboard.press('Enter'); await expect.poll(() => hero.evaluate(v => v.paused)).toBe(false);
  await page.emulateMedia({ reducedMotion: 'reduce' }); await expect.poll(() => hero.evaluate(v => v.paused)).toBe(true);
  await page.getByRole('button', { name: 'Play hero video' }).click(); await expect.poll(() => hero.evaluate(v => v.paused)).toBe(false);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect.poll(() => hero.evaluate(v => v.paused)).toBe(true);
  await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
  await expect.poll(() => hero.evaluate(v => v.paused)).toBe(false);
  await page.getByRole('button', { name: 'Pause hero video' }).click(); await page.setViewportSize({ width: 390, height: 844 });
  await expect(hero).toHaveAttribute('src', '/media/tap-wrap-mobile-hero.mp4'); expect(await hero.evaluate(v => v.paused)).toBe(true);
  await page.getByRole('button', { name: 'Play hero video' }).click(); await expect.poll(() => hero.evaluate(v => v.videoWidth)).toBe(480);
  await page.screenshot({ path: 'test-results/remediation-2/hero-390.png' });
  await page.setViewportSize({ width: 844, height: 390 }); await expect(hero).toHaveAttribute('src', '/media/tap-wrap-desktop-hero.mp4');
  expect(errors).toEqual([]); console.log(JSON.stringify({ browser: browser.version(), device: 'Windows Edge, responsive viewports only', actualLocalMP4: true }));
});
test('touch-emulated hero control accepts taps and reduced-motion initial load stays paused', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  const page = await context.newPage(); await mockCatalog(page); await page.goto('http://127.0.0.1:5191/');
  const hero = page.locator('.hero-film video'); expect(await hero.evaluate(v => v.paused)).toBe(true);
  await page.getByRole('button', { name: 'Play hero video' }).tap(); await expect.poll(() => hero.evaluate(v => v.paused)).toBe(false);
  await page.getByRole('button', { name: 'Pause hero video' }).tap(); await expect.poll(() => hero.evaluate(v => v.paused)).toBe(true);
  await context.close();
});
test('autoplay rejection leaves poster/manual retry and failed sources preserve content', async ({ page }) => {
  await page.addInitScript(() => { HTMLMediaElement.prototype.play = function () { return Promise.reject(new DOMException('Simulated browser policy', 'NotAllowedError')); }; });
  await mockCatalog(page); await page.goto('/'); await expect(page.getByRole('button', { name: 'Play hero video' })).toBeVisible();
  await page.getByRole('button', { name: 'Play hero video' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible(); await expect(page.locator('.hero-film video')).toHaveAttribute('poster', /poster/);
  await page.evaluate(() => document.querySelector('.hero-film video').dispatchEvent(new Event('error')));
  await expect(page.locator('.hero-film-poster')).toBeVisible(); await expect.poll(() => page.locator('.hero-film-poster').evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByRole('link', { name: 'Shop Gifts', exact: true })).toBeVisible();
});
test('service films load on visibility, decode both MP4s, keep manual pause and react to motion changes', async ({ page }) => {
  await mockCatalog(page); await page.goto('/'); const films = page.locator('.home-service-media video');
  await expect(films.first()).not.toHaveAttribute('src');
  for (const title of ['Build Your Gift Box', 'Laser Engraving']) {
    const video = page.getByLabel(`${title} film`, { exact: true }); await video.scrollIntoViewIfNeeded();
    await expect.poll(() => video.evaluate(v => v.videoWidth)).toBe(480);
    await page.getByRole('button', { name: `Pause ${title} video` }).click();
    await page.emulateMedia({ reducedMotion: 'reduce' }); await expect.poll(() => video.evaluate(v => v.paused)).toBe(true);
    await page.getByRole('button', { name: `Play ${title} video` }).click(); await expect.poll(() => video.evaluate(v => v.paused)).toBe(false);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  }
  const first = films.first(); await first.scrollIntoViewIfNeeded();
  if (!(await first.evaluate(v => v.paused))) await page.getByRole('button', { name: 'Pause Build Your Gift Box video' }).click();
  await page.evaluate(() => window.scrollTo(0, 0)); await first.scrollIntoViewIfNeeded(); await expect.poll(() => first.evaluate(v => v.paused)).toBe(true);
});

test('failed service films preserve their posters and accessible service navigation', async ({ page }) => {
  await mockCatalog(page); await page.goto('/');
  for (const title of ['Build Your Gift Box', 'Laser Engraving']) {
    const video = page.getByLabel(`${title} film`, { exact: true });
    const card = page.locator('article').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
    await video.scrollIntoViewIfNeeded(); await expect(video).toHaveAttribute('src', /\.mp4$/);
    await video.evaluate(node => node.dispatchEvent(new Event('error')));
    const poster = card.locator('.home-service-media img');
    await expect(poster).toBeVisible(); await expect.poll(() => poster.evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
    await expect(card.getByRole('button', { name: new RegExp(`(?:Play|Pause) ${title} video`) })).toHaveCount(0);
    await expect(card.getByRole('link')).toBeVisible();
  }
});
test('slow or interrupted video keeps a poster and usable links, including navigation back', async ({ page }) => {
  await mockCatalog(page); let release; const pending = new Promise(resolve => { release = resolve; });
  await page.route('**/media/*hero.mp4', async route => { await pending; await route.abort('failed').catch(() => {}); });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible(); await expect(page.locator('.hero-film video')).toHaveAttribute('poster', /poster/);
  await expect(page.getByRole('link', { name: 'Shop Gifts', exact: true })).toBeVisible();
  release(); await expect(page.locator('.hero-film-poster')).toBeVisible();
  await page.getByRole('link', { name: 'Shop Gifts', exact: true }).click(); await expect(page).toHaveURL(/\/shop/);
  await page.goBack(); await expect(page.getByRole('heading', { level: 1 })).toBeVisible(); await expect(page.locator('.hero-film-poster')).toBeVisible();
});
test('trace HTML never reloads a playing storefront and repeated service scroll/navigation preserves media', async ({ page }, info) => {
  await writeFile(info.outputPath('watcher-probe.html'), '<html>Initial isolated artifact</html>');
  await mockCatalog(page); await page.goto('/');
  let navigations = 0; page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++; });
  const first = page.getByLabel('Build Your Gift Box film', { exact: true }); await first.scrollIntoViewIfNeeded();
  await expect.poll(() => first.evaluate(node => node.paused)).toBe(false);
  await writeFile(info.outputPath('watcher-probe.html'), '<html>Isolated trace-style artifact</html>');
  // Allow the development watcher to emit its debounced event, if misconfigured.
  await page.waitForTimeout(1000); expect(navigations).toBe(0);
  for (let repetition = 0; repetition < 3; repetition++) {
    for (const title of ['Build Your Gift Box', 'Laser Engraving']) {
      const video = page.getByLabel(`${title} film`, { exact: true }); await video.scrollIntoViewIfNeeded();
      await expect.poll(() => video.evaluate(node => node.videoWidth)).toBe(480);
      await expect(page.getByRole('button', { name: `Pause ${title} video` })).toBeVisible();
      await page.getByRole('button', { name: `Pause ${title} video` }).click();
      await page.evaluate(() => scrollTo(0, 0)); await video.scrollIntoViewIfNeeded();
      await expect.poll(() => video.evaluate(node => node.paused)).toBe(true);
      await page.getByRole('button', { name: `Play ${title} video` }).click();
      await expect.poll(() => video.evaluate(node => node.paused)).toBe(false);
    }
  }
  expect(navigations).toBe(0); expect(await page.evaluate(() => window.__mediaFailures)).toEqual([]);
});
test('history-restricted browsers still have accessible Cancel without a native picker', async ({ page }) => {
  await personalize(page); await page.evaluate(() => { history.pushState = () => { throw new DOMException('Restricted fixture', 'SecurityError'); }; });
  await page.getByRole('button', { name: 'Your photo: Upload Image' }).click();
  const dialog = page.getByRole('dialog', { name: 'Choose image source', exact: true }); await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(dialog).toHaveCount(0); await expect(page.getByLabel(/^Gift name/)).toHaveValue('Keep this name');
});
