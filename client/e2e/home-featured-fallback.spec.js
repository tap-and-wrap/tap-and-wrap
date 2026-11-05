import { test, expect } from '@playwright/test';
import { mockCatalog,detail,cards as fixtureCards } from './catalog-fixtures.js';

// Isolated API fixtures: no live shop, production database, or cart requests.
for (const selectedCount of [0, 2, 4, 6, 8, 12, 24]) {
  test(`homepage Featured Gifts handles ${selectedCount} owner selections without unnecessary requests`, async ({ page }) => {
    const fixture = await mockCatalog(page, { bestSellerCount: selectedCount });
    await page.goto('/');

    const cards = page.locator('.home-product-grid .catalog-card');
    await expect(cards).toHaveCount(Math.max(4,selectedCount));
    expect(new Set(await cards.locator('h3 a').evaluateAll(nodes=>nodes.map(node=>node.href))).size).toBe(Math.max(4,selectedCount));
    await expect(cards.first()).toContainText('Fixture Gift 01');
    expect((await cards.locator('h3 a').allTextContents()).slice(0,selectedCount)).toEqual(fixtureCards.filter(item=>item.orderingAvailable).slice(0,selectedCount).map(item=>item.name));
    if (selectedCount >= 4) await expect(cards.nth(3)).toContainText('Fixture Gift 05');

    const requests = fixture.requests.filter(request => request.path === '/public/products');
    const selections = requests.filter(request => request.params.bestSeller === 'true');
    const newestFallback = requests.filter(request => request.params.sort === 'newest' && !request.params.category);
    const categoryFallback = requests.filter(request => Boolean(request.params.category));

    expect(selections).toHaveLength(Math.max(1,Math.ceil(selectedCount/20)));
    if (selectedCount >= 4) {
      expect(newestFallback).toHaveLength(0);
      expect(categoryFallback).toHaveLength(0);
      expect(requests).toHaveLength(Math.max(1,Math.ceil(selectedCount/20)));
    } else {
      // The single root-category fixture produces one diversity request.
      expect(newestFallback).toHaveLength(1);
      expect(categoryFallback).toHaveLength(1);
      expect(requests).toHaveLength(3);
    }
  });
}

for(const width of [320,390,1440]) test(`cohesive product cards across homepage, shop and related gifts at ${width}px`,async({page},info)=>{
  await page.setViewportSize({width,height:1000});await mockCatalog(page,{bestSellerCount:6});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  for(const [path,selector,label] of [['/','.home-product-grid','home'],['/shop','.catalog-results .catalog-grid','shop'],[`/products/${detail.slug}`,'.product-related .catalog-grid','related']]) {
    await page.goto(path);await expect(page.getByTestId('ribbon-opening')).toHaveCount(0);const grid=page.locator(selector);await expect(grid.locator('.catalog-card').first()).toBeVisible();
    const card=grid.locator('.catalog-card').first();await expect(card).toHaveCSS('border-radius','14px');await expect(card).toHaveCSS('border-top-width','1px');
    if(label==='home') expect(await grid.evaluate(node=>getComputedStyle(node).gridTemplateColumns.split(' ').length)).toBe(width===1440 ? 4 : 2);
    const bottoms=await grid.locator('.catalog-card').evaluateAll(nodes=>nodes.slice(0,2).map(node=>node.querySelector('.catalog-card-action').getBoundingClientRect().bottom));expect(Math.abs(bottoms[0]-bottoms[1])).toBeLessThan(2);
    const actionFonts=await grid.locator('.catalog-card-action').evaluateAll(nodes=>nodes.slice(0,2).map(node=>getComputedStyle(node).fontSize));expect(actionFonts[0]).toBe(actionFonts[1]);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await grid.screenshot({path:info.outputPath(`cards-${label}-${width}.png`)});
  }
  expect(errors).toEqual([]);
});
