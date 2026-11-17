import { test, expect } from '@playwright/test';
import { mockCommerce, cartWithProduct, commerceProduct, fillCheckout } from './commerce-fixtures.js';

// Fixture-only browser coverage. These tests never use production MongoDB,
// private uploads or financial transfers.
test('an unresolved owner-bound customization survives reload and blocks checkout', async ({page}) => {
  const fixture = await mockCommerce(page, {checkoutEnabled:true, cart:cartWithProduct()});
  await page.goto('/cart');
  await page.evaluate(async () => {
    const owner = '0'.repeat(64);
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('tw-private-customization-drafts-v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('drafts');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise((resolve, reject) => {
        const transaction = database.transaction('drafts', 'readwrite');
        transaction.objectStore('drafts').put({
          version:1, owner, kind:'cart-preparations', updatedAt:Date.now(),
          payload:{jobs:[{
            kind:'gift_box_v2', operationKey:'11111111-1111-4111-8111-111111111111',
            ownerContext:owner, label:'Gift Box', snapshot:{sealed:true}, receipts:{}, payload:null,
            status:'failed', definitiveReject:true, stage:'uploading', createdAt:Date.now(), error:'Fixture upload rejected',
          }]},
        }, `cart-preparations:${owner}`);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });
    } finally { database.close(); }
  });
  await page.reload();
  await expect(page.locator('.cart-preparation')).toHaveCount(1);
  await expect(page.getByRole('button', {name:'Resolve pending custom items before checkout'})).toBeDisabled();
  await page.goto('/checkout');
  await expect(page.getByRole('heading', {name:'Custom items are still preparing'})).toBeVisible();
  await expect(page.getByRole('button', {name:'Place Order'})).toBeDisabled();
  expect(fixture.calls.filter(call=>call.path==='/commerce/checkout/quote')).toHaveLength(0);
  expect(fixture.calls.filter(call=>call.path==='/commerce/checkout/payments' && call.method==='POST')).toHaveLength(0);
  expect(fixture.orders).toHaveLength(0);
});

test('regular cart changes reprice checkout before any InstaPay reference is issued', async ({page}) => {
  const fixture = await mockCommerce(page, {checkoutEnabled:true, cart:cartWithProduct()});
  await page.goto('/cart');
  await page.getByRole('button', {name:`Increase quantity for ${commerceProduct.name}`}).click();
  await expect(page.locator('.commerce-summary')).toContainText('500.00');
  await page.getByRole('link', {name:'Proceed to Checkout'}).click();
  await fillCheckout(page);
  await expect(page.locator('.commerce-total')).toContainText('500.00');
  await expect(page.getByRole('button', {name:'Update payment details', exact:true})).toHaveCount(0);
  expect(fixture.calls.filter(call=>call.path==='/commerce/checkout/payments' && call.method==='POST')).toHaveLength(0);
  await page.getByRole('radio', {name:/InstaPay/}).check();
  await expect.poll(() => fixture.calls.filter(call=>call.path==='/commerce/checkout/payments' && call.method==='POST').length).toBe(1);
  await expect(page.locator('.checkout-transfer-amount')).toContainText('500.00');
  expect(fixture.orders).toHaveLength(0);
});
