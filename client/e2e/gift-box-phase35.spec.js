import { expect,test } from '@playwright/test';
import { giftBoxFixture,beginGiftBox } from './gift-box-fixtures.js';

async function capture(target,info,name,options={}){if(info.config.metadata.captureEvidence===false)return;await target.screenshot({...options,path:info.outputPath(name)});}
const top=async page=>{await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo({top:0,left:0,behavior:'instant'});});};
async function order(page){
  const positions=await page.evaluate(()=>{
    const rect=selector=>{const item=document.querySelector(selector),r=item.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right};};
    return {steps:rect('.gb-steps'),preview:rect('.gb-preview'),intro:rect('.gb-step-intro'),heading:rect('.gb-step-intro h2'),description:rect('.gb-step-intro>p:last-child'),options:rect('.gb-options'),last:rect('.gb-options .gb-option:last-child'),navigation:rect('.gb-navigation'),load:document.querySelector('.gb-load-more')?rect('.gb-load-more'):null};
  });
  expect(positions.steps.bottom).toBeLessThanOrEqual(positions.preview.top+1);
  if(positions.intro.left>=positions.preview.right)expect(positions.preview.top).toBeLessThanOrEqual(positions.intro.top+1);
  else expect(positions.preview.bottom).toBeLessThanOrEqual(positions.intro.top+1);
  expect(positions.heading.bottom).toBeLessThanOrEqual(positions.description.top+1);
  expect(positions.description.bottom).toBeLessThanOrEqual(positions.options.top+1);
  expect(positions.last.bottom).toBeLessThanOrEqual(positions.navigation.top);
  if(positions.load){expect(positions.last.bottom).toBeLessThanOrEqual(positions.load.top);expect(positions.load.bottom).toBeLessThanOrEqual(positions.navigation.top);}
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
}
test.beforeEach(async({page})=>{const errors=[];page.on('pageerror',error=>errors.push(error.message));page.__errors=errors;});
test.afterEach(async({page})=>{expect(page.__errors).toEqual([]);});

for(const width of [320,390])test(`mobile ${width}: options and Load More precede navigation in visual and keyboard order`,async({page},info)=>{
  await page.setViewportSize({width,height:1000});await giftBoxFixture(page,{role:'admin'});await beginGiftBox(page);await top(page);await order(page);
  await capture(page,info,`mobile-${width}-after.png`,{fullPage:true});
  await page.locator('.gb-steps button').nth(2).click();await top(page);await order(page);
  await expect(page.locator('.gb-options-plush .gb-option')).toHaveCount(12);
  await page.locator('.gb-options-plush .gb-option').last().focus();await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:/Load More/})).toBeFocused();
  await page.keyboard.press('Tab');await expect(page.locator('.gb-navigation').getByRole('button',{name:'Back',exact:true})).toBeFocused();
  await page.getByRole('button',{name:/Load More/}).click();await expect(page.locator('.gb-options-plush .gb-option')).toHaveCount(17);
  await page.getByRole('button',{name:'Back',exact:true}).click();await page.getByRole('button',{name:'Next',exact:true}).click();await expect(page.locator('.gb-options-plush .gb-option')).toHaveCount(17);await expect(page.locator('.gb-step-intro h2')).toBeFocused();
});
for(const width of [320,390,768,1024])test(`text enlarged to 200 percent at ${width}px preserves readable content order`,async({page})=>{
  await page.setViewportSize({width,height:1000});await giftBoxFixture(page);await beginGiftBox(page);
  await page.evaluate(()=>{document.documentElement.style.fontSize='200%';});await top(page);await order(page);
  await page.locator('.gb-steps button').nth(4).click();await page.getByLabel('Add a gift card').check();await page.getByLabel('Your personal message').fill('Synthetic review message.');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
test('200 percent zoom equivalent reflow retains options before actions',async({page},info)=>{
  await page.setViewportSize({width:640,height:500});await giftBoxFixture(page);await beginGiftBox(page);await top(page);await order(page);
  await page.evaluate(()=>{document.documentElement.style.zoom='2';});
  const positions=await page.locator('.gb-navigation').evaluate(item=>({top:item.getBoundingClientRect().top,last:document.querySelector('.gb-option:last-child').getBoundingClientRect().bottom}));
  expect(positions.top).toBeGreaterThan(positions.last);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await capture(page,info,'mobile-zoom-200.png',{fullPage:true});
});
test('mixed draft proportions, layering, drag, remove and undo preserve server price separation',async({page},info)=>{
  const fixture=await giftBoxFixture(page);await beginGiftBox(page);await page.locator('.gb-steps button').nth(1).click();
  for(const color of ['red','yellow','black'])await page.getByRole('button',{name:`Add Fixture rose-${color}`,exact:true}).click();
  await page.locator('.gb-steps button').nth(2).click();await page.getByRole('button',{name:'Add Fixture plush-1',exact:true}).click();
  await page.locator('.gb-steps button').nth(3).click();await page.getByRole('button',{name:/Load More/}).click();await page.getByRole('button',{name:'Add Fixture chocolate-20',exact:true}).click();
  await expect(page.locator('.gb-price-summary strong')).toContainText('60.00');
  const toy=page.locator('.gb-placed[aria-label^="Move Fixture plush-1"]'),rose=page.locator('.gb-placed[aria-label^="Move Fixture rose-red"]');
  const toyBounds=await toy.boundingBox(),roseBounds=await rose.boundingBox();expect(toyBounds.height).toBeGreaterThan(roseBounds.height*2);
  await rose.scrollIntoViewIfNeeded();
  const calls=fixture.estimates.length,before=await rose.getAttribute('style'),bounds=await rose.boundingBox();
  await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await page.mouse.down();await page.mouse.move(bounds.x+bounds.width/2+25,bounds.y+bounds.height/2+16,{steps:6});await page.mouse.up();
  await expect(rose).not.toHaveAttribute('style',before);expect(fixture.estimates).toHaveLength(calls);
  await top(page);await capture(page,info,'desktop-mixed-arrangement-after.png',{fullPage:true});
  await toy.focus();await page.keyboard.press('Enter');await page.getByRole('button',{name:'Move beside box (draft)'}).click();expect(fixture.estimates).toHaveLength(calls);
  await top(page);await capture(page.locator('.gb-preview'),info,'oversized-plush-beside-proposal.png');
  await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(page.getByRole('button',{name:'Move beside box (draft)'})).toBeVisible();
  await page.getByRole('button',{name:'Remove selected item'}).click();await expect(page.locator('.gb-placed')).toHaveCount(4);await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(page.locator('.gb-placed')).toHaveCount(5);
});
test('Step 5 keeps solid ribbon choices and a plain Unicode gift-card message',async({page},info)=>{
  await giftBoxFixture(page);await beginGiftBox(page);await page.locator('.gb-steps button').nth(4).click();await page.getByLabel('Add a gift card').check();
  await page.getByLabel('Your personal message').fill('A little something, chosen just for you.\nSynthetic review message.');
  await top(page);await capture(page,info,'step-5-finishing-touches.png',{fullPage:true});
  await page.getByLabel('Your personal message').fill('💐'.repeat(500));await expect(page.getByText('500 / 500 characters')).toBeVisible();await page.getByLabel('Your personal message').press('x');await expect(page.getByLabel('Your personal message')).toHaveValue('💐'.repeat(500));
  await expect(page.locator('.gb-options-ribbon button')).toHaveCount(12);await expect(page.locator('.gb-price-summary strong')).toContainText('20.00');
});
test('restricted admin review exposes fixed fields and explicit price approval only',async({page},info)=>{
  await giftBoxFixture(page,{role:'admin'});await page.goto('/admin/gift-box/components');await page.getByLabel('Component category').selectOption('chocolate');
  const form=page.locator('.gb-setting-editor').first();await expect(form).toContainText('complete pictured retail product');await capture(form,info,'restricted-admin-component-editor.png');
  await expect(form.locator('input[type=file]')).toHaveCount(0);await expect(form.getByRole('button',{name:/Create|Delete|Replace/})).toHaveCount(0);
  await form.getByLabel('Approved price (EGP)').fill('0');await expect(form.getByLabel('Explicitly approve this component as complimentary')).toBeVisible();
});
test('box 11 review starts with two circular floor proposals and unchanged submission gate',async({page},info)=>{
  await giftBoxFixture(page);await page.goto('/dev/gift-box/geometry');await page.getByLabel('Review box').selectOption('box-11');
  const draft=JSON.parse(await page.getByLabel('Geometry review draft JSON').inputValue());expect(draft.regions).toHaveLength(2);expect(draft.foregroundMasks).toHaveLength(3);expect(draft.productionApproved).toBe(false);expect(draft.capacity).toBeNull();
  await capture(page.locator('.gb-geometry .gb-workspace>section').first(),info,'box-11-two-compartments-browser.png');
  await page.getByLabel('Review box').selectOption('box-1');await expect(page.getByRole('button',{name:'Add draft region',exact:true})).toBeDisabled();await expect(page.getByText('Selected open box: Artwork unavailable')).toBeVisible();
});
test.describe('touch and reduced motion',()=>{
  test.use({hasTouch:true,isMobile:true,viewport:{width:390,height:844},reducedMotion:'reduce'});
  test('touch drag, keyboard alternatives and state changes make no pointer pricing requests',async({page,context})=>{
    const fixture=await giftBoxFixture(page);await beginGiftBox(page);await page.locator('.gb-steps button').nth(1).click();await page.getByRole('button',{name:'Add Fixture rose-red',exact:true}).tap();await expect(page.locator('.gb-price-summary strong')).toContainText('20.00');
    const item=page.locator('.gb-placed');await item.scrollIntoViewIfNeeded();const before=await item.getAttribute('style'),rect=await item.boundingBox(),calls=fixture.estimates.length;
    const cdp=await context.newCDPSession(page),point={x:rect.x+rect.width/2,y:rect.y+rect.height/2};
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.x+30,y:point.y+18,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
    await expect(item).not.toHaveAttribute('style',before);await item.focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');await page.getByRole('button',{name:'Move left',exact:true}).click();expect(fixture.estimates).toHaveLength(calls);
    expect(await page.locator('.gb-option').first().evaluate(item=>getComputedStyle(item).transitionDuration)).toBe('0s');
  });
});
