import { expect, test } from '@playwright/test';
import { giftBoxFixture,beginGiftBox } from './gift-box-fixtures.js';
import { localCheckoutFixture } from './gift-box-checkout-fixture.js';
import { fillCheckout,isolatedImageFile } from './commerce-fixtures.js';
import { freePresentation } from '../src/gift-box/free-presentation.mjs';
import { ARTWORK_METRICS } from '../src/gift-box/artwork-metrics.mjs';

const errors = new WeakMap();
test.beforeEach(({page})=>{const list=[];errors.set(page,list);page.on('pageerror',error=>list.push(error.message));});
test.afterEach(({page})=>expect(errors.get(page)).toEqual([]));
async function review(page) { await page.getByRole('button',{name:'Finishing Touches',exact:true}).click(); await page.getByRole('button',{name:'Next: Review'}).click(); }
for (const width of [320,390,768,1440]) test(`compact shopping flow and six-at-a-time choices at ${width}px`,async({page},info)=>{
  await page.setViewportSize({width,height:960}); await giftBoxFixture(page); await page.goto('/customize/gift-box');
  await expect(page.locator('.gb-heading')).toHaveCount(0);
  await expect(page.locator('.gb-options .gb-option')).toHaveCount(6);
  await page.getByRole('button',{name:'Show 6 more'}).click(); await expect(page.locator('.gb-options .gb-option')).toHaveCount(12);
  await page.getByRole('button',{name:'Choose Fixture box-2',exact:true}).click();
  await expect(page.locator('.gb-live-total strong')).toContainText('10.00');
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Fill With Flowers',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Add Fixture rose-red',exact:true}).click();
  await expect(page.locator('.gb-live-total strong')).toContainText('20.00');
  if (width < 901) { const before=await page.locator('.gb-canvas').boundingBox(); await page.getByRole('button',{name:'Expand preview'}).click(); const after=await page.locator('.gb-canvas').boundingBox(); expect(after.width).toBeGreaterThanOrEqual(before.width); await page.getByRole('button',{name:'Close expanded preview'}).click(); }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath(`builder-${width}.png`),fullPage:true});
  await review(page); await expect(page.getByRole('button',{name:'Add Your Gift to Cart'})).toBeDisabled();
  await expect(page.getByText('Online ordering for this gift is currently unavailable.')).toBeVisible();
  await expect(page.getByRole('link',{name:'Request a quote'})).toHaveCount(0);
});

test('free workspace keeps framing stable, deselects, deletes one object, moves keyboard and pointer, and undoes',async({page})=>{
  await localCheckoutFixture(page); await beginGiftBox(page);
  const canvas=page.locator('.gb-canvas'), before=await canvas.boundingBox();
  await page.getByRole('button',{name:'Fill With Flowers',exact:true}).click();
  await page.getByRole('button',{name:'Add Fixture rose-red',exact:true}).click();
  await page.getByRole('button',{name:'Add Fixture rose-red',exact:true}).click();
  const placed=page.locator('.gb-placed'); const first=placed.first(); await first.focus();
  const left=await first.evaluate(el=>el.style.left); await first.press('ArrowRight'); expect(await first.evaluate(el=>el.style.left)).not.toBe(left);
  await page.getByRole('button',{name:'Undo',exact:true}).click(); expect(await first.evaluate(el=>el.style.left)).toBe(left);
  await first.focus(); await first.press('Escape'); await expect(page.getByRole('button',{name:'Delete selected item'})).toBeDisabled();
  await placed.last().click(); await canvas.click({position:{x:5,y:5}}); await expect(page.getByRole('button',{name:'Delete selected item'})).toBeDisabled();
  await first.focus(); await page.getByRole('button',{name:'Move beside box',exact:true}).click();
  const rect=await first.boundingBox(), area=await canvas.boundingBox(); await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2); await page.mouse.down(); await page.mouse.move(area.x+area.width+150,area.y-150); await page.mouse.up();
  const bounds=await first.boundingBox(); expect(bounds.x+bounds.width).toBeLessThanOrEqual(area.x+area.width+1); expect(bounds.y).toBeGreaterThanOrEqual(area.y-1);
  await first.focus(); await page.getByRole('button',{name:'Delete selected item'}).click(); await expect(placed).toHaveCount(1);
  await page.getByRole('button',{name:'Undo',exact:true}).click(); await expect(placed).toHaveCount(2);
  const after=await canvas.boundingBox(); expect(after.width).toBe(before.width); expect(after.height).toBe(before.height);
});

test('ribbon pose persists in cart proposal and does not change workspace framing',async({page})=>{
  const {audit}=await localCheckoutFixture(page); await beginGiftBox(page); const before=await page.locator('.gb-canvas').boundingBox();
  await page.getByRole('button',{name:'Finishing Touches',exact:true}).click(); while (!await page.getByRole('button',{name:'Choose Fixture ribbon-navy',exact:true}).count()) await page.getByRole('button',{name:'Show 6 more'}).click(); await page.getByRole('button',{name:'Choose Fixture ribbon-navy',exact:true}).click();
  const ribbon=page.getByRole('button',{name:'Move Fixture ribbon-navy',exact:true}); await ribbon.focus(); await ribbon.press('ArrowRight'); await ribbon.press('ArrowDown');
  await page.getByRole('button',{name:'Move beside box',exact:true}).click(); await page.getByRole('button',{name:'Next: Review'}).click(); await page.getByRole('button',{name:'Add Your Gift to Cart'}).click();
  await expect(page).toHaveURL(/\/cart$/); expect(audit.adds[0].configuration.ribbonPlacement).toMatchObject({zone:'beside'}); expect(audit.adds[0].configuration.ribbonPlacement.x).toBeCloseTo(.405); expect(audit.adds[0].configuration.ribbonPlacement.y).toBeCloseTo(.69);
  expect(before.width).toBeGreaterThan(0);
});

test('photos stay local until Add; distinct licensed sticker styles, price, private upload, mixed checkout and admin recreation',async({page},info)=>{
  const {fixture,audit,savedOrder}=await localCheckoutFixture(page,{personalized:true}); await beginGiftBox(page);
  await page.getByRole('button',{name:'Make It Personal',exact:true}).click();
  const photos=page.locator('.gb-personal-section').first(), sticker=page.locator('.gb-personal-section').last();
  await expect(photos).not.toHaveAttribute('open'); await expect(sticker).not.toHaveAttribute('open');
  await photos.locator('summary').click(); await page.getByLabel('Choose your photos').setInputFiles(isolatedImageFile('private-photo.png'));
  await expect(page.locator('.gb-free-photo')).toHaveCount(1); await expect(page.locator('.gb-live-total strong')).toContainText('30.00');
  expect(fixture.uploads).toHaveLength(0);
  await page.getByRole('button',{name:'Move Photo 1',exact:true}).focus(); await page.getByRole('button',{name:'Delete selected item'}).click(); await expect(page.locator('.gb-free-photo')).toHaveCount(0);
  await page.getByRole('button',{name:'Undo',exact:true}).click(); await expect(page.locator('.gb-free-photo')).toHaveCount(1);
  const photo=page.getByRole('button',{name:'Move Photo 1',exact:true}); await photo.focus(); await photo.press('ArrowLeft');
  await page.getByRole('button',{name:'Move inside',exact:true}).click(); await page.getByRole('button',{name:'Undo',exact:true}).click();
  await expect(page.getByRole('button',{name:'Move inside',exact:true})).toBeVisible();
  await sticker.locator('summary').click(); await page.getByRole('checkbox',{name:'Add a personalized sticker',exact:true}).check();
  await page.getByLabel('Name or message').fill('With love');
  await expect(page.locator('.gb-sticker-style-list button')).toHaveCount(6);
  const families=await page.locator('.gb-sticker-style-list button span').evaluateAll(els=>els.map(el=>getComputedStyle(el).fontFamily)); expect(new Set(families).size).toBe(6);
  await page.getByRole('button',{name:'Show 6 more'}).click(); await expect(page.locator('.gb-sticker-style-list button')).toHaveCount(12);
  await page.getByRole('button',{name:/Amiri/}).click(); await page.getByLabel('Name or message').fill('\u0623\u062d\u0645\u062f'); await page.getByRole('radio',{name:'Gold',exact:true}).check();
  await page.evaluate(()=>document.fonts.ready); expect(await page.evaluate(()=>document.fonts.check('20px "Gift-amiri"'))).toBe(true);
  await expect(page.locator('.gb-live-total strong')).toContainText('50.00');
  await page.screenshot({path:info.outputPath('personalization.png'),fullPage:true});
  await review(page); await page.getByRole('button',{name:'Add Your Gift to Cart'}).click(); await expect(page).toHaveURL(/\/cart$/);
  expect(fixture.uploads).toHaveLength(1); expect(audit.adds[0].configuration.personalizationIntent.sticker.application).toBe('exterior-front');
  expect(audit.adds[0].configuration.personalizationIntent.photoPrints[0]).toMatchObject({x:.7,zone:'beside'});
  expect(JSON.stringify(audit.adds)).not.toMatch(/blob:|private-photo.png|pricePiastres/);
  await page.getByRole('link',{name:'Proceed to Checkout'}).click(); await fillCheckout(page); await page.getByRole('button',{name:'Place Order'}).click();
  await expect(page.getByRole('heading',{name:'Order #681243'})).toBeVisible(); expect(savedOrder().totals.totalPiastres).toBe(5000);
  fixture.state.user={id:'710000000000000000000050',name:'Fixture admin',role:'admin'};
  await page.goto('/admin/commerce/orders/710000000000000000000040'); const design=page.getByRole('region',{name:"Customer's Gift Design"});
  await expect(design.locator('.gb-free-photo img')).toHaveCount(0); expect(fixture.calls.filter(call=>/\/files\//.test(call.path))).toHaveLength(0);
  await design.getByRole('button',{name:'View private photos in design'}).click(); await expect(design.locator('.gb-free-photo img')).toHaveCount(1);
  await expect(design).toContainText('Apply to exterior front'); await page.screenshot({path:info.outputPath('admin-design.png'),fullPage:true});
});

test('all twelve box frames center measured artwork without stretching it',()=>{
  for(let index=1;index<=12;index++){
    const {aspect,box}=freePresentation(`box-${index}`), [l,t,r,b]=ARTWORK_METRICS[`box-${index}`].visibleBounds;
    expect(box.x+box.width/2).toBeCloseTo(.5,6);
    expect(box.y+box.height/2).toBeCloseTo(.49,6);
    expect(box.width/box.height*aspect).toBeCloseTo((r-l+1)/(b-t+1),6);
    expect(box.width).toBeGreaterThan(.4); expect(box.height).toBeLessThanOrEqual(.8);
  }
});

for(const width of [320,390,1440]) test(`polished arrangement, review, cart and checkout at ${width}px`,async({page},info)=>{
  await page.setViewportSize({width,height:960}); await localCheckoutFixture(page,{personalized:true}); await beginGiftBox(page);
  await page.getByRole('button',{name:'Fill With Flowers',exact:true}).click();
  await page.getByRole('button',{name:'Add Fixture rose-red',exact:true}).click();
  await page.getByRole('button',{name:'Add Fixture rose-red',exact:true}).click();
  await page.getByRole('button',{name:'Expand preview'}).click();
  const dialog=page.getByRole('dialog',{name:'Your arrangement'});
  await expect(dialog).toBeVisible();
  const first=dialog.locator('.gb-placed').first(), left=await first.evaluate(el=>el.style.left);
  await first.focus(); await dialog.getByRole('button',{name:'Move right',exact:true}).click();
  expect(await first.evaluate(el=>el.style.left)).not.toBe(left);
  await dialog.getByRole('button',{name:'Undo',exact:true}).click();
  expect(await first.evaluate(el=>el.style.left)).toBe(left);
  await first.focus(); await dialog.getByRole('button',{name:'Delete selected item'}).click();
  await expect(dialog.locator('.gb-placed')).toHaveCount(1);
  await dialog.getByRole('button',{name:'Undo',exact:true}).click();
  await dialog.locator('.gb-placed').first().focus();
  await dialog.getByRole('button',{name:'Close expanded preview'}).click();
  await expect(page.locator('.gb-placed.is-active')).toHaveCount(1);
  await expect(page.getByRole('button',{name:'Expand preview'})).toBeFocused();
  await page.getByRole('button',{name:'Make It Personal',exact:true}).click();
  await page.locator('.gb-personal-section').last().locator('summary').click();
  await page.getByRole('checkbox',{name:'Add a personalized sticker',exact:true}).check();
  await page.getByLabel('Name or message').fill('For Nour');
  await expect(page.locator('.gb-sticker-style-list button span')).toHaveText(Array(6).fill('For Nour'));
  await expect(page.locator('.gb-sticker-style-list small')).toHaveCount(0);
  await page.getByRole('radio',{name:'Gold',exact:true}).focus(); await page.keyboard.press('Space');
  await expect(page.getByRole('radio',{name:'Gold',exact:true})).toBeChecked();
  await review(page);
  await expect(page.getByRole('button',{name:'Edit your gift'})).toBeVisible();
  await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});
  await page.screenshot({path:info.outputPath(`review-${width}.png`),fullPage:true});
  await page.getByRole('button',{name:'Add Your Gift to Cart'}).click(); await expect(page).toHaveURL(/\/cart$/);
  await expect(page.locator('.commerce-gift-photo .gb-placed')).toHaveCount(2);
  await expect(page.getByText('Gift box preview unavailable')).toHaveCount(0);
  await page.getByText('View design and details',{exact:true}).click();
  await expect(page.getByText('Personalized sticker: For Nour - Apply to exterior front')).toBeVisible();
  await page.screenshot({path:info.outputPath(`cart-${width}.png`),fullPage:true});
  await page.getByRole('link',{name:'Proceed to Checkout'}).click(); await fillCheckout(page);
  await expect(page.getByRole('radio',{name:/Cash on Delivery/})).toHaveCount(0);
  await expect(page.getByRole('radio',{name:/InstaPay/})).toBeChecked();
  await expect(page.getByText('Have a discount code?',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Place Order',exact:true})).toBeEnabled();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});
  await page.screenshot({path:info.outputPath(`checkout-${width}.png`),fullPage:true});
});
