import { test, expect } from '@playwright/test';
import { mockCatalog } from './catalog-fixtures.js';

for (const width of [320, 1440]) {
  test(`V2-styled ribbon with V1 smooth reveal is decorative, once-per-session, and previewable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await mockCatalog(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const intro = page.getByTestId('ribbon-opening');
    await expect(intro).toBeVisible();
    await expect(intro).toHaveAttribute('aria-hidden', 'true');
    await expect(intro).toHaveCSS('pointer-events', 'none');
    await expect(intro.getByRole('button', { includeHidden: true })).toHaveCount(0);
    await expect(intro).not.toContainText(/Tap & Wrap|Unlock the Magic|Skip intro/i);
    await expect(intro.locator('.tw-ribbon-opening__loop')).toHaveCount(2);
    await expect(intro.locator('.tw-ribbon-opening__tail')).toHaveCount(2);
    await expect(intro.locator('.tw-ribbon-opening__paper--left')).toHaveCSS('animation-name', 'tw-paper-left');
    await expect(intro.locator('.tw-ribbon-opening__paper--right')).toHaveCSS('animation-name', 'tw-paper-right');
    await expect(intro.locator('.tw-ribbon-opening__paper--left')).toHaveCSS('animation-duration', '1.65s');
    await expect(intro.locator('.tw-ribbon-opening__paper--right')).toHaveCSS('animation-duration', '1.65s');
    await expect(page.getByRole('heading', { name: 'Make their heart flutter.' })).toBeVisible();
    await expect(intro).toHaveCount(0, { timeout: 5000 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(intro).toHaveCount(0);
    await page.goto('/?previewRibbon=1', { waitUntil: 'domcontentloaded' });
    await expect(intro).toBeVisible();
    await expect(intro).toHaveCount(0, { timeout: 5000 });
  });
}

test('reduced-motion visitors do not see the opening overlay', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockCatalog(page);
  await page.goto('/?previewRibbon=1');
  await expect(page.getByTestId('ribbon-opening')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Make their heart flutter.' })).toBeVisible();
});
