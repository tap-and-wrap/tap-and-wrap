import test from 'node:test';
import assert from 'node:assert/strict';
import { ASSET_VERSION, CATALOG_VERSION, GEOMETRY_VERSION, FIXED_COMPONENTS } from '../../shared/gift-box/definitions.mjs';
import { GIFT_BOX_COMMERCE_CONTRACT_VERSION, GIFT_BOX_COMMERCE_DRAFT_REFERENCE_VERSION } from '../../shared/gift-box/commerce-contract.mjs';
import { assertGiftBoxFulfillment, giftBoxFulfillmentPolicyInput, GIFT_BOX_FULFILLMENT_POLICY_CONTRACT_VERSION,
  GIFT_BOX_FULFILLMENT_POLICIES, getGiftBoxFulfillmentPolicy } from '../src/gift-box/fulfillment-policy.js';

// All positive physical policies in this file are isolated invented test rules.
// They are never exported to runtime or presented as merchant approval.
const configuration = (boxId = 'box-2') => ({
  kind: 'gift_box_v2', contractVersion: GIFT_BOX_COMMERCE_CONTRACT_VERSION,
  catalogVersion: CATALOG_VERSION, assetVersion: ASSET_VERSION, geometryVersion: GEOMETRY_VERSION,
  draftGeometryVersion: GIFT_BOX_COMMERCE_DRAFT_REFERENCE_VERSION, coordinateSystem: 'normalized-scene',
  selection: { boxId, items: [{ componentId: 'rose-red', quantity: 1 }, { componentId: 'plush-1', quantity: 1 }],
    ribbonId: 'ribbon-navy', giftCard: null },
  placements: [
    { instanceId: 'd39bff72-8917-49cb-9c4b-b9d2ae3d7ae1', componentId: 'rose-red', x: .3, y: .4, zone: 'inside', regionId: 'test-floor', layer: 1 },
    { instanceId: '29641ae2-6c3d-48ef-a287-25854a31d366', componentId: 'plush-1', x: .5, y: .6, zone: 'inside', regionId: 'test-floor', layer: 2 },
  ],
});
const policy = (boxId = 'box-2') => ({
  contractVersion: GIFT_BOX_FULFILLMENT_POLICY_CONTRACT_VERSION, policyId: 'isolated-test-policy', policyVersion: 'test-v1',
  boxId, status: 'approved', approvedBy: 'isolated-test-owner', approvedAt: '2026-10-28T10:00:00Z', withdrawnAt: null,
  catalogVersion: CATALOG_VERSION, assetVersion: ASSET_VERSION, geometryVersion: GEOMETRY_VERSION,
  draftGeometryVersion: GIFT_BOX_COMMERCE_DRAFT_REFERENCE_VERSION,
  regions: [{ regionId: 'test-floor', zone: 'inside', compartmentId: null }, { regionId: 'test-beside', zone: 'beside', compartmentId: null }],
  compartments: [],
  componentRules: [
    { componentId: 'rose-red', maxQuantity: 3, allowedRegionIds: ['test-floor'], oversizedPlush: false, allowOversizedInside: false },
    { componentId: 'plush-1', maxQuantity: 2, allowedRegionIds: ['test-floor', 'test-beside'], oversizedPlush: false, allowOversizedInside: false },
    { componentId: 'ribbon-navy', maxQuantity: 1, allowedRegionIds: [], oversizedPlush: false, allowOversizedInside: false },
  ],
  limits: { maxUnits: 5, maxByCategory: { flower: 3, plush: 2, chocolate: 0 }, mixedContentLimits: [{ categories: ['flower', 'plush'], maxUnits: 4 }] },
});
const box11 = () => {
  const configurationFixture = configuration('box-11'), policyFixture = policy('box-11');
  policyFixture.compartments = [{ id: 'test-lower', maxUnits: 1 }, { id: 'test-upper', maxUnits: 1 }];
  policyFixture.regions = [
    { regionId: 'test-lower-floor', zone: 'inside', compartmentId: 'test-lower' },
    { regionId: 'test-upper-floor', zone: 'inside', compartmentId: 'test-upper' },
  ];
  policyFixture.componentRules[0].allowedRegionIds = ['test-lower-floor'];
  policyFixture.componentRules[1].allowedRegionIds = ['test-upper-floor'];
  configurationFixture.placements[0].regionId = 'test-lower-floor';
  configurationFixture.placements[1].regionId = 'test-upper-floor';
  return { configurationFixture, policyFixture };
};

test('every real box remains physically unapproved and absence never infers a policy from geometry', () => {
  assert.deepEqual(GIFT_BOX_FULFILLMENT_POLICIES, []);
  assert.ok(Object.isFrozen(GIFT_BOX_FULFILLMENT_POLICIES));
  for (const box of FIXED_COMPONENTS.filter(item => item.category === 'box')) {
    assert.equal(getGiftBoxFulfillmentPolicy(box.id), null);
    assert.throws(() => assertGiftBoxFulfillment(configuration(box.id), getGiftBoxFulfillmentPolicy(box.id)), { code: 'GIFT_BOX_FULFILLMENT_UNAPPROVED' });
  }
});

test('approved isolated policy validates explicit compatibility and returns a frozen versioned reference', () => {
  const input = configuration(), rules = policy(), before = structuredClone({ input, rules });
  const result = assertGiftBoxFulfillment(input, rules);
  assert.equal(result.directCommerceEligible, true);
  assert.equal(result.physicalFitCertifiedByGeometry, false);
  assert.equal(result.policyReference.policyVersion, 'test-v1');
  assert.equal(result.policyReference.approvedBy, 'isolated-test-owner');
  assert.ok(Object.isFrozen(result)); assert.ok(Object.isFrozen(result.policyReference));
  assert.deepEqual({ input, rules }, before);
});

test('pending and withdrawn policies block independently of business setting availability', () => {
  const pending = { ...policy(), status: 'pending', approvedBy: null, approvedAt: null };
  assert.throws(() => assertGiftBoxFulfillment(configuration(), pending), { code: 'GIFT_BOX_FULFILLMENT_UNAPPROVED' });
  const withdrawn = { ...policy(), status: 'withdrawn', withdrawnAt: '2026-10-28T11:00:00Z' };
  assert.throws(() => assertGiftBoxFulfillment(configuration(), withdrawn), { code: 'GIFT_BOX_FULFILLMENT_WITHDRAWN' });
  for (const patch of [{ approvedBy: null }, { approvedAt: null }, { withdrawnAt: '2026-10-28T11:00:00Z' }]) {
    assert.throws(() => assertGiftBoxFulfillment(configuration(), { ...policy(), ...patch }), { code: 'GIFT_BOX_FULFILLMENT_POLICY_INVALID' });
  }
});

test('unsupported policy versions, stale references and unknown approval fields fail closed', () => {
  for (const patch of [{ contractVersion: 'future' }, { catalogVersion: 'old' }, { assetVersion: 'old' },
    { geometryVersion: 'approved-by-browser' }, { draftGeometryVersion: 'future' }, { physicallyApproved: true }]) {
    assert.throws(() => assertGiftBoxFulfillment(configuration(), { ...policy(), ...patch }), { code: 'GIFT_BOX_FULFILLMENT_POLICY_INVALID' });
  }
  assert.throws(() => assertGiftBoxFulfillment(configuration('box-3'), policy()), { code: 'GIFT_BOX_FULFILLMENT_POLICY_MISMATCH' });
});

test('unlisted components, quantity excess and unapproved finishing combinations are incompatible', () => {
  const missing = policy(); missing.componentRules = missing.componentRules.filter(rule => rule.componentId !== 'rose-red');
  assert.throws(() => assertGiftBoxFulfillment(configuration(), missing), { code: 'GIFT_BOX_FULFILLMENT_INCOMPATIBLE' });
  const card = configuration(); card.selection.giftCard = { componentId: 'gift-card-1', message: '' };
  assert.throws(() => assertGiftBoxFulfillment(card, policy()), { code: 'GIFT_BOX_FULFILLMENT_INCOMPATIBLE' });
  const quantity = configuration(); quantity.selection.items[0].quantity = 2;
  quantity.placements.push({ ...quantity.placements[0], instanceId: 'e089a136-9abb-4338-a3ee-0f8ef1a3760e', x: .4 });
  const limited = policy(); limited.componentRules[0].maxQuantity = 1;
  assert.throws(() => assertGiftBoxFulfillment(quantity, limited), { code: 'GIFT_BOX_FULFILLMENT_INCOMPATIBLE' });
});

test('conservative total, per-category and mixed-content limits apply per completed box', () => {
  const total = policy(); total.limits.maxUnits = 1;
  assert.throws(() => assertGiftBoxFulfillment(configuration(), total), { code: 'GIFT_BOX_FULFILLMENT_LIMIT' });
  const category = policy(); category.limits.maxByCategory.flower = 0;
  assert.throws(() => assertGiftBoxFulfillment(configuration(), category), { code: 'GIFT_BOX_FULFILLMENT_LIMIT' });
  const mixed = policy(); mixed.limits.mixedContentLimits[0].maxUnits = 1;
  assert.throws(() => assertGiftBoxFulfillment(configuration(), mixed), { code: 'GIFT_BOX_FULFILLMENT_LIMIT' });
  const single = configuration(); single.selection.items.pop(); single.placements.pop();
  assert.equal(assertGiftBoxFulfillment(single, mixed).directCommerceEligible, true);
});

test('inside/beside permissions and oversized plush restrictions require explicit owner rules', () => {
  const beside = configuration(); beside.placements[1] = { ...beside.placements[1], zone: 'beside', regionId: 'test-beside' };
  assert.equal(assertGiftBoxFulfillment(beside, policy()).directCommerceEligible, true);
  const denied = policy(); denied.componentRules[1].allowedRegionIds = ['test-floor'];
  assert.throws(() => assertGiftBoxFulfillment(beside, denied), { code: 'GIFT_BOX_FULFILLMENT_PLACEMENT' });
  const oversized = policy(); oversized.componentRules[1].oversizedPlush = true;
  assert.throws(() => assertGiftBoxFulfillment(configuration(), oversized), { code: 'GIFT_BOX_FULFILLMENT_PLACEMENT' });
  assert.equal(assertGiftBoxFulfillment(beside, oversized).directCommerceEligible, true);
  oversized.componentRules[1].allowOversizedInside = true;
  assert.equal(assertGiftBoxFulfillment(configuration(), oversized).directCommerceEligible, true);
  const mismatchedZone = configuration(); mismatchedZone.placements[1].regionId = 'test-beside';
  assert.throws(() => assertGiftBoxFulfillment(mismatchedZone, policy()), { code: 'GIFT_BOX_FULFILLMENT_PLACEMENT' });
});

test('Box 11 independently validates its two compartments and disallows bridging aliases', () => {
  const { configurationFixture, policyFixture } = box11();
  assert.equal(assertGiftBoxFulfillment(configurationFixture, policyFixture).directCommerceEligible, true);
  const bridge = structuredClone(configurationFixture); bridge.placements[0].regionId = 'test-bridge-between-compartments';
  assert.throws(() => assertGiftBoxFulfillment(bridge, policyFixture), { code: 'GIFT_BOX_FULFILLMENT_PLACEMENT' });
  const wrongCompartment = structuredClone(configurationFixture); wrongCompartment.placements[0].regionId = 'test-upper-floor';
  assert.throws(() => assertGiftBoxFulfillment(wrongCompartment, policyFixture), { code: 'GIFT_BOX_FULFILLMENT_PLACEMENT' });
  const malformedBridge = structuredClone(configurationFixture); malformedBridge.placements[0].regionIds = ['test-lower-floor', 'test-upper-floor'];
  assert.throws(() => assertGiftBoxFulfillment(malformedBridge, policyFixture));
  const full = structuredClone(policyFixture); full.compartments[0].maxUnits = 0;
  assert.throws(() => assertGiftBoxFulfillment(configurationFixture, full), { code: 'GIFT_BOX_FULFILLMENT_COMPARTMENT_LIMIT' });
});

test('Box 11 policy cannot collapse compartments, add shared inside regions or reference unknown compartments', () => {
  const { configurationFixture, policyFixture } = box11();
  for (const mutate of [
    rules => rules.compartments.pop(),
    rules => { rules.regions[0].compartmentId = null; },
    rules => { rules.regions[0].compartmentId = 'unknown'; },
    rules => { rules.regions[1].compartmentId = 'test-lower'; },
  ]) {
    const changed = structuredClone(policyFixture); mutate(changed);
    assert.throws(() => assertGiftBoxFulfillment(configurationFixture, changed), { code: 'GIFT_BOX_FULFILLMENT_POLICY_INVALID' });
  }
});

test('policy rejects duplicate identities, cross-category privileges and malicious fields', () => {
  for (const mutate of [
    rules => rules.componentRules.push({ ...rules.componentRules[0] }),
    rules => rules.regions.push({ ...rules.regions[0] }),
    rules => rules.componentRules[0].allowedRegionIds.push('test-floor'),
    rules => { rules.componentRules[0].allowedRegionIds = ['test-beside']; },
    rules => { rules.componentRules[0].oversizedPlush = true; },
    rules => { rules.componentRules[0].componentId = 'box-2'; },
    rules => { rules.componentRules[0].componentId = 'product-kitkat'; },
    rules => { rules.componentRules[0].pricePiastres = 0; },
    rules => { rules.limits.maxUnits = -1; },
    rules => { rules.limits.mixedContentLimits[0].categories = ['flower', 'flower']; },
  ]) {
    const changed = policy(); mutate(changed);
    assert.equal(giftBoxFulfillmentPolicyInput.safeParse(changed).success, false);
  }
});
