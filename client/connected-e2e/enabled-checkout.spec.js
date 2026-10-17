import { chooseImageFiles } from '../e2e/media-helpers.js';
import { test, expect } from '@playwright/test';
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWO4NbsXAARVAgOYIL6CAAAAAElFTkSuQmCC', 'base64');
async function restrict(context) {
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return ['127.0.0.1', 'localhost'].includes(url.hostname) || ['data:', 'blob:'].includes(url.protocol) ? route.continue() : route.abort();
  });
}
async function details(page) {
  await page.goto('/checkout');
  await page.getByLabel('Full name', { exact: true }).fill('Audit Synthetic Customer');
  await page.getByLabel('Email', { exact: true }).fill('synthetic@example.test');
  await page.getByLabel('Egyptian mobile number').fill('01012345678');
  await page.getByLabel('Governorate', { exact: true }).selectOption('cairo');
  await page.getByLabel('Delivery address').fill('10 Isolated Fixture Street');
}
test.beforeEach(async ({ context }) => restrict(context));

test('real React/API/disposable database guest COD order preserves pending delivery and reload ownership', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/products/connected-catalog-batch3-1');
  await page.getByRole('button', { name: 'Add to Cart', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Added to your cart.' })).toBeVisible();
  await details(page);
  const response = page.waitForResponse(r => r.url().endsWith('/commerce/orders') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Place Order', exact: true }).click();
  const result = await response; expect(result.status()).toBe(201); const order = (await result.json()).data.order;
  expect(order.paymentState).toBe('unpaid'); expect(order.totals.shippingPiastres).toBeNull(); expect(order.shipping.amountPiastres).toBeNull();
  await expect(page).toHaveURL(/\/orders\//); await page.reload(); await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect(errors).toEqual([]);
  console.log(JSON.stringify({ audit: 'connected-enabled-cod', realAPI: true, disposableDB: true, providers: 'mocked', orderState: order.paymentState, pendingShipping: true }));
});

test('real personalization upload to cart to InstaPay order to proof and explicit admin private view', async ({ page, browser }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/products/connected-personalized-product');
  await page.getByRole('button', { name: 'Customize This', exact: true }).click();
  await chooseImageFiles(page, page, /^Audit photo/, { name: 'synthetic.png', mimeType: 'image/png', buffer: image });
  await page.getByRole('button', { name: 'Save personalization' }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByAltText('Selected audit photo 1')).toBeVisible();
  await page.getByRole('button', { name: 'Save personalization' }).click();
  await page.getByRole('button', { name: 'Add to Cart', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Added to your cart.' })).toBeVisible();
  await details(page); await expect(page.getByRole('radio', { name: 'Cash on Delivery', exact: true })).toBeDisabled();
  const response = page.waitForResponse(r => r.url().endsWith('/commerce/orders') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Place Order', exact: true }).click();
  const result = await response; expect(result.status()).toBe(201); const order = (await result.json()).data.order;
  expect(order.paymentState).toBe('awaiting_transfer'); expect(order.totals.totalPiastres).toBe(10000); expect(order.lines[0].personalization.photo).toHaveLength(1);
  await expect(page.getByRole('heading', { name: new RegExp('InstaPay instructions') })).toBeVisible();
  await chooseImageFiles(page, page, /^InstaPay payment proof/, { name: 'synthetic-proof.png', mimeType: 'image/png', buffer: image });
  await page.getByRole('button', { name: 'Submit proof for this order' }).click(); await expect(page.getByText('Proof submitted. Payment awaits account reconciliation.')).toBeVisible();
  const admin = await browser.newContext({ baseURL: 'http://127.0.0.1:' + (process.env.TAP_WRAP_CONTRACT_WEB_PORT || 5192) }); await restrict(admin); const adminPage = await admin.newPage();
  await adminPage.goto('/login?returnTo=' + encodeURIComponent('/admin/commerce/orders/' + order.id)); await adminPage.getByLabel('Email Address').fill('admin@connected.example.test'); await adminPage.getByLabel('Password', { exact: true }).fill('isolated-fixture-password'); await adminPage.getByRole('button', { name: 'Log In', exact: true }).click();
  await expect(adminPage).toHaveURL(`/admin/commerce/orders/${order.id}`); await expect(adminPage.getByRole('heading', { name: 'Private Files', exact: true })).toBeVisible(); await adminPage.getByRole('button', { name: 'View Personalization 1', exact: true }).click();
  await expect(adminPage.getByRole('dialog').locator('img')).toBeVisible(); await expect.poll(() => adminPage.getByRole('dialog').locator('img').evaluate(img => img.naturalWidth)).toBe(1);
  await adminPage.getByRole('button', { name: 'Close private file' }).click(); await adminPage.getByRole('button', { name: 'View Proof', exact: true }).click(); await expect(adminPage.getByRole('dialog').locator('img')).toBeVisible();
  expect(errors).toEqual([]); await admin.close();
  console.log(JSON.stringify({ audit: 'connected-enabled-personalization', realAPI: true, disposableDB: true, R2: 'memory adapter', filesCorrectlyBound: true, paymentNotAutomaticallyVerified: true }));
});

test('real guest Gift Box and engraving references survive request, protected admin view, accepted quote and conversion', async ({ page, browser }) => {
  for (const service of ['gift-box', 'laser-engraving']) {
    await page.goto(`/customize/${service}`);
    if (service === 'gift-box') { await page.getByLabel('Occasion', { exact: true }).fill('Synthetic birthday'); await page.getByLabel('Desired contents', { exact: true }).fill('Synthetic owner-reviewed bespoke gift'); }
    else { await page.getByLabel('Item description or product reference', { exact: true }).fill('Synthetic item for suitability review'); await page.getByLabel('Engraving text', { exact: true }).fill('Synthetic name'); }
    await page.getByLabel('Your name', { exact: true }).fill('Synthetic request customer'); await page.getByLabel('Egyptian WhatsApp number', { exact: true }).fill('01012345678');
    await chooseImageFiles(page, page, 'Reference images / artwork', [{ name: 'reference-one.png', mimeType: 'image/png', buffer: image }, { name: 'reference-two.png', mimeType: 'image/png', buffer: image }]);
    await expect(page.getByAltText('Selected reference images / artwork 2')).toBeVisible();
    const saved = page.waitForResponse(r => r.url().endsWith('/commerce/service-requests') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Submit request · No payment now' }).click();
    const response = await saved; expect(response.status()).toBe(201); const record = (await response.json()).data.request;
    await expect(page.getByRole('heading', { name: record.reference, exact: true })).toBeVisible();
    const context = await browser.newContext({ baseURL: 'http://127.0.0.1:' + (process.env.TAP_WRAP_CONTRACT_WEB_PORT || 5192) }); await restrict(context); const admin = await context.newPage();
    await admin.goto('/login?returnTo=' + encodeURIComponent('/admin/requests/' + record.id)); await admin.getByLabel('Email Address').fill('admin@connected.example.test'); await admin.getByLabel('Password', { exact: true }).fill('isolated-fixture-password'); await admin.getByRole('button', { name: 'Log In', exact: true }).click();
    await expect(admin).toHaveURL(`/admin/requests/${record.id}`); await expect(admin.getByRole('button', { name: 'View reference image 2', exact: true })).toBeVisible();
    await admin.getByRole('button', { name: 'View reference image 2', exact: true }).click(); await expect.poll(() => admin.getByRole('dialog').locator('img').evaluate(img => img.naturalWidth)).toBe(1);
    await admin.getByRole('button', { name: 'Close private file', exact: true }).click();
    await admin.getByLabel('Confirmed product/custom-work unit amount (EGP)').fill('450'); await admin.getByLabel('Confirmed delivery fee (EGP)').fill('90'); await admin.getByRole('button', { name: 'Save new quotation version' }).click();
    await expect(admin.getByLabel('Saved WhatsApp quotation', { exact: true })).toHaveValue(/540.00/);
    await admin.getByLabel('Private review / WhatsApp evidence note').fill('Synthetic recorded acceptance, no actual contact'); await admin.getByRole('button', { name: 'Record quotation actually shared' }).click();
    await admin.getByLabel('Customer confirmed this version and method through WhatsApp').check(); await admin.getByRole('button', { name: 'Record WhatsApp acceptance', exact: true }).click();
    await admin.getByLabel('Agreed delivery governorate').selectOption('cairo'); await admin.getByLabel('Agreed delivery address').fill('10 Synthetic Fixture Street');
    await admin.getByRole('button', { name: 'Create order from accepted quotation' }).click(); await expect(admin.getByRole('heading', { name: /^Linked order #/ })).toBeVisible();
    console.log(JSON.stringify({ service, realAPI: true, disposableDB: true, attachments: 2, privateAdminView: true, quoteAcceptedConverted: true, realPayment: false })); await context.close();
  }
});
