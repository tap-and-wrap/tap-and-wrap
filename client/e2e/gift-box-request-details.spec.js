import { test, expect } from '@playwright/test';
import { mockCommerce } from './commerce-fixtures.js';
import { ASSET_VERSION, CATALOG_VERSION, GEOMETRY_VERSION } from '../../shared/gift-box/definitions.mjs';
import { DRAFT_GEOMETRY_VERSION } from '../../shared/gift-box/geometry-drafts.mjs';
import { GIFT_BOX_REQUEST_CONTRACT_VERSION, GIFT_BOX_REQUEST_KIND, GIFT_BOX_REQUEST_SCENE } from '../../shared/gift-box/request-contract.mjs';

const id = '710000000000000000000091', now = '2026-10-28T09:00:00.000Z';
const cors = { 'Access-Control-Allow-Origin': 'http://127.0.0.1:5191', 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'content-type,x-csrf-token', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
const message = 'هدية جميلة 💐\n<script>window.requestCardInjected=true</script>';
function requestRecord({ preview = false, blankCard = false } = {}) {
  const items = [
    { componentId: 'box-11', category: 'box', displayName: 'Synthetic saved two-level box', quantity: 1, unit: 'one-box', unitPricePiastres: 12000, lineSubtotalPiastres: 12000, inventoryMode: 'tracked', inventoryQuantity: 10 },
    { componentId: 'rose-red', category: 'flower', displayName: 'Synthetic saved rose', quantity: 2, unit: 'individual-rose', unitPricePiastres: 300, lineSubtotalPiastres: 600, inventoryMode: 'tracked', inventoryQuantity: 12 },
    { componentId: 'plush-1', category: 'plush', displayName: 'Synthetic saved plush', quantity: 1, unit: 'one-plush-toy', unitPricePiastres: 10000, lineSubtotalPiastres: 10000, inventoryMode: 'made_to_order', inventoryQuantity: 0 },
    { componentId: 'chocolate-1', category: 'chocolate', displayName: 'Synthetic saved retail chocolate', quantity: 1, unit: 'complete-pictured-retail-unit', unitPricePiastres: 500, lineSubtotalPiastres: 500, inventoryMode: 'tracked', inventoryQuantity: 10 },
    { componentId: 'ribbon-red', category: 'ribbon', displayName: 'Synthetic saved red ribbon', quantity: 1, unit: 'one-ribbon', unitPricePiastres: 0, lineSubtotalPiastres: 0, inventoryMode: 'status_only', inventoryQuantity: null, colorHex: '#C92D39' },
    { componentId: 'gift-card-1', category: 'gift_card', displayName: 'Synthetic saved card', quantity: 1, unit: 'one-gift-card', unitPricePiastres: 100, lineSubtotalPiastres: 100, inventoryMode: 'tracked', inventoryQuantity: 10 },
  ].map(item => ({ ...item, available: true, settingsRevision: 5, priceApproval: item.unitPricePiastres === 0 ? 'complimentary' : 'paid' }));
  const placements = ['rose-red', 'rose-red', 'plush-1', 'chocolate-1'].map((componentId, index) => ({ instanceId: `bd22714a-a7b1-4c66-9f9d-${String(index).padStart(12, '0')}`, componentId, x: [.2,.48,.72,.25][index], y: [.47,.25,.46,.52][index], zone: index === 2 ? 'beside' : 'inside', regionId: index === 1 ? 'raised-circular-floor' : index === 2 ? 'beside-proposal' : 'lower-circular-floor', layer: index === 1 ? 220 : 20 }));
  const giftBoxV2Snapshot = { kind: GIFT_BOX_REQUEST_KIND, contractVersion: GIFT_BOX_REQUEST_CONTRACT_VERSION, catalogVersion: CATALOG_VERSION, assetVersion: preview ? ASSET_VERSION : 'archived-assets-unavailable', geometryVersion: GEOMETRY_VERSION, draftGeometryVersion: DRAFT_GEOMETRY_VERSION,
    coordinateSystem: 'normalized-scene', scene: GIFT_BOX_REQUEST_SCENE,
    selection: { boxId: 'box-11', items: [{ componentId: 'rose-red', quantity: 2 }, { componentId: 'plush-1', quantity: 1 }, { componentId: 'chocolate-1', quantity: 1 }], ribbonId: 'ribbon-red', giftCard: { componentId: 'gift-card-1', message: blankCard ? '' : message } }, placements,
    estimate: { currency: 'EGP', componentSubtotalPiastres: 23200, items, delivery: { status: 'pending_confirmation', pricePiastres: null } },
    physicalFitReviewRequired: true, arrangementApproved: false, geometryReviewStatus: 'unreviewed', submissionAllowed: false, orderConversionAllowed: false, inventoryReserved: false,
    physicalFitReview: { required: true, authoritativeGeometryStatus: 'unreviewed', draftVersionVerified: false, regionIdsVerified: false, placementTraceStatus: 'unverified-customer-proposal' } };
  return { id, reference: 'TW-123456FEDCBA', service: 'gift_box', customer: { name: 'Synthetic V2 Customer', phone: '+201012345678' }, details: { quantity: 1 }, giftBoxV2Snapshot,
    components: [], estimate: { baseUnitPiastres: null, knownSubtotalPiastres: 23200, shippingPiastres: null }, state: 'submitted', status: 'submitted', createdAt: now, followUpDueAt: '2026-10-28T21:00:00Z', quotations: [], history: [{ event: 'submitted', at: now, actor: 'customer' }], files: [], revision: 0, order: null, whatsapp: null };
}
async function fixture(page, options = {}) {
  await mockCommerce(page, { role: 'admin' });
  const record = requestRecord(options), actions = [];
  if (options.malformed) delete record.giftBoxV2Snapshot.estimate.items[0].unit;
  await page.route('**/api/v1/admin/commerce/service-requests/**', async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (route.request().url().endsWith('/action')) {
      const action = route.request().postDataJSON(); actions.push(action); record.revision++;
      if (action.action === 'review') record.state = record.status = 'needs_review';
      record.history.push({ event: action.action, at: now, note: action.reason });
    }
    return route.fulfill({ headers: cors, json: { ok: true, data: { request: record } } });
  });
  return { record, actions };
}
test('saved V2 owner details show server pricing, finishing and instance traces while legacy financial actions stay hidden', async ({ page }, testInfo) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const data = await fixture(page);
  await page.goto(`/admin/requests/${id}`);
  await expect(page.getByRole('heading', { name: 'Saved Gift Box V2 request' })).toBeVisible();
  await expect(page.getByText('Physical-fit review required.', { exact: true })).toBeVisible();
  await expect(page.getByText('EGP 232.00', { exact: true })).toBeVisible();
  const priceTable = page.locator('.request-v2-details').getByRole('table').first();
  await expect(priceTable.getByRole('cell').filter({ hasText: 'Synthetic saved retail chocolate' })).toBeVisible();
  await expect(page.getByText('complete pictured retail unit', { exact: false })).toBeVisible();
  await expect(priceTable.getByRole('cell').filter({ hasText: 'Made to order' })).toBeVisible();
  await expect(priceTable.getByRole('cell').filter({ hasText: 'Availability only; no numeric stock' })).toBeVisible();
  await expect(page.locator('.request-v2-message')).toHaveText(message); expect(await page.evaluate(() => window.requestCardInjected)).toBeUndefined();
  await expect(page.getByText('Illustrative preview unavailable', { exact: false })).toBeVisible();
  await expect(page.getByText('lower-circular-floor', { exact: true })).toHaveCount(2);
  await expect(page.getByText('raised-circular-floor', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Prepare a new quotation version' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Create order from accepted quotation' })).toHaveCount(0);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 320) {
      const tableRegion = page.getByRole('region', { name: 'Saved item prices and inventory' });
      expect(await tableRegion.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
      await tableRegion.focus(); await page.keyboard.press('ArrowRight');
      await expect.poll(() => tableRegion.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
    }
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: testInfo.outputPath('gift-box-v2-owner-request-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 320, height: 900 });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: testInfo.outputPath('gift-box-v2-owner-request-320.png'), fullPage: true });
  await page.getByLabel('Private review / WhatsApp evidence note').fill('Owner needs measurements and fit review');
  await page.getByRole('button', { name: 'Mark Needs Review' }).click();
  await expect.poll(() => data.actions.length).toBe(1); expect(data.actions[0]).toMatchObject({ revision: 0, action: 'review' });
  expect(errors).toEqual([]);
});
test('blank card messages stay explicit and only matching DEV artwork may provide an illustrative preview', async ({ page }) => {
  await fixture(page, { preview: true, blankCard: true });
  await page.goto(`/admin/requests/${id}`);
  await expect(page.getByText('Blank message selected.', { exact: false })).toBeVisible();
  await expect(page.getByText('Draft version and region IDs are unverified customer trace labels', { exact: false })).toBeVisible();
  await page.getByText('Saved configuration and geometry versions', { exact: true }).click();
  await expect(page.getByText(GIFT_BOX_REQUEST_CONTRACT_VERSION, { exact: true })).toBeVisible();
  await expect(page.getByText('Authoritative geometry remains unreviewed.', { exact: false })).toBeVisible();
  // Missing local media must degrade honestly; production media is never guessed.
  await expect.poll(async () => await page.getByRole('img', { name: 'Illustrative saved gift layout; physical fit and scale unreviewed' }).count() + await page.getByText('Illustrative preview unavailable', { exact: false }).count()).toBe(1);
  await expect(page.getByRole('button', { name: /Move|Remove selected item/ })).toHaveCount(0);
});
test('a malformed same-version V2 snapshot shows specialist review without prices, media or legacy financial actions', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await fixture(page, { malformed: true, preview: true });
  await page.goto(`/admin/requests/${id}`);
  await expect(page.getByRole('heading', { name: 'Saved Gift Box V2 request' })).toBeVisible();
  await expect(page.getByText('This saved request version requires specialist review.', { exact: false })).toBeVisible();
  await expect(page.getByText('Its pricing and layout details are unavailable.', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Saved items and server-calculated prices' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Prepare a new quotation version' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Create order from accepted quotation' })).toHaveCount(0);
  await expect(page.locator('.request-v2-preview')).toHaveCount(0);
  expect(errors).toEqual([]);
});
