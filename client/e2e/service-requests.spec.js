import { chooseImageFiles } from './media-helpers.js';
import { test, expect } from '@playwright/test';
import { mockCommerce, isolatedImageFile } from './commerce-fixtures.js';
import { mockCatalog, adminProduct } from './catalog-fixtures.js';

const id = '710000000000000000000090', now = '2026-10-16T09:00:00.000Z';
const component = (suffix, name, pricing, unitPricePiastres) => ({ componentId: `7100000000000000000000${suffix}`, name, pricing, unitPricePiastres, imageUrl: null });
const components = [component('81', 'Approved packaging fixture', 'fixed', 2500), component('82', 'Quote-only addition fixture', 'pending', null), component('83', 'Explicit free card fixture', 'free', 0)];
const product = { id: '710000000000000000000001', name: 'Unpriced approved engraving fixture', basePricePiastres: null, variants: [], engraving: { fonts: ['Owner approved font'], placements: ['Front'], materials: [], maxTextLength: 80 } };
const headers = { 'Access-Control-Allow-Origin': 'http://127.0.0.1:5191', 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'content-type,x-csrf-token', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS' };
function requestRecord() { return { id, reference: 'TW-123456ABCDEF', service: 'gift_box', governorates: [{ id: 'cairo', name: 'Cairo' }], customer: { name: 'Isolated Customer', phone: '+201012345678' }, details: { occasion: 'Birthday', contents: 'Bespoke fixture contents', quantity: 1 }, productSnapshot: null, components: [], estimate: { baseUnitPiastres: null, knownSubtotalPiastres: 0, shippingPiastres: null }, state: 'submitted', status: 'submitted', createdAt: now, followUpDueAt: '2026-10-16T21:00:00.000Z', quotations: [], history: [], files: [], revision: 0, order: null, whatsapp: null }; }
async function fixture(page, { role, empty = false, initial, loseFirst = false, intakeOpen = true, closeOnSubmit = false } = {}) {
  const commerce = await mockCommerce(page, { role }); let record = initial ? structuredClone(initial) : null; const submissions = [], actions = [];
  await page.route('**/api/v1/**/service-requests**', async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    const reply = data => route.fulfill({ headers, json: { ok: true, data } });
    if (path.includes('/options/')) return reply({ intakeEnabled: intakeOpen, products: empty || !intakeOpen ? [] : [product], components: empty || !intakeOpen ? [] : components, page: 1, hasNext: false });
    if (path.includes('/submissions/')) return reply({ request: record && record.requestKey === path.split('/').at(-1) ? record : null });
    if (path === '/commerce/service-requests') {
      const body = route.request().postDataJSON(); submissions.push(body); if (closeOnSubmit) { intakeOpen = false; return route.fulfill({ status: 503, headers, json: { ok: false, error: { code: 'REQUEST_INTAKE_CLOSED', message: 'New customization requests are temporarily unavailable.' } } }); }
      record ||= { ...requestRecord(), requestKey: body.requestKey, service: body.service, customer: body.customer, details: body.details, components: body.components.map(selection => ({ ...components.find(item => item.componentId === selection.componentId), quantity: selection.quantity })) };
      if (loseFirst && submissions.length === 1) return route.abort('failed');
      return reply({ request: record });
    }
    if (path === '/admin/commerce/service-requests') return reply({ requests: record ? [record] : [], pagination: { page: 1, pages: record ? 1 : 0, total: record ? 1 : 0 } });
    if (path.endsWith('/action')) {
      const body = route.request().postDataJSON(); actions.push(body);
      const latest = record.quotations.at(-1);
      if (body.action === 'prepare') {
        const quote = { ...body.quote, version: record.quotations.length + 1, preparedAt: now, totalPiastres: body.quote.baseUnitPiastres - body.quote.discountPiastres + body.quote.shippingPiastres + body.quote.charges.reduce((sum, item) => sum + item.quantity * item.unitPricePiastres, 0) };
        record.quotations.push(quote); record.state = 'quote_prepared'; record.whatsapp = { text: `Tap & Wrap | ${record.reference} | Quotation v${quote.version}\nConfirmed total EGP ${(quote.totalPiastres / 100).toFixed(2)}\nInstaPay 01060673073 after acceptance and order creation`, url: 'https://wa.me/201012345678?text=Isolated-fixture-only', deliveryConfirmed: false };
      }
      if (body.action === 'share') record.state = 'quote_shared';
      if (body.action === 'accept') { record.state = 'accepted'; latest.acceptance = { at: now, method: body.method, channel: 'whatsapp' }; }
      if (body.action === 'convert') record.order = { id: '710000000000000000000099', orderNumber: '681243', paymentState: 'awaiting_transfer', fulfillmentState: 'received', accounting: { collectedPiastres: 0, refundedPiastres: 0, outstandingPiastres: latest.totalPiastres } };
      record.status = record.order ? 'awaiting_payment' : record.state; record.revision++; record.history.push({ at: now, event: body.action, note: body.reason }); return reply({ request: record });
    }
    return reply({ request: record });
  });
  return { ...commerce, submissions, actions, record: () => record, setIntakeOpen: value => { intakeOpen = value; } };
}
async function contact(page) { await page.getByLabel('Your name', { exact: true }).fill('Isolated Customer'); await page.getByLabel('Egyptian WhatsApp number').fill('01012345678'); }
async function gift(page) { await page.getByLabel('Occasion', { exact: true }).fill('Birthday'); await page.getByLabel('Desired contents').fill('A bespoke gift based on my instructions'); await contact(page); }

test('merchant explicitly selects component request eligibility and real stock without approving imported quantity', async ({ page }) => {
  await mockCommerce(page, { role: 'admin' }); const writes = [];
  await page.route('**/api/v1/admin/commerce/components/*', async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (route.request().method() !== 'PATCH') return route.fallback();
    const patch = route.request().postDataJSON(); writes.push(patch);
    return route.fulfill({ headers, json: { ok: true, data: { component: { _id: '710000000000000000000030', ...patch, revision: 1 } } } });
  });
  await page.goto('/admin/commerce/components'); await page.getByRole('button', { name: /^Edit Configured Card/ }).click();
  await expect(page.getByLabel('Actual stock quantity')).toHaveValue('');
  await page.getByLabel('Owner approved for quotation requests').check(); await page.getByLabel('Gift Box requests', { exact: true }).check();
  await page.getByRole('combobox', { name: /^Request availability/ }).selectOption('available');
  await page.getByRole('combobox', { name: /^Request pricing/ }).selectOption('fixed');
  await page.getByLabel('Confirmed request unit price (EGP)').fill('25');
  await page.getByLabel('Actual stock quantity').fill('3'); await page.getByRole('button', { name: 'Save configuration' }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].requestPolicy).toEqual({ enabled: true, services: ['gift_box'], availability: 'available', pricing: 'fixed', unitPricePiastres: 2500 });
  expect(writes[0].inventory).toEqual({ mode: 'tracked', quantity: 3, approved: true, available: true }); expect(writes[0].priceApproved).toBe(false);
});

test('merchant configures engraving eligibility and human options without a template or base-price approval', async ({ page }) => {
  const data = await mockCatalog(page, { role: 'admin' }); await page.goto(`/admin/products/${adminProduct._id}/edit`);
  await page.getByLabel('Offer this product for engraving quotations').check();
  await page.getByRole('textbox', { name: /^Approved fonts/ }).fill('Owner font\nSecond owner font');
  await page.getByRole('textbox', { name: /^Approved engraving placements/ }).fill('Front');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect.poll(() => data.saves.length).toBe(1);
  expect(data.saves[0].payload.engravingRequest).toEqual({ enabled: true, fonts: ['Owner font', 'Second owner font'], placements: ['Front'], materials: [], maxTextLength: 120 });
});

test('gift requests work without templates, products or components, with no account or upfront payment on mobile', async ({ page }) => {
  const data = await fixture(page, { empty: true }); const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 320, height: 900 }); await page.goto('/customize/gift-box'); await gift(page);
  await expect(page.getByText('No selectable components on this page. Your bespoke request can still be submitted.')).toBeVisible();
  await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', /noindex/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/batch4b-gift-box-320.png', fullPage: true });
  for (const width of [768, 1440]) { await page.setViewportSize({ width, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
  await page.screenshot({ path: 'test-results/batch4b-gift-box-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Submit request · No payment now' }).click(); await expect(page.getByRole('heading', { name: 'TW-123456ABCDEF' })).toBeVisible();
  expect(data.submissions).toHaveLength(1); expect(data.submissions[0].components).toEqual([]); expect(data.orders).toHaveLength(0); expect(errors).toEqual([]);
});
test('fixed, pending and explicit Free components remain distinct and client sends only identities and quantities', async ({ page }) => {
  const data = await fixture(page); await page.goto('/customize/gift-box'); await gift(page);
  await page.getByRole('checkbox', { name: 'Approved packaging fixture', exact: true }).check(); await page.getByLabel('Approved packaging fixture quantity').fill('2');
  await page.getByRole('checkbox', { name: 'Quote-only addition fixture', exact: true }).check(); await page.getByRole('checkbox', { name: 'Explicit free card fixture', exact: true }).check();
  await expect(page.getByText('Known subtotal estimate: EGP 50.00', { exact: true })).toBeVisible(); await expect(page.getByText('Price to be confirmed', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Submit request · No payment now' }).click(); await expect.poll(() => data.submissions.length).toBe(1);
  expect(data.submissions[0].components[0]).toEqual({ componentId: components[0].componentId, quantity: 2 }); expect(data.submissions[0]).not.toHaveProperty('totalPiastres');
});
test('engraving accepts an unpriced approved product with only owner-approved options', async ({ page }) => {
  const data = await fixture(page); await page.goto('/customize/laser-engraving');
  await page.getByRole('combobox', { name: /^Product to engrave/ }).selectOption(product.id); await page.getByLabel('Engraving text', { exact: true }).fill('For Alice');
  await page.getByRole('combobox', { name: /^Font/ }).selectOption('Owner approved font'); await page.getByRole('combobox', { name: /^Engraving placement/ }).selectOption('Front'); await contact(page);
  await expect(page.getByText('Material: the owner will confirm options.')).toBeVisible();
  await page.getByRole('button', { name: 'Submit request · No payment now' }).click(); await expect.poll(() => data.submissions.length).toBe(1);
  expect(data.submissions[0].details).toMatchObject({ productId: product.id, font: 'Owner approved font', placement: 'Front' }); expect(data.submissions[0].details).not.toHaveProperty('material');
});
test('manual engraving fallback invents no fonts/materials and supports optional local reference images', async ({ page }) => {
  const data = await fixture(page, { empty: true }); await page.goto('/customize/laser-engraving'); await page.getByLabel('Item description or product reference').fill('My own item for suitability review');
  await page.getByRole('combobox', { name: /^Engraving type/ }).selectOption('design'); await chooseImageFiles(page, page, 'Reference images / artwork', isolatedImageFile()); await contact(page);
  expect(data.uploads).toHaveLength(0); await page.getByRole('button', { name: 'Submit request · No payment now' }).click(); await expect.poll(() => data.submissions.length).toBe(1);
  expect(data.uploads[0]).toMatchObject({ purpose: 'service_reference', requestKey: data.submissions[0].requestKey }); expect(data.submissions[0].details).not.toHaveProperty('font'); expect(data.submissions[0].uploadIds).toHaveLength(1);
});
test('lost submission retries the same request and verified files; reload recovers the owned receipt', async ({ page }) => {
  const data = await fixture(page, { loseFirst: true, empty: true }); await page.goto('/customize/gift-box'); await gift(page);
  await chooseImageFiles(page, page, 'Reference images / artwork', isolatedImageFile()); await page.getByRole('button', { name: 'Submit request · No payment now' }).click();
  await expect(page.getByRole('button', { name: 'Retry same request', exact: true })).toBeVisible(); await page.getByRole('button', { name: 'Retry same request', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'TW-123456ABCDEF' })).toBeVisible(); expect(data.submissions[1]).toEqual(data.submissions[0]); expect(data.uploads).toHaveLength(1);
  await page.reload(); await expect(page.getByRole('heading', { name: 'TW-123456ABCDEF' })).toBeVisible();
  const stored = await page.evaluate(() => Object.entries(sessionStorage).filter(([key]) => key.startsWith('tw-service-request:'))); expect(JSON.stringify(stored)).not.toContain('Isolated Customer'); expect(JSON.stringify(stored)).not.toContain('uploadIds');
});
test('admin saves quotation, opens a manual message, records sharing/acceptance then creates a linked unpaid order', async ({ page }) => {
  const data = await fixture(page, { role: 'admin', initial: requestRecord() }); await page.setViewportSize({ width: 320, height: 900 }); await page.goto(`/admin/requests/${id}`);
  await page.getByLabel('Confirmed product/custom-work unit amount (EGP)').fill('450'); await page.getByLabel('Confirmed delivery fee (EGP)').fill('90'); await page.getByRole('button', { name: 'Save new quotation version' }).click();
  await expect(page.getByLabel('Saved WhatsApp quotation', { exact: true })).toHaveValue(/540.00/);
  await expect(page.getByRole('link', { name: 'Open WhatsApp', exact: true })).toHaveAttribute('href', /^https:\/\/wa.me\//); expect(data.actions).toHaveLength(1);
  await page.getByLabel('Private review / WhatsApp evidence note').fill('Actual manual sharing and customer reply evidence'); await page.getByRole('button', { name: 'Record quotation actually shared' }).click();
  await page.getByLabel('Customer confirmed this version and method through WhatsApp').check(); await page.getByRole('button', { name: 'Record WhatsApp acceptance', exact: true }).click();
  await page.getByLabel('Agreed delivery governorate').selectOption('cairo'); await page.getByLabel('Agreed delivery address').fill('10 Isolated Delivery Street');
  await page.getByRole('button', { name: 'Create order from accepted quotation' }).click(); await expect(page.getByRole('heading', { name: 'Linked order #681243' })).toBeVisible();
  await expect(page.getByText('Payment: Awaiting InstaPay transfer · Fulfillment: received')).toBeVisible(); expect(data.actions.map(action => action.action)).toEqual(['prepare', 'share', 'accept', 'convert']);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: 'test-results/batch4b-admin-320.png', fullPage: true });
});

test('closed intake hides new request forms and safely reopens without creating a submission', async ({ page }) => {
  const data = await fixture(page, { empty: true, intakeOpen: false }); await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/customize/gift-box');
  await expect(page.getByRole('heading', { name: 'New requests are temporarily unavailable' })).toBeVisible();
  await expect(page.getByLabel('Occasion', { exact: true })).toHaveCount(0); expect(data.submissions).toHaveLength(0);
  data.setIntakeOpen(true); await page.getByRole('button', { name: 'Check availability and saved request' }).click();
  await expect(page.getByLabel('Occasion', { exact: true })).toBeVisible(); expect(data.submissions).toHaveLength(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('intake closing during a draft shows maintenance and existing receipt still recovers', async ({ page }) => {
  const data = await fixture(page, { empty: true, closeOnSubmit: true }); await page.goto('/customize/gift-box'); await gift(page);
  await page.getByRole('button', { name: 'Submit request · No payment now' }).click();
  await expect(page.getByRole('heading', { name: 'New requests are temporarily unavailable' })).toBeVisible(); expect(data.submissions).toHaveLength(1);
});
test('existing submitted request remains visible while intake is closed', async ({ page }) => {
  const data = await fixture(page, { empty: true }); await page.goto('/customize/gift-box'); await gift(page);
  await page.getByRole('button', { name: 'Submit request · No payment now' }).click();
  await expect(page.getByRole('heading', { name: 'TW-123456ABCDEF' })).toBeVisible();
  data.setIntakeOpen(false); await page.reload();
  await expect(page.getByRole('heading', { name: 'TW-123456ABCDEF' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'New requests are temporarily unavailable' })).toHaveCount(0);
});
