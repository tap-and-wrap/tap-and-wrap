import { chooseImageFiles } from './media-helpers.js';
import { expect, test } from '@playwright/test';
import { cartWithProduct, commerceOrder, commerceProduct, commerceTemplate, fillCheckout, isolatedImageFile, mockCommerce } from './commerce-fixtures';

const browserErrors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const errors = [];
  browserErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(async ({ page }) => { expect(browserErrors.get(page) || []).toEqual([]); });

// Request-first test transport: isolated API fixtures, never a merchant service.
async function offerIsolatedRequests(page, { products = [], components = [] } = {}) {
  const submissions = [];
  const headers = { 'access-control-allow-origin': 'http://127.0.0.1:5191', 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type,x-csrf-token', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
  await page.route('**/api/v1/**/service-requests**', async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const reply = data => route.fulfill({ headers, json: { ok: true, data } });
    if (path.includes('/options/')) return reply({ intakeEnabled: true, products, components, page: 1, hasNext: false });
    if (path.includes('/submissions/')) return reply({ request: null });
    if (path.endsWith('/commerce/service-requests') && method === 'POST') {
      const payload = route.request().postDataJSON(); submissions.push(payload);
      return reply({ request: { id: '710000000000000000000090', reference: 'TW-TEST-NOPAYMENT', service: payload.service, state: 'submitted' } });
    }
    return route.fallback();
  });
  return submissions;
}
async function fillIsolatedRequestContact(page) {
  await page.getByLabel('Your name', { exact: true }).fill('Isolated Customer');
  await page.getByLabel('Egyptian WhatsApp number').fill('01012345678');
}
const eligibleEngravingProduct = { id: commerceProduct._id, name: commerceProduct.name, variants: [], basePricePiastres: null,
  engraving: { fonts: ['Approved style'], placements: ['Front'], materials: ['Approved material'], maxTextLength: 120 } };

test('successful product-card adds update the real cart, survive refresh, and support quantity/remove', async ({ page }) => {
  const fixture = await mockCommerce(page);
  await page.goto('/shop');
  await page.getByRole('button', { name: `Add to Cart: ${commerceProduct.name}`, exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Added to your cart.' })).toBeVisible();
  await expect.poll(() => fixture.state.cart.quantity).toBe(1);
  await page.getByRole('link', { name: /^Cart(?:,|$)/ }).click();
  await expect(page.getByRole('heading', { name: 'Your Cart', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: commerceProduct.name, exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: commerceProduct.name, exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: /^Quantity/ }).selectOption('3');
  await expect.poll(() => fixture.state.cart.quantity).toBe(3);
  await page.getByRole('button', { name: `Remove ${commerceProduct.name}`, exact: true }).click();
  await expect(page.getByText('Your cart is empty.', { exact: true })).toBeVisible();
});

test('required photos stay local until Add to Cart and distinct photo sets produce separate entries', async ({ page }) => {
  const product = { ...commerceProduct, requiresOptions: true, personalization: { fields: [{ key: 'photos', label: 'Your photos', type: 'image', required: true, minFiles: 2, maxFiles: 2, maxBytes: 8 * 1024 * 1024, acceptedMimeTypes: ['image/png'] }, { key: 'message', label: 'Gift message', type: 'short_text', required: true, maxLength: 40 }] } };
  const fixture = await mockCommerce(page, { product });
  await page.goto(`/products/${product.slug}`);
  await chooseImageFiles(page, page, 'Your photos', [isolatedImageFile('first.png')]);
  await page.getByLabel('Gift message', { exact: false }).fill('First gift');
  expect(fixture.uploads).toHaveLength(0);
  expect(fixture.calls.filter((call) => call.path === '/direct-upload')).toHaveLength(0);
  await page.getByRole('button', { name: 'Add to Cart', exact: true }).first().click();
  await expect(page.getByText('Choose exactly 2 files.', { exact: true })).toBeVisible();
  expect(fixture.calls.filter((call) => call.path === '/commerce/cart/items')).toHaveLength(0);
  await chooseImageFiles(page, page, 'Your photos', [isolatedImageFile('first.png'), isolatedImageFile('second.png')]);
  await page.getByRole('button', { name: 'Add to Cart', exact: true }).first().click();
  await expect.poll(() => fixture.uploads.length).toBe(2);
  await expect.poll(() => fixture.state.cart.items.length).toBe(1);
  await chooseImageFiles(page, page, 'Your photos', [isolatedImageFile('third.png'), isolatedImageFile('fourth.png')]);
  await page.getByLabel('Gift message', { exact: false }).fill('Another gift');
  await page.getByRole('button', { name: 'Add to Cart', exact: true }).first().click();
  await expect.poll(() => fixture.state.cart.items.length).toBe(2);
  expect(fixture.state.cart.items[0].personalization.photos).not.toEqual(fixture.state.cart.items[1].personalization.photos);
});

test('unavailable storage prevents personalized cart adds and never reports a fake success', async ({ page }) => {
  const product = { ...commerceProduct, requiresOptions: true, personalization: { fields: [{ key: 'photo', label: 'Customer photo', type: 'image', required: true, minFiles: 1, maxFiles: 1, acceptedMimeTypes: ['image/png'] }] } };
  const fixture = await mockCommerce(page, { product, storageUnavailable: true });
  await page.goto(`/products/${product.slug}`);
  await chooseImageFiles(page, page, 'Customer photo', isolatedImageFile());
  expect(fixture.uploads).toHaveLength(0);
  await page.getByRole('button', { name: 'Add to Cart', exact: true }).first().click();
  await expect(page.getByText('Private storage is not configured. No file was uploaded.', { exact: true }).first()).toBeVisible();
  expect(fixture.state.cart.items).toHaveLength(0);
  expect(fixture.calls.filter((call) => call.path === '/commerce/cart/items')).toHaveLength(0);
  await expect(page.getByText('Added to your cart.', { exact: true })).toHaveCount(0);
});

test('failed direct uploads are discarded without adding a cart item', async ({ page }) => {
  const product = { ...commerceProduct, requiresOptions: true, personalization: { fields: [{ key: 'photo', label: 'Customer photo', type: 'image', required: true, minFiles: 1, maxFiles: 1 }] } };
  const fixture = await mockCommerce(page, { product, failDirectUpload: true });
  await page.goto(`/products/${product.slug}`);
  await chooseImageFiles(page, page, 'Customer photo', isolatedImageFile());
  await page.getByRole('button', { name: 'Add to Cart', exact: true }).first().click();
  await expect.poll(() => fixture.calls.some((call) => call.method === 'DELETE' && call.path.startsWith('/commerce/uploads/'))).toBe(true);
  expect(fixture.state.cart.items).toHaveLength(0);
});

test('Gift Box submits a component quotation request without cart or fabricated price', async ({ page }) => {
  const fixture = await mockCommerce(page);
  const components = [{ componentId: '710000000000000000000030', name: 'Configured Card', pricing: 'pending', unitPricePiastres: null, imageUrl: null }];
  const requests = await offerIsolatedRequests(page, { components });
  await page.goto('/customize/gift-box');
  await page.getByLabel('Occasion', { exact: true }).fill('Birthday');
  await page.getByLabel('Desired contents').fill('Flowers and a thoughtful handwritten card');
  await page.getByLabel('Configured Card', { exact: true }).check();
  await expect(page.getByText('Price to be confirmed', { exact: true })).toBeVisible();
  await fillIsolatedRequestContact(page);
  await page.getByRole('button', { name: 'Submit request · No payment now' }).click();
  await expect(page.getByRole('heading', { name: 'TW-TEST-NOPAYMENT' })).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(requests[0].components).toEqual([{ componentId: components[0].componentId, quantity: 1 }]);
  expect(requests[0]).not.toHaveProperty('pricePiastres');
  expect(fixture.state.cart.items).toHaveLength(0);
  expect(fixture.orders).toHaveLength(0);
});

test('engraving requests use only merchant-configured product choices and submit exact text', async ({ page }) => {
  const fixture = await mockCommerce(page);
  const requests = await offerIsolatedRequests(page, { products: [eligibleEngravingProduct] });
  await page.goto('/customize/laser-engraving');
  await page.getByLabel('Product to engrave').selectOption(eligibleEngravingProduct.id);
  await expect(page.getByLabel('Product to engrave')).toHaveValue(eligibleEngravingProduct.id);
  // A selected eligible product must suppress the manual-reference fallback
  // and reveal exactly the merchant-provided font, placement and material.
  await expect(page.getByLabel('Item description or product reference')).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: /^Font/ })).toBeVisible();
  await expect(page.getByRole('combobox', { name: /^Font/ }).locator('option')).toContainText(['Choose an approved option', 'Approved style']);
  await page.getByLabel('Engraving type').selectOption('text');
  await page.getByLabel('Engraving text').fill('A thoughtful gift');
  await page.getByRole('combobox', { name: /^Font/ }).selectOption('Approved style');
  await page.getByLabel('Engraving placement').selectOption('Front');
  await page.getByLabel('Material').selectOption('Approved material');
  await fillIsolatedRequestContact(page);
  await page.getByRole('button', { name: 'Submit request · No payment now' }).click();
  await expect(page.getByRole('heading', { name: 'TW-TEST-NOPAYMENT' })).toBeVisible();
  expect(requests[0].details).toMatchObject({ engravingType: 'text', engravingText: 'A thoughtful gift', productId: eligibleEngravingProduct.id, font: 'Approved style', placement: 'Front', material: 'Approved material' });
  expect(fixture.state.cart.items).toHaveLength(0);
});

test('normalized engraving DTO renders one control and uploads each artwork file once', async ({ page }) => {
  const template = { ...commerceTemplate, kind: 'laser_engraving', groups: [], engraving: { textRequired: true, maxChars: 50, allowedTextLines: 1, maxCharsPerLine: 50, materials: [{ key: 'metal', label: 'Approved metal', active: true, adjustmentPiastres: 0 }], fonts: [{ key: 'style', label: 'Approved style', active: true, adjustmentPiastres: 0 }], placements: [], artworkAllowed: true, artworkRequired: true, artworkMaxFiles: 2, artworkMaxBytes: 5242880, artworkAcceptedMimeTypes: ['image/png'] } };
  const fixture = await mockCommerce(page, { template });
  await page.goto(`/products/${commerceProduct.slug}/customize`);
  await page.getByRole('radio', { name: 'Name / Text' }).check();
  await expect(page.getByLabel('Name or text to engrave')).toHaveCount(1);
  await expect(page.getByRole('combobox', { name: /^Material/ })).toHaveCount(1);
  await expect(page.getByRole('combobox', { name: /^Font/ })).toHaveCount(1);
  await expect(page.getByLabel('Engraving artwork', { exact: false })).toHaveCount(1);
  await page.getByRole('radio', { name: 'Name / Text' }).check();
  await page.getByLabel('Name or text to engrave').fill('A thoughtful gift');
  await page.getByRole('combobox', { name: /^Material/ }).selectOption('metal');
  await page.getByRole('combobox', { name: /^Font/ }).selectOption('style');
  await chooseImageFiles(page, page, 'Engraving artwork', [isolatedImageFile('first.png'), isolatedImageFile('second.png')]);
  expect(fixture.uploads).toHaveLength(0);
  await expect(page.getByRole('button', { name: 'Add to Cart', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Add to Cart', exact: true }).click();
  await expect.poll(() => fixture.state.cart.items.length).toBe(1);
  expect(fixture.uploads).toHaveLength(2);
  expect(fixture.calls.filter((call) => call.path === '/direct-upload')).toHaveLength(2);
  expect(fixture.state.cart.items[0].customization.fields.engraving_artwork).toEqual(fixture.uploads.map((upload) => upload.id));
  expect(fixture.calls.filter((call) => call.method === 'DELETE' && call.path.startsWith('/commerce/uploads/'))).toHaveLength(0);
});

test('manual engraving Other requires a written explanation and records the request type', async ({ page }) => {
  const fixture = await mockCommerce(page);
  const requests = await offerIsolatedRequests(page);
  await page.goto('/customize/laser-engraving');
  await page.getByLabel('Item description or product reference').fill('Owner must confirm engraving suitability');
  await page.getByLabel('Engraving type').selectOption('other');
  await fillIsolatedRequestContact(page);
  await expect(page.getByLabel('Additional instructions')).toHaveAttribute('required', '');
  await page.getByRole('button', { name: 'Submit request · No payment now' }).click();
  expect(requests).toHaveLength(0);
  await page.getByLabel('Additional instructions').fill('Engrave a family symbol');
  await page.getByRole('button', { name: 'Submit request · No payment now' }).click();
  await expect(page.getByRole('heading', { name: 'TW-TEST-NOPAYMENT' })).toBeVisible();
  expect(requests[0].details).toMatchObject({ engravingType: 'other', instructions: 'Engrave a family symbol' });
  expect(fixture.state.cart.items).toHaveLength(0);
});

test('manual engraving Design stores private reference images against a request, not a cart', async ({ page }) => {
  const fixture = await mockCommerce(page);
  const requests = await offerIsolatedRequests(page);
  await page.goto('/customize/laser-engraving');
  await page.getByLabel('Item description or product reference').fill('Metal plaque with owner-confirmed artwork later');
  await page.getByLabel('Engraving type').selectOption('design');
  await fillIsolatedRequestContact(page);
  await chooseImageFiles(page, page, 'Reference images / artwork', isolatedImageFile('design.png'));
  expect(fixture.uploads).toHaveLength(0);
  await page.getByRole('button', { name: 'Submit request · No payment now' }).click();
  await expect(page.getByRole('heading', { name: 'TW-TEST-NOPAYMENT' })).toBeVisible();
  expect(requests[0].details.engravingType).toBe('design');
  expect(requests[0].uploadIds).toHaveLength(1);
  expect(fixture.uploads).toHaveLength(1);
  expect(fixture.state.cart.items).toHaveLength(0);
});

test('duplicate upload definitions fail before signing or transferring any file', async ({ page }) => {
  const fixture = await mockCommerce(page);
  await page.goto('/shop');
  await expect(page.getByRole('heading', { level: 1, name: 'Shop' })).toBeVisible();
  const failure = await page.evaluate(async () => {
    const { uploadConfiguredFields } = await import('/src/commerce/api.js');
    try { await uploadConfiguredFields({ artwork: [new File(['fixture'], 'fixture.png', { type: 'image/png' })] }, [{ key: 'artwork', type: 'image' }, { key: 'artwork', type: 'image' }], { productId: '710000000000000000000001' }, []); }
    catch (error) { return error.message; }
    return 'unexpected success';
  });
  expect(failure).toContain('duplicate fields');
  expect(fixture.uploads).toHaveLength(0);
});

test('stale customization editor retains its draft and reloads only after confirmation', async ({ page }) => {
  const fixture = await mockCommerce(page, { role: 'admin', template: { ...commerceTemplate, kind: 'generic', status: 'draft', active: false, revision: 0 } });
  await page.goto('/admin/commerce/templates');
  await page.getByRole('button', { name: `Edit ${commerceTemplate.name}`, exact: true }).click();
  await page.getByLabel('Template name', { exact: true }).fill('My unsaved rules');
  fixture.state.template.name = 'Other editor rules'; fixture.state.template.revision = 1;
  await page.getByRole('button', { name: 'Save configuration', exact: true }).click();
  await expect(page.getByText('This record changed after you opened it. Your changes were not saved.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Template name', { exact: true })).toHaveValue('My unsaved rules');
  await page.getByRole('button', { name: 'Reload latest record', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm reload and discard draft', exact: true }).click();
  await expect(page.getByLabel('Template name', { exact: true })).toHaveValue('Other editor rules');
  await page.getByLabel('Template name', { exact: true }).fill('Reviewed configuration');
  await page.getByRole('button', { name: 'Save configuration', exact: true }).click();
  await expect(page.getByText('Configuration saved.', { exact: true })).toBeVisible();
  const calls = fixture.calls.filter((call) => call.method === 'PATCH' && call.path.includes('/templates/'));
  expect(calls.map((call) => call.body.expectedRevision)).toEqual([0, 1]);
});

for (const [section, field, record, label] of [
  ['components', 'component', { _id: '710000000000000000000030', name: 'Component revision fixture', revision: 0, categoryId: commerceProduct.category._id, subcategoryId: null, description: '', pricePiastres: 5000, compareAtPiastres: null, priceApproved: false, enabledForCustomization: false, configurationApproved: false, reviewRequired: true, requestPolicy: { enabled: false, services: [], availability: 'unconfirmed', pricing: 'pending', unitPricePiastres: null }, inventory: { mode: 'tracked', quantity: 10, approved: false, available: true } }, 'Component name'],
  ['bundles', 'bundle', { _id: '710000000000000000000060', name: 'Bundle revision fixture', revision: 0, description: '', active: false, published: false, items: [{ productId: commerceProduct._id, quantity: 1, variantKey: null }, { productId: '710000000000000000000002', quantity: 1, variantKey: null }], discountKind: 'fixed', discountValue: 100, maxApplications: 1, priority: 0, startsAt: null, endsAt: null }, 'Bundle name'],
  ['discounts', 'discount', { _id: '710000000000000000000060', name: 'Discount revision fixture', revision: 0, code: 'REVISION', active: false, kind: 'fixed', value: 100, minimumSubtotalPiastres: 0, maximumDiscountPiastres: null, productIds: [], categoryIds: [], authenticatedOnly: false, stackWithBundles: false, startsAt: null, endsAt: null, usageLimit: null, perCustomerLimit: null }, 'Discount name'],
]) {
  test(`stale ${section} editor retains its merchant draft and submits the latest revision after reload`, async ({ page }) => {
    const fixture = await mockCommerce(page, { role: 'admin', [field]: record });
    await page.goto(`/admin/commerce/${section}`);
    await page.getByRole('button', { name: `Edit ${record.name}`, exact: true }).click();
    await page.getByLabel(label, { exact: true }).fill('My unsaved merchant edit');
    fixture.state[field].name = 'Other editor saved record'; fixture.state[field].revision = 1;
    await page.getByRole('button', { name: 'Save configuration', exact: true }).click();
    await expect(page.getByText('This record changed after you opened it. Your changes were not saved.', { exact: true })).toBeVisible();
    await expect(page.getByLabel(label, { exact: true })).toHaveValue('My unsaved merchant edit');
    expect(fixture.state[field].name).toBe('Other editor saved record');
    await page.getByRole('button', { name: 'Reload latest record', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm reload and discard draft', exact: true }).click();
    await expect(page.getByLabel(label, { exact: true })).toHaveValue('Other editor saved record');
    await page.getByLabel(label, { exact: true }).fill('Reviewed latest merchant edit');
    await page.getByRole('button', { name: 'Save configuration', exact: true }).click();
    await expect(page.getByText('Configuration saved.', { exact: true })).toBeVisible();
    expect(fixture.calls.filter((call) => call.method === 'PATCH' && call.path.startsWith(`/admin/commerce/${section}/`)).map((call) => call.body.expectedRevision)).toEqual([0, 1]);
  });
}

test('retired global delivery-rate editor cannot silently approve or save charges', async ({ page }) => {
  const fixture = await mockCommerce(page, { role: 'admin' });
  await page.goto('/admin/commerce/shipping');
  await expect(page.getByRole('heading', { name: 'Delivery is confirmed per order' })).toBeVisible();
  await expect(page.getByLabel('Cairo and Giza shipping (EGP)', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Manage orders and delivery' })).toHaveAttribute('href', '/admin/commerce/orders');
  expect(fixture.calls.filter(call => call.path === '/admin/commerce/shipping' && call.method === 'PATCH')).toHaveLength(0);
});

test('purchase-configuration editor preserves requirements on conflict and uses the deliberate reloaded revision', async ({ page }) => {
  const product = { ...commerceProduct, revision: 0, personalization: { fields: [{ key: 'gift-name', label: 'Initial requirement', type: 'short_text', required: false, maxLength: 120, minFiles: 0, maxFiles: 1, maxBytes: 5242880, acceptedMimeTypes: ['image/png'] }] }, customization: { enabled: false, templateId: null, serviceKind: null, serviceEntryEligible: false } };
  const fixture = await mockCommerce(page, { role: 'admin', product });
  await page.goto(`/admin/products/${product._id}/configuration`);
  await page.getByLabel('Customer-facing label', { exact: true }).fill('My unsaved requirement');
  fixture.product.personalization.fields[0].label = 'Other editor requirement'; fixture.product.revision = 1;
  await page.getByRole('button', { name: 'Save purchase configuration', exact: true }).click();
  await expect(page.getByText('This record changed after you opened it. Your changes were not saved.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Customer-facing label', { exact: true })).toHaveValue('My unsaved requirement');
  await page.getByRole('button', { name: 'Reload latest record', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm reload and discard draft', exact: true }).click();
  await expect(page.getByLabel('Customer-facing label', { exact: true })).toHaveValue('Other editor requirement');
  await page.getByLabel('Customer-facing label', { exact: true }).fill('Reviewed latest requirement');
  await page.getByRole('button', { name: 'Save purchase configuration', exact: true }).click();
  await expect(page.getByText('Product configuration saved.', { exact: true })).toBeVisible();
  expect(fixture.calls.filter((call) => call.method === 'PATCH' && call.path.endsWith('/configuration')).map((call) => call.body.expectedRevision)).toEqual([0, 1]);
});

test('personalization controls count Unicode characters and reject overflow without truncating valid emoji', async ({ page }) => {
  const product = { ...commerceProduct, requiresOptions: true, personalization: { fields: [{ key: 'gift-message', label: 'Gift message', type: 'short_text', required: true, maxLength: 2 }] } };
  const fixture = await mockCommerce(page, { product });
  await page.goto(`/products/${product.slug}`);
  await page.getByLabel('Gift message', { exact: false }).fill('🎁🎁');
  await expect(page.getByText('2/2 characters', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add to Cart', exact: true }).first().click();
  await expect.poll(() => fixture.state.cart.items.length).toBe(1);
  expect(fixture.state.cart.items[0].personalization['gift-message']).toBe('🎁🎁');
  await page.getByLabel('Gift message', { exact: false }).fill('abc');
  await page.getByRole('button', { name: 'Add to Cart', exact: true }).first().click();
  await expect(page.getByText('This text exceeds the character limit.', { exact: true })).toBeVisible();
  expect(fixture.calls.filter((call) => call.path === '/commerce/cart/items')).toHaveLength(1);
});

test('template editor uses supported option fields and exact configured input boundaries', async ({ page }) => {
  const template = { ...commerceTemplate, kind: 'laser_engraving', status: 'draft', revision: 0, active: false, engraving: { maxChars: 500, maxCharsPerLine: 500, allowedTextLines: 1, textRequired: true, artworkAllowed: true, artworkRequired: false, artworkMaxFiles: 5, artworkMaxBytes: 12345, artworkAcceptedMimeTypes: ['image/png'], materials: [], fonts: [], placements: [], baseAdjustmentPiastres: 0 } };
  const fixture = await mockCommerce(page, { role: 'admin', template });
  await page.goto('/admin/commerce/templates');
  await page.getByRole('button', { name: `Edit ${template.name}`, exact: true }).click();
  await expect(page.getByLabel('Available', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Maximum quantity', { exact: true }).first()).toHaveAttribute('max', '20');
  await expect(page.getByLabel('Maximum characters', { exact: true })).toHaveAttribute('max', '500');
  await expect(page.getByLabel('Maximum artwork files', { exact: true })).toHaveAttribute('max', '5');
  await expect(page.getByLabel('Maximum artwork size (bytes; 1048576 = 1 MB)', { exact: true })).toHaveValue('12345');
  await page.getByLabel('Base adjustment (EGP)', { exact: true }).fill('12.');
  await expect(page.getByLabel('Base adjustment (EGP)', { exact: true })).toHaveValue('12.');
  await page.getByLabel('Base adjustment (EGP)', { exact: true }).fill('12.345');
  await page.getByRole('button', { name: 'Save configuration', exact: true }).click();
  expect(fixture.calls.filter((call) => call.method === 'PATCH')).toHaveLength(0);
  await page.getByLabel('Base adjustment (EGP)', { exact: true }).fill('12.34');
  await page.getByRole('button', { name: 'Save configuration', exact: true }).click();
  await expect(page.getByText('Configuration saved.', { exact: true })).toBeVisible();
  const patch = fixture.calls.find((call) => call.method === 'PATCH').body;
  expect(patch.baseAdjustmentPiastres).toBe(1234);
  expect(patch.engraving.artworkMaxBytes).toBe(12345);
  expect(patch.groups.flatMap((group) => group.options).every((option) => !Object.hasOwn(option, 'available'))).toBe(true);
});

test('Customize This preserves original configured selections and locks unsupported changes', async ({ page }) => {
  const template = structuredClone(commerceTemplate);
  template.kind = 'tray'; template.groups[0].allowedActions = []; template.groups[0].options[0].defaultQuantity = 1;
  const fixture = await mockCommerce(page, { template });
  await page.goto(`/products/${commerceProduct.slug}/customize`);
  await expect(page.getByLabel('Configured Card', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Configured Card', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Add to Cart', exact: true }).click();
  await expect.poll(() => fixture.state.cart.items.length).toBe(1);
  expect(fixture.state.cart.items[0].customization.selections[0].quantity).toBe(1);
});

test('global checkout disable blocks submission and upload activity', async ({ page }) => {
  const fixture = await mockCommerce(page, { cart: cartWithProduct() });
  await page.goto('/checkout');
  await expect(page.getByRole('heading', { name: 'Ordering is not enabled yet', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Place Order', exact: true })).toHaveCount(0);
  expect(fixture.calls.filter((call) => call.path === '/commerce/orders' && call.method === 'POST')).toHaveLength(0);
  expect(fixture.uploads).toHaveLength(0);
});

test('COD checkout quotes shipping and discount server-side then confirms one unpaid order', async ({ page }) => {
  const fixture = await mockCommerce(page, { checkoutEnabled: true, cart: cartWithProduct() });
  await page.goto('/checkout');
  await fillCheckout(page);
  await page.getByLabel('Discount code', { exact: true }).fill('ISOLATED');
  await page.getByRole('button', { name: 'Apply code', exact: true }).click();
  await expect.poll(() => fixture.calls.some((call) => call.path === '/commerce/checkout/quote' && call.body.discountCode === 'ISOLATED')).toBe(true);
  await expect(page.getByRole('button', { name: 'Place Order', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Place Order', exact: true }).click();
  await expect(page.getByRole('heading', { name: `Order #${commerceOrder.orderNumber}`, exact: true })).toBeVisible();
  expect(fixture.orders).toHaveLength(1);
  expect(fixture.orders[0].paymentState).toBe('unpaid');
  expect(fixture.calls.find((call) => call.path === '/commerce/orders' && call.method === 'POST').body).not.toHaveProperty('totalPiastres');
  expect(fixture.uploads).toHaveLength(0);
});

test('InstaPay cannot collect proof or instruct a transfer before order creation', async ({ page }) => {
  const fixture = await mockCommerce(page, { checkoutEnabled: true, cart: cartWithProduct() });
  await page.goto('/checkout'); await fillCheckout(page);
  await page.getByLabel('InstaPay — full payment', { exact: true }).check();
  await expect(page.getByText(/Place your order first/)).toBeVisible();
  await expect(page.getByRole('button', { name: /InstaPay payment proof/ })).toHaveCount(0);
  await expect(page.getByText('01060673073', { exact: true })).toHaveCount(0);
  expect(fixture.uploads).toHaveLength(0);
  await page.getByRole('button', { name: 'Place Order', exact: true }).click();
  await expect(page.getByRole('heading', { name: `Order #${commerceOrder.orderNumber}` })).toBeVisible();
  expect(fixture.orders).toHaveLength(1);
  expect(fixture.calls.find(call => call.path === '/commerce/orders' && call.method === 'POST').body).not.toHaveProperty('paymentProofId');
  expect(fixture.uploads).toHaveLength(0);
});

test('failed InstaPay order retries the identical owner-bound request without pre-order proof', async ({ page }) => {
  const options = { checkoutEnabled: true, cart: cartWithProduct(), rejectOrder: true };
  const fixture = await mockCommerce(page, options);
  await page.goto('/checkout'); await fillCheckout(page);
  await page.getByLabel('InstaPay — full payment', { exact: true }).check();
  await expect(page.getByRole('button', { name: /InstaPay payment proof/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Place Order', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Check your order submission' })).toBeVisible();
  expect(fixture.orders).toHaveLength(0);
  expect(fixture.uploads).toHaveLength(0);
  options.rejectOrder = false;
  await page.getByRole('button', { name: 'Retry same submission', exact: true }).click();
  await expect(page.getByRole('heading', { name: `Order #${commerceOrder.orderNumber}` })).toBeVisible();
  const requests = fixture.calls.filter(call => call.path === '/commerce/orders' && call.method === 'POST');
  expect(requests).toHaveLength(2);
  expect(requests[0].body).toEqual(requests[1].body);
  expect(requests[0].body).not.toHaveProperty('paymentProofId');
  expect(fixture.uploads).toHaveLength(0);
  expect(fixture.orders).toHaveLength(1);
});

test('admin proof is fetched only on request and viewed in an accessible in-page dialog', async ({ page }) => {
  const fixture = await mockCommerce(page, { role: 'admin', order: { ...commerceOrder, proofAvailable: true, paymentMethod: 'instapay', paymentState: 'awaiting_verification' } });
  await page.goto(`/admin/commerce/orders/${commerceOrder.id}`);
  await expect(page.getByRole('button', { name: 'View Proof', exact: true })).toBeVisible();
  expect(fixture.calls.some((call) => call.path.endsWith('/proof'))).toBe(false);
  await page.getByRole('button', { name: 'View Proof', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'InstaPay payment proof', exact: true })).toBeVisible();
  expect(fixture.calls.filter((call) => call.path.endsWith('/proof'))).toHaveLength(1);
  await expect(page.getByRole('img', { name: 'InstaPay payment proof', exact: true })).toHaveAttribute('src', /^blob:/);
  await expect.poll(() => page.getByRole('img', { name: 'InstaPay payment proof', exact: true }).evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'View Proof', exact: true })).toBeFocused();
  await page.getByRole('combobox', { name: /^Payment update/ }).selectOption('paid');
  await page.getByRole('button', { name: 'Save order update', exact: true }).click();
  await expect.poll(() => fixture.state.order.paymentState).toBe('paid');
});

test('customer sessions cannot open admin commerce pages or fetch private receipts', async ({ page }) => {
  const fixture = await mockCommerce(page, { role: 'customer', order: { ...commerceOrder, proofAvailable: true } });
  await page.goto(`/admin/commerce/orders/${commerceOrder.id}`);
  await expect(page.getByRole('button', { name: 'View Proof', exact: true })).toHaveCount(0);
  await expect.poll(() => fixture.calls.some((call) => call.path === '/auth/me')).toBe(true);
  expect(fixture.calls.some((call) => call.path.startsWith('/admin/commerce/orders/'))).toBe(false);
});

test('tracking uses number and checkout phone with a privacy-limited result', async ({ page }) => {
  const fixture = await mockCommerce(page);
  await page.goto('/track-order');
  await page.getByLabel('Order number', { exact: true }).fill(commerceOrder.orderNumber);
  await page.getByLabel('Checkout phone number', { exact: true }).fill('01012345678');
  await page.getByRole('button', { name: 'Track Order', exact: true }).click();
  await expect(page.getByRole('heading', { name: `Order #${commerceOrder.orderNumber}`, exact: true })).toBeVisible();
  await expect(page.getByText(commerceOrder.customer.address, { exact: true })).toHaveCount(0);
  expect(fixture.calls.find((call) => call.path === '/commerce/orders/track').body).toEqual({ orderNumber: commerceOrder.orderNumber, phone: '01012345678' });
});

test('admin template questions save without manual approval and delivery remains confirmed per order', async ({ page }) => {
  const fixture = await mockCommerce(page, { role: 'admin' });
  await page.goto('/admin/commerce/templates'); await page.getByRole('button', { name: 'Add template', exact: true }).click();
  await page.getByLabel('Template name', { exact: true }).fill('Isolated Gift Questions');
  await expect(page.getByLabel('Stable key', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Add requirement field', exact: true }).click();
  await page.getByLabel('Customer-facing label', { exact: true }).fill('Card message');
  await page.getByRole('button', { name: 'Save configuration', exact: true }).click();
  await expect(page.getByText('Configuration saved.', { exact: true })).toBeVisible();
  const saved = fixture.calls.find(call => call.path === '/admin/commerce/templates' && call.method === 'POST').body;
  expect(saved).toMatchObject({ ownerWorkflow: true, usage: 'enquiry', kind: 'gift_box', fields: [{ label: 'Card message', type: 'text' }] });
  expect(saved.fields[0].key).toMatch(/^field_/);
  await page.getByRole('link', { name: 'Shipping', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Delivery is confirmed per order', exact: true })).toBeVisible();
  expect(fixture.calls.some(call => call.path === '/admin/commerce/shipping' && call.method === 'PATCH')).toBe(false);
});

test('admin component business fields preserve stock safeguards without approval clicks', async ({ page }) => {
  const fixture = await mockCommerce(page, { role: 'admin' });
  await page.goto('/admin/commerce/components'); await page.getByRole('button', { name: 'Edit Configured Card', exact: true }).click();
  await page.getByLabel('Gift Box requests', { exact: true }).check();
  await page.getByRole('combobox', { name: 'Request availability', exact: true }).selectOption('available');
  await page.getByRole('combobox', { name: 'Request pricing', exact: true }).selectOption('fixed');
  await page.getByLabel('Confirmed request unit price (EGP)').fill('50');
  await page.getByRole('combobox', { name: 'Inventory availability', exact: true }).selectOption('made_to_order');
  for (const label of ['Price approved', 'Configuration approved', 'Catalog review resolved']) await expect(page.getByLabel(label, { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Save configuration', exact: true }).click();
  await expect(page.getByText('Configuration saved.', { exact: true })).toBeVisible();
  const change = fixture.calls.find(call => call.method === 'PATCH' && call.path.startsWith('/admin/commerce/components/'));
  expect(change.body).toMatchObject({ ownerWorkflow: true, requestPolicy: { enabled: true, services: ['gift_box'], availability: 'available', pricing: 'fixed', unitPricePiastres: 5000 }, inventory: { mode: 'made_to_order', quantity: null, approved: true, available: true } });
  expect(change.body).not.toHaveProperty('catalogRole'); expect(change.body).not.toHaveProperty('externalCatalogId');
});

test('admin bundle and discount forms preserve integer prices and stacking restrictions', async ({ page }) => {
  const fixture = await mockCommerce(page, { role: 'admin' });
  await page.goto('/admin/commerce/bundles');
  await page.getByRole('button', { name: 'Add bundle', exact: true }).click();
  await page.getByLabel('Bundle name', { exact: true }).fill('Isolated Pair');
  await page.getByLabel('Fixed discount (EGP)', { exact: true }).fill('15');
  await page.getByRole('button', { name: 'Add bundle product', exact: true }).click();
  await page.getByRole('combobox', { name: /^Product/ }).selectOption(commerceProduct._id);
  await page.getByLabel('Required quantity', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Save configuration', exact: true }).click();
  await expect(page.getByText('Configuration saved.', { exact: true })).toBeVisible();
  expect(fixture.calls.find((call) => call.method === 'POST' && call.path === '/admin/commerce/bundles').body).toMatchObject({ discountKind: 'fixed', discountValue: 1500, items: [{ productId: commerceProduct._id, quantity: 2, variantKey: null }] });
  await page.getByRole('link', { name: 'Discounts', exact: true }).click();
  await page.getByRole('button', { name: 'Add discount', exact: true }).click();
  await page.getByLabel('Discount name', { exact: true }).fill('Isolated Discount');
  await page.getByLabel('Discount code', { exact: true }).fill('ISOLATED');
  await page.getByLabel('Fixed discount (EGP)', { exact: true }).fill('10');
  await page.getByLabel('Minimum subtotal (EGP)', { exact: true }).fill('50');
  await page.getByLabel('Total usage limit (optional)', { exact: true }).fill('10');
  await page.getByLabel('Per-customer limit (optional)', { exact: true }).fill('1');
  await page.getByLabel('Registered customers only', { exact: true }).check();
  await page.getByRole('button', { name: 'Save configuration', exact: true }).click();
  await expect(page.getByText('Configuration saved.', { exact: true })).toBeVisible();
  expect(fixture.calls.find((call) => call.method === 'POST' && call.path === '/admin/commerce/discounts').body).toMatchObject({ value: 1000, minimumSubtotalPiastres: 5000, usageLimit: 10, perCustomerLimit: 1, authenticatedOnly: true, stackWithBundles: false });
});

test('ordinary personalization fields stay product-level and do not require templates', async ({ page }) => {
  const fixture = await mockCommerce(page, { role: 'admin' });
  await page.goto(`/admin/products/${commerceProduct._id}/configuration`);
  await expect(page.getByRole('heading', { name: 'Product personalization' })).toBeVisible();
  await page.getByLabel('Requires Customization Before Purchase').check();
  await page.getByRole('button', { name: 'Add customer field' }).click();
  await page.getByLabel('Customer-facing label', { exact: true }).fill('Name to print');
  await page.getByLabel('Required information', { exact: true }).check();
  await page.getByRole('button', { name: 'Save purchase configuration', exact: true }).click();
  await expect(page.getByText('Product configuration saved.', { exact: true })).toBeVisible();
  const saved = fixture.calls.find(call => call.method === 'PATCH' && call.path.endsWith('/configuration'));
  expect(saved.body.personalization.fields).toEqual([expect.objectContaining({ type: 'short_text', required: true, maxLength: 120, label: 'Name to print' })]);
  expect(saved.body.personalization.requiredBeforePurchase).toBe(true);
  expect(saved.body.customization.enabled).toBe(false);
});

test('customer order history shows approved totals, immutable text/options and revision-safe cancellation', async ({ page }) => {
  const order = structuredClone(commerceOrder);
  order.lines[0].personalization = { recipient_name: 'Alice', photos: ['710000000000000000000100'] };
  order.lines[0].customization = { templateName: 'Saved Gift Rules', selections: [{ groupLabel: 'Extras', optionLabel: 'Configured Card', quantity: 1 }], fields: { gift_message: 'Thinking of you' } };
  order.history.push({ at: '2026-10-08T13:00:00.000Z', event: 'state_changed', to: { fulfillmentState: 'confirmed', paymentState: 'unpaid' } });
  const fixture = await mockCommerce(page, { role: 'customer', order });
  await page.goto('/my-orders');
  await expect(page.locator('.commerce-order-card strong')).toHaveText(/340/);
  await expect(page.getByText('Price awaiting approval', { exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: new RegExp(`#${order.orderNumber}`) }).click();
  await expect(page.getByText('Alice', { exact: true })).toBeVisible();
  await expect(page.getByText('Thinking of you', { exact: true })).toBeVisible();
  await expect(page.getByText('Extras: Configured Card × 1', { exact: true })).toBeVisible();
  // The public order never exposes stored private attachment identifiers.
  await expect(page.getByText('710000000000000000000100', { exact: true })).toHaveCount(0);
  await expect(page.getByText('confirmed · unpaid', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel order', exact: true }).click();
  await expect(page.getByRole('status').getByText('Cancellation request recorded. Review the latest order status.', { exact: true })).toBeVisible();
  expect(fixture.calls.find((call) => call.path.endsWith('/cancel')).body).toEqual({ revision: 1 });
  expect(fixture.state.order.fulfillmentState).toBe('cancelled');
  await expect(page.locator('.commerce-heading .commerce-badge')).toHaveText('cancelled');
});

test('successful customer login explicitly merges eligible guest cart items', async ({ page }) => {
  const fixture = await mockCommerce(page, { cart: cartWithProduct() });
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email Address' }).fill('isolated@example.test');
  await page.getByLabel(/Password/i).fill('LocalFixturePassword!123');
  await page.getByRole('button', { name: 'Log In', exact: true }).click();
  await expect.poll(() => fixture.calls.some((call) => call.path === '/commerce/cart/merge' && call.method === 'POST')).toBe(true);
  await page.goto('/cart');
  await expect(page.getByRole('heading', { name: commerceProduct.name, exact: true })).toBeVisible();
  expect(fixture.state.cart.quantity).toBe(1);
});

test('admin order search uses strict order-number filtering and bounded server pagination', async ({ page }) => {
  const fixture = await mockCommerce(page, { role: 'admin' });
  await page.goto('/admin/commerce/orders');
  await page.getByLabel('Search by order number', { exact: true }).fill(commerceOrder.orderNumber);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect.poll(() => fixture.calls.some((call) => call.path === '/admin/commerce/orders' && call.query.q === commerceOrder.orderNumber)).toBe(true);
  await page.getByRole('combobox', { name: /^Order sorting/ }).selectOption('oldest');
  await expect.poll(() => fixture.calls.some((call) => call.path === '/admin/commerce/orders' && call.query.sort === 'oldest')).toBe(true);
  const requests = fixture.calls.filter((call) => call.path === '/admin/commerce/orders');
  expect(requests.every((call) => call.query.limit === '20')).toBe(true);
  expect(requests.every((call) => !Object.hasOwn(call.query, 'search'))).toBe(true);
});

for (const width of [320, 390, 768, 1440]) {
  test(`commerce layouts remain within the ${width}px viewport`, async ({ page }, testInfo) => {
    await mockCommerce(page, { checkoutEnabled: true, cart: cartWithProduct() });
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/cart', '/checkout', '/track-order', `/products/${commerceProduct.slug}/customize`]) {
      // Readiness belongs to the application, rather than repeated external
      // font downloads included by the browser's document load event.
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('main h1')).toBeVisible();
      if (route === '/cart') await expect(page.locator('.commerce-cart-item')).toBeVisible();
      if (route === '/checkout') await expect(page.getByLabel('Full name', { exact: true })).toBeVisible();
      if (route.endsWith('/customize')) await expect(page.locator('.commerce-configurator')).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      if (route === '/cart' && [320, 1440].includes(width)) await page.screenshot({ path: testInfo.outputPath(`commerce-cart-${width}.png`), fullPage: true });
    }
  });
}

test('reduced-motion cart feedback avoids the product flight animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const fixture = await mockCommerce(page);
  await page.goto('/shop');
  await page.getByRole('button', { name: `Add to Cart: ${commerceProduct.name}`, exact: true }).click();
  await expect.poll(() => fixture.state.cart.quantity).toBe(1);
  await expect(page.locator('body > img[aria-hidden="true"]')).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Added to your cart.' })).toBeVisible();
});
