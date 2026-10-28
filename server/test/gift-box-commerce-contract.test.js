import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ASSET_VERSION, CATALOG_VERSION, GEOMETRY_VERSION } from '../../shared/gift-box/definitions.mjs';
import { GIFT_BOX_COMMERCE_KIND, GIFT_BOX_COMMERCE_CONTRACT_VERSION, GIFT_BOX_COMMERCE_COORDINATE_SYSTEM, GIFT_BOX_COMMERCE_DRAFT_REFERENCE_VERSION } from '../../shared/gift-box/commerce-contract.mjs';
import { giftBoxV2CommerceInput, canonicalizeGiftBoxConfiguration, identifyGiftBoxConfiguration } from '../src/gift-box/commerce-contract.js';
import { giftBoxV2RequestInput } from '../src/gift-box/request-contract.js';

// Synthetic arrangements exercise contract semantics, never physical approval.
function input() {
  const items = [{ componentId: 'rose-red', quantity: 2 }, { componentId: 'plush-1', quantity: 1 }, { componentId: 'chocolate-1', quantity: 1 }];
  return { kind: GIFT_BOX_COMMERCE_KIND, contractVersion: GIFT_BOX_COMMERCE_CONTRACT_VERSION,
    catalogVersion: CATALOG_VERSION, assetVersion: ASSET_VERSION, geometryVersion: GEOMETRY_VERSION,
    draftGeometryVersion: GIFT_BOX_COMMERCE_DRAFT_REFERENCE_VERSION, coordinateSystem: GIFT_BOX_COMMERCE_COORDINATE_SYSTEM,
    selection: { boxId: 'box-2', items, ribbonId: 'ribbon-red', giftCard: { componentId: 'gift-card-1', message: 'For you\nهدية 💐' } },
    placements: items.flatMap(item => Array.from({ length: item.quantity }, (_, index) => ({ instanceId: randomUUID(), componentId: item.componentId,
      x: .3 + index * .1, y: .5, zone: 'inside', regionId: 'synthetic-floor', layer: index + 20 }))),
  };
}
const identify = value => identifyGiftBoxConfiguration(value).configurationId;
const invalid = value => assert.equal(giftBoxV2CommerceInput.safeParse(value).success, false);

test('direct commerce is versioned separately from the request contract and requires a ribbon', () => {
  const raw = input();
  assert.equal(giftBoxV2CommerceInput.safeParse(raw).success, true);
  assert.equal(giftBoxV2RequestInput.safeParse(raw).success, false);
  invalid({ ...raw, kind: 'gift-box-v2' });
  invalid({ ...raw, requestKey: randomUUID() });
  invalid({ ...raw, customer: { name: 'Not part of configuration' } });
  invalid({ ...raw, selection: { ...raw.selection, ribbonId: null } });
  const missing = input(); delete missing.selection.ribbonId; invalid(missing);
  for (const field of ['contractVersion', 'catalogVersion', 'assetVersion', 'geometryVersion', 'draftGeometryVersion', 'coordinateSystem']) invalid({ ...raw, [field]: 'unsupported-version' });
});

test('recognized categories and unique quantity lines reject unknown or misplaced identities', () => {
  const raw = input();
  for (const boxId of ['box-99', 'rose-red', 'chocolate-1', '507f1f77bcf86cd799439011']) invalid({ ...raw, selection: { ...raw.selection, boxId } });
  for (const ribbonId of ['ribbon-unknown', 'box-2']) invalid({ ...raw, selection: { ...raw.selection, ribbonId } });
  for (const componentId of ['unknown', 'box-2', 'ribbon-red', 'gift-card-1']) invalid({ ...raw, selection: { ...raw.selection, items: [{ componentId, quantity: 1 }] } });
  invalid({ ...raw, selection: { ...raw.selection, items: [...raw.selection.items, raw.selection.items[0]] } });
  invalid({ ...raw, selection: { ...raw.selection, giftCard: { componentId: 'rose-red', message: '' } } });
});

test('quantity and aggregate computation limits reject malformed and excessive selections', () => {
  const raw = input();
  for (const quantity of [0, -1, 1.5, '1', NaN, Infinity, 101, Number.MAX_SAFE_INTEGER + 1]) invalid({ ...raw, selection: { ...raw.selection, items: [{ componentId: 'rose-red', quantity }] } });
  invalid({ ...raw, selection: { ...raw.selection, items: ['rose-red', 'rose-yellow', 'rose-black'].map(componentId => ({ componentId, quantity: 100 })) } });
});

test('strict nested contracts reject browser prices, stocks, approvals and malicious fields', () => {
  const raw = input();
  for (const patch of [{ pricePiastres: 0 }, { totalPiastres: 0 }, { quantity: 3 }, { inventoryQuantity: 9 }, { approved: true }, { physicalFitApproved: true }, { configurationId: 'forged' }, { policy: { approved: true } }, { constructor: {} }]) invalid({ ...raw, ...patch });
  invalid({ ...raw, selection: { ...raw.selection, unitPricePiastres: 0 } });
  invalid({ ...raw, selection: { ...raw.selection, items: raw.selection.items.map(item => ({ ...item, stock: 999 })) } });
  invalid({ ...raw, selection: { ...raw.selection, giftCard: { ...raw.selection.giftCard, approved: true } } });
  invalid({ ...raw, placements: raw.placements.map(item => ({ ...item, regionIds: ['left', 'right'] })) });
  invalid(JSON.parse(JSON.stringify(raw).replace('"selection":', '"__proto__":{"approved":true},"selection":')));
});

test('every selected unit requires one unique matching placement with bounded visual metadata', () => {
  const raw = input();
  invalid({ ...raw, placements: raw.placements.slice(1) });
  invalid({ ...raw, placements: [...raw.placements, { ...raw.placements[0], instanceId: randomUUID() }] });
  invalid({ ...raw, placements: raw.placements.map((item, index) => index ? item : { ...item, componentId: 'rose-yellow' }) });
  invalid({ ...raw, placements: raw.placements.map(item => ({ ...item, instanceId: raw.placements[0].instanceId })) });
  const duplicate = input(); duplicate.placements[1].instanceId = duplicate.placements[0].instanceId.toUpperCase(); invalid(duplicate);
  for (const patch of [{ instanceId: 'not-a-uuid' }, { x: -0.01 }, { y: 1.01 }, { x: NaN }, { y: Infinity }, { layer: 1.5 }, { layer: 1001 }, { regionId: '<script>' }, { zone: 'above' }, { componentId: 'box-2' }]) invalid({ ...raw, placements: raw.placements.map((item, index) => index ? item : { ...item, ...patch }) });
  invalid({ ...raw, placements: raw.placements.map((item, index) => index ? item : { ...item, zone: 'beside' }) });
  const beside = input(); beside.placements.find(item => item.componentId === 'plush-1').zone = 'beside';
  assert.equal(giftBoxV2CommerceInput.safeParse(beside).success, true);
});

test('gift cards retain literal well-formed Unicode messages with a 500-code-point limit', () => {
  for (const message of ['', '💐'.repeat(500), '<b>Literal</b>\nرسالة\t💐']) {
    const raw = input(); raw.selection.giftCard.message = message;
    assert.equal(canonicalizeGiftBoxConfiguration(raw).selection.giftCard.message, message);
  }
  for (const message of ['💐'.repeat(501), '\ud800', 'message\u0000']) {
    const raw = input(); raw.selection.giftCard.message = message; invalid(raw);
  }
});

test('canonical identity ignores collection order, object key order and regenerated editing UUIDs', () => {
  const raw = input(), reordered = structuredClone(raw);
  reordered.selection.items.reverse();
  reordered.placements.reverse();
  reordered.placements = reordered.placements.map(({ instanceId, ...placement }) => ({ ...Object.fromEntries(Object.entries(placement).reverse()), instanceId: randomUUID() }));
  const canonical = canonicalizeGiftBoxConfiguration(raw);
  assert.equal(identify(raw), identify(reordered));
  assert.deepEqual(canonical, canonicalizeGiftBoxConfiguration(reordered));
  assert.deepEqual(canonical, canonicalizeGiftBoxConfiguration(canonical));
  assert.equal(Object.isFrozen(canonical.placements[0]), true);
  assert.match(identify(raw), /^gift-box-configuration-v1:[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(raw).includes('00000000-0000-4000-8000-'), false);
});

test('canonical identity normalizes defaults and negative zero without changing customer text', () => {
  const raw = input(); raw.selection = { boxId: 'box-2', ribbonId: 'ribbon-red' }; raw.placements = [];
  assert.equal(identify(raw), identify({ ...raw, selection: { ...raw.selection, items: [], giftCard: null } }));
  const empty = input(); empty.selection.giftCard = { componentId: 'gift-card-1' };
  assert.equal(identify(empty), identify({ ...empty, selection: { ...empty.selection, giftCard: { componentId: 'gift-card-1', message: '' } } }));
  const positive = input(), negative = structuredClone(positive); positive.placements[0].x = 0; negative.placements[0].x = -0;
  assert.equal(identify(positive), identify(negative));
});

test('different selections, messages and component-to-placement associations stay distinct', () => {
  const raw = input(), original = identify(raw);
  const variants = [
    value => { value.selection.boxId = 'box-3'; },
    value => { value.selection.ribbonId = 'ribbon-white'; },
    value => { value.selection.giftCard = null; },
    value => { value.selection.giftCard.message += ' '; },
    value => { value.placements[0].x += .001; },
    value => { value.placements[0].y += .001; },
    value => { value.placements[0].layer++; },
    value => { value.placements[0].regionId = 'another-floor'; },
    value => { value.placements.find(item => item.componentId === 'plush-1').zone = 'beside'; },
    value => { value.selection.items[0].quantity++; value.placements.push({ ...value.placements[0], instanceId: randomUUID() }); },
    value => { const a = value.placements[0], b = value.placements.find(item => item.componentId === 'chocolate-1'); [a.x, b.x] = [.7, .2]; },
  ];
  for (const change of variants) { const value = structuredClone(raw); change(value); assert.notEqual(identify(value), original); }
  const a = input(); a.placements[0].x = .2; a.placements.find(item => item.componentId === 'chocolate-1').x = .7;
  const b = structuredClone(a); [b.placements[0].x, b.placements.find(item => item.componentId === 'chocolate-1').x] = [.7, .2];
  assert.notEqual(identify(a), identify(b));
});

test('permanent configuration contains no prices, live stock or saved-setting revisions', () => {
  const configuration = canonicalizeGiftBoxConfiguration(input());
  const text = JSON.stringify(configuration);
  for (const field of ['pricePiastres', 'totalPiastres', 'inventoryQuantity', 'settingsRevision', 'priceApproval', 'expectedRevision']) assert.equal(text.includes(field), false);
});
