import {test,expect} from '@playwright/test';
import {localCheckoutFixture} from './gift-box-checkout-fixture.js';
import {beginGiftBox} from './gift-box-fixtures.js';
import {isolatedImageFile} from './commerce-fixtures.js';
import {chooseImageFiles} from './media-helpers.js';
for(const width of [320,390,440,768,1024,1440])test(`Gift Box photo replacement retains arrangement identity and aspect ratio at ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:1000});const {fixture}=await localCheckoutFixture(page,{personalized:true});await beginGiftBox(page);await page.getByRole('button',{name:'Make It Personal',exact:true}).click();
 await page.getByRole('button',{name:'Choose your photos',exact:true}).click();await page.getByRole('dialog',{name:'Choose image source'}).screenshot({path:info.outputPath(width+'-gift-chooser.png')});await page.keyboard.press('Escape');
 await chooseImageFiles(page,page,'Choose your photos',[isolatedImageFile('first.png'),isolatedImageFile('second.png')]);await expect(page.locator('.gb-free-photo')).toHaveCount(2);const photo=page.locator('.gb-free-photo').first();await photo.focus();await photo.press('ArrowRight');const before=await photo.evaluate(n=>({id:n.dataset.instanceId,left:n.style.left,top:n.style.top}));
 const encoded=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=8;c.height=4;const ctx=c.getContext('2d');ctx.fillStyle='#915B50';ctx.fillRect(0,0,8,4);return c.toDataURL('image/png').split(',')[1];});
 await chooseImageFiles(page,page,'Photo 1',{name:'wide.png',mimeType:'image/png',buffer:Buffer.from(encoded,'base64')});await expect.poll(()=>photo.locator('img').evaluate(n=>n.naturalWidth/n.naturalHeight)).toBe(2);
 expect(await photo.evaluate(n=>({id:n.dataset.instanceId,left:n.style.left,top:n.style.top}))).toEqual(before);await expect(page.locator('.gb-free-photo')).toHaveCount(2);expect(fixture.uploads).toHaveLength(0);await expect(page.locator('.gb-photo-thumbnails .image-upload-button').first()).toBeVisible();await page.locator('.gb-personal-editor').screenshot({path:info.outputPath(width+'-gift-photo-replacement.png')});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
