import { test, expect } from '@playwright/test';
import { mockCatalog } from './catalog-fixtures.js';

for (const width of [320, 1440]) {
  test(`gifting icon marquee replaces statistics without changing the hero at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await mockCatalog(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Make their heart flutter.' })).toBeVisible();
    await expect(page.locator('.website-trust')).toHaveCount(0);
    const marquee = page.getByTestId('brand-icon-marquee');
    await expect(marquee).toBeVisible();
    await expect(marquee).toHaveAttribute('aria-hidden', 'true');
    await expect(marquee.locator('.brand-icon-marquee__group')).toHaveCount(2);
    await expect(marquee.locator('svg')).toHaveCount(12);
    const hero = page.locator('.home-media-hero');
    expect(await hero.boundingBox()).not.toBeNull();
    expect((await marquee.boundingBox()).y).toBeGreaterThan((await hero.boundingBox()).y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    if (width < 1024) {
      await page.getByRole('button', { name: 'Open menu' }).click();
      const drawer = page.getByRole('dialog', { name: 'Explore Tap & Wrap' });
      await expect(drawer).toBeVisible();
      await expect(drawer.locator('.drawer-account')).toHaveCount(0);
      await expect(drawer.getByRole('link', { name: 'Account' })).toHaveCount(0);
      await expect(drawer.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
      await expect(page.locator('.site-header .header-actions .icon-button').first()).toBeVisible();
    }
  });
}

test('reduced-motion users see static icon details instead of auto-scrolling content', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockCatalog(page);
  await page.goto('/');
  await expect(page.getByTestId('brand-icon-marquee').locator('.brand-icon-marquee__track')).toHaveCSS('animation-name', 'none');
});
