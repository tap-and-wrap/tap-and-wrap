import {test,expect} from '@playwright/test';
import {mockCatalog} from './catalog-fixtures.js';
import {ownerFixture} from './owner-dashboard-fixtures.js';
const widths=[320,390,440,768,1024,1440];
async function settle(dialog){await dialog.evaluate(async node=>{await Promise.allSettled(node.getAnimations({subtree:true}).map(a=>a.finished));});}
for(const width of widths)test(`responsive navigation, simplified menu, logo and focus at ${width}`,async({page},info)=>{
 await mockCatalog(page);await page.setViewportSize({width,height:900});await page.goto('/shop');const opener=page.getByRole('button',{name:'Open menu',exact:true});if(width>=1024){await expect(opener).toHaveCount(0);await expect(page.locator('.desktop-navigation')).toBeVisible();for(const name of ['Home','Shop','Customize','About Us'])await expect(page.locator('.desktop-navigation').getByRole('link',{name,exact:true})).toBeVisible();const logo=await page.locator('.site-logo').boundingBox(),nav=await page.locator('.desktop-navigation').boundingBox(),actions=await page.locator('.header-actions').boundingBox();expect(logo.x+logo.width).toBeLessThan(nav.x);expect(nav.x+nav.width).toBeLessThan(actions.x);await page.screenshot({path:info.outputPath(`${width}-desktop-header.png`)});return;}await opener.click();const dialog=page.getByRole('dialog',{name:'Main menu'});await expect(dialog).toBeVisible();await expect(dialog.getByRole('button',{name:'Close menu'})).toBeFocused();expect((await dialog.boundingBox()).x).toBe(0);await expect(dialog.locator('.sm-prelayer')).toHaveCount(3);await expect(dialog.locator('.sm-link-number,.sm-socials,.drawer-eyebrow')).toHaveCount(0);await expect(dialog).not.toContainText(/Explore Tap & Wrap|Your store|Thoughtfully managed|A little thought\. A lasting memory/);await expect(dialog.getByRole('button',{name:'Close menu'})).toHaveText('');await expect(dialog.getByRole('button',{name:'Close menu'}).locator('svg')).toHaveCount(1);await settle(dialog);await dialog.locator('.drawer-logo img').evaluate(n=>n.decode());await page.screenshot({path:info.outputPath(`${width}-left-menu.png`),animations:'disabled'});
 expect(await dialog.evaluate(n=>n.scrollWidth<=n.clientWidth)).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.keyboard.press('Shift+Tab');expect(await dialog.evaluate(n=>n.contains(document.activeElement))).toBe(true);await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(opener).toBeFocused();expect(await page.evaluate(()=>document.body.style.overflow)).not.toBe('hidden');
 await opener.click();await settle(dialog);await dialog.getByRole('link',{name:'About Us',exact:true}).click();await expect(page).toHaveURL('/about');await expect(dialog).toHaveCount(0);
});
for(const width of widths.filter(n=>n<1024))test(`admin menu preserves eight primary destinations at ${width}`,async({page},info)=>{
 await ownerFixture(page);await page.setViewportSize({width,height:900});await page.goto('/admin');await page.getByRole('button',{name:'Open menu',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Administration menu'});await settle(dialog);await expect(dialog.locator('.drawer-nav>ul>li')).toHaveCount(8);await dialog.getByText('Customization',{exact:true}).click();await expect(dialog.getByRole('link',{name:'Gift Box',exact:true})).toBeVisible();await expect(dialog.getByRole('link',{name:'Standalone Engraving',exact:true})).toBeVisible();await page.screenshot({path:info.outputPath(`${width}-admin-menu.png`),animations:'disabled'});await dialog.getByRole('link',{name:'Gift Box',exact:true}).click();await expect(page).toHaveURL('/admin/gift-box');
});
test('layered entrance and exit display the reference choreography and tolerate rapid dismissal',async({page},info)=>{
 await mockCatalog(page);await page.setViewportSize({width:390,height:844});await page.goto('/');await page.getByRole('button',{name:'Open menu',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Main menu'});await expect(dialog).toBeVisible();
 for(const time of [90,180,360,650,1200,1900]){await dialog.evaluate((node,t)=>node.getAnimations({subtree:true}).forEach(a=>{a.pause();a.currentTime=t;}),time);await page.screenshot({path:info.outputPath(`menu-entrance-${time}.png`),animations:'allow'});}
 await dialog.getByRole('button',{name:'Close menu'}).click();await expect(dialog).toHaveCount(0);await page.getByRole('button',{name:'Open menu',exact:true}).click();await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);expect(await page.evaluate(()=>document.body.style.overflow)).not.toBe('hidden');
});
test('short viewport, backdrop and live reduced-motion changes keep every navigation reachable',async({page})=>{
 await mockCatalog(page);await page.setViewportSize({width:768,height:390});await page.goto('/shop');const opener=page.getByRole('button',{name:'Open menu',exact:true});await opener.click();const dialog=page.getByRole('dialog',{name:'Main menu'});await page.emulateMedia({reducedMotion:'reduce'});await expect(dialog.getByRole('link',{name:'Track Order',exact:true})).toBeVisible();await page.mouse.click(750,300);await expect(dialog).toHaveCount(0);await expect(opener).toBeFocused();await opener.click();expect(await dialog.evaluate(n=>n.getAnimations({subtree:true}).length)).toBe(0);await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
});

for(const width of [1024,1440])for(const workspace of ['storefront','admin'])test(`desktop owner ${workspace} keeps actions and navigation without a menu at ${width}`,async({page},info)=>{
 if(workspace==='admin')await ownerFixture(page);else await mockCatalog(page,{role:'admin'});
 await page.setViewportSize({width,height:900});await page.goto(workspace==='admin'?'/admin':'/shop');
 await expect(page.getByRole('button',{name:'Open menu',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:/^Admin notifications/})).toBeVisible();
 if(workspace==='admin'){
  await expect(page.locator('.desktop-navigation>ul>li')).toHaveCount(8);
  await expect(page.getByRole('link',{name:/Home — storefront/})).toHaveAttribute('href','/');
 }else{
  await expect(page.getByRole('link',{name:'Account',exact:true})).toHaveAttribute('href','/admin');
  await expect(page.getByRole('link',{name:/^Cart/})).toBeVisible();
 }
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath(`${width}-${workspace}-owner-header.png`)});
});

test('simplified menu keeps keyboard containment, X dismissal and desktop resize cleanup',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await mockCatalog(page);await page.setViewportSize({width:390,height:844});await page.goto('/shop');
 const opener=page.getByRole('button',{name:'Open menu',exact:true});await opener.click();const dialog=page.getByRole('dialog',{name:'Main menu'});await settle(dialog);
 for(let i=0;i<14;i++){await page.keyboard.press(i%2?'Shift+Tab':'Tab');expect(await dialog.evaluate(node=>node.contains(document.activeElement))).toBe(true);}
 await dialog.getByRole('button',{name:'Close menu'}).click();await expect(dialog).toHaveCount(0);await expect(opener).toBeFocused();
 await opener.click();await page.setViewportSize({width:1024,height:900});await expect(dialog).toHaveCount(0);await expect(opener).toHaveCount(0);
 expect(await page.evaluate(()=>document.body.style.overflow)).not.toBe('hidden');expect(errors).toEqual([]);
});
