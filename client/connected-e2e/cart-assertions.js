import { expect } from '@playwright/test';

// Register before the click: an existing line/count cannot confirm an edit,
// and transient toast feedback does not prove that a cart was saved.
export async function saveCartItem(page, action) {
  const [response] = await Promise.all([
    page.waitForResponse(response => response.request().method() === 'POST'
      && new URL(response.url()).pathname === '/api/v1/commerce/cart/items', { timeout: 12_000 }),
    action(),
  ]);
  expect(response.status()).toBe(201);
  const { cart } = (await response.json()).data;
  expect(cart.items.length).toBeGreaterThan(0);
  const saved = await page.context().request.get(new URL('/api/v1/commerce/cart', response.url()).href);
  expect(saved.ok()).toBe(true);
  expect((await saved.json()).data.cart).toEqual(cart);
  await expect(page.locator('[data-cart-anchor]').first()).toHaveAccessibleName(`Cart, ${cart.quantity} items`);
  return cart;
}
