import { expect } from '@playwright/test';

/** These contract tests use the real isolated API. Do not confuse a queued
 * toast or route location with an authoritative cart write. */
export async function confirmedCartAdd(page, click) {
  const pending = page.waitForResponse(response => response.request().method() === 'POST'
    && new URL(response.url()).pathname === '/api/v1/commerce/cart/items', { timeout: 35_000 });
  await click();
  const response = await pending;
  expect(response.status(), `The isolated cart write returned ${response.status()}: ${await response.text()}`).toBe(201);
  const data = (await response.json()).data;
  expect(data?.cart?.items?.length).toBeGreaterThan(0);
  const endpoint = new URL('/api/v1/commerce/cart', response.url()).href;
  await expect.poll(async () => {
    const latest = await page.context().request.get(endpoint);
    expect(latest.ok()).toBe(true);
    return (await latest.json()).data.cart;
  }, { timeout: 20_000 }).toEqual(data.cart);
  return data.cart;
}

export async function confirmedCartAddAndOpen(page, click) {
  const cart = await confirmedCartAdd(page, click);
  await page.locator('[data-cart-anchor]').first().click();
  await expect(page).toHaveURL(/\/cart$/);
  await expect(page.locator('.cart-preparation')).toHaveCount(0, { timeout: 20_000 });
  return cart;
}

/** A lost HTTP response is NOT a license to add the same item again. A
 * real server acknowledgement must produce one owned cart line. Do not skip
 * the queue's status check merely because it has not rendered yet. */
export async function reconcileUncertainAddition(page, label) {
  await page.locator('[data-cart-anchor]').first().click();
  await expect(page).toHaveURL(/\/cart$/);
  const job = page.getByRole('article', { name: `${label} preparation`, exact: true });
  const check = job.getByRole('button', { name: 'Check status', exact: true });
  const expectedKind = label === 'Gift Box' ? 'gift_box_v2' : 'engraving_service_v2';
  const apiPort = process.env.TAP_WRAP_CONTRACT_API_PORT;
  expect(apiPort, 'The isolated API port must be declared by the connected test runner.').toMatch(/^\d+$/);
  const response = await page.context().request.get(`http://127.0.0.1:${apiPort}/api/v1/commerce/cart`);
  expect(response.ok(), 'The authoritative cart must be accessible to its verified owner.').toBe(true);
  const confirmed = (await response.json()).data.cart.items.filter(item => item.kind === expectedKind);
  expect(confirmed, 'A lost response must not create duplicate custom cart lines.').toHaveLength(1);
  const name = expectedKind === 'gift_box_v2' ? 'Gift Box' : (confirmed[0].name || 'Item engraving').replace(/\bengraving\b/gi, 'Engraving');
  const line = page.getByRole('article', { name, exact: true });

  // Either the cart already displays the saved item, or the background worker
  // must expose a status check. A one-time .count() can race the worker and
  // incorrectly skip the check while the cart view still has stale data.
  // Do not reload the page or directly mutate the cart: these are user-facing
  // recovery guarantees, not shortcuts to make an old test pass.
  try {
    await expect.poll(async () => {
      if (await line.isVisible()) return 'saved';
      if (await check.isVisible()) return 'actionable';
      return 'waiting';
    }, { timeout: 25_000 }).not.toBe('waiting');
  } catch (error) {
    const state = {
      route: new URL(page.url()).pathname,
      savedVisible: await line.isVisible().catch(() => false),
      pendingCount: await job.count().catch(() => -1),
      pendingBusy: await job.first().getAttribute('aria-busy').catch(() => null),
      renderedCartItems: await page.locator('.commerce-cart-items .cart-v2-line').count().catch(() => -1),
      emptyCartVisible: await page.getByText('Your cart is empty.', { exact: true }).isVisible().catch(() => false),
      loadingCartVisible: await page.getByText('Loading your cart').isVisible().catch(() => false),
    };
    throw new Error(`An API-confirmed cart item was neither rendered nor recoverable in the UI: ${JSON.stringify(state)}; ${error.message}`);
  }

  if (!(await line.isVisible()) && await check.isVisible()) {
    await expect(job).toContainText(/confirmation needed|needs your attention/i);
    await check.click();
    await expect(job).toHaveCount(0, { timeout: 20_000 });
  }
  await expect(line, 'A confirmed cart write must be visible to the owner after reconciliation.').toBeVisible({ timeout: 20_000 });
  const verify = await page.context().request.get(`http://127.0.0.1:${apiPort}/api/v1/commerce/cart`);
  expect(verify.ok()).toBe(true);
  expect((await verify.json()).data.cart.items.filter(item => item.kind === expectedKind),
    'Checking a lost response must never create a duplicate item.').toHaveLength(1);
}
