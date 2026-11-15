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
  const {fonts}=await client.send('CSS.getPlatformFontsForNode',{nodeId});await client.detach();return fonts.filter(font=>font.glyphCount>0).map(font=>font.familyName);
}
// Remote font delivery is deliberately blocked in these isolated fixtures. Verify
// the approved CSS family, rendered text and layout; the separate font-handoff
// tests cover fallback stability. CDP font inspection hangs on the owner shell.
async function renderedTextWidth(page,selector){return page.locator(selector).first().evaluate(node=>{const range=document.createRange();range.selectNodeContents(node);return range.getBoundingClientRect().width;});}
async function noOverflow(page){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}

for(const width of widths)test(`Deployed typography storefront and account navigation at ${width}`,async({page},info)=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.setViewportSize({width,height:900});await mockCatalog(page);
  for(const [path,name] of [['/','home'],['/shop','shop'],[`/products/${detail.slug}`,'product']]){
    await page.goto(path);await expect(page.getByRole('heading',{level:1,name:({'/':'Make their heart flutter.','/shop':'Shop Our Gifts','/cart':'Your Cart','/checkout':'Checkout','/admin':'Dashboard','/admin/products':'Products','/admin/payment':'Payment'})[path] || detail.name,exact:true})).toBeVisible();
    await expect(page.locator('main h1').first()).toHaveCSS('font-family',/Cormorant Garamond/);expect(await renderedTextWidth(page,'main h1')).toBeGreaterThan(0);await noOverflow(page);await screenshot(page,info,`${width}-${name}`);
  }
  if(width<1024){
    const opener=page.getByRole('button',{name:'Open menu',exact:true});await opener.click();const dialog=page.getByRole('dialog',{name:'Main menu'});
    await expect(dialog).toBeVisible();await expect(dialog.getByRole('button',{name:'Close menu'})).toBeFocused();
    expect(await page.locator('.drawer-nav a').first().evaluate(node=>getComputedStyle(node).fontFamily)).toMatch(/Cormorant Garamond|DM Sans/);expect(await renderedTextWidth(page,'.drawer-nav a')).toBeGreaterThan(0);await screenshot(page,info,`${width}-menu`,false);
    await page.keyboard.press('Shift+Tab');expect(await dialog.evaluate(node=>node.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Tab');await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(opener).toBeFocused();
    await opener.click();await dialog.getByRole('link',{name:'Shop',exact:true}).click();await expect(page).toHaveURL('/shop');await expect(dialog).toHaveCount(0);
  }
  await page.unroute('**/api/v1/**');await mockCommerce(page,{cart:cartWithProduct(),checkoutEnabled:true});
  for(const [path,name] of [['/cart','product-cart'],['/checkout','checkout']]){await page.goto(path);await expect(page.getByRole('heading',{level:1,name:({'/':'Make their heart flutter.','/shop':'Shop Our Gifts','/cart':'Your Cart','/checkout':'Checkout','/admin':'Dashboard','/admin/products':'Products','/admin/payment':'Payment'})[path] || detail.name,exact:true})).toBeVisible();await expect(page.locator('main h1').first()).toHaveCSS('font-family',/Cormorant Garamond/);expect(await renderedTextWidth(page,'main h1')).toBeGreaterThan(0);await noOverflow(page);await screenshot(page,info,`${width}-${name}`);}
  await page.evaluate(()=>{const node=document.createElement('p');node.id='arabic-ui-probe';node.lang='ar';node.dir='rtl';node.textContent='هدية جميلة، بكل الحبّ ١٢٣';document.querySelector('main').append(node);});
  await page.evaluate(()=>document.fonts.load('400 18px "TapWrap Arabic"','هدية جميلة'));
  expect(await fontUsed(page,'#arabic-ui-probe')).toContain('Amiri');await screenshot(page,info,`${width}-arabic`);await page.locator('#arabic-ui-probe').screenshot({path:info.outputPath(`${width}-arabic-detail.png`)});
  expect(errors).toEqual([]);
});

for(const width of widths)test(`Selected engraving fonts remain independent of UI typography at ${width}`,async({page},info)=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.setViewportSize({width,height:900});await mockCommerce(page);
  await page.route('**/api/v1/commerce/engraving/types**',route=>route.fulfill({headers:{'access-control-allow-origin':'http://127.0.0.1:5191','access-control-allow-credentials':'true'},json:{ok:true,data:{enabled:true,hasNext:false,types:INITIAL_ENGRAVING_TYPES.map(type=>({...type,status:'active',version:1,fontIds:FONT_REGISTRY.map(font=>font.id),iconIds:ICON_REGISTRY.map(icon=>icon.id)}))}}}));
  await page.goto('/customize/laser-engraving');await page.getByLabel('Engraving type',{exact:true}).selectOption('watch');
  await page.locator('input[aria-label="Engraving surface photo"]').setInputFiles(isolatedImageFile());await screenshot(page,info,`${width}-engraving-items`);await page.getByRole('button',{name:'Design Your Engraving',exact:true}).click();
  await page.getByRole('button',{name:'Add text',exact:true}).click();await page.getByLabel('Your text',{exact:true}).fill('With love');
  await expect(page.locator('.tw-lettering-gallery button span').first()).toBeVisible();expect(await page.locator('.tw-lettering-gallery button span').first().evaluate(node=>getComputedStyle(node).fontFamily)).toContain('Engraving-');await noOverflow(page);await screenshot(page,info,`${width}-engraving-fonts`);
  expect(errors).toEqual([]);
});

for(const width of widths)test(`Deployed typography owner workspace and role menu at ${width}`,async({page},info)=>{
  await page.setViewportSize({width,height:900});await ownerFixture(page);
  for(const [path,name] of [['/admin','dashboard'],['/admin/products','admin-products'],['/admin/payment','admin-payment']]){await page.goto(path);await expect(page.getByRole('heading',{level:1,name:({'/':'Make their heart flutter.','/shop':'Shop Our Gifts','/cart':'Your Cart','/checkout':'Checkout','/admin':'Dashboard','/admin/products':'Products','/admin/payment':'Payment'})[path] || detail.name,exact:true})).toBeVisible();await expect(page.locator('main h1').first()).toHaveCSS('font-family',/Cormorant Garamond/);expect(await renderedTextWidth(page,'main h1')).toBeGreaterThan(0);await noOverflow(page);if(name==='admin-products')expect(await page.locator('.admin-products-table tbody td').nth(1).evaluate(node=>getComputedStyle(node).whiteSpace)).toBe('nowrap');await screenshot(page,info,`${width}-${name}`);}
  await expect(page.locator('.header-account')).toHaveAttribute('href','/');
  if(width<1024){await page.getByRole('button',{name:'Open menu'}).click();const dialog=page.getByRole('dialog',{name:'Administration menu'});await expect(dialog.locator('nav>ul>li')).toHaveCount(8);await dialog.getByText('Customization',{exact:true}).click();await expect(dialog.getByRole('link',{name:'Standalone Engraving',exact:true})).toBeVisible();await screenshot(page,info,`${width}-admin-menu`,false);await page.keyboard.press('Escape');await expect(dialog).toHaveCount(1);await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);}
  await page.goto('/');if(width<1024){await page.getByRole('button',{name:'Open menu',exact:true}).click();await expect(page.getByRole('dialog',{name:'Main menu'}).getByRole('link',{name:'Dashboard',exact:true})).toHaveAttribute('href','/admin');await page.keyboard.press('Escape');}else await expect(page.getByRole('link',{name:'Account',exact:true})).toHaveAttribute('href','/admin');
});

test('staggered motion has bounded entry/exit, traps focus and fits a short phone',async({page},info)=>{
  await mockCatalog(page);await page.setViewportSize({width:320,height:400});await page.emulateMedia({reducedMotion:'no-preference'});await page.goto('/');
  const opener=page.getByRole('button',{name:'Open menu'});await opener.click();const dialog=page.getByRole('dialog');
  expect(await dialog.locator('.sm-panel').evaluate(node=>node.getAnimations().length)).toBeGreaterThan(0);
  await page.waitForTimeout(650);await screenshot(page,info,'320-short-menu',false);await noOverflow(page);
  await dialog.getByRole('link',{name:'Track Order',exact:true}).focus();await page.keyboard.press('Tab');expect(await dialog.evaluate(node=>node.contains(document.activeElement))).toBe(true);
  await dialog.getByRole('button',{name:'Close menu'}).click();await expect(dialog).toHaveClass(/is-closing/);await expect(dialog).toHaveCount(0);await expect(opener).toBeFocused();
  await page.emulateMedia({reducedMotion:'reduce'});await opener.click();expect(await dialog.evaluate(node=>getComputedStyle(node).animationName)).toBe('none');await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
});
