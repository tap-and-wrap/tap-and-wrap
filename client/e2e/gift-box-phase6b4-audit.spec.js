import {localCheckoutFixture} from './gift-box-checkout-fixture.js';
import { expect,test } from '@playwright/test';
import { giftBoxFixture,beginGiftBox } from './gift-box-fixtures.js';
import { isolatedImageFile } from './commerce-fixtures.js';
// The old browser-only quote/multi-engraving study UI is replaced by the shopping builder.
// Keep the full-stage, enlarged-text, local-photo and closed-launch audit here.
test.beforeEach(({page})=>{const errors=[];page.on('pageerror',error=>errors.push(error.message));page.__auditErrors=errors;});
test.afterEach(({page})=>expect(page.__auditErrors).toEqual([]));
for(const width of [320,390,768,1440]) test(`six shopping stages keep prices visible and ordering closed at ${width}px`,async({page},info)=>{
 await page.setViewportSize({width,height:950});const fixture=await giftBoxFixture(page);await beginGiftBox(page);
 for(const [title,item] of [['Fill With Flowers','rose-red'],['Add Soft Toys','plush-1'],['Add Chocolates','chocolate-1']]){
  await page.getByRole('button',{name:title,exact:true}).click();await page.getByRole('button',{name:`Add Fixture ${item}`,exact:true}).click();
 }
 await expect(page.locator('.gb-live-total strong')).toContainText('40.00');
 await page.getByRole('button',{name:'Make It Personal',exact:true}).click();
 await expect(page.locator('.gb-personal-section[open]')).toHaveCount(0);
 await page.locator('.gb-personal-section summary').first().click();await page.getByLabel('Choose your photos').setInputFiles(isolatedImageFile('local.png'));
 await expect(page.locator('.gb-photo-thumbnails img')).toHaveCount(1);expect(fixture.uploads).toHaveLength(0);
 await page.getByRole('button',{name:'Finishing Touches',exact:true}).click();await page.locator('.gb-finishing summary').click();await page.getByLabel('Your message').fill('Literal customer message');
 await page.getByRole('button',{name:'Next: Review'}).click();await expect(page.getByRole('button',{name:'Add Your Gift to Cart',exact:true})).toBeDisabled();
 expect(fixture.calls.filter(call=>/cart\/items|orders|uploads/.test(call.path))).toHaveLength(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath(`shopping-audit-${width}.png`),fullPage:true});
});
for(const width of [320,768,1440]) test(`personalization reflows with 200 percent text at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:1000});await localCheckoutFixture(page,{personalized:true});await beginGiftBox(page);await page.getByRole('button',{name:'Make It Personal',exact:true}).click();
 await page.evaluate(()=>{document.documentElement.style.fontSize='200%';});await page.locator('.gb-personal-section summary').last().click();
 await page.getByLabel('Name or message').fill('Literal text');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await expect(page.locator('.gb-sticker-style-list button')).toHaveCount(6);
});
