import { chooseOption } from './select-option.js';
import { expect,test } from '@playwright/test';
import { giftBoxFixture,beginGiftBox } from './gift-box-fixtures.js';
async function capture(target,info,name,options={}) { await target.screenshot({...options,path:info.outputPath(name)}); }
test.beforeEach(async({page})=>{const errors=[];page.on('pageerror',error=>errors.push(error.message));page.__errors=errors;});
test.afterEach(async({page})=>expect(page.__errors).toEqual([]));
for (const width of [320,390,768,1024]) test(`200 percent text preserves shopping controls at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:1000});await giftBoxFixture(page);await beginGiftBox(page);
  await page.evaluate(()=>{document.documentElement.style.fontSize='200%';});
  await page.getByRole('button',{name:'Finishing Touches',exact:true}).click();await page.locator('.gb-finishing summary').click();await page.getByLabel('Your message').fill('A literal gift message');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.getByRole('button',{name:'Next: Review'})).toBeVisible();
  expect(await page.locator('.gb-options').evaluate(el=>Boolean(el.compareDocumentPosition(document.querySelector('.gb-navigation')) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
});
test('restricted admin review exposes fixed fields and explicit price approval only',async({page},info)=>{
  await giftBoxFixture(page,{role:'admin'});await page.goto('/admin/gift-box/components');await chooseOption(page.getByLabel('Component category'), 'chocolate');
  const form=page.locator('.gb-setting-editor').first();await expect(form).toContainText('complete pictured retail product');await capture(form,info,'restricted-admin-component-editor.png');
  await expect(form.locator('input[type=file]')).toHaveCount(0);await expect(form.getByRole('button',{name:/Create|Delete|Replace/})).toHaveCount(0);
  await form.getByLabel('Approved price (EGP)').fill('0');await expect(form.getByLabel('Explicitly approve this component as complimentary')).toBeVisible();
});
test('box 11 review starts with two circular floor proposals and unchanged submission gate',async({page},info)=>{
  await giftBoxFixture(page);await page.goto('/dev/gift-box/geometry');await chooseOption(page.getByLabel('Review box'), 'box-11');
  const draft=JSON.parse(await page.getByLabel('Geometry review draft JSON').inputValue());expect(draft.regions).toHaveLength(2);expect(draft.foregroundMasks).toHaveLength(3);expect(draft.productionApproved).toBe(false);expect(draft.capacity).toBeNull();
  await capture(page.locator('.gb-geometry .gb-workspace>section').first(),info,'box-11-two-compartments-browser.png');
  await chooseOption(page.getByLabel('Review box'), 'box-1');await expect(page.getByRole('button',{name:'Add draft region',exact:true})).toBeDisabled();await expect(page.locator('.gb-geometry .gb-box-art img')).toBeVisible();
});

test.describe('touch and reduced motion',()=>{
 test.use({hasTouch:true,isMobile:true,viewport:{width:390,height:844},reducedMotion:'reduce'});
 test('touch movement and keyboard controls keep the authoritative price unchanged',async({page,context})=>{
  const fixture=await giftBoxFixture(page);await beginGiftBox(page);await page.getByRole('button',{name:'Fill With Flowers',exact:true}).click();await page.getByRole('button',{name:'Add Fixture rose-red',exact:true}).tap();
  await expect(page.locator('.gb-live-total strong')).toContainText('20.00');await page.getByRole('button',{name:'Expand preview'}).click();
  const item=page.locator('.gb-placed');await item.scrollIntoViewIfNeeded();const before=await item.getAttribute('style'),rect=await item.boundingBox(),calls=fixture.estimates.length;
  const cdp=await context.newCDPSession(page),point={x:rect.x+rect.width/2,y:rect.y+rect.height/2};
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.x+30,y:point.y+18,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
  await expect(item).not.toHaveAttribute('style',before);await item.focus();await page.keyboard.press('ArrowRight');await page.getByRole('button',{name:'Move left',exact:true}).click();expect(fixture.estimates).toHaveLength(calls);
  expect(await page.locator('.gb-option').first().evaluate(item=>getComputedStyle(item).transitionDuration)).toBe('0s');
 });
});
