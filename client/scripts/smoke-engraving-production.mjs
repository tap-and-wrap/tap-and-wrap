// Explicitly authorized synthetic production smoke. Never run from normal tests/builds.
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chooseImageFiles } from '../e2e/media-helpers.js';
const readOnlyFollowup = process.argv[2] === '--read-only-followup';
if (!['--authorized-production-smoke', '--read-only-followup'].includes(process.argv[2]) || process.argv.length !== 3) throw Error('EXPLICIT_PRODUCTION_SMOKE_REQUIRED');
const site = 'https://tapandwrap.net', api = 'https://api.tapandwrap.net';
const directory = new URL('../test-results-engraving-production-smoke/', import.meta.url);
await mkdir(directory, { recursive: true });
const report = { time: new Date().toISOString(), synthetic: true, success: false, checks: [], ordersCreated: 0 };
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.name));
const image = { name: 'SYNTHETIC-ENGRAVING-LAUNCH-TEST.png', mimeType: 'image/png',
  buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWO4NbsXAARVAgOYIL6CAAAAAElFTkSuQmCC', 'base64') };
await context.route('**/*', route => {
  const request = route.request(), url = new URL(request.url()), method = request.method();
  if (['blob:', 'data:'].includes(url.protocol)) return route.continue();
  if (url.protocol !== 'https:') return route.abort();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return [site, api].includes(url.origin) || url.hostname.endsWith('.r2.cloudflarestorage.com') ? route.continue() : route.abort();
  if (readOnlyFollowup) return route.abort();
  if (method === 'PUT' && url.hostname.endsWith('.r2.cloudflarestorage.com') && url.searchParams.has('X-Amz-Signature')) return route.continue();
  const allowed = /^\/api\/v1\/commerce\/(?:engraving\/quote|uploads\/sign|uploads\/[a-f0-9]{24}\/complete|cart\/items|checkout\/quote|orders)$/;
  if (url.origin !== api || method !== 'POST' || !allowed.test(url.pathname)) return route.abort();
  if (url.pathname.endsWith('/orders')) {
    const body = request.postDataJSON();
    if (report.ordersCreated || body.customer?.email !== 'tw-engraving-launch@example.invalid'
      || !body.customer?.name?.startsWith('TW ENGRAVING LAUNCH TEST')) return route.abort();
    report.ordersCreated++; // An uncertain response is never automatically retried.
  }
  return route.continue();
});
async function screen(name) {
  await page.evaluate(() => { window.scrollTo(0, 0); document.activeElement?.blur(); });
  await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, directory)), fullPage: true });
}
async function compatibility() {
  await page.goto(site + '/customize/gift-box');
  await expect(page.locator('main:not([data-prerender])').getByRole('heading', { name: 'Build your gift box', exact: true })).toBeVisible();
  await expect(page.locator('main:not([data-prerender]) .gb-choices')).toBeVisible();
  await screen('gift-box-read-only'); report.giftBoxPageTitle = await page.title();
  report.checks.push('gift-box-builder-loaded-read-only');
  if (readOnlyFollowup) {
    await page.goto(site + '/checkout');
    await expect(page.locator('main:not([data-prerender])').getByRole('heading', { name: 'Checkout', exact: true })).toBeVisible();
    await expect(page.getByText('Your cart is empty.', { exact: true })).toBeVisible();
    await screen('ordinary-empty-checkout-read-only'); report.checks.push('ordinary-checkout-loaded-read-only');
  }
}
async function json(path) {
  const response = await context.request.get(api + path); expect(response.status()).toBe(200); return (await response.json()).data;
}
try {
  const types = await json('/api/v1/commerce/engraving/types?page=1');
  expect(types.enabled).toBe(true); expect(types.types).toHaveLength(9);
  expect(new Set(types.types.map(type => type.typeId)).size).toBe(9);
  expect(types.types.every(type => type.pricePiastres === 10000 && type.status === 'active' && type.assetsApproved && type.placements.length === 0)).toBe(true);
  report.checks.push('nine-active-types-EGP100');
  if (readOnlyFollowup) { await compatibility(); }
  else {
  for (const [index, variant] of ['arabic', 'english', 'icons', 'photo', 'drawing', 'handwriting', 'fingerprint'].entries()) {
    await page.goto(site + '/customize/laser-engraving');
    await expect(page.getByRole('heading', { name: 'Choose your item', exact: true })).toBeVisible();
    await expect(page.locator('.engraving-type')).toHaveCount(9);
    if (!index) {
      await screen('step-1-desktop');
      await page.setViewportSize({ width: 390, height: 900 }); await screen('step-1-mobile');
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    await page.getByRole('radio', { name: /Perfume/ }).check();
    await chooseImageFiles(page, page, 'Photo of your item', image);
    if (!index) await chooseImageFiles(page, page, 'Close-up of engraving surface (optional)', image);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByRole('radio', { name: 'Help me choose the best placement', exact: true })).toBeChecked();
    if (variant === 'arabic' || variant === 'english') {
      await page.getByLabel('Your engraving text').fill(variant === 'arabic' ? '\u0623\u062d\u0645\u062f\nTEST 2026' : 'SYNTHETIC TEST\n2026');
      await page.getByRole('radio', { name: variant === 'arabic' ? /Amiri/ : /Rochester/ }).check();
      await expect.poll(() => page.evaluate(() => document.fonts.ready.then(() => document.fonts.check('20px Engraving-amiri-v1') && document.fonts.check('20px Engraving-rochester-v1')))).toBe(true);
    } else if (variant === 'icons') {
      await page.getByRole('radio', { name: 'Icons', exact: true }).check();
      for (const name of ['Heart', 'Star', 'Infinity']) await page.getByRole('radio', { name, exact: true }).check();
    } else {
      await page.getByRole('radio', { name: 'Personal', exact: true }).check();
      const label = variant[0].toUpperCase() + variant.slice(1);
      await page.getByRole('radio', { name: label, exact: true }).check();
      await chooseImageFiles(page, page, `${label} artwork`, image);
    }
    for (const name of ['Black', 'White', 'Grey']) await page.getByRole('radio', { name, exact: true }).check();
    await page.getByText('Any special requests?', { exact: true }).click();
    await page.getByLabel('Positioning, orientation, size or handling notes').fill('AUTHORIZED SYNTHETIC LAUNCH TEST. No physical item. DO NOT ENGRAVE, COLLECT PAYMENT OR SHIP.');
    await screen(`step-2-${variant}`);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Review your engraving', exact: true })).toBeVisible();
    if (!index) await screen('step-3-review');
    await page.getByRole('button', { name: 'Add Engraving to Cart', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your engraving is in the cart' })).toBeVisible({ timeout: 30000 });
    const cart = (await json('/api/v1/commerce/cart')).cart;
    expect(cart.items).toHaveLength(index + 1);
    expect(cart.items.every(item => item.kind === 'engraving_service_v1' && item.quantity === 1 && item.unitPricePiastres === 10000)).toBe(true);
    report.checks.push(`live-private-upload-cart-${variant}`);
  }
  await page.goto(site + '/cart'); await screen('cart');
  await page.goto(site + '/checkout');
  await page.getByLabel('Full name', { exact: true }).fill('TW ENGRAVING LAUNCH TEST - DO NOT FULFIL');
  await page.getByLabel('Email', { exact: true }).fill('tw-engraving-launch@example.invalid');
  await page.getByLabel('Egyptian mobile number', { exact: true }).fill('01000000000');
  await page.getByLabel('Governorate', { exact: true }).selectOption('cairo');
  await page.getByLabel('Return / contact address', { exact: true }).fill('SYNTHETIC TEST - NO DELIVERY AND NO PHYSICAL ITEM');
  await page.getByText('Add delivery notes (optional)', { exact: true }).click();
  await page.getByLabel('Order notes (optional)', { exact: true }).fill('AUTHORIZED PRODUCTION SMOKE. No customer or item exists. DO NOT REQUEST PAYMENT, ENGRAVE OR SHIP.');
  await expect(page.getByText('Your engraving order starts unpaid.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Place engraving order · No payment now', exact: true })).toBeEnabled();
  await screen('checkout');
  const placed = page.waitForResponse(response => response.url() === api + '/api/v1/commerce/orders' && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Place engraving order · No payment now', exact: true }).click();
  const response = await placed; expect(response.status()).toBe(201);
  const order = (await response.json()).data.order;
  expect(order.collectionAuthorized).toBe(false); expect(order.paymentInstructions).toBeNull(); expect(order.paymentState).toBe('unpaid');
  expect(order.lines).toHaveLength(7); expect(order.lines.every(line => line.kind === 'engraving_service_v1' && line.unitPricePiastres === 10000)).toBe(true);
  report.testOrder = { id: order.id, orderNumber: order.orderNumber, paymentState: order.paymentState,
    collectionAuthorized: order.collectionAuthorized, totalPiastres: order.totals.totalPiastres, serviceLines: 7 };
  await expect(page).toHaveURL(new RegExp(`/orders/${order.id}$`)); await screen('unpaid-test-order');
  const csrf = (await json('/api/v1/auth/csrf')).csrfToken;
  const rejected = await context.request.post(api + '/api/v1/commerce/uploads/sign', { headers: { Origin: site, 'x-csrf-token': csrf },
    data: { purpose: 'payment_proof', orderId: order.id, mimeType: 'image/png', sizeBytes: image.buffer.length } });
  expect(rejected.status()).toBe(409); expect((await rejected.json()).error.code).toBe('ENGRAVING_PAYMENT_NOT_AUTHORIZED');
  report.checks.push('positive-priced-unpaid-order', 'payment-instructions-hidden', 'direct-payment-proof-signing-rejected');
  await compatibility();
  }
  expect(errors).toEqual([]); report.success = true;
} catch (error) {
  report.failure = { name: error.name, message: String(error.message).slice(0, 1200) };
  process.exitCode = 1; await screen('failure').catch(() => {});
} finally {
  await writeFile(new URL(readOnlyFollowup ? 'read-only-followup.json' : 'latest.json', directory), JSON.stringify(report, null, 2));
  await context.close(); await browser.close(); console.log(JSON.stringify(report, null, 2));
}
