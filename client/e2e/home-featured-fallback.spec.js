import { test, expect } from '@playwright/test';
import { mockCatalog } from './catalog-fixtures.js';

// Isolated API fixtures: no live shop, production database, or cart requests.
for (const selectedCount of [0, 4, 8]) {
  test(`homepage Featured Gifts handles ${selectedCount} owner selections without unnecessary requests`, async ({ page }) => {
    const fixture = await mockCatalog(page, { bestSellerCount: selectedCount });
    await page.goto('/');

    const cards = page.locator('.home-product-grid .catalog-card');
    await expect(cards).toHaveCount(8);
    await expect(cards.first()).toContainText('Fixture Gift 01');
    if (selectedCount >= 4) await expect(cards.nth(3)).toContainText('Fixture Gift 05');

    const requests = fixture.requests.filter(request => request.path === '/public/products');
    const selections = requests.filter(request => request.params.bestSeller === 'true');
    const newestFallback = requests.filter(request => request.params.sort === 'newest' && !request.params.category);
    const categoryFallback = requests.filter(request => Boolean(request.params.category));

    expect(selections).toHaveLength(1);
    if (selectedCount === 8) {
      expect(newestFallback).toHaveLength(0);
      expect(categoryFallback).toHaveLength(0);
      expect(requests).toHaveLength(1);
    } else {
      // The single root-category fixture produces one diversity request.
      expect(newestFallback).toHaveLength(1);
      expect(categoryFallback).toHaveLength(1);
      expect(requests).toHaveLength(3);
    }
  });
}
