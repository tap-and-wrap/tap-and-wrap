import test from 'node:test';
import assert from 'node:assert/strict';
import { ASSET_VERSION, CATALOG_VERSION, GEOMETRY_VERSION, getFixedComponent } from '../../shared/gift-box/definitions.mjs';
import { GIFT_BOX_COMMERCE_DRAFT_REFERENCE_VERSION } from '../../shared/gift-box/commerce-contract.mjs';
import { prepareGiftBoxV2CommerceQuote } from '../src/gift-box/commerce-quote.js';
import { calculateEstimate } from '../src/gift-box/pricing.js';
import { prepareGiftBoxV2Request } from '../src/gift-box/request-preparation.js';
import { GIFT_BOX_REQUEST_CONTRACT_VERSION, GIFT_BOX_REQUEST_KIND } from '../../shared/gift-box/request-contract.mjs';
import { assertGiftBoxV2SubmissionClosed } from '../src/gift-box/request-gates.js';

// All approved fulfillment examples are isolated fixtures. No real policy exists.
const versions = { catalogVersion: CATALOG_VERSION, assetVersion: ASSET_VERSION, geometryVersion: GEOMETRY_VERSION,
  draftGeometryVersion: GIFT_BOX_COMMERCE_DRAFT_REFERENCE_VERSION };
const configuration = () => ({ kind: 'gift_box_v2', contractVersion: 'gift-box-commerce-v1', ...versions,
  coordinateSystem: 'normalized-scene', selection: { boxId: 'box-2',
    items: [{ componentId: 'rose-red', quantity: 2 }, { componentId: 'plush-1', quantity: 1 }, { componentId: 'chocolate-1', quantity: 1 }],
    ribbonId: 'ribbon-navy', giftCard: { componentId: 'gift-card-1', message: 'For you 🌹' } },
  placements: ['rose-red', 'rose-red', 'plush-1', 'chocolate-1'].map((componentId, index) => ({
    instanceId: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, componentId,
    x: .2 + index * .1, y: .4, zone: 'inside', regionId: 'fixture-inside', layer: index,
  })) });
const settings = () => Object.entries({ 'box-2': 20000, 'rose-red': 3000, 'plush-1': 50000,
  'chocolate-1': 10000, 'ribbon-navy': 5000, 'gift-card-1': 5000 }).map(([componentId, pricePiastres]) => ({
  componentId, displayName: `Fixture ${componentId}`, pricePiastres, priceApproval: 'paid',
  priceApprovedBy: '507f1f77bcf86cd799439011', priceApprovedAt: new Date('2026-10-28T08:00:00Z'),
  enabled: true, available: true, __v: 1,
  inventoryMode: getFixedComponent(componentId).category === 'ribbon' ? 'status_only' : 'tracked',
  inventoryQuantity: getFixedComponent(componentId).category === 'ribbon' ? null : 10,
}));
const policy = () => ({ contractVersion: 'gift-box-fulfillment-policy-v1', policyId: 'isolated-test-policy', policyVersion: 'fixture-v1',
  boxId: 'box-2', status: 'approved', approvedBy: 'isolated-test-reviewer', approvedAt: '2026-10-28T08:00:00Z', withdrawnAt: null, ...versions,
  regions: [{ regionId: 'fixture-inside', zone: 'inside', compartmentId: null }], compartments: [],
  componentRules: settings().filter(item => item.componentId !== 'box-2').map(item => ({ componentId: item.componentId,
    maxQuantity: item.componentId === 'rose-red' ? 10 : 1, oversizedPlush: false, allowOversizedInside: false,
    allowedRegionIds: ['flower', 'plush', 'chocolate'].includes(getFixedComponent(item.componentId).category) ? ['fixture-inside'] : [] })),
  limits: { maxUnits: 10, maxByCategory: { flower: 10, plush: 2, chocolate: 5 },
    mixedContentLimits: [{ categories: ['flower', 'plush', 'chocolate'], maxUnits: 10 }] },
});
const quote = (config = configuration(), snapshot = settings(), quantity = 1, fulfillmentPolicy = policy()) =>
  prepareGiftBoxV2CommerceQuote({ configuration: config, quantity }, snapshot, { fulfillmentPolicy });

test('pure commerce quote itemizes one completed box and multiplies every component for the cart line', () => {
  const result = quote(configuration(), settings(), 2);
  assert.equal(result.unitPricePiastres, 96000);
  assert.equal(result.lineTotalPiastres, 192000);
  assert.equal(result.components.reduce((sum, item) => sum + item.lineSubtotalPiastres, 0), result.lineTotalPiastres);
  const roses = result.components.find(item => item.componentId === 'rose-red');
  assert.deepEqual([roses.quantityPerBox, roses.quantityForLine, roses.unitPricePiastres, roses.perBoxSubtotalPiastres, roses.lineSubtotalPiastres], [2, 4, 3000, 6000, 12000]);
  assert.ok(result.components.every(item => item.inventory.owner === 'GiftBoxComponentSetting'));
  assert.equal(result.components.find(item => item.category === 'ribbon').inventory.trackedDemand, 0);
  assert.deepEqual(result.delivery, { status: 'pending_confirmation', pricePiastres: null });
  for (const key of ['directCommerceEligible', 'addToCartAllowed', 'checkoutAllowed', 'physicalFitCertified', 'inventoryReserved', 'inventoryDeducted']) assert.equal(result[key], false);
  assert.equal(result.promotions.eligible, false);
});

test('quote preparation never mutates or deducts settings, configuration or policy and freezes its own snapshot', () => {
  const config = configuration(), snapshot = settings(), rules = policy();
  const before = structuredClone({ config, snapshot, rules });
  const first = quote(config, snapshot, 2, rules), second = quote(config, snapshot, 2, rules);
  assert.deepEqual({ config, snapshot, rules }, before);
  assert.equal(first.quoteId, second.quoteId);
  assert.ok(Object.isFrozen(first.configuration.placements[0]));
  assert.throws(() => { first.components[0].unitPricePiastres = 1; }, TypeError);
  snapshot[0].pricePiastres = 100;
  assert.equal(first.components[0].unitPricePiastres, 20000);
});

test('quantity, prices, totals, stock and approval claims cannot enter the customer quote envelope', () => {
  const raw = { configuration: configuration(), quantity: 1 };
  for (const injected of [{ pricePiastres: 1 }, { totalPiastres: 1 }, { stock: 100 }, { fulfillmentPolicy: policy() }, { approved: true }]) {
    assert.throws(() => prepareGiftBoxV2CommerceQuote({ ...raw, ...injected }, settings()));
  }
  for (const quantity of [0, -1, 1.2, '2', 100, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => quote(configuration(), settings(), quantity));
  const tampered = configuration(); tampered.selection.items[0].unitPricePiastres = 1;
  assert.throws(() => quote(tampered));
});

test('all tracked inventory includes cart line quantity, including the box, retail chocolate, card and roses', () => {
  for (const componentId of ['box-2', 'rose-red', 'plush-1', 'chocolate-1', 'gift-card-1']) {
    const snapshot = settings(); snapshot.find(item => item.componentId === componentId).inventoryQuantity = componentId === 'rose-red' ? 3 : 1;
    assert.throws(() => quote(configuration(), snapshot, 2), { code: 'GIFT_BOX_STOCK_EXCEEDED' });
  }
});

test('Made to Order has no numeric stock ceiling while ribbon uses availability only', () => {
  const snapshot = settings().map(item => item.componentId.startsWith('ribbon-') ? item : { ...item, inventoryMode: 'made_to_order', inventoryQuantity: 0 });
  const result = quote(configuration(), snapshot, 99);
  assert.equal(result.lineTotalPiastres, 9504000);
  assert.ok(result.components.every(item => item.inventory.trackedDemand === 0));
  snapshot[0].available = false;
  assert.throws(() => quote(configuration(), snapshot, 99), { code: 'GIFT_BOX_COMPONENT_UNAVAILABLE' });
  for (const patch of [{ inventoryMode: 'tracked', inventoryQuantity: 100 }, { inventoryQuantity: 10 }]) {
    const invalid = settings(); Object.assign(invalid.find(item => item.componentId === 'ribbon-navy'), patch);
    assert.throws(() => quote(configuration(), invalid), { code: 'GIFT_BOX_INVENTORY_PENDING' });
  }
});

test('missing, disabled, unavailable and unapproved settings fail closed with no starting-price fallback', () => {
  assert.throws(() => quote(configuration(), []), { code: 'GIFT_BOX_COMPONENT_UNAVAILABLE' });
  for (const [patch, code] of [[{ enabled: false }, 'GIFT_BOX_COMPONENT_UNAVAILABLE'], [{ available: false }, 'GIFT_BOX_COMPONENT_UNAVAILABLE'],
    [{ pricePiastres: null }, 'GIFT_BOX_PRICE_PENDING'], [{ priceApproval: 'pending' }, 'GIFT_BOX_PRICE_PENDING'],
    [{ priceApprovedBy: null }, 'GIFT_BOX_PRICE_PENDING'], [{ priceApprovedAt: null }, 'GIFT_BOX_PRICE_PENDING'],
    [{ inventoryMode: null }, 'GIFT_BOX_INVENTORY_PENDING']]) {
    const snapshot = settings(); Object.assign(snapshot[3], patch);
    assert.throws(() => quote(configuration(), snapshot), { code });
  }
  const duplicate = settings(); duplicate.push({ ...duplicate[0] });
  assert.throws(() => quote(configuration(), duplicate), { code: 'GIFT_BOX_SETTINGS_INVALID' });
});

test('only explicitly approved complimentary zero is accepted', () => {
  const snapshot = settings(); snapshot[3].pricePiastres = 0;
  assert.throws(() => quote(configuration(), snapshot), { code: 'GIFT_BOX_PRICE_PENDING' });
  snapshot[3].priceApproval = 'complimentary';
  assert.equal(quote(configuration(), snapshot).unitPricePiastres, 86000);
  snapshot[3].priceApproval = 'paid'; snapshot[3].pricePiastres = -1;
  assert.throws(() => quote(configuration(), snapshot), { code: 'GIFT_BOX_PRICE_PENDING' });
});

test('malformed selected saved names, revisions and approval metadata fail closed', () => {
  for (const patch of [{ displayName: 'Bad\u0000name' }, { displayName: 'x'.repeat(121) }, { displayName: '\ud800' },
    { __v: -1 }, { __v: 1.1 }, { priceApprovedBy: 'not-an-admin-id' }, { priceApprovedAt: new Date('invalid') },
    { priceApprovedAt: '2026-10-28T08:00:00Z' }]) {
    const snapshot = settings(); Object.assign(snapshot[0], patch);
    assert.throws(() => quote(configuration(), snapshot), { code: 'GIFT_BOX_SETTINGS_INVALID' });
  }
});

test('safe integer arithmetic rejects component, subtotal and cart line overflow', () => {
  const snapshot = settings(); snapshot[1].pricePiastres = Number.MAX_SAFE_INTEGER;
  assert.throws(() => quote(configuration(), snapshot), { code: 'GIFT_BOX_AMOUNT_OVERFLOW' });
  snapshot[1].pricePiastres = Number.MAX_SAFE_INTEGER + 1;
  assert.throws(() => quote(configuration(), snapshot), { code: 'GIFT_BOX_PRICE_PENDING' });
  const config = configuration(); config.selection.items = []; config.selection.giftCard = null; config.placements = [];
  const minimal = settings().filter(item => ['box-2', 'ribbon-navy'].includes(item.componentId));
  minimal[0].pricePiastres = Number.MAX_SAFE_INTEGER; minimal[1].pricePiastres = 1;
  assert.throws(() => quote(config, minimal), { code: 'GIFT_BOX_AMOUNT_OVERFLOW' });
  minimal[0].pricePiastres -= 1;
  assert.equal(quote(config, minimal).unitPricePiastres, Number.MAX_SAFE_INTEGER);
  assert.throws(() => quote(config, minimal, 2), { code: 'GIFT_BOX_AMOUNT_OVERFLOW' });
});

test('current price/revision and cart quantity change quotes without changing configuration identity', () => {
  const first = quote();
  const snapshot = settings(); snapshot[0].pricePiastres += 100; snapshot[0].__v += 1; snapshot[0].inventoryQuantity = 20;
  const changed = quote(configuration(), snapshot, 2);
  assert.equal(first.configurationId, changed.configurationId);
  assert.notEqual(first.quoteId, changed.quoteId);
  assert.equal(changed.unitPricePiastres, 96100);
  const rearranged = configuration(); rearranged.placements[0].x += .01;
  assert.notEqual(first.configurationId, quote(rearranged).configurationId);
});

test('missing or withdrawn physical fulfillment approval blocks commerce quote preparation', () => {
  assert.throws(() => prepareGiftBoxV2CommerceQuote({ configuration: configuration() }, settings()), { code: 'GIFT_BOX_FULFILLMENT_UNAPPROVED' });
  const withdrawn = policy(); withdrawn.status = 'withdrawn'; withdrawn.withdrawnAt = '2026-10-28T09:00:00Z';
  assert.throws(() => quote(configuration(), settings(), 1, withdrawn), { code: 'GIFT_BOX_FULFILLMENT_WITHDRAWN' });
  const incompatible = policy(); incompatible.componentRules = incompatible.componentRules.filter(item => item.componentId !== 'chocolate-1');
  assert.throws(() => quote(configuration(), settings(), 1, incompatible), { code: 'GIFT_BOX_FULFILLMENT_INCOMPATIBLE' });
});

test('existing component estimates and guarded V2 requests retain their separate contract and closed submission', () => {
  const config = configuration();
  assert.equal(calculateEstimate(config.selection, settings()).componentSubtotalPiastres, 96000);
  const request = { ...config, kind: GIFT_BOX_REQUEST_KIND, contractVersion: GIFT_BOX_REQUEST_CONTRACT_VERSION,
    requestKey: '20000000-0000-4000-8000-000000000001', customer: { name: 'Fixture Customer', phone: '01012345678' } };
  const prepared = prepareGiftBoxV2Request(request, settings());
  assert.equal(prepared.snapshot.estimate.componentSubtotalPiastres, 96000);
  assert.equal(prepared.snapshot.submissionAllowed, false);
  assert.throws(() => quote(request));
  assert.throws(() => prepareGiftBoxV2Request(config, settings()));
  assert.throws(assertGiftBoxV2SubmissionClosed, { code: 'GIFT_BOX_V2_SUBMISSION_DISABLED' });
});
