import { chooseImageFiles } from './media-helpers.js';
import { test, expect } from '@playwright/test';
import { mockCommerce, commerceProduct, isolatedImageFile } from './commerce-fixtures.js';
import { mockCatalog, adminProduct } from './catalog-fixtures.js';

const fields = [
  { key: 'photo', label: 'Your photo', type: 'image', required: true, minFiles: 1, maxFiles: 2, maxBytes: 5242880, acceptedMimeTypes: ['image/png', 'image/jpeg'] },
  { key: 'recipient', label: 'Name on your gift', type: 'short_text', required: true, maxLength: 40 },
  { key: 'notes', label: 'Your instructions', type: 'long_text', required: false, maxLength: 300 },
  { key: 'style', label: 'Gift style', type: 'select', required: true, choices: ['Classic', 'Minimal'] },
];
const product = { ...commerceProduct, pricePiastres: 45000, requiresOptions: true, personalization: { requiredBeforePurchase: true, fields } };
const headers = { 'Access-Control-Allow-Origin': 'http://127.0.0.1:5191', 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'content-type,x-csrf-token', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS' };
const purchase = page => page.getByRole('form', { name: 'Product options' });
async function complete(page, name = 'Alice') {
  const dialog = page.getByRole('dialog');
  await chooseImageFiles(page, dialog, /^Your photo/, isolatedImageFile());
  await dialog.getByLabel(/^Name on your gift/).fill(name);
  await dialog.getByLabel('Your instructions').fill('Keep the original crop');
  await dialog.getByLabel(/^Gift style/).selectOption('Classic');
  await dialog.getByRole('button', { name: 'Save personalization' }).click();
}

test('ordinary Add to Cart is unchanged; customization requires valid completion then preserves Edit and private previews', async ({ page }) => {
  const fixture = await mockCommerce(page, { product, checkoutEnabled: true });
  await page.goto(`/products/${product.slug}`);
  await expect(purchase(page).getByRole('button', { name: 'Add to Cart', exact: true })).toHaveCount(0);
  await purchase(page).getByRole('button', { name: 'Customize This', exact: true }).click();
  await page.getByRole('button', { name: 'Save personalization' }).click();
  await expect(page.getByRole('dialog').getByText('This field is required.')).toHaveCount(2);
  await complete(page);
  await expect(purchase(page).getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  await expect(purchase(page).getByRole('button', { name: 'Add to Cart', exact: true })).toBeEnabled();
  expect(fixture.uploads).toHaveLength(0);
  await purchase(page).getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel(/^Name on your gift/)).toHaveValue('Alice');
  await expect(page.getByAltText('Selected your photo 1')).toBeVisible();
  await page.getByLabel(/^Name on your gift/).fill('Bea'); await page.getByRole('button', { name: 'Save personalization' }).click();
  await purchase(page).getByRole('button', { name: 'Add to Cart', exact: true }).click();
  await expect.poll(() => fixture.state.cart.quantity).toBe(1);
  expect(fixture.state.cart.items[0].personalization.recipient).toBe('Bea'); expect(fixture.state.cart.subtotalPiastres).toBe(45000);
  expect(fixture.uploads).toHaveLength(1);
});

test('mobile keyboard dialog, quantity and variant state survive normal navigation; reload clearly requires fresh local files', async ({ page }) => {
  await mockCommerce(page, { product: { ...product, variants: [{ key: 'large', attributes: [{ name: 'Size', value: 'Large' }], priceApproved: true, pricePiastres: 50000, orderingAvailable: true, inventory: { mode: 'tracked', quantity: 3 } }] } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 320, height: 900 }); await page.goto(`/products/${product.slug}`);
  await page.getByLabel('Choose size / color').selectOption('large'); await page.getByLabel('Quantity', { exact: true }).fill('2');
  const opener = purchase(page).getByRole('button', { name: 'Customize This', exact: true }); await opener.click();
  await complete(page); await purchase(page).getByRole('button', { name: 'Edit', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/reloading the page clears/)).toBeVisible();
  for (const width of [1440, 768, 320]) { await page.setViewportSize({ width, height: 900 }); expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true); }
  await page.screenshot({ path: 'test-results/batch4a-customize-320.png' });
  const first = dialog.getByRole('button', { name: 'Close customize this' }), last = dialog.getByRole('button', { name: 'Save personalization' });
  await last.focus(); await page.keyboard.press('Tab'); await expect(first).toBeFocused(); await page.keyboard.press('Shift+Tab'); await expect(last).toBeFocused();
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(purchase(page).getByRole('button', { name: 'Edit', exact: true })).toBeFocused();
  await page.getByRole('link', { name: 'Shop', exact: true }).first().click(); await page.goBack();
  await expect(purchase(page).getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  await expect(page.getByLabel('Choose size / color')).toHaveValue('large'); await expect(page.getByLabel('Quantity', { exact: true })).toHaveValue('2');
  await page.reload(); await expect(purchase(page).getByRole('button', { name: 'Customize This', exact: true })).toBeVisible();
  await purchase(page).getByRole('button', { name: 'Customize This', exact: true }).click(); await expect(page.getByLabel(/^Name on your gift/)).toHaveValue('');
  expect(errors).toEqual([]);
});

test('lost add response retries one immutable operation and reuses verified uploads rather than duplicating quantity', async ({ page }) => {
  const fixture = await mockCommerce(page, { product }); const requests = [];
  await page.route('**/api/v1/commerce/cart/items', async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const input = route.request().postDataJSON(); requests.push(input);
    if (requests.length === 1) {
      fixture.state.cart = { items: [{ id: 'line-1', ...input, name: product.name, slug: product.slug, valid: true, unitPricePiastres: 45000, lineTotalPiastres: 45000 }], quantity: 1, subtotalPiastres: 45000 };
      return route.abort('failed');
    }
    expect(input).toEqual(requests[0]); return route.fulfill({ headers, json: { ok: true, data: { cart: fixture.state.cart } } });
  });
  await page.goto(`/products/${product.slug}`); await purchase(page).getByRole('button', { name: 'Customize This', exact: true }).click(); await complete(page);
  await purchase(page).getByRole('button', { name: 'Add to Cart', exact: true }).click();
  await expect(purchase(page).getByRole('button', { name: 'Retry same Add to Cart' })).toBeVisible();
  await expect(page.getByLabel('Quantity', { exact: true })).toBeDisabled();
  await purchase(page).getByRole('button', { name: 'Retry same Add to Cart' }).click();
  await expect.poll(() => requests.length).toBe(2); expect(fixture.uploads).toHaveLength(1); expect(fixture.state.cart.quantity).toBe(1);
});

test('failed verification keeps local selections for retry; unavailable and unapproved products stay enquiry-only', async ({ page }) => {
  const fixture = await mockCommerce(page, { product, failComplete: true });
  await page.goto(`/products/${product.slug}`); await purchase(page).getByRole('button', { name: 'Customize This', exact: true }).click(); await complete(page);
  await purchase(page).getByRole('button', { name: 'Add to Cart', exact: true }).click(); await expect(purchase(page).getByRole('alert')).toContainText('Upload verification failed');
  expect(fixture.state.cart.quantity).toBe(0); await purchase(page).getByRole('button', { name: 'Edit', exact: true }).click(); await expect(page.getByLabel(/^Name on your gift/)).toHaveValue('Alice');
  await page.keyboard.press('Escape');
  fixture.product.orderingAvailable = false; fixture.product.priceApproved = false; fixture.product.pricePiastres = null;
  await page.reload(); await expect(purchase(page).getByRole('link', { name: 'Enquire on WhatsApp' })).toBeVisible();
  await expect(purchase(page).getByRole('button', { name: 'Customize This' })).toHaveCount(0); await expect(purchase(page).getByRole('button', { name: 'Add to Cart' })).toHaveCount(0);
});

test('admin checkbox and friendly fields save with the loaded revision and never need a template or technical key input', async ({ page }) => {
  const fixture = await mockCatalog(page, { role: 'admin', adminProduct: { ...adminProduct, personalization: { ...adminProduct.personalization, fields: adminProduct.personalization.fields.map(field => field.type === 'image' ? { ...field, minFiles: 1, maxFiles: 1, maxBytes: 8388608, acceptedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'] } : field) } } });
  await page.goto(`/admin/products/${adminProduct._id}/edit`);
  await page.getByLabel('Requires Customization Before Purchase').check(); await page.getByRole('button', { name: 'Add customer field' }).click();
  await page.getByLabel('Customer-facing label', { exact: true }).last().fill('Printed name');
  await expect(page.getByLabel('Field key', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Save changes', exact: true }).click(); await expect(page.getByRole('status').filter({ hasText: 'Changes saved.' })).toBeVisible();
  const saved = fixture.saves.at(-1).payload;
  expect(saved.personalization.requiredBeforePurchase).toBe(true); expect(saved.personalization.fields.at(-1)).toMatchObject({ label: 'Printed name', required: true });
  expect(saved.expectedRevision).toBe(0); expect(saved).not.toHaveProperty('customization');
});

test('ordinary unchecked product keeps Add to Cart without opening a personalization dialog', async ({ page }) => {
  const fixture = await mockCommerce(page, { product: { ...commerceProduct, personalization: { requiredBeforePurchase: false, fields: [] } } });
  await page.goto(`/products/${commerceProduct.slug}`); await purchase(page).getByRole('button', { name: 'Add to Cart', exact: true }).click();
  await expect.poll(() => fixture.state.cart.quantity).toBe(1); await expect(page.getByRole('dialog')).toHaveCount(0); expect(fixture.uploads).toHaveLength(0);
});

test('legacy product navigation resolves to its permanent friendly path without changing personalization behavior', async ({ page }) => {
  await mockCommerce(page, { product: { ...product, publicPath: '/products/permanent-photo-gift' } });
  await page.goto(`/products/${product.slug}?campaign=fixture`);
  await expect(page).toHaveURL('/products/permanent-photo-gift?campaign=fixture');
  await purchase(page).getByRole('button', { name: 'Customize This', exact: true }).click(); await complete(page);
  await expect(purchase(page).getByRole('button', { name: 'Add to Cart', exact: true })).toBeEnabled();
});

test('completed files are reused after a later image fails, and account changes erase the previous private draft', async ({ page }) => {
  const fixture = await mockCommerce(page, { product: { ...product, personalization: { requiredBeforePurchase: true, fields: [{ ...fields[0], minFiles: 2 }] } } });
  let attempts = 0;
  await page.route('**/api/v1/commerce/uploads/*/complete', route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    attempts++;
    return route.fulfill({ status: attempts === 2 ? 400 : 200, headers, json: attempts === 2 ? { ok: false, error: { message: 'Second image verification failed' } } : { ok: true, data: { upload: {} } } });
  });
  await page.goto(`/products/${product.slug}`); await purchase(page).getByRole('button', { name: 'Customize This', exact: true }).click();
  await chooseImageFiles(page, page, /^Your photo/, [isolatedImageFile('first.png'), isolatedImageFile('second.png')]);
  await page.getByRole('button', { name: 'Save personalization' }).click(); await purchase(page).getByRole('button', { name: 'Add to Cart', exact: true }).click();
  await expect(purchase(page).getByRole('alert')).toContainText('Second image verification failed');
  await purchase(page).getByRole('button', { name: 'Add to Cart', exact: true }).click(); await expect.poll(() => fixture.state.cart.quantity).toBe(1);
  expect(fixture.uploads).toHaveLength(3); // First successful image was not uploaded again.
  fixture.state.user = { id: '710000000000000000000050', name: 'Different customer', role: 'customer' };
  await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'tap-wrap-session-change' })));
  await expect(purchase(page).getByRole('button', { name: 'Customize This', exact: true })).toBeVisible();
  await purchase(page).getByRole('button', { name: 'Customize This', exact: true }).click(); await expect(page.getByRole('dialog').locator('.commerce-file-previews')).toHaveCount(0);
});

test('returning while Add to Cart is in flight observes the same pending operation and its confirmed result', async ({ page }) => {
  const fixture = await mockCommerce(page, { product });
  let release, started = false;
  const pending = new Promise(resolve => { release = resolve; });
  await page.route('**/api/v1/commerce/cart/items', async route => {
    if (route.request().method() === 'OPTIONS') return route.fallback();
    started = true; await pending; return route.fallback();
  });
  await page.goto(`/products/${product.slug}`); await purchase(page).getByRole('button', { name: 'Customize This', exact: true }).click(); await complete(page);
  await purchase(page).getByRole('button', { name: 'Add to Cart', exact: true }).click(); await expect.poll(() => started).toBe(true);
  await page.getByRole('link', { name: 'Shop', exact: true }).first().click(); await page.goBack();
  await expect(purchase(page).getByRole('button', { name: 'Adding…', exact: true })).toBeDisabled(); release();
  await expect(purchase(page).getByRole('button', { name: 'Add to Cart', exact: true })).toBeEnabled();
  expect(fixture.state.cart.quantity).toBe(1); expect(fixture.calls.filter(call => call.path === '/commerce/cart/items' && call.method === 'POST')).toHaveLength(1);
});
