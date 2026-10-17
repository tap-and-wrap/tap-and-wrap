import { test, expect } from '@playwright/test';
import { mockCatalog } from './catalog-fixtures.js';

test('hero typography and mobile film cover stay contained at requested widths', async ({ page }) => {
  await mockCatalog(page); await page.goto('/');
  const heading = page.locator('#home-hero-heading');
  for (const width of [320, 375, 440, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(heading).toHaveCSS('color', 'rgb(255, 255, 255)');
    await expect(heading.locator('em')).toHaveCSS('color', 'rgb(255, 255, 255)');
    await expect(heading.locator('em')).toHaveCSS('font-style', 'italic');
    const frame = page.locator('.hero-film');
    const media = page.locator('.hero-film video, .hero-film-poster');
    await expect(media).toHaveCount(1);
    if (width < 768) {
      await expect(media).toHaveCSS('object-fit', 'cover');
      await expect.poll(() => media.evaluate(node => Number(node.getAttribute('width')) / Number(node.getAttribute('height')))).toBeCloseTo(480 / 854, 3);
      const geometry = await frame.evaluate(node => ({ width: node.clientWidth, height: node.clientHeight, blur: getComputedStyle(node, '::before').display }));
      const box = await media.boundingBox();
      expect(box.width).toBeCloseTo(geometry.width, 0);
      expect(box.height).toBeCloseTo(geometry.height, 0);
      expect(geometry.height).toBeGreaterThanOrEqual(geometry.width * 854 / 480 - 1);
      expect(geometry.blur).toBe('none');
      const sizes = await page.locator('.home-hero-content').evaluate(node => ['h1', '.home-hero-subtitle', '.eyebrow', '.button'].map(selector => parseFloat(getComputedStyle(node.querySelector(selector)).fontSize)));
      expect(sizes[0]).toBeGreaterThanOrEqual(49); expect(sizes[0]).toBeLessThanOrEqual(50);
      expect(sizes[1]).toBeGreaterThanOrEqual(16); expect(sizes[1]).toBeLessThanOrEqual(18);
      expect(sizes[2]).toBeGreaterThanOrEqual(12);
      expect(sizes[3]).toBeGreaterThanOrEqual(14); expect(sizes[3]).toBeLessThanOrEqual(15);
    } else {
      const box = await media.boundingBox();
      expect(box.width / box.height).toBeCloseTo(960 / 570, 2);
    }
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
    expect(await heading.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/hero-refinement-${width}.png` });
  }
});

test('skip link stays hidden until keyboard focus and retains focus across viewport changes', async ({ page }) => {
  await mockCatalog(page); await page.goto('/');
  const skip = page.getByRole('link', { name: 'Skip to main content', exact: true });
  const onScreen = () => skip.evaluate(node => node.getBoundingClientRect().bottom > 0);
  for (const width of [320, 1440, 375]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await onScreen()).toBe(false);
  }
  await page.keyboard.press('Tab');
  await expect(skip).toBeFocused(); expect(await onScreen()).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(skip).toBeFocused(); expect(await onScreen()).toBe(true);
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused(); expect(await onScreen()).toBe(false);
});
