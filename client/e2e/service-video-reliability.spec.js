import { test, expect } from '@playwright/test';
import { mockCatalog } from './catalog-fixtures.js';

const titles = ['Build Your Gift Box', 'Laser Engraving'];
test.beforeEach(async ({ page }) => {
  await mockCatalog(page);
  await page.addInitScript(() => {
    window.__filmDiagnostics = [];
    for (const type of ['loadstart', 'loadedmetadata', 'playing', 'pause', 'waiting', 'stalled', 'abort', 'emptied', 'error']) {
      document.addEventListener(type, event => {
        const v = event.target;
        if (!(v instanceof HTMLVideoElement)) return;
        window.__filmDiagnostics.push({ type, time: performance.now(), label: v.getAttribute('aria-label'), src: v.getAttribute('src'), readyState: v.readyState, networkState: v.networkState, paused: v.paused, currentTime: v.currentTime, error: v.error && { code: v.error.code, message: v.error.message } });
      }, true);
    }
  });
});
test.afterEach(async ({ page, browser }, info) => {
  const events = await page.evaluate(() => window.__filmDiagnostics).catch(() => []);
  await info.attach('film-lifecycle', { body: JSON.stringify({ browser: browser.version(), events }), contentType: 'application/json' });
});

for (const width of [390, 1440]) {
  test(`both service films survive rapid controls, scroll, motion, visibility, history and refresh at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const errors = [], responses = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (/gift-box.*mp4|engraving.*mp4/.test(response.url())) responses.push(response.status()); });
    await page.goto('/');
    for (let round = 0; round < 3; round++) {
      for (const title of titles) {
        const video = page.getByLabel(`${title} film`, { exact: true });
        await video.scrollIntoViewIfNeeded();
        await expect.poll(() => video.evaluate(v => v.videoWidth)).toBe(480);
        const control = page.locator('.home-service-media').filter({ has: video }).getByRole('button');
        // Real trusted clicks; no force, source replacement or synthetic play events.
        for (let click = 0; click < 6; click++) await control.click();
        if (await video.evaluate(v => v.paused)) await control.click();
        await expect.poll(() => video.evaluate(v => v.paused)).toBe(false);
        const before = await video.evaluate(v => v.currentTime);
        await expect.poll(() => video.evaluate(v => v.currentTime)).not.toBe(before);
        await page.evaluate(() => scrollTo(0, 0));
        await expect.poll(() => video.evaluate(v => v.paused)).toBe(true);
        await video.scrollIntoViewIfNeeded();
        await expect.poll(() => video.evaluate(v => v.paused)).toBe(false);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await expect.poll(() => video.evaluate(v => v.paused)).toBe(true);
        await control.click(); await expect.poll(() => video.evaluate(v => v.paused)).toBe(false);
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
        await expect.poll(() => video.evaluate(v => v.paused)).toBe(true);
        await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
        await expect.poll(() => video.evaluate(v => v.paused)).toBe(false);
      }
      if (round === 0) { await page.getByRole('link', { name: 'Shop Gifts', exact: true }).click(); await page.goBack(); }
      if (round === 1) await page.reload();
    }
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => window.__filmDiagnostics.filter(event => event.type === 'error'))).toEqual([]);
    expect(responses.length).toBeGreaterThan(0);
    expect(responses.every(status => status === 200 || status === 206)).toBe(true);
  });
}

test('delayed service responses retain posters, then decode; failed responses retain service navigation', async ({ page }) => {
  let release;
  const delay = new Promise(resolve => { release = resolve; });
  await page.route('**/media/*.mp4', async route => {
    if (/gift|engraving/i.test(route.request().url())) await delay;
    await route.continue();
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  for (const title of titles) {
    const video = page.getByLabel(`${title} film`, { exact: true });
    await video.scrollIntoViewIfNeeded(); await expect(video).toHaveAttribute('poster', /poster/);
    const card = page.locator('article').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
    await expect(card.getByRole('link')).toBeVisible();
  }
  release();
  for (const title of titles) {
    const video = page.getByLabel(`${title} film`, { exact: true }); await video.scrollIntoViewIfNeeded();
    await expect.poll(() => video.evaluate(v => v.videoWidth)).toBe(480);
  }
  await page.unroute('**/media/*.mp4');
  await page.route('**/media/*.mp4', route => route.abort('failed'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  for (const title of titles) {
    const card = page.locator('article').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
    await card.scrollIntoViewIfNeeded();
    const poster = card.locator('.home-service-media img'); await expect(poster).toBeVisible();
    await expect.poll(() => poster.evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
    await expect(card.getByRole('link')).toBeVisible();
  }
});
