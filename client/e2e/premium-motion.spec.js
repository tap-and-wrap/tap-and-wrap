import { test, expect } from '@playwright/test';
import { mockCatalog } from './catalog-fixtures.js';

for (const width of [320, 1440]) {
  test(`homepage motion is progressive and sections reveal safely at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await mockCatalog(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { level: 1, name: 'Make their heart flutter.' })).toBeVisible();
    await expect(page.getByTestId('brand-icon-marquee')).toBeVisible();
    await expect(page.locator('.home-product-grid > article')).toHaveCount(8);
    const title = page.locator('main.home-page .section-heading').first();
    await expect(title).toHaveAttribute('data-tw-motion', /waiting|visible/);
    await title.scrollIntoViewIfNeeded();
    await expect(title).toHaveAttribute('data-tw-motion', 'visible');
    await expect(title).toBeVisible();
    await expect(page.locator('main.home-page .home-service-card')).toHaveCount(2);
  });
}

test('desktop cards and controls move subtly without blocking navigation', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockCatalog(page);
  await page.goto('/');
  const card = page.locator('.home-product-grid .catalog-card').first();
  await expect(card).toBeVisible();
  await card.hover();
  await expect.poll(() => card.evaluate(node => getComputedStyle(node).transform)).not.toBe('none');
  await expect(card.getByRole('link', { name: /View / })).toHaveAttribute('href', /^\/products\//);
});

test('reduced-motion users never receive hidden sections or card movement', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockCatalog(page);
  await page.goto('/');
  const title = page.locator('main.home-page .section-heading').first();
  await expect(title).toBeVisible();
  await expect(title).not.toHaveAttribute('data-tw-motion', 'waiting');
  const card = page.locator('.home-product-grid .catalog-card').first();
  await card.hover();
  await expect(card).toHaveCSS('transform', 'none');
  await expect(page.locator('.hero-film video, .hero-film img.hero-film-poster')).toHaveCount(1);
});
