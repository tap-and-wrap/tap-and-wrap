import {test,expect} from '@playwright/test';
import {mockCatalog,detail} from './catalog-fixtures.js';
import {mockCommerce,cartWithProduct,isolatedImageFile} from './commerce-fixtures.js';
import {ownerFixture} from './owner-dashboard-fixtures.js';
import {INITIAL_ENGRAVING_TYPES,FONT_REGISTRY,ICON_REGISTRY} from '../../shared/engraving/definitions.mjs';

const widths=[320,390,440,768,1024,1440];
async function screenshot(page,info,name,fullPage=true){if(fullPage)await page.evaluate(()=>scrollTo(0,0));if(name.includes('menu'))await page.waitForTimeout(700);await page.screenshot({path:info.outputPath(`${name}.png`),fullPage,animations:'disabled'});}
async function fontUsed(page,selector){
  await page.evaluate(()=>document.fonts.ready);
  const client=await page.context().newCDPSession(page);await client.send('DOM.enable');await client.send('CSS.enable');
  const {root}=await client.send('DOM.getDocument');const {nodeId}=await client.send('DOM.querySelector',{nodeId:root.nodeId,selector});
  if(!nodeId){await client.detach();return [];}const {fonts}=await client.send('CSS.getPlatformFontsForNode',{nodeId});await client.detach();return fonts.filter(font=>font.glyphCount>0).map(font=>font.familyName);
}
async function noOverflow(page){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}

for(const width of widths)test(`Kalam storefront and account navigation at ${width}`,async({page},info)=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.setViewportSize({width,height:900});await mockCatalog(page);
  for(const [path,name] of [['/','home'],['/shop','shop'],[`/products/${detail.slug}`,'product']]){
    await page.goto(path);await expect(page.locator('main h1').first()).toBeVisible();await page.evaluate(()=>document.fonts.load('400 18px Kalam'));
    await expect.poll(()=>fontUsed(page,'main h1')).toContain('Kalam');await noOverflow(page);await screenshot(page,info,`${width}-${name}`);
  }
  if(width<1024){
    const opener=page.getByRole('button',{name:'Open menu',exact:true});await opener.click();const dialog=page.getByRole('dialog',{name:'Explore Tap & Wrap'});
    await expect(dialog).toBeVisible();await expect(dialog.getByRole('button',{name:'Close menu'})).toBeFocused();
    expect(await fontUsed(page,'.drawer-nav a')).toContain('Kalam');await screenshot(page,info,`${width}-menu`,false);
    await page.keyboard.press('Shift+Tab');expect(await dialog.evaluate(node=>node.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Tab');await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(opener).toBeFocused();
    await opener.click();await dialog.getByRole('link',{name:'Shop',exact:true}).click();await expect(page).toHaveURL('/shop');await expect(dialog).toHaveCount(0);
  }
  await page.unroute('**/api/v1/**');await mockCommerce(page,{cart:cartWithProduct(),checkoutEnabled:true});
  for(const [path,name] of [['/cart','product-cart'],['/checkout','checkout']]){await page.goto(path);await expect(page.locator('main h1').first()).toBeVisible();await expect.poll(()=>fontUsed(page,'main h1')).toContain('Kalam');await noOverflow(page);await screenshot(page,info,`${width}-${name}`);}
  await page.evaluate(()=>{const node=document.createElement('p');node.id='arabic-ui-probe';node.lang='ar';node.dir='rtl';node.textContent='هدية جميلة، بكل الحبّ ١٢٣';document.querySelector('main').append(node);});
  await page.evaluate(()=>document.fonts.load('400 18px "TapWrap Arabic"','هدية جميلة'));
  expect(await fontUsed(page,'#arabic-ui-probe')).toContain('Amiri');await screenshot(page,info,`${width}-arabic`);await page.locator('#arabic-ui-probe').screenshot({path:info.outputPath(`${width}-arabic-detail.png`)});
  await page.route('**/api/v1/commerce/engraving/types**',route=>route.fulfill({headers:{'access-control-allow-origin':'http://127.0.0.1:5191','access-control-allow-credentials':'true'},json:{ok:true,data:{enabled:true,hasNext:false,types:INITIAL_ENGRAVING_TYPES.map(type=>({...type,status:'active',version:1,fontIds:FONT_REGISTRY.map(font=>font.id),iconIds:ICON_REGISTRY.map(icon=>icon.id)}))}}}));
  await page.goto('/customize/laser-engraving');await expect(page.getByRole('radio',{name:'Watch',exact:false})).toBeVisible();await page.getByRole('radio',{name:'Watch',exact:false}).check();
  await page.locator('.studio-photo-section input[type=file]').first().setInputFiles(isolatedImageFile());await screenshot(page,info,`${width}-engraving-items`);await page.getByRole('button',{name:'Continue',exact:true}).click();
  await expect(page.locator('.engraving-sample').first()).toBeVisible();expect(await page.locator('.engraving-sample').first().evaluate(node=>getComputedStyle(node).fontFamily)).toContain('Engraving-');await noOverflow(page);await screenshot(page,info,`${width}-engraving-fonts`);
  expect(errors).toEqual([]);
});

for(const width of widths)test(`Kalam owner workspace and role menu at ${width}`,async({page},info)=>{
  await page.setViewportSize({width,height:900});await ownerFixture(page);
  for(const [path,name] of [['/admin','dashboard'],['/admin/products','admin-products'],['/admin/payment','admin-payment']]){await page.goto(path);await expect(page.locator('main h1').first()).toBeVisible();await page.evaluate(()=>document.fonts.load('400 18px Kalam'));await expect.poll(()=>fontUsed(page,'main h1')).toContain('Kalam');await noOverflow(page);if(name==='admin-products')expect(await page.locator('.admin-products-table tbody td').nth(1).evaluate(node=>getComputedStyle(node).whiteSpace)).toBe('nowrap');await screenshot(page,info,`${width}-${name}`);}
  await expect(page.getByRole('link',{name:'Home — storefront'})).toHaveAttribute('href','/');
  if(width<1024){await page.getByRole('button',{name:'Open menu'}).click();const dialog=page.getByRole('dialog',{name:'Your store'});await expect(dialog.locator('nav>ul>li')).toHaveCount(8);await dialog.getByText('Customization',{exact:true}).click();await expect(dialog.getByRole('link',{name:'Standalone Engraving',exact:true})).toBeVisible();await screenshot(page,info,`${width}-admin-menu`,false);await page.keyboard.press('Escape');await expect(dialog).toHaveCount(1);await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);}
  await page.goto('/');await expect(page.getByRole('link',{name:'Account',exact:true})).toHaveAttribute('href','/admin');
});

test('staggered motion has bounded entry/exit, traps focus and fits a short phone',async({page},info)=>{
  await mockCatalog(page);await page.setViewportSize({width:320,height:400});await page.emulateMedia({reducedMotion:'no-preference'});await page.goto('/');
  const opener=page.getByRole('button',{name:'Open menu'});await opener.click();const dialog=page.getByRole('dialog');
  expect(await dialog.locator('nav>ul>li').first().evaluate(node=>getComputedStyle(node).animationName)).toBe('menu-link-in');
  await page.waitForTimeout(650);await screenshot(page,info,'320-short-menu',false);await noOverflow(page);
  await dialog.getByRole('link',{name:'Track Order',exact:true}).focus();await page.keyboard.press('Tab');await expect(dialog.getByRole('button',{name:'Close menu'})).toBeFocused();
  await dialog.getByRole('button',{name:'Close menu'}).click();await expect(dialog).toHaveClass(/is-closing/);await expect(dialog).toHaveCount(0);await expect(opener).toBeFocused();
  await page.emulateMedia({reducedMotion:'reduce'});await opener.click();expect(await dialog.evaluate(node=>getComputedStyle(node).animationName)).toBe('none');await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
});
