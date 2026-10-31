import { expect, test } from '@playwright/test';
import { mockCommerce, commerceOrder } from './commerce-fixtures.js';

// End-to-end *browser* contracts against isolated API fixtures. This test must
// never connect to production, turn on launch flags, or create real options.
const headers = {
  'access-control-allow-origin': 'http://127.0.0.1:5191',
  'access-control-allow-credentials': 'true',
  'access-control-allow-headers': 'content-type,x-csrf-token,x-tracking-consent',
  'access-control-allow-methods': 'GET,PATCH,OPTIONS',
};
const baseRecord = () => ({
  optionId: 'synthetic-engraving-plate', kind: 'engraving_surface',
  displayName: 'Test engraving surface', configuredPricePiastres: 2500,
  pricePiastres: 2500, pricing: 'paid', enabled: true, available: true,
  boxIds: ['box-2'], approvedStyleIds: ['lettering-12'], approvedColorIds: ['black'],
  fontLicensesConfirmed: true, revision: 2,
});

async function mockPersonalizationAdmin(page, initial = []) {
  let records = structuredClone(initial);
  const writes = [];
  await page.route(/\/api\/v1\/admin\/gift-box\/personalization-options(?:\/[^/?]+)?(?:\?.*)?$/, async route => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const url = new URL(request.url()), id = url.pathname.split('/').at(-1);
    if (request.method() === 'GET') return route.fulfill({ headers, json: { ok: true, data: { options: records, personalizationCheckoutEnabled: false } } });
    if (request.method() !== 'PATCH') return route.fulfill({ status: 405, headers });
    const payload = request.postDataJSON();
    writes.push({ id, payload });
    const old = records.find(record => record.optionId === id);
    if (payload.expectedRevision !== (old?.revision ?? 0)) return route.fulfill({ status: 409, headers,
      json: { ok: false, error: { code: 'EDIT_CONFLICT', message: 'Another administrator saved this option.' } } });
    const next = { ...old, optionId: id, kind: old?.kind || payload.kind,
      displayName: payload.displayName ?? old?.displayName, enabled: payload.enabled ?? old?.enabled ?? false,
      available: payload.available ?? old?.available ?? false, boxIds: payload.boxIds ?? old?.boxIds ?? [],
      approvedStyleIds: payload.approvedStyleIds ?? old?.approvedStyleIds ?? [],
      approvedColorIds: payload.approvedColorIds ?? old?.approvedColorIds ?? [],
      fontLicensesConfirmed: payload.fontLicensesConfirmed ?? old?.fontLicensesConfirmed ?? false,
      configuredPricePiastres: Object.hasOwn(payload, 'pricePiastres') ? payload.pricePiastres : old?.configuredPricePiastres ?? null,
      revision: (old?.revision ?? 0) + 1 };
    next.pricePiastres = next.enabled && next.available ? next.configuredPricePiastres : null;
    records = old ? records.map(record => record.optionId === id ? next : record) : [...records, next];
    return route.fulfill({ headers, json: { ok: true, data: { option: next } } });
  });
  return { writes, get records() { return records; }, externalEdit(fn) { records = records.map(record => fn({ ...record })); } };
}

const errors = new WeakMap();
test.beforeEach(({ page }) => {
  const collected = []; errors.set(page, collected);
  page.on('pageerror', error => collected.push(error.message));
});
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));

test('admin can create a pending photo-print option without silently publishing it', async ({ page }) => {
  await mockCommerce(page, { role: 'admin' });
  const fixture = await mockPersonalizationAdmin(page);
  await page.goto('/admin/gift-box/personalization-options');
  await expect(page.getByRole('heading', { name: 'Gift Box Personalization', exact: true })).toBeVisible();
  await page.getByLabel('Option ID').fill('synthetic-small-print');
  await page.getByRole('button', { name: 'Prepare new option' }).click();
  const editor = page.locator('form.gb-opt-editor');
  await editor.getByLabel('Customer-facing display name').fill('Synthetic small print');
  await editor.getByLabel('Box 2', { exact: true }).check();
  await editor.getByRole('button', { name: 'Create pending option' }).click();
  await expect.poll(() => fixture.writes.length).toBe(1);
  expect(fixture.writes[0].id).toBe('synthetic-small-print');
  expect(fixture.writes[0].payload).toMatchObject({ expectedRevision: 0, kind: 'photo_print',
    displayName: 'Synthetic small print', boxIds: ['box-2'] });
  expect(fixture.writes[0].payload).not.toHaveProperty('pricePiastres');
  expect(fixture.writes[0].payload).not.toHaveProperty('fontLicensesConfirmed');
  expect(fixture.records[0]).toMatchObject({ enabled: false, available: false, configuredPricePiastres: null });
  await expect(page.getByText('synthetic-small-print').first()).toBeVisible();
});

test('admin conflict retains the engraving draft until explicit reload', async ({ page }) => {
  await mockCommerce(page, { role: 'admin' });
  const fixture = await mockPersonalizationAdmin(page, [baseRecord()]);
  await page.goto('/admin/gift-box/personalization-options');
  const editor = page.locator('form.gb-opt-editor');
  const price = editor.getByLabel('Price (EGP)');
  await expect(price).toHaveValue('25');
  await price.fill('45.67');
  fixture.externalEdit(record => ({ ...record, revision: 3, displayName: 'Other editor engraving' }));
  await editor.getByRole('button', { name: 'Save option' }).click();
  await expect(editor.getByText('Another editor changed this record. Your unsaved changes are still here. Copy any changes you need before reloading.')).toBeVisible();
  await expect(price).toHaveValue('45.67');
  await editor.getByRole('button', { name: 'Reload latest record', exact: true }).click();
  await editor.getByRole('button', { name: 'Confirm reload and discard draft', exact: true }).click();
  await expect(page.locator('form.gb-opt-editor').getByLabel('Customer-facing display name')).toHaveValue('Other editor engraving');
  await expect(page.locator('form.gb-opt-editor').getByLabel('Price (EGP)')).toHaveValue('25');
  const updated = page.locator('form.gb-opt-editor');
  await updated.getByLabel('Price (EGP)').fill('45.67');
  await updated.getByRole('button', { name: 'Save option' }).click();
  await expect.poll(() => fixture.writes.length).toBe(2);
  expect(fixture.writes.map(write => write.payload.expectedRevision)).toEqual([2, 3]);
  expect(fixture.writes[1].payload).toMatchObject({ pricePiastres: 4567 });
  expect(fixture.writes[1].payload).not.toHaveProperty('fontLicensesConfirmed');
  expect(fixture.writes[1].payload).not.toHaveProperty('confirmComplimentary');
});

test('customer session cannot open or mutate the admin personalization registry', async ({ page }) => {
  await mockCommerce(page, { role: 'customer' });
  const fixture = await mockPersonalizationAdmin(page, [baseRecord()]);
  await page.goto('/admin/gift-box/personalization-options');
  await expect(page.getByRole('heading', { name: 'Gift Box Personalization', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save option' })).toHaveCount(0);
  expect(fixture.writes).toHaveLength(0);
});

const privateEngraving = 'Private customer instruction <not HTML> 🌹';
const guestGiftOrder = {
  ...commerceOrder,
  lines: [{ kind: 'gift_box_v2', name: 'Build Your Gift Box', quantity: 1,
    unitPricePiastres: 5500, lineTotalPiastres: 5500, giftBox: {
      snapshotVersion: 'gift-box-order-v2', box: { componentId: 'box-2', displayName: 'Snapshot Box' },
      ribbon: { displayName: 'Snapshot Ribbon', colorHex: '#203356' },
      giftCard: { selected: false }, components: [], personalization: {
        photoCount: 1, unitAdjustmentPiastres: 4500,
        engravings: [{ text: privateEngraving, styleId: 'lettering-12', colorId: 'black', surfaceOptionId: 'synthetic-engraving-plate', pricePiastres: 2000 }],
        photoPrints: [{ uploadId: '7a7a7a7a7a7a7a7a7a7a7a7a', printOptionId: 'synthetic-small-print', zone: 'inside', x: 0.2, y: 0.4, pricePiastres: 2500 }],
      },
    } }],
  totals: { subtotalPiastres: 5500, discountPiastres: 0, shippingPiastres: null, totalPiastres: 5500, applied: [] },
};

test('customer order hides private upload references while admin sees read-only fulfillment instructions', async ({ page }) => {
  await mockCommerce(page, { role: 'customer', order: guestGiftOrder });
  await page.goto(`/orders/${commerceOrder.id}`);
  const gift = page.getByRole('article', { name: 'Build Your Gift Box', exact: true });
  await expect(gift.getByText('Photo prints and engraving at purchase')).toBeVisible();
  await gift.getByText('Photo prints and engraving at purchase').click();
  await expect(gift.getByText(`Engraving 1: ${privateEngraving}`, { exact: true })).toBeVisible();
  await expect(gift.getByText('Private print instructions')).toHaveCount(0);
  await expect(gift.locator('img')).toHaveCount(0);
  await expect(gift).not.toContainText('7a7a7a7a7a7a7a7a7a7a7a7a');
});

test('admin order displays saved print placement and engraving instructions without loading photo bytes', async ({ page }) => {
  const fixture = await mockCommerce(page, { role: 'admin', order: guestGiftOrder });
  await page.goto(`/admin/commerce/orders/${commerceOrder.id}`);
  const gift = page.getByRole('article', { name: 'Build Your Gift Box', exact: true });
  await expect(gift.getByText('Photo prints and engraving at purchase')).toBeVisible();
  await gift.getByText('Photo prints and engraving at purchase').click();
  await expect(gift.getByText('Private print instructions')).toBeVisible();
  await expect(gift.getByText('Photo 1: synthetic-small-print · inside · x 0.2, y 0.4 · EGP 25.00')).toBeVisible();
  await expect(gift.getByText(`Engraving 1: ${privateEngraving}`, { exact: true })).toBeVisible();
  await expect(gift).not.toContainText('7a7a7a7a7a7a7a7a7a7a7a7a');
  expect(fixture.calls.filter(call => /\/files\//.test(call.path))).toHaveLength(0);
});
