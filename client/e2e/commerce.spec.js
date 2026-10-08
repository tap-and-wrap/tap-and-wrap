import { expect, test } from '@playwright/test';
import { cartWithProduct, commerceOrder, commerceProduct, commerceTemplate, fillCheckout, isolatedImageFile, mockCommerce } from './commerce-fixtures';

const browserErrors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const errors = [];
  browserErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(async ({ page }) => { expect(browserErrors.get(page) || []).toEqual([]); });

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
  await page.getByLabel('Your photos', { exact: false }).setInputFiles([isolatedImageFile('first.png')]);
  await page.getByLabel('Gift message', { exact: false }).fill('First gift');
  expect(fixture.uploads).toHaveLength(0);
  expect(fixture.calls.filter((call) => call.path === '/direct-upload')).toHaveLength(0);
  await page.getByRole('button', { name: 'Add to Cart', exact: true }).first().click();
  await expect(page.getByText('Choose exactly 2 files.', { exact: true })).toBeVisible();
  expect(fixture.calls.filter((call) => call.path === '/commerce/cart/items')).toHaveLength(0);
  await page.getByLabel('Your photos', { exact: false }).setInputFiles([isolatedImageFile('first.png'), isolatedImageFile('second.png')]);
  await page.getByRole('button', { name: 'Add to Cart', exact: true }).first().click();
  await expect.poll(() => fixture.uploads.length).toBe(2);
  await expect.poll(() => fixture.state.cart.items.length).toBe(1);
  await page.getByLabel('Your photos', { exact: false }).setInputFiles([isolatedImageFile('third.png'), isolatedImageFile('fourth.png')]);
  await page.getByLabel('Gift message', { exact: false }).fill('Another gift');
  await page.getByRole('button', { name: 'Add to Cart', exact: true }).first().click();
  await expect.poll(() => fixture.state.cart.items.length).toBe(2);
  expect(fixture.state.cart.items[0].personalization.photos).not.toEqual(fixture.state.cart.items[1].personalization.photos);
});

test('unavailable storage prevents personalized cart adds and never reports a fake success', async ({ page }) => {
  const product = { ...commerceProduct, requiresOptions: true, personalization: { fields: [{ key: 'photo', label: 'Customer photo', type: 'image', required: true, minFiles: 1, maxFiles: 1, acceptedMimeTypes: ['image/png'] }] } };
  const fixture = await mockCommerce(page, { product, storageUnavailable: true });
  await page.goto(`/products/${product.slug}`);
  await page.getByLabel('Customer photo').setInputFiles(isolatedImageFile());
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
  await page.getByLabel('Customer photo').setInputFiles(isolatedImageFile());
  await page.getByRole('button', { name: 'Add to Cart', exact: true }).first().click();
  await expect.poll(() => fixture.calls.some((call) => call.method === 'DELETE' && call.path.startsWith('/commerce/uploads/'))).toBe(true);
  expect(fixture.state.cart.items).toHaveLength(0);
});

test('gift boxes use configured components, authoritative dynamic quotes, and unavailable option controls', async ({ page }) => {
  const fixture = await mockCommerce(page);
  await page.goto('/customize/gift-box');
  await page.getByLabel('Gift box type / size').selectOption(commerceProduct.slug);
  await expect(page.getByLabel('Unavailable Extra — unavailable')).toBeDisabled();
  await page.getByLabel('Configured Card', { exact: true }).check();
  await expect(page.getByText(/300\.00|300/).filter({ hasText: /each/ })).toBeVisible();
  await page.getByRole('button', { name: 'Add to Cart', exact: true }).click();
  await expect.poll(() => fixture.state.cart.items.length).toBe(1);
  const payload = fixture.calls.find((call) => call.path === '/commerce/cart/items').body;
  expect(payload.customization).toMatchObject({ templateId: commerceTemplate._id, version: 1, selections: [{ groupKey: 'extras', optionKey: 'card', quantity: 1 }] });
  expect(payload).not.toHaveProperty('pricePiastres');
});

test('laser engraving allows only configured material/font/placement and submits exact text', async ({ page }) => {
  const template = { ...commerceTemplate, kind: 'laser_engraving', groups: [], engraving: { textRequired: true, maxChars: 20, allowedTextLines: 1, maxCharsPerLine: 20, materials: [{ key: 'approved_material', label: 'Approved material', active: true, adjustmentPiastres: 0 }], fonts: [{ key: 'approved_style', label: 'Approved style', active: true, adjustmentPiastres: 0 }], placements: [{ key: 'front', label: 'Front', active: true, adjustmentPiastres: 0 }], artworkAllowed: false } };
  const fixture = await mockCommerce(page, { template });
  await page.goto('/customize/laser-engraving');
  await page.getByRole('combobox', { name: /^Engravable product/ }).selectOption(commerceProduct.slug);
  await page.getByLabel('Engraving text', { exact: false }).fill('A thoughtful gift');
  await page.getByRole('combobox', { name: /^Material/ }).selectOption('approved_material');
  await page.getByRole('combobox', { name: /^Font \/ style/ }).selectOption('approved_style');
  await page.getByRole('combobox', { name: /^Placement \/ side/ }).selectOption('front');
  await expect(page.getByRole('button', { name: 'Add to Cart', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Add to Cart', exact: true }).click();
  await expect.poll(() => fixture.state.cart.items.length).toBe(1);
  expect(fixture.state.cart.items[0].customization.fields).toMatchObject({ engraving_text: 'A thoughtful gift', engraving_material: 'approved_material', engraving_font: 'approved_style', engraving_placement: 'front' });
  expect(fixture.uploads).toHaveLength(0);
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

test('InstaPay proof stays local until Place Order and remains awaiting manual verification', async ({ page }) => {
  const fixture = await mockCommerce(page, { checkoutEnabled: true, cart: cartWithProduct() });
  await page.goto('/checkout');
  await fillCheckout(page);
  await page.getByLabel('InstaPay — full payment', { exact: true }).check();
  await page.getByLabel('InstaPay payment proof', { exact: false }).setInputFiles(isolatedImageFile('isolated-proof.png'));
  expect(fixture.uploads).toHaveLength(0);
  await expect(page.getByText('01060673073', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Place Order', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Place Order', exact: true }).click();
  await expect(page.getByText('Your payment proof is awaiting manual verification.', { exact: true })).toBeVisible();
  expect(fixture.uploads).toHaveLength(1);
  expect(fixture.uploads[0].purpose).toBe('payment_proof');
  expect(fixture.orders[0].paymentState).toBe('awaiting_verification');
});

test('failed order responses retry with the same checkout key and private proof instead of reuploading', async ({ page }) => {
  const options = { checkoutEnabled: true, cart: cartWithProduct(), rejectOrder: true };
  const fixture = await mockCommerce(page, options);
  await page.goto('/checkout');
  await fillCheckout(page);
  await page.getByLabel('InstaPay — full payment', { exact: true }).check();
  await page.getByLabel('InstaPay payment proof', { exact: false }).setInputFiles(isolatedImageFile('isolated-proof-retry.png'));
  await expect(page.getByRole('button', { name: 'Place Order', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Place Order', exact: true }).click();
  await expect(page.getByText('Order submission could not be completed. Your cart remains saved.', { exact: true })).toBeVisible();
  expect(fixture.orders).toHaveLength(0);
  expect(fixture.uploads).toHaveLength(1);
  options.rejectOrder = false;
  await page.getByRole('button', { name: 'Place Order', exact: true }).click();
  await expect(page.getByRole('heading', { name: `Order #${commerceOrder.orderNumber}`, exact: true })).toBeVisible();
  const requests = fixture.calls.filter((call) => call.path === '/commerce/orders' && call.method === 'POST');
  expect(requests).toHaveLength(2);
  expect(requests[0].body.checkoutKey).toBe(requests[1].body.checkoutKey);
  expect(requests[0].body.paymentProofId).toBe(requests[1].body.paymentProofId);
  expect(fixture.uploads).toHaveLength(1);
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

test('admin template and shipping forms save meaningful typed configuration', async ({ page }) => {
  const fixture = await mockCommerce(page, { role: 'admin' });
  await page.goto('/admin/commerce/templates');
  await page.getByRole('button', { name: 'Add template', exact: true }).click();
  await page.getByLabel('Template name', { exact: true }).fill('Isolated Tray Rules');
  await page.getByLabel('Stable key', { exact: true }).fill('isolated-tray');
  await page.getByRole('combobox', { name: /^Service \/ configuration type/ }).selectOption('tray');
  await page.getByRole('button', { name: 'Add requirement field', exact: true }).click();
  await page.getByLabel('Field key', { exact: true }).fill('message');
  await page.getByLabel('Customer-facing label', { exact: true }).fill('Card message');
  await page.getByRole('button', { name: 'Save configuration', exact: true }).click();
  await expect(page.getByText('Configuration saved.', { exact: true })).toBeVisible();
  const templateCall = fixture.calls.find((call) => call.path === '/admin/commerce/templates' && call.method === 'POST');
  expect(templateCall.body).toMatchObject({ name: 'Isolated Tray Rules', kind: 'tray', status: 'draft', fields: [{ key: 'message', label: 'Card message', type: 'text' }] });
  await page.getByRole('link', { name: 'Shipping', exact: true }).click();
  await page.getByLabel('Cairo and Giza shipping (EGP)', { exact: true }).fill('90');
  await page.getByLabel('Other governorates shipping (EGP)', { exact: true }).fill('120');
  await page.getByLabel('Shipping rates approved', { exact: true }).check();
  await page.getByRole('button', { name: 'Save shipping settings', exact: true }).click();
  await expect.poll(() => fixture.calls.some((call) => call.path === '/admin/commerce/shipping' && call.method === 'PATCH')).toBe(true);
  expect(fixture.calls.find((call) => call.path === '/admin/commerce/shipping' && call.method === 'PATCH').body).toMatchObject({ cairoGizaPiastres: 9000, otherGovernoratesPiastres: 12000, approved: true });
});

test('admin component inventory and approval controls require deliberate merchant decisions', async ({ page }) => {
  const fixture = await mockCommerce(page, { role: 'admin' });
  await page.goto('/admin/commerce/components');
  await page.getByRole('button', { name: 'Edit Configured Card', exact: true }).click();
  await page.getByLabel('Component price (EGP)', { exact: true }).fill('50');
  await page.getByLabel('Price approved', { exact: true }).check();
  await page.getByLabel('Catalog review resolved', { exact: true }).check();
  await page.getByLabel('Merchant review notes', { exact: true }).fill('Isolated fixture review resolved for this test.');
  await page.getByLabel('Enabled for customization', { exact: true }).check();
  await page.getByLabel('No Inventory Tracking / Made by Request', { exact: true }).check();
  await page.getByLabel('Inventory approved', { exact: true }).check();
  await page.getByLabel('Configuration approved', { exact: true }).check();
  await page.getByRole('button', { name: 'Save configuration', exact: true }).click();
  await expect(page.getByText('Configuration saved.', { exact: true })).toBeVisible();
  const change = fixture.calls.find((call) => call.method === 'PATCH' && call.path.startsWith('/admin/commerce/components/'));
  expect(change.body).toMatchObject({ pricePiastres: 5000, priceApproved: true, configurationApproved: true, enabledForCustomization: true, reviewRequired: false, inventory: { mode: 'made_to_order', quantity: null, approved: true, available: true } });
  expect(change.body).not.toHaveProperty('catalogRole');
  expect(change.body).not.toHaveProperty('externalCatalogId');
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

test('admin purchase requirements remain separate from customization and save actual product field types', async ({ page }) => {
  const fixture = await mockCommerce(page, { role: 'admin' });
  await page.goto(`/admin/products/${commerceProduct._id}/configuration`);
  await page.getByRole('button', { name: 'Add requirement field', exact: true }).click();
  await page.getByLabel('Field key', { exact: true }).fill('customer_name');
  await page.getByLabel('Customer-facing label', { exact: true }).fill('Name to print');
  await page.getByLabel('Required', { exact: true }).check();
  await page.getByRole('button', { name: 'Save purchase configuration', exact: true }).click();
  await expect(page.getByText('Product configuration saved.', { exact: true })).toBeVisible();
  const saved = fixture.calls.find((call) => call.method === 'PATCH' && call.path.endsWith('/configuration'));
  expect(saved.body.personalization).toEqual({ fields: [expect.objectContaining({ key: 'customer_name', type: 'short_text', required: true, maxLength: 120 })] });
  expect(saved.body.personalization).not.toHaveProperty('enabled');
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
  await expect(page.getByText('1 private file', { exact: true })).toBeVisible();
  await expect(page.getByText('710000000000000000000100', { exact: true })).toHaveCount(0);
  await expect(page.getByText('confirmed · unpaid', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel order', exact: true }).click();
  await expect(page.getByText('Order cancelled.', { exact: true })).toBeVisible();
  expect(fixture.calls.find((call) => call.path.endsWith('/cancel')).body).toEqual({ revision: 1 });
  expect(fixture.state.order.fulfillmentState).toBe('cancelled');
});

test('successful customer login explicitly merges eligible guest cart items', async ({ page }) => {
  const fixture = await mockCommerce(page, { cart: cartWithProduct() });
  await page.goto('/login');
  await page.getByLabel(/Email/i).fill('isolated@example.test');
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
