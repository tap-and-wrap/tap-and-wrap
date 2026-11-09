import { test, expect } from '@playwright/test';
import { localCheckoutFixture } from './gift-box-checkout-fixture.js';
import { beginGiftBox } from './gift-box-fixtures.js';

for (const [width,height] of [[320,740],[390,844],[768,900],[1024,900],[1440,900],[844,390]]) test(`Gift Box confirmation centers and preserves removal at ${width}x${height}`, async ({ page }, info) => {
  await page.setViewportSize({width,height});await localCheckoutFixture(page);await beginGiftBox(page);
  await page.getByRole('button',{name:'Fill With Flowers',exact:true}).click();
  await page.getByRole('button',{name:'Add Fixture rose-red',exact:true}).click();
  await page.locator('.gb-placed').first().focus();await page.keyboard.press('Delete');
  const dialog=page.getByRole('dialog',{name:/Remove/});await expect(dialog).toBeVisible();
  expect(await dialog.getByRole('button',{name:'Remove item',exact:true}).evaluate(n=>getComputedStyle(n).backgroundColor)).toBe('rgb(121, 80, 69)');
  const rect=await dialog.boundingBox();
  await page.screenshot({path:info.outputPath('confirmation.png')});
  expect(Math.abs(rect.x+rect.width/2-width/2)).toBeLessThan(2);
  expect(Math.abs(rect.y+rect.height/2-height/2)).toBeLessThan(2);
  await expect(dialog.getByRole('button',{name:'Keep item'})).toBeFocused();
  await page.keyboard.press('Shift+Tab');await expect(dialog.getByRole('button',{name:'Remove item',exact:true})).toBeFocused();
  await page.keyboard.press('Tab');await expect(dialog.getByRole('button',{name:'Keep item'})).toBeFocused();
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(page.locator('.gb-placed').first()).toBeFocused();
  await page.keyboard.press('Delete');await dialog.getByRole('button',{name:'Remove item',exact:true}).click();await expect(page.locator('.gb-placed')).toHaveCount(0);
  await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(page.locator('.gb-placed')).toHaveCount(1);
  await page.setViewportSize({width:390,height:280});await page.locator('.gb-placed').first().focus();await page.keyboard.press('Delete');
  const small=await dialog.boundingBox();expect(small.y).toBeGreaterThanOrEqual(15);expect(small.y+small.height).toBeLessThanOrEqual(265);
  await dialog.getByRole('button',{name:'Keep item'}).click();

});
