import { expect, test } from '@playwright/test';
import { mockCatalog, category } from './catalog-fixtures.js';

const headers = {
  'access-control-allow-origin': 'http://127.0.0.1:5191',
  'access-control-allow-credentials': 'true',
};
async function prepare(page) {
  await mockCatalog(page);
  await page.route('**/api/v1/public/categories?*', route => route.fulfill({headers,json:{
    ok:true,data:{categories:Array.from({length:12},(_,index)=>({
      ...category,_id:`home-category-${index}`,slug:`home-category-${index}`,
      name:`Category ${index + 1}`,productCount:1,
    })),pagination:{page:1,pages:1,total:12}},
  }}));
}

for (const width of [320, 390, 440, 768, 1440]) {
  test(`premium category controls and home service cards fit ${width}px`, async ({page}) => {
    await page.setViewportSize({width,height:900});await prepare(page);await page.goto('/');
    const nav=page.getByRole('navigation',{name:'Category carousel navigation'});
    await expect(nav).toBeVisible();
    await expect(nav.getByRole('button',{name:'Previous categories'})).toBeDisabled();
    await expect(nav.getByRole('button',{name:'Next categories'})).toBeEnabled();
    await expect(nav.locator('.home-slide-dot')).toHaveCount(5);
    await expect(nav.locator('.home-slide-dot.is-active')).toHaveCount(1);
    expect(await nav.evaluate(node=>getComputedStyle(node).borderRadius)).toBe('999px');
    expect(await nav.locator('.home-slide-dot.is-active').evaluate(node=>parseFloat(getComputedStyle(node,'::after').width))).toBeGreaterThan(17);
    for(const arrow of await nav.locator('.home-slide-arrow').all()) {
      const box=await arrow.boundingBox();expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);
    }
    const cards=page.locator('main.home-page .home-service-card');
    await expect(cards).toHaveCount(2);
    for(const card of await cards.all()) {
      const media=await card.locator('.home-service-media').boundingBox();
      const outer=await card.boundingBox();
      const link=card.locator('.home-service-detail');
      await expect(link).toBeVisible();
      await expect(link.locator(':scope > span')).toHaveCount(1);
      if(width<=760) {
        expect(media.width/outer.width).toBeGreaterThan(.90);
        expect(media.y).toBeLessThan((await link.boundingBox()).y);
      } else {
        expect(media.width/outer.width).toBeLessThan(.55);
      }
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  });
}

test('category pill navigation follows actual rail scrolling and remains keyboard accessible',async({page})=>{
  await page.setViewportSize({width:390,height:900});await prepare(page);await page.goto('/');
  const rail=page.locator('.home-category-grid');
  const nav=page.getByRole('navigation',{name:'Category carousel navigation'});
  const next=nav.getByRole('button',{name:'Next categories'});
  await next.focus();await page.keyboard.press('Enter');
  await expect.poll(()=>rail.evaluate(node=>node.scrollLeft)).toBeGreaterThan(20);
  await expect(nav.getByRole('button',{name:'Previous categories'})).toBeEnabled();
  await rail.evaluate(node=>{node.scrollLeft=node.scrollWidth;});
  await expect(next).toBeDisabled();
  await expect(nav.locator('.home-slide-dot.is-active')).toHaveCount(1);
});
