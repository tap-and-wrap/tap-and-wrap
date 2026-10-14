import { test, expect } from '@playwright/test';
import { mockCatalog } from './catalog-fixtures.js';

const categoryNames = ['Accessories', 'Food & Treats', 'Gifts & Occasions', 'Home & Kitchen', 'Beauty & Selfcare', 'Baby & Kids', 'Home & Decor', 'Flowers & Plants', 'Outdoor & Travel', 'Electronics & Gaming', 'Office & Stationery', 'Pets'];
const categories = categoryNames.map((name, index) => ({
  _id: String(500 + index).padStart(24, '0'), name,
  slug: name.toLowerCase().replace(/&/g, ' ').replace(/\band\b/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
  parentId: null, active: true, featured: false, imageUrl: null, productCount: 3,
}));
const headers = { 'access-control-allow-origin': 'http://127.0.0.1:5191', 'access-control-allow-credentials': 'true' };

test('twelve active main categories get their editorial thumbnails and real navigation URLs', async ({ page }) => {
  await mockCatalog(page);
  await page.route('**/api/v1/public/categories?*', route => route.fulfill({ headers, json: { ok: true, data: { categories, pagination: { page: 1, limit: 20, total: 12, pages: 1 } } } }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.locator('.home-category')).toHaveCount(12);
  for (const category of categories) {
    const card = page.getByRole('link', { name: `Shop ${category.name}`, exact: true });
    await expect(card).toHaveAttribute('href', `/categories/${category.slug}`);
    await expect(card.locator('img')).toHaveAttribute('src', `/media/tap-wrap-category-${category.slug}.webp`);
    await expect(card.getByText('Shop Now')).toBeVisible();
  }
  await expect(page.getByRole('button', { name: 'Previous categories' })).toBeDisabled();
  await page.getByRole('button', { name: 'Next categories' }).click();
  await expect.poll(() => page.locator('.home-category-grid').evaluate(node => node.scrollLeft)).toBeGreaterThan(50);
});

test('desktop and mobile heroes select distinct optimized files; incomplete reviews are hidden', async ({ page }) => {
  await mockCatalog(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.locator('.hero-film video')).toHaveAttribute('src', '/media/tap-wrap-desktop-hero.mp4');
  await expect(page.locator('.home-service-media video')).toHaveCount(2);
  await expect(page.getByRole('heading', { name: 'Make their heart flutter.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What Our Customers Say' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Frequently Asked Questions' })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.hero-film video')).toHaveAttribute('src', '/media/tap-wrap-mobile-hero.mp4');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
