import { test, expect } from '@playwright/test';
import { mockCommerce } from './commerce-fixtures.js';
import { giftBoxFixture, beginGiftBox } from './gift-box-fixtures.js';
import { STICKER_STYLES } from '../../shared/gift-box/sticker-styles.mjs';
import { ENGRAVING_COLORS } from '../../shared/gift-box/lettering-styles.mjs';

for (const width of [390, 1440]) {
  test(`successful tracking replaces inputs and Track Another Order restores a clean lookup at ${width}px`, async ({page}) => {
    await page.setViewportSize({width,height:900});await mockCommerce(page);
    await page.route('**/api/v1/commerce/orders/track', route => route.request().method()==='OPTIONS' ? route.fallback() : route.fulfill({status:200,contentType:'application/json',json:{ok:true,data:{order:{orderNumber:'123456',fulfillmentState:'preparing',paymentState:'paid',items:[{name:'Gift Box',quantity:1}],totalPiastres:15000}}}}));
    await page.goto('/track-order');
    await page.getByLabel('Order number').fill('123456');await page.getByLabel('Checkout phone number').fill('01000000000');
    await page.getByRole('button',{name:'Track Order',exact:true}).click();
    await expect(page.locator('.tracking-result')).toContainText('Gift Box');
    await expect(page.getByLabel('Order number')).toHaveCount(0);
    await page.getByRole('button',{name:'Track Another Order'}).click();
    await expect(page.getByLabel('Order number')).toHaveValue('');
    await expect(page.getByLabel('Checkout phone number')).toHaveValue('');
    await expect(page.locator('.tracking-result')).toHaveCount(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  });
  test(`Gift Card checkbox allows an explicitly selected empty message at ${width}px`, async ({page}) => {
    await page.setViewportSize({width,height:900});const fixture=await giftBoxFixture(page);await beginGiftBox(page);
    await page.getByRole('button',{name:'Finishing Touches',exact:true}).click();
    const checkbox=page.getByRole('checkbox',{name:'Add a Gift Card'});
    await expect(checkbox).not.toBeChecked();await expect(page.getByLabel('Message (optional)')).toHaveCount(0);
    await checkbox.check();await expect(page.getByLabel('Message (optional)')).toHaveValue('');
    await expect.poll(()=>fixture.estimates.at(-1)?.giftCard?.message).toBe('');
    await page.getByRole('button',{name:'Next: Review'}).click();
    await expect(page.locator('[aria-label="Gift card details"]')).toContainText('Blank card');
    await page.locator('.gb-review-edit').getByRole('button',{name:'Finishing touches'}).click();
    await checkbox.uncheck();await expect(page.locator('[aria-label="Gift card details"]')).toHaveCount(0);
    await expect.poll(()=>fixture.estimates.at(-1)?.giftCard).toBeNull();
  });
}

test('cancelling a native photo picker does not clear Gift Box layout or produce upload status',async ({page})=>{
  await page.setViewportSize({width:390,height:780});await giftBoxFixture(page);await beginGiftBox(page);
  await page.getByRole('button',{name:'Make It Personal',exact:true}).click();
  const before=await page.locator('.gb-preview').boundingBox();
  const picker=page.locator('.gb-personal-editor input[type=file]').first();
  await picker.dispatchEvent('cancel');
  await expect(page.locator('.gb-preview')).toBeVisible();
  await expect(page.getByText(/Ready to upload/)).toHaveCount(0);
  const after=await page.locator('.gb-preview').boundingBox();
  expect(after.height).toBeGreaterThan(0);expect(Math.abs(after.height-before.height)).toBeLessThan(3);
});

test('first sticker character preserves editor focus and layout instead of resizing the workspace', async ({page}) => {
  await page.setViewportSize({width:390,height:790});await giftBoxFixture(page);
  // The generic Gift Box fixture does not publish sticker options. This test
  // specifically exercises a usable, owner-approved sticker input, so supply
  // its real public option contract instead of attempting to focus a disabled field.
  await page.route('**/api/v1/gift-box/personalization-options', route => route.fulfill({
    contentType:'application/json', json:{ok:true,data:{personalizationCheckoutEnabled:true,options:[{
      optionId:'fixture-approved-sticker',kind:'box_sticker',displayName:'Sticker',
      enabled:true,available:true,boxIds:['box-2'],pricePiastres:2000,
      approvedStyleIds:STICKER_STYLES.map(style=>style.id),
      approvedColorIds:ENGRAVING_COLORS.map(color=>color.id),
    }]}}
  }));
  await beginGiftBox(page);
  await page.getByRole('button',{name:'Make It Personal',exact:true}).click();
  const text=page.getByLabel('Write a name, special date, or heartfelt message');
  const frame=page.locator('.sticker-position').first();
  // Personalization options arrive asynchronously. The enclosing fieldset is
  // deliberately disabled before the approved sticker option loads. Focusing
  // a disabled input is a no-op; wait for an actually usable editor.
  await expect(text).toBeEnabled();
  const before=await frame.boundingBox();
  await text.focus();await expect(text).toBeFocused();
  await text.pressSequentially('Nour', {delay:40});
  await expect(text).toBeFocused();await expect(text).toHaveValue('Nour');
  await expect.poll(async()=> (await frame.boundingBox()).width).toBeCloseTo(before.width, 1);
  await expect.poll(async()=> (await frame.boundingBox()).height).toBeCloseTo(before.height, 1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
