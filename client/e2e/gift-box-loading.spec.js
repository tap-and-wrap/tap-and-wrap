import { test,expect } from '@playwright/test';
import { cartWithProduct,isolatedImageFile } from './commerce-fixtures.js';
import { localCheckoutFixture } from './gift-box-checkout-fixture.js';
import { beginGiftBox } from './gift-box-fixtures.js';

test.beforeEach(async({page,context})=>{
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    return ['127.0.0.1','localhost'].includes(url.hostname) || ['data:','blob:'].includes(url.protocol) ? route.continue() : route.abort();
  });
  await page.addInitScript(()=>{
    window.loadingBoot=crypto.randomUUID();window.preloadFailures=[];
    window.addEventListener('vite:preloadError',event=>window.preloadFailures.push(String(event.payload?.message || event.payload)));
  });
});

test('cold cart return has eager font faces and no route-specific sticker CSS request',async({page},info)=>{
  await localCheckoutFixture(page,{initialCart:cartWithProduct()});await page.goto('/cart');
  await page.getByRole('link',{name:'Build another Gift Box',exact:true}).waitFor();
  let legacyRequests=0;
  await page.route('**/assets/sticker-fonts-*.css',route=>{legacyRequests++;return route.abort('failed');});
  try {
    await page.getByRole('link',{name:'Build another Gift Box',exact:true}).click();
    await expect(page.getByRole('button',{name:'Choose Fixture box-2',exact:true})).toBeVisible();
    expect(legacyRequests).toBe(0);
    const families=await page.evaluate(()=>[...document.styleSheets].flatMap(sheet=>{
      try{return [...sheet.cssRules].filter(rule=>rule.type===CSSRule.FONT_FACE_RULE).map(rule=>rule.style.fontFamily);}catch{return [];}
    }).filter(family=>family.includes('Gift-')));
    expect(new Set(families).size).toBe(12);
    expect(await page.evaluate(()=>window.preloadFailures)).toEqual([]);
  } finally {
    await info.attach('preload-events',{body:JSON.stringify({legacyRequests,events:await page.evaluate(()=>window.preloadFailures)}),contentType:'application/json'});
  }
});

test('personalized Add, cart reload and normal return use the production lazy bundles',async({page})=>{
  const {fixture}=await localCheckoutFixture(page,{personalized:true});await beginGiftBox(page);
  await page.getByRole('button',{name:'Make It Personal',exact:true}).click();
  await page.locator('.gb-personal-section').first().locator('summary').click();
  await page.getByLabel('Choose your photos').setInputFiles(isolatedImageFile('loading-fixture.png'));
  await page.locator('.gb-personal-section').last().locator('summary').click();
  await page.getByLabel('Write a name, special date, or heartfelt message').fill('Loading check');
  await page.getByRole('button',{name:'Finishing Touches',exact:true}).click();await page.getByRole('button',{name:'Next: Review'}).click();
  await expect(page.getByRole('button',{name:'Add Your Gift to Cart'})).toBeEnabled();await page.getByRole('button',{name:'Add Your Gift to Cart'}).click();await expect(page).toHaveURL(/\/cart$/);
  expect(fixture.uploads).toHaveLength(1);
  await page.reload();await page.getByRole('link',{name:'Build another Gift Box',exact:true}).click();
  await expect(page.locator('.gb-preview-empty')).toBeVisible();
  await page.getByRole('button',{name:'Choose Fixture box-3',exact:true}).click();
  expect(await page.evaluate(()=>window.preloadFailures)).toEqual([]);
});

test('a transient unrelated lazy CSS failure emits preloadError without reloading or losing the private draft',async({page})=>{
  const {fixture}=await localCheckoutFixture(page,{personalized:true});await beginGiftBox(page);
  await page.getByRole('button',{name:'Make It Personal',exact:true}).click();await page.locator('.gb-personal-section').first().locator('summary').click();
  await page.getByLabel('Choose your photos').setInputFiles(isolatedImageFile('keep-in-memory.png'));
  await page.locator('.gb-personal-section').last().locator('summary').click();await page.getByLabel('Write a name, special date, or heartfelt message').fill('Keep this draft');
  const photo=await page.locator('.gb-free-photo img').getAttribute('src'),boot=await page.evaluate(()=>window.loadingBoot);
  let failures=0;
  await page.route('**/assets/service-requests-*.css',route=>{failures++;return failures===1 ? route.abort('failed') : route.continue();});
  await page.getByRole('banner').getByRole('link',{name:'Customize',exact:true}).click();await page.locator('main a[href="/customize/laser-engraving"]').click();
  await expect(page.getByRole('heading',{name:'This page couldn’t be displayed',exact:true})).toBeVisible();
  expect(failures).toBe(1);expect(await page.evaluate(()=>window.loadingBoot)).toBe(boot);
  expect(await page.evaluate(()=>window.preloadFailures)).toEqual([expect.stringContaining('Unable to preload CSS')]);
  await page.getByRole('banner').getByRole('link',{name:'Customize',exact:true}).click();await page.locator('main a[href="/customize/gift-box"]').click();
  await expect(page.locator('.gb-free-photo img')).toHaveAttribute('src',photo);
  await expect(page.getByLabel('Write a name, special date, or heartfelt message')).toHaveValue('Keep this draft');
  expect(await page.evaluate(()=>window.loadingBoot)).toBe(boot);expect(fixture.uploads).toHaveLength(0);
});
