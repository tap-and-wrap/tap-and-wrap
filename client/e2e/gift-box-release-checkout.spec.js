import { localCheckoutFixture } from './gift-box-checkout-fixture.js';
import { expect, test } from '@playwright/test';
import { beginGiftBox } from './gift-box-fixtures.js';
import { cartWithProduct, fillCheckout, isolatedImageFile } from './commerce-fixtures.js';

async function review(page) {
  await page.getByRole('button', { name: 'Finishing Touches', exact: false }).click();
  await page.getByRole('button', { name: 'Next: Review', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review your gift' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add Your Gift to Cart' })).toBeEnabled();
}

const errors = new WeakMap();
test.beforeEach(({ page }) => { const caught = []; errors.set(page, caught); page.on('pageerror', error => caught.push(error.message)); });
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));

test('priced flexible gift with roses, chocolate and no ribbon goes from builder to InstaPay order', async ({ page }) => {
  const { audit, savedOrder } = await localCheckoutFixture(page);
  await beginGiftBox(page);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Add Fixture rose-red', exact: true }).click();
  await page.getByRole('button', { name: 'Add Fixture rose-red', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Add Fixture chocolate-1', exact: true }).click();
  await review(page);
  await expect(page.locator('.gb-live-total strong')).toContainText('40.00');
  await page.getByRole('button', { name: 'Add Your Gift to Cart' }).click();
  await expect(page).toHaveURL(/\/cart$/);
  const gift = page.getByRole('article', { name: 'Gift Box' });
  await gift.getByText('View Design Details', {exact:true}).click();
  await expect(gift).toContainText('Fixture rose-red × 2');
  await expect(gift).toContainText('Fixture chocolate-1 × 1');
  await expect(gift).toContainText('No ribbon selected');
  await expect(gift).toContainText('40.00');
  expect(audit.adds).toHaveLength(1);
  expect(audit.adds[0].configuration.selection.ribbonId).toBeNull();
  expect(audit.adds[0].configuration.placements).toHaveLength(3);
  await page.getByRole('link', { name: 'Proceed to Checkout' }).click();
  await fillCheckout(page);
  await expect(page.getByRole('radio', { name: /Cash on Delivery/ })).toBeChecked();
  await page.getByRole('radio', { name: /InstaPay/ }).check();
  await expect(page.getByRole('button',{name:'View transfer details',exact:true})).toHaveCount(0);
  await page.getByLabel(/^Transfer sender name/).fill('Fixture Sender');
  await page.getByLabel('Transaction screenshot',{exact:true}).setInputFiles(isolatedImageFile());
  await expect(page.locator('.commerce-summary')).toContainText('40.00');
  await page.getByRole('button', { name: 'Place Order' }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByRole('heading', { name: 'Thank you for your order!' })).toBeVisible();
  await expect(page.getByText(/received your payment screenshot/)).toBeVisible();
  expect(savedOrder().lines[0].giftBox.items).toEqual(expect.arrayContaining([expect.objectContaining({componentId:'chocolate-1',quantityPerBox:1})]));
  expect(audit.quotes.length).toBeGreaterThan(0);
  expect(audit.orders).toHaveLength(1);
  expect(savedOrder().totals.totalPiastres).toBe(4000);
  expect(savedOrder().lines).toHaveLength(1);
  expect(savedOrder().lines[0].giftBox.components).toEqual(expect.arrayContaining([
    expect.objectContaining({ componentId: 'box-2', quantityPerBox: 1, unitPricePiastres: 1000 }),
    expect.objectContaining({ componentId: 'rose-red', quantityPerBox: 2, unitPricePiastres: 1000 }),
    expect.objectContaining({ componentId: 'chocolate-1', quantityPerBox: 1, unitPricePiastres: 1000 }),
  ]));
  expect(savedOrder().lines[0].giftBox.components).toHaveLength(3);
});

test('box-only no-ribbon gift can check out alongside an ordinary priced product', async ({ page }) => {
  const { audit, savedOrder } = await localCheckoutFixture(page, { initialCart: cartWithProduct() });
  await beginGiftBox(page);
  await review(page);
  await page.getByRole('button', { name: 'Add Your Gift to Cart' }).click();
  await expect(page).toHaveURL(/\/cart$/);
  await expect(page.getByRole('article', { name: 'Gift Box' })).toContainText('10.00');
  await expect(page.getByRole('heading', { name: 'Isolated Commerce Gift' })).toBeVisible();
  await page.getByRole('link', { name: 'Proceed to Checkout' }).click();
  await fillCheckout(page);
  await expect(page.locator('.commerce-summary')).toContainText('260.00');
  await page.getByRole('button', { name: 'Place Order' }).click();
  await expect(page.getByRole('heading', { name: 'Thank you for your order!' })).toBeVisible();
  expect(audit.adds[0].configuration.selection.items).toEqual([]);
  expect(audit.adds[0].configuration.selection.ribbonId).toBeNull();
  expect(savedOrder().lines).toHaveLength(2);
  expect(savedOrder().totals.totalPiastres).toBe(26000);
});

test('rejected server cart pricing leaves the customer on review without creating an order', async ({ page }) => {
  const { audit, fixture } = await localCheckoutFixture(page, { rejectAdd: true });
  await beginGiftBox(page);
  await review(page);
  await page.getByRole('button', { name: 'Add Your Gift to Cart' }).click();
  await expect(page).toHaveURL(/\/customize\/gift-box$/);
  await expect(page.getByRole('region',{name:'Notifications alt+T'}).getByText('An approved gift component is no longer available.',{exact:true})).toBeVisible();
  expect(audit.adds).toHaveLength(1);
  expect(audit.orders).toHaveLength(0);
  expect(fixture.state.cart.items).toHaveLength(0);
});

// This journey requires the enabled-builder fixture used by this suite.
const field=page=>page.getByLabel('Write a name, special date, or heartfelt message');
function position(page){return page.locator('.sticker-position').evaluate(node=>({x:parseFloat(node.style.left),y:parseFloat(node.style.top)}));}
test('cart submission contains actual normalized placement and the same single sticker price',async({page})=>{
 const {audit}=await localCheckoutFixture(page,{personalized:true});await page.goto('/customize/gift-box');await page.getByRole('button',{name:'Choose Fixture box-2',exact:true}).click();await page.getByRole('button',{name:'Make It Personal',exact:true}).click();await field(page).fill('Nour');await page.getByRole('button',{name:'Move sticker right',exact:true}).click();const expected=await position(page);
 await page.getByRole('button',{name:'Finishing Touches',exact:true}).click();await page.getByRole('button',{name:'Next: Review',exact:true}).click();await expect(page.locator('.gb-review .sticker-proof-image')).toBeVisible();await expect(page.locator('.gb-live-total strong')).toContainText('30.00');await page.getByRole('button',{name:'Add Your Gift to Cart',exact:true}).click();await expect(page).toHaveURL(/\/cart$/);const intent=audit.adds[0].configuration.personalizationIntent;expect(intent.version).toBe('gift-box-personalization-intent-v3');expect(intent.sticker.placement.x).toBeCloseTo(expected.x/100);expect(intent.sticker.placement.boxId).toBe('box-2');expect(intent.sticker.placement.view).toBe('exterior');expect(audit.adds).toHaveLength(1);
});

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
