import { test, expect } from '@playwright/test';
import { mockCatalog } from './catalog-fixtures.js';

test('shop opens in Discover, keeps explicit sorting and normal pagination', async ({ page }) => {
  const fixture = await mockCatalog(page);
  await page.goto('/shop');
  const sort = page.locator('#catalog-sort');
  await expect(sort).toHaveValue('discovery');
  await expect(page.getByRole('heading', { name: 'Shop Our Gifts' })).toBeVisible();
  await expect(page.locator('.catalog-grid .catalog-card')).toHaveCount(20);
  expect(fixture.requests.some(request => request.path === '/public/products' && request.params.sort === 'discovery')).toBe(true);
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.locator('#catalog-sort')).toHaveValue('discovery');
  await sort.selectOption('featured');
  await expect(page).toHaveURL(/sort=featured/);
  await expect(page.getByText('Page 1 of 3')).toBeVisible();
  expect(fixture.requests.some(request => request.path === '/public/products' && request.params.sort === 'featured')).toBe(true);
});

test('Customize Yours hover has the same legible dark backdrop as Shop Gifts', async ({ page }) => {
  await mockCatalog(page);
  await page.goto('/');
  const shop = page.getByRole('link', { name: 'Shop Gifts' });
  const customize = page.getByRole('link', { name: 'Customize Yours' });
  for (const button of [shop, customize]) {
    await button.hover();
    await expect.poll(() => button.evaluate(node => getComputedStyle(node).color)).toBe('rgb(255, 255, 255)');
    await expect.poll(() => button.evaluate(node => getComputedStyle(node).backgroundColor)).toBe('rgba(20, 13, 10, 0.55)');
  }
  await expect(customize).toHaveAttribute('href', '/customize');
});
