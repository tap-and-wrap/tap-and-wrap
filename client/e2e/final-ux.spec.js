import { test, expect } from '@playwright/test';
import { mockCommerce } from './commerce-fixtures.js';
import { ownerFixture } from './owner-dashboard-fixtures.js';
import { readFile } from 'node:fs/promises';

test('account controls reflow at six sizes and show actionable auth feedback', async ({ page }, info) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await mockCommerce(page); await page.goto('/signup');
  for (const width of [320, 390, 440, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByText(/Use at least 12 characters/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.goto('/login?returnTo=%2Fcart');
  await page.getByLabel('Email Address').fill('customer@example.test');
  await page.getByLabel('Password', { exact: true }).fill('correct-test-password');
  await page.getByRole('button', { name: 'Show password', exact: true }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide password', exact: true }).click();
  await page.getByRole('button', { name: 'Log In', exact: true }).click();
  await expect(page).toHaveURL(/\/cart$/);
  await expect(page.getByText('You are signed in.', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  await page.screenshot({ path: info.outputPath('account-result.png') });
});

test('legacy owner pages redirect and required box controls stay reachable', async ({ page }) => {
  await ownerFixture(page);
  await page.goto('/admin/payment');
  await expect(page).toHaveURL(/\/admin\/orders\?view=verification$/);
  await expect(page.getByRole('button', { name: 'Payment review', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('link', { name: 'Payment', exact: true })).toHaveCount(0);
  await page.goto('/admin/gift-box/fulfillment-policies');
  await expect(page).toHaveURL(/\/admin\/gift-box\?tab=components$/);
  await expect(page.locator('.owner-workspace-tabs a')).toHaveCount(2);
  await expect(page.locator('summary').filter({ hasText: 'Safe packing & box availability' })).toHaveCount(0);
  await page.goto('/admin/gift-box?tab=visuals');
  await expect(page).toHaveURL(/\?tab=components$/);
});

test('tracking presents only the limited summary and clears it on a failed retry', async ({ page }) => {
  await mockCommerce(page);
  let found = true;
  await page.route('**/api/v1/commerce/orders/track', route => route.request().method() === 'OPTIONS' ? route.fallback() : route.fulfill({ status: found ? 200 : 404, headers: { 'access-control-allow-origin': 'http://127.0.0.1:5191', 'access-control-allow-credentials': 'true' }, json: found ? { ok: true, data: { order: { orderNumber: '123456', fulfillmentState: 'preparing', paymentState: 'awaiting_verification', createdAt: '2026-11-15T10:00:00Z', totalPiastres: 25000, items: [{ name: 'An isolated gift', quantity: 1 }], shippingStatus: 'pending' } } } : { ok: false, error: { code: 'TRACKING_NOT_FOUND', message: 'No matching order was found. Check both details.' } } }));
  await page.goto('/track-order');
  await page.getByLabel('Order number', { exact: true }).fill('123456'); await page.getByLabel('Checkout phone number').fill('01000000000');
  await page.getByRole('button', { name: 'Track Order', exact: true }).click();
  await expect(page.locator('.tracking-result')).toContainText('An isolated gift');
  await expect(page.locator('[aria-current="step"]')).toContainText('Being prepared');
  await expect(page.locator('.tracking-result')).toContainText('250.00');
  await expect(page.getByLabel('Order number', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Track Another Order', exact: true }).click();
  await expect(page.getByLabel('Order number', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Checkout phone number', { exact: true })).toHaveValue('');
  found = false; await page.getByLabel('Order number', { exact: true }).fill('123456');
  await page.getByLabel('Checkout phone number', { exact: true }).fill('01000000000');
  await page.getByRole('button', { name: 'Track Order', exact: true }).click();
  await expect(page.getByText('No matching order was found. Check both details.')).toBeVisible();
  await expect(page.locator('.tracking-result')).toHaveCount(0);
});

test('prerender hands off to React loading without exposing raw SEO content', async ({ page }) => {
  await mockCommerce(page);
  await page.route('**/login', async route => {
    const response = await route.fetch(); const html = await response.text();
    await route.fulfill({ response, body: html.replace('<div id="root"></div>', '<div id="root"><main data-prerender="true"><h1>STATIC SEO SENTINEL</h1><a href="/shop">Browse gifts</a></main></div>') });
  });
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.getByText('STATIC SEO SENTINEL')).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveClass(/tw-booting/);

});

test('failed React initialization restores navigable static content after the bounded opening', async ({ page }) => {
  const template = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const styles = template.match(/<style>[\s\S]*?<\/style>/)[0];
  await page.clock.install();
  await page.route('**/__boot-failure', route => route.fulfill({ contentType:'text/html', body:`<!doctype html><html><head>${styles}<script src="/boot-appearance.js"></script></head><body><div class="site-boot" role="status">Opening gifts</div><div id="root"><main data-prerender="true"><h1>Browse thoughtful gifts</h1><a href="/shop">Browse the shop</a></main></div><script type="module">import {initializePrerender} from '/src/seo/boot.js';initializePrerender(document.getElementById('root'));window.bootTestStarted=true;</script></body></html>` }));
  await page.goto('/__boot-failure');
  await expect.poll(() => page.evaluate(() => window.bootTestStarted)).toBe(true);
  await expect(page.getByRole('heading', { name:'Browse thoughtful gifts' })).toBeHidden();
  await page.clock.fastForward(7600);
  await expect(page.getByRole('heading', { name:'Browse thoughtful gifts' })).toBeVisible();
  await expect(page.getByRole('link', { name:'Browse the shop' })).toHaveAttribute('href','/shop');
  await expect(page.locator('html')).not.toHaveClass(/tw-booting/);
  await page.route('**/__boot-empty', route => route.fulfill({ contentType:'text/html', body:`<!doctype html><html><head>${styles}<script src="/boot-appearance.js"></script></head><body><div class="site-boot" role="status">Opening gifts</div><div id="root"></div></body></html>` }));
  await page.goto('/__boot-empty');
  await page.clock.fastForward(8100);
  await expect(page.getByRole('heading', { name:'Your page could not open' })).toBeVisible();
  await expect(page.getByRole('link', { name:'Reload this page' })).toBeVisible();
});

test('saved checkout proof stays quiet in customer details and owner actions lead the order', async ({ page }, info) => {
  const fixture = await mockCommerce(page, { role:'customer' });
  Object.assign(fixture.state.order, { accountingVersion:1, paymentMethod:'instapay', paymentState:'awaiting_verification', proofStatus:'submitted', checkoutPayment:{ reference:'synthetic-reference', amountPiastres:34000 }, paymentInstructions:{ destination:'01060673073', amountPiastres:34000 }, accounting:{ merchandisePiastres:34000, agreedTotalPiastres:34000, outstandingPiastres:34000, collectedPiastres:0, refundedPiastres:0, overpaymentPiastres:0, charges:[], groups:[], settlements:[], unresolvedCharges:0, collectionAuthorized:true } });
  await page.goto(`/orders/${fixture.state.order.id}`);
  await expect(page.getByRole('heading', { name:`Order #${fixture.state.order.orderNumber}`, exact:true })).toBeVisible();
  await expect(page.getByRole('button', { name:'Submit proof for this order' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name:'Fix payment proof' })).toHaveCount(0);
  for (const width of [320,390,440,768,1024,1440]) {
    await page.setViewportSize({width,height:900});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  fixture.state.order.proofStatus='rejected'; fixture.state.order.paymentState='rejected'; fixture.state.order.paymentAttention={receiptReplacementEnabled:true};
  await page.reload(); await expect(page.getByRole('heading', {name:'Fix payment proof'})).toBeVisible();
  fixture.state.user.role='admin'; await page.goto(`/admin/orders/${fixture.state.order.id}`);
  await expect(page.getByRole('heading',{name:'Purchased items'})).toBeVisible();
  await expect(page.getByText('Payment verification and financial records')).toBeVisible();
  await expect(page.locator('.commerce-private-dialog')).toHaveCount(0);
  await page.setViewportSize({width:390,height:900});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('owner-order-390.png')});
});
