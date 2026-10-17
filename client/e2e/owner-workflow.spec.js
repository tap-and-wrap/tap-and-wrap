import { test, expect } from '@playwright/test';
import { mockCatalog, adminProduct } from './catalog-fixtures.js';
import { mockCommerce } from './commerce-fixtures.js';

test('owner listing calls inherited stock unconfirmed and distinguishes enquiry-only products from import state', async ({ page }) => {
  await mockCatalog(page, { role: 'admin' });
  await page.route('**/api/v1/admin/products?*', route => route.fulfill({ json: { ok: true, data: { products: [{ ...adminProduct, visibility: 'public', status: 'hold', reviewRequired: true, orderingAvailable: false, hasVariants: false, inventory: { mode: 'tracked', quantity: 10, approved: false, available: true } }], pagination: { page: 1, pages: 1, total: 1 } } } }));
  await page.setViewportSize({ width: 320, height: 900 }); await page.goto('/admin/products');
  await expect(page.locator('table')).toContainText('Unconfirmed quantity: 10');
  await expect(page.locator('table')).toContainText('Enquiries only');
  await expect(page.getByRole('combobox', { name: 'Original catalog status', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('owner saves price and actual stock without approval/status controls; import state and public identity stay intact', async ({ page }) => {
  const fixture = await mockCatalog(page, { role: 'admin', adminProduct: { ...adminProduct, visibility: 'public', status: 'hold', reviewRequired: true, pricePiastres: null, compareAtPiastres: null, priceApproved: false, inventory: { mode: 'tracked', quantity: 10, approved: false, available: true } } });
  await page.goto(`/admin/products/${adminProduct._id}/edit`);
  for (const width of [1440, 768, 320]) { await page.setViewportSize({ width, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
  await expect(page.getByLabel('Purchase readiness', { exact: true })).toHaveCount(0);
  await expect(page.locator('input[name=reviewRequired]')).toHaveCount(0);
  await expect(page.getByLabel('Product quantity', { exact: true })).toHaveValue('');
  await page.getByRole('textbox', { name: /^Price \(EGP\)/ }).fill('450');
  await page.getByRole('combobox', { name: 'Product availability', exact: true }).selectOption('tracked');
  await page.getByLabel('Product quantity', { exact: true }).fill('3');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect.poll(() => fixture.saves.length).toBe(1);
  const body = fixture.saves[0].payload;
  expect(body.ownerWorkflow).toBe(true); expect(body.optionStructure).toBe('single');
  expect(body.status).toBe('hold'); expect(body.reviewRequired).toBe(true); expect(body.slug).toBe(adminProduct.slug);
  expect(body.pricePiastres).toBe(45000); expect(body.inventory.quantity).toBe(3); expect(body.inventory.approved).toBe(true);
});

test('new enquiry template saves without an approval, price, stable-key or engraving-font step', async ({ page }) => {
  await mockCommerce(page, { role: 'admin' }); const writes = [];
  await page.route('**/api/v1/admin/commerce/templates', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { ok: true, data: { templates: [], pagination: { page: 1, pages: 1 } } } });
    const body = route.request().postDataJSON(); writes.push(body);
    return route.fulfill({ json: { ok: true, data: { template: { ...body, _id: '710000000000000000000055', key: 'generated_template', status: 'approved', active: true, version: 1, revision: 0 } } } });
  });
  await page.goto('/admin/commerce/templates'); await page.getByRole('button', { name: 'Add template', exact: true }).click();
  await page.getByLabel('Template name', { exact: true }).fill('Engraving request questions');
  await page.getByRole('combobox', { name: 'Service / configuration type', exact: true }).selectOption('laser_engraving');
  await expect(page.getByLabel('Approval status', { exact: true })).toHaveCount(0); await expect(page.getByLabel('Stable key', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Fonts', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Add requirement field', exact: true }).click();
  await page.getByLabel('Customer-facing label', { exact: true }).fill('Who is the gift for?');
  await expect(page.getByLabel('Field key', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Save configuration', exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].ownerWorkflow).toBe(true); expect(writes[0].usage).toBe('enquiry'); expect(writes[0].fields[0].key).toMatch(/^field_/);
});

test('variant editor uses real per-variant quantities without asking the owner to certify the imported parent ten', async ({ page }) => {
  const fixture = await mockCatalog(page, { role: 'admin', adminProduct: { ...adminProduct,
    inventory: { mode: 'tracked', quantity: 10, approved: false, available: true },
    variants: [0, 2].map((quantity, index) => ({ key: `size-${index}`, sku: '', attributes: [{ name: 'Size', value: String(index) }], pricePiastres: 10000, priceApproved: true, inventory: { mode: 'tracked', quantity, approved: true, available: true } })),
  } });
  await page.goto(`/admin/products/${adminProduct._id}/edit`);
  await expect(page.getByLabel('Product quantity', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Variant 1 quantity', { exact: true })).toHaveValue('0');
  await expect(page.getByLabel('Variant 2 quantity', { exact: true })).toHaveValue('2');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect.poll(() => fixture.saves.length).toBe(1);
  const saved = fixture.saves[0].payload;
  expect(saved.optionStructure).toBe('variants'); expect(saved.inventory.quantity).toBe(10); expect(saved.inventory.approved).toBe(false);
  expect(saved.variants.map(variant => variant.inventory.quantity)).toEqual([0, 2]);
});

test('mobile accountless Gift Box uses saved request questions and keeps no-template submission optional', async ({ page }) => {
  await mockCommerce(page); const submissions = [];
  await page.route('**/api/v1/**/service-requests**', async route => {
    const path = new URL(route.request().url()).pathname;
    const reply = data => route.fulfill({ json: { ok: true, data } });
    if (path.includes('/options/')) return reply({ intakeEnabled: true, products: [], components: [], templates: [{ id: '710000000000000000000056', name: 'Gift questions', version: 2, fields: [{ key: 'recipient_note', label: 'Tell us about the recipient', type: 'text', required: true, maxChars: 100 }] }], page: 1, hasNext: false });
    if (path.includes('/submissions/')) return reply({ request: null });
    const body = route.request().postDataJSON(); submissions.push(body); return reply({ request: { reference: 'TW-SYNTHETIC', service: 'gift_box' } });
  });
  await page.setViewportSize({ width: 320, height: 900 }); await page.goto('/customize/gift-box');
  await page.getByLabel('Occasion', { exact: true }).fill('Birthday'); await page.getByLabel('Desired contents').fill('A thoughtful gift');
  await page.getByLabel('Your name', { exact: true }).fill('Synthetic Customer'); await page.getByLabel('Egyptian WhatsApp number').fill('01012345678');
  await page.getByRole('combobox', { name: 'Additional request questions', exact: true }).selectOption('710000000000000000000056');
  await page.getByLabel('Tell us about the recipient', { exact: false }).fill('They like handwritten notes');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Submit request · No payment now' }).click();
  await expect(page.getByRole('heading', { name: 'TW-SYNTHETIC' })).toBeVisible();
  expect(submissions[0].template).toEqual({ id: '710000000000000000000056', version: 2, fields: { recipient_note: 'They like handwritten notes' } });
});
