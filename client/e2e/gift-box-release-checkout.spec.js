import { localCheckoutFixture } from './gift-box-checkout-fixture.js';
import { expect, test } from '@playwright/test';
import { beginGiftBox } from './gift-box-fixtures.js';
import { cartWithProduct, fillCheckout } from './commerce-fixtures.js';

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
  const gift = page.getByRole('article', { name: 'Build Your Gift Box' });
  await gift.getByText('View design and details', {exact:true}).click();
  await expect(gift).toContainText('Fixture rose-red × 2');
  await expect(gift).toContainText('Fixture chocolate-1 × 1');
  await expect(gift).toContainText('No ribbon selected');
  await expect(gift).toContainText('40.00');
  expect(audit.adds).toHaveLength(1);
  expect(audit.adds[0].configuration.selection.ribbonId).toBeNull();
  expect(audit.adds[0].configuration.placements).toHaveLength(3);
  await page.getByRole('link', { name: 'Proceed to Checkout' }).click();
  await fillCheckout(page);
  await expect(page.getByRole('radio', { name: /InstaPay/ })).toBeChecked();
  await expect(page.getByRole('radio', { name: /Cash on Delivery/ })).toHaveCount(0);
  await expect(page.locator('.commerce-summary')).toContainText('40.00');
  await page.getByRole('button', { name: 'Place Order' }).click();
  await expect(page).toHaveURL(/\/orders\/710000000000000000000040$/);
  await expect(page.getByRole('heading', { name: 'Order #681243' })).toBeVisible();
  await expect(page.getByText(/Payment: awaiting transfer · InstaPay/)).toBeVisible();
  await expect(page.locator('.commerce-gift-order-item')).toContainText('Fixture chocolate-1 × 1');
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
  await expect(page.getByRole('article', { name: 'Build Your Gift Box' })).toContainText('10.00');
  await expect(page.getByRole('heading', { name: 'Isolated Commerce Gift' })).toBeVisible();
  await page.getByRole('link', { name: 'Proceed to Checkout' }).click();
  await fillCheckout(page);
  await expect(page.locator('.commerce-summary')).toContainText('260.00');
  await page.getByRole('button', { name: 'Place Order' }).click();
  await expect(page.getByRole('heading', { name: 'Order #681243' })).toBeVisible();
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
  await expect(page.locator('.gb-announcement')).toContainText('no longer available');
  expect(audit.adds).toHaveLength(1);
  expect(audit.orders).toHaveLength(0);
  expect(fixture.state.cart.items).toHaveLength(0);
});
