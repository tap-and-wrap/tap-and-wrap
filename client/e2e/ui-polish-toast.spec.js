import { test, expect } from '@playwright/test';
import { mockCommerce,commerceProduct } from './commerce-fixtures.js';
import { mockCatalog } from './catalog-fixtures.js';

for(const width of [320,390,768,1024,1440]) test(`toast stays centered below the measured storefront header at ${width}px`,async({page},info)=>{
  await mockCommerce(page);await page.setViewportSize({width,height:900});await page.goto('/products/'+commerceProduct.slug);
  await page.getByRole('button',{name:'Add to Cart',exact:true}).first().click();
  const toast=page.locator('[data-sonner-toast]').first();await expect(toast).toContainText('Added to your cart.');
  await toast.hover();await expect.poll(()=>toast.evaluate(n=>Number(getComputedStyle(n).opacity))).toBe(1);
  const box=await toast.boundingBox(),header=await page.locator('.site-header-stack').boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(header.y+header.height+10);expect(Math.abs(box.x+box.width/2-width/2)).toBeLessThan(2);
  expect(await toast.evaluate(n=>getComputedStyle(n).backgroundColor)).toBe('rgb(255, 252, 251)');
  const close=await toast.getByRole('button',{name:'Close toast',exact:true}).boundingBox();expect(close.width).toBeGreaterThanOrEqual(44);expect(close.height).toBeGreaterThanOrEqual(44);expect(close.x).toBeGreaterThan(box.x+box.width/2);
  await page.screenshot({path:info.outputPath('toast-header.png')});
  await page.evaluate(()=>scrollTo(0,500));await expect(toast).toBeVisible();
  await toast.getByRole('button',{name:'Close toast',exact:true}).click();await expect(toast).toHaveCount(0);
});

test('toast types, announcements, safe offsets and reduced motion remain consistent',async({page},info)=>{
  await mockCatalog(page);await page.goto('/e2e/controls.html');await page.emulateMedia({reducedMotion:'reduce'});
  for(const [name,type] of [['Show error toast','error'],['Show info toast','info'],['Show warning toast','warning']]){
    await page.getByRole('button',{name,exact:true}).click();const toast=page.locator(`[data-sonner-toast][data-type=${type}]`);await expect(toast).toBeVisible();await toast.hover();
    await expect(toast.locator('[data-icon] svg')).toBeVisible();
    expect(await toast.evaluate(n=>getComputedStyle(n).backgroundColor)).toBe('rgb(255, 252, 251)');
    expect(await toast.evaluate(n=>getComputedStyle(n).transitionDuration)).toBe('0s');
    expect(await toast.evaluate(n=>n.closest('section').getAttribute('aria-live'))).toBe('polite');
    await page.screenshot({path:info.outputPath(`toast-${type}.png`)});
    await toast.getByRole('button',{name:'Close toast',exact:true}).click();await expect(toast).toHaveCount(0);
  }
  await page.evaluate(()=>document.documentElement.style.setProperty('--site-header-height','180px'));
  await page.getByRole('button',{name:'Show info toast',exact:true}).click();
  const toast=page.locator('[data-sonner-toast][data-type=info]');await toast.hover();await expect.poll(()=>toast.evaluate(n=>Math.round(n.getBoundingClientRect().y))).toBe(192);
});
