import { test, expect } from '@playwright/test';
import { giftBoxFixture, beginGiftBox } from './gift-box-fixtures.js';
import { localCheckoutFixture } from './gift-box-checkout-fixture.js';
import { isolatedImageFile } from './commerce-fixtures.js';

const steps = ['Choose Your Box','Fill With Flowers','Add Soft Toys','Add Chocolates','Make It Personal','Finishing Touches'];
const go = (page, index) => page.getByRole('navigation', { name: 'Gift builder steps' }).getByRole('button', { name: steps[index], exact: true }).click();
async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function photoLoaded(image) {
  await expect.poll(() => image.evaluate(node => node.complete && node.naturalWidth > 0)).toBe(true);
}

for (const width of [320,390,440,768,1024,1440]) test(`owner handoff visual journey at ${width}px`, async ({ page }, info) => {
  test.setTimeout(90000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width, height: 1000 });
  const { fixture } = await localCheckoutFixture(page, { personalized: true });
  await page.goto('/customize/gift-box');
  await page.getByRole('button', { name: 'Show 6 more', exact: true }).click();
  const boxPhotos = page.locator('.gb-box-choice-photo img');
  await expect(boxPhotos).toHaveCount(12);
  for (const image of await boxPhotos.all()) {
    await image.scrollIntoViewIfNeeded(); await photoLoaded(image);
    expect(await image.getAttribute('src')).not.toContain('open-top');
    expect(await image.getAttribute('srcset')).toContain('thumbnail/640/box-');
  }
  await page.evaluate(() => scrollTo(0,0));
  await page.screenshot({ animations:'disabled', path: info.outputPath(`${width}-01-boxes.png`), fullPage: true });
  const enlarge = page.getByRole('button', { name: 'Enlarge Fixture box-1 photo', exact: true });
  await enlarge.focus(); await enlarge.press('Enter');
  const viewer = page.getByRole('dialog', { name: 'Fixture box-1', exact: true });
  await photoLoaded(viewer.getByRole('img'));
  await viewer.getByRole('button', { name: 'Zoom in' }).click();
  await expect(viewer.locator('.gb-lightbox-stage')).toHaveClass(/is-zoomed/);
  expect(await viewer.locator('img').evaluate(node=>node.getBoundingClientRect().width>0)).toBe(true);
  await page.screenshot({ animations:'disabled', path: info.outputPath(`${width}-02-photo-viewer.png`) });
  await page.keyboard.press('Escape'); await expect(enlarge).toBeFocused();
  await expect(page.getByRole('button',{name:'Choose Fixture box-1',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Choose Fixture box-2',exact:true}).click();
  for (let index=1; index<steps.length; index++) {
    await go(page, index);
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
    await expect(page.getByRole('heading', { name: steps[index], exact: true })).toBeFocused();
    if (index===1) {
      await page.getByRole('button',{name:'Add Fixture rose-red',exact:true}).click();
      await page.locator('.gb-placed').first().focus();
      const left = await page.locator('.gb-placed').first().evaluate(node=>node.style.left);
      await page.getByRole('button',{name:'Move right',exact:true}).click();
      expect(await page.locator('.gb-placed').first().evaluate(node=>node.style.left)).not.toBe(left);
      await page.getByRole('button',{name:'Delete selected item'}).click();
      const removal = page.getByRole('dialog',{name:'Remove Fixture rose-red?'});
      await expect(removal).toBeVisible();
      await page.screenshot({ animations:'disabled', path: info.outputPath(`${width}-03-delete.png`) });
      await removal.getByRole('button',{name:'Keep item'}).click();
      await expect(page.locator('.gb-placed')).toHaveCount(1);
    }
    if (index===2) await page.getByRole('button',{name:'Add Fixture plush-1',exact:true}).click();
    if (index===3) await page.getByRole('button',{name:'Add Fixture chocolate-1',exact:true}).click();
    if (index===4) {
      await expect(page.locator('.gb-personal-editor details')).toHaveCount(0);
      await page.getByLabel('Choose your photos').setInputFiles(isolatedImageFile('memory-only.png'));
      await page.getByLabel('Write a name, special date, or heartfelt message').fill('For Nour');
      await expect(page.locator('.gb-sticker-style-list button')).toHaveCount(6);
      await page.evaluate(()=>scrollTo(0,0));
      await page.screenshot({ animations:'disabled', path: info.outputPath(`${width}-07-english.png`), fullPage:true });
      await page.getByRole('tab',{name:'Arabic',exact:true}).click();
      await expect(page.locator('.gb-sticker-style-list button')).toHaveCount(6);
      expect(await page.locator('.gb-sticker-style-list span').evaluateAll(nodes => nodes.every(node => node.lang === 'ar'))).toBe(true);
      await page.getByRole('button',{name:'Amiri',exact:true}).click();
      await page.getByLabel('Write a name, special date, or heartfelt message').fill('هَدِيَّة لَكِ');
      await page.evaluate(()=>document.fonts.ready);
    }
    if (index===5) {
      await expect(page.locator('.gb-finishing details')).toHaveCount(0);
      await page.getByLabel('Your message', {exact:true}).fill('With love, always.');
    }
    await noOverflow(page);
    await page.evaluate(()=>scrollTo(0,0));
    await page.screenshot({ animations:'disabled', path: info.outputPath(`${width}-step-${index+1}.png`), fullPage:true });
  }
  expect(fixture.uploads).toHaveLength(0);
  await page.getByRole('button',{name:'Next: Review'}).click();
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(0);
  await expect(page.getByRole('button',{name:'Add Your Gift to Cart'})).toBeEnabled();
  await expect(page.locator('.gb-final-review .gb-purchase-bar')).toHaveCSS('position','static');
  expect(await page.evaluate(() => document.querySelector('.gb-review-edit').getBoundingClientRect().bottom <= document.querySelector('.gb-purchase-bar').getBoundingClientRect().top)).toBe(true);
  await page.screenshot({ animations:'disabled', path:info.outputPath(`${width}-review.png`), fullPage:true });
  await page.locator('.gb-review-edit').getByRole('button',{name:'Personalization',exact:true}).click();
  await expect(page.getByLabel('Write a name, special date, or heartfelt message')).toHaveValue('هَدِيَّة لَكِ');
  await expect(page.locator('.gb-free-photo')).toHaveCount(1);
  await expect(page.locator('.gb-progress .is-complete')).toHaveCount(5);
  await page.getByRole('button',{name:'Return to review'}).click();
  await expect(page.getByRole('button',{name:'Add Your Gift to Cart'})).toBeEnabled();
  expect(errors).toEqual([]);
});

test('every delete entry confirms one stable target; cancel, focus, nested Escape and undo work', async ({page}) => {
  await localCheckoutFixture(page); await beginGiftBox(page); await go(page,1);
  await page.getByRole('button',{name:'Add Fixture rose-red',exact:true}).click();
  await page.getByRole('button',{name:'Add Fixture rose-red',exact:true}).click();
  for (const key of ['Delete','Backspace']) {
    const item = page.locator('.gb-placed').first(), id = await item.getAttribute('data-instance-id');
    await item.focus(); await item.press(key);
    await expect(page.getByRole('button',{name:'Keep item'})).toBeFocused();
    await page.keyboard.press('Escape'); await expect(item).toBeFocused();
    await item.press(key); await page.getByRole('button',{name:'Remove item',exact:true}).click();
    await expect(page.locator(`[data-instance-id="${id}"]`)).toHaveCount(0);
    await expect(page.locator('.gb-placed')).toHaveCount(1);
    await page.getByRole('button',{name:'Undo',exact:true}).click();
    await expect(page.locator(`[data-instance-id="${id}"]`)).toHaveCount(1);
  }
  await page.getByRole('button',{name:'Expand preview'}).click();
  const fullscreen=page.getByRole('dialog',{name:'Your gift box',exact:true});
  await fullscreen.locator('.gb-placed').first().focus();
  await fullscreen.getByRole('button',{name:'Delete selected item'}).click();
  await page.keyboard.press('Escape'); await expect(fullscreen).toBeVisible();
  await expect(fullscreen.getByRole('button',{name:'Delete selected item'})).toBeFocused();
  await fullscreen.getByRole('button',{name:'Delete selected item'}).click();
  await page.getByRole('button',{name:'Remove item',exact:true}).click();
  await expect(fullscreen.locator('.gb-placed')).toHaveCount(1);
  await fullscreen.getByRole('button',{name:'Undo',exact:true}).click();
  await fullscreen.getByRole('button',{name:'Close expanded preview'}).click();
  await expect(page.getByRole('button',{name:'Expand preview'})).toBeFocused();
});

test('stepper retains reached state, reduced motion, document-top navigation and card selection', async ({page}) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  const {fixture,audit}=await localCheckoutFixture(page); await beginGiftBox(page);
  await go(page,5);
  await expect(page.getByRole('button',{name:'Choose Your Box',exact:true})).toHaveAccessibleDescription('Completed');
  const message=page.getByLabel('Your message',{exact:true});
  for(const value of [' ', '\u200b\u200d\ufeff', '\u064e\u0651']) {
    await message.fill(value); await expect(page.locator('.gb-live-total strong')).toContainText('10.00');
    expect(fixture.estimates.at(-1).giftCard).toBeNull();
  }
  await message.fill('هَدِيَّة لَكِ'); await expect(page.locator('.gb-live-total strong')).toContainText('20.00');
  await message.fill(''); await expect(page.locator('.gb-live-total strong')).toContainText('10.00');
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(0);
  await expect(page.locator('.gb-progress .is-complete')).toHaveCount(4);
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await page.getByRole('button',{name:'Next: Review'}).click();
  for(const name of ['Box','Contents','Personalization','Finishing touches']) {
    await page.locator('.gb-review-edit').getByRole('button',{name,exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(0);
    await page.getByRole('button',{name:'Return to review'}).click();
  }
  await page.getByRole('button',{name:'Add Your Gift to Cart'}).click();
  await expect(page).toHaveURL(/\/cart$/);
  expect(audit.adds[0].configuration.selection.giftCard).toBeNull();
});

test('photo viewer traps focus, closes by button or backdrop, and never selects a box', async ({page}) => {
  await giftBoxFixture(page, { componentOverrides: { 'box-3': { inventoryQuantity: 0 } } });
  await page.goto('/customize/gift-box');
  const opener=page.getByRole('button',{name:'Enlarge Fixture box-3 photo',exact:true});
  await opener.click();
  const dialog=page.getByRole('dialog',{name:'Fixture box-3',exact:true});
  await photoLoaded(dialog.getByRole('img'));
  const close=dialog.getByRole('button',{name:'Close box photo'});
  await close.focus(); await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button',{name:'Fit photo to screen'})).toBeFocused();
  await page.keyboard.press('Tab'); await expect(close).toBeFocused();
  await dialog.getByRole('button',{name:'Close box photo'}).click(); await expect(opener).toBeFocused();
  await opener.click(); const bounds=await dialog.boundingBox();
  // The page reserves scrollbar gutters; click the backdrop, not that gutter.
  await page.mouse.click(bounds.x-6,bounds.y+30);
  await expect(dialog).toHaveCount(0); await expect(opener).toBeFocused();
  await expect(page.getByRole('button',{name:'Choose Fixture box-3',exact:true})).toBeDisabled();
  await expect(page.locator('.gb-preview-empty')).toBeVisible();
});

test.describe('touch arrangement', () => {
  test.use({hasTouch:true,viewport:{width:320,height:900}});
  test('normal controls, photo-card removal and undo work without fullscreen', async ({page}) => {
    await localCheckoutFixture(page,{personalized:true}); await beginGiftBox(page); await go(page,1);
    await page.getByRole('button',{name:'Add Fixture rose-red',exact:true}).tap();
    const object=page.locator('.gb-placed').first(); await object.tap();
    const before=await object.evaluate(node=>node.style.top);
    await page.getByRole('button',{name:'Move down',exact:true}).tap();
    expect(await object.evaluate(node=>node.style.top)).not.toBe(before);
    await go(page,4); await page.getByLabel('Choose your photos').setInputFiles(isolatedImageFile('touch.png'));
    await page.getByRole('button',{name:'Remove photo 1',exact:true}).tap();
    const dialog=page.getByRole('dialog',{name:'Remove Photo 1?',exact:true});
    await dialog.getByRole('button',{name:'Keep item'}).tap();
    await expect(page.locator('.gb-free-photo')).toHaveCount(1);
    await page.getByRole('button',{name:'Remove photo 1',exact:true}).tap();
    await dialog.getByRole('button',{name:'Remove item',exact:true}).tap();
    await expect(page.locator('.gb-free-photo')).toHaveCount(0);
    await page.getByRole('button',{name:'Undo',exact:true}).tap();
    await expect(page.locator('.gb-free-photo')).toHaveCount(1);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await noOverflow(page);
  });
});

for (const height of [700,420]) test(`focused personalization stays clear of header and purchase bar at 390x${height}`, async ({page},info) => {
  await page.setViewportSize({width:390,height});
  await localCheckoutFixture(page,{personalized:true}); await beginGiftBox(page); await go(page,4);
  const sticker=page.getByLabel('Write a name, special date, or heartfelt message');
  await sticker.fill('For Nour');
  const visible=() => page.evaluate(() => {
    const input=document.activeElement.getBoundingClientRect(), header=document.querySelector('.site-header-stack').getBoundingClientRect();
    const bar=document.querySelector('.gb-purchase-bar').getBoundingClientRect();
    return input.top>=header.bottom && input.bottom<=innerHeight && (bar.top>=innerHeight || input.bottom<=bar.top);
  });
  await expect.poll(visible).toBe(true);
  await page.screenshot({path:info.outputPath(`sticker-focus-390-${height}.png`)});
  await page.setViewportSize({width:390,height:height===700?420:700});
  await expect.poll(visible).toBe(true);
  await go(page,5);
  const message=page.getByLabel('Your message',{exact:true}); await message.fill('With love');
  await expect.poll(visible).toBe(true);
  await page.getByRole('button',{name:'Next: Review'}).click();
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(0);
});
