import { randomUUID } from 'node:crypto';
import { ASSET_VERSION, CATALOG_VERSION, GEOMETRY_VERSION, getFixedComponent } from '../../../shared/gift-box/definitions.mjs';
import { GIFT_BOX_COMMERCE_DRAFT_REFERENCE_VERSION } from '../../../shared/gift-box/commerce-contract.mjs';
import { GiftBoxComponentSetting } from '../../src/models/GiftBoxComponentSetting.js';

// Synthetic business settings and reviewed policies exist only in disposable
// fixtures. They never seed the real registry or an existing merchant database.
const versions = { catalogVersion: CATALOG_VERSION, assetVersion: ASSET_VERSION, geometryVersion: GEOMETRY_VERSION,
  draftGeometryVersion: GIFT_BOX_COMMERCE_DRAFT_REFERENCE_VERSION };
export function giftCartConfiguration({ roses = 3, message = 'Private fixture message', x = .3, card = true,
  plush = true, chocolate = true } = {}) {
  const items = [...(roses ? [{ componentId: 'rose-red', quantity: roses }] : []),
    ...(plush ? [{ componentId: 'plush-1', quantity: 1 }] : []), ...(chocolate ? [{ componentId: 'chocolate-1', quantity: 1 }] : [])];
  return { kind: 'gift_box_v2', contractVersion: 'gift-box-commerce-v1', ...versions, coordinateSystem: 'normalized-scene',
    selection: { boxId: 'box-2', items, ribbonId: 'ribbon-navy', giftCard: card ? { componentId: 'gift-card-1', message } : null },
    placements: items.flatMap(item => Array.from({ length: item.quantity }, (_, index) => ({ instanceId: randomUUID(), componentId: item.componentId,
      x: x + index * .02, y: .4, zone: 'inside', regionId: 'test-cart-inside', layer: index }))) };
}
export function giftCartInput(configuration = giftCartConfiguration(), quantity = 1, operationKey = randomUUID()) {
  return { kind: 'gift_box_v2', configuration, quantity, operationKey };
}
export function giftCartPolicy() {
  return { contractVersion: 'gift-box-fulfillment-policy-v1', policyId: 'isolated-cart-policy', policyVersion: 'fixture-v1', boxId: 'box-2',
    status: 'approved', approvedBy: 'isolated-fixture-reviewer', approvedAt: '2026-10-28T08:00:00Z', withdrawnAt: null, ...versions,
    regions: [{ regionId: 'test-cart-inside', zone: 'inside', compartmentId: null }], compartments: [],
    componentRules: ['rose-red', 'plush-1', 'chocolate-1', 'ribbon-navy', 'gift-card-1'].map(componentId => ({
      componentId, maxQuantity: componentId === 'rose-red' ? 10 : 1, oversizedPlush: false, allowOversizedInside: false,
      allowedRegionIds: ['flower', 'plush', 'chocolate'].includes(getFixedComponent(componentId).category) ? ['test-cart-inside'] : [],
    })), limits: { maxUnits: 20, maxByCategory: { flower: 10, plush: 2, chocolate: 5 },
      mixedContentLimits: [{ categories: ['flower', 'plush', 'chocolate'], maxUnits: 20 }] } };
}
export async function seedGiftCartSettings(adminId, { quantities = {}, modes = {} } = {}) {
  if (process.env.NODE_ENV !== 'test' || process.env.MONGODB_URI || process.env.CATALOG_IMPORT_STAGING_URI
    || GiftBoxComponentSetting.db.name !== 'tap_wrap_catalog_test' || GiftBoxComponentSetting.db.host !== '127.0.0.1') {
    throw new Error('Synthetic gift settings require the fresh disposable loopback fixture.');
  }
  return GiftBoxComponentSetting.create(Object.entries({ 'box-2': 20000, 'rose-red': 3000, 'plush-1': 50000,
    'chocolate-1': 10000, 'ribbon-navy': 5000, 'gift-card-1': 5000 }).map(([componentId, pricePiastres], index) => ({
    componentId, displayName: `Synthetic ${componentId}`, displayOrder: index + 1, pricePiastres, priceApproval: 'paid',
    priceApprovedBy: adminId, priceApprovedAt: new Date('2026-10-28T08:00:00Z'), createdBy: adminId, updatedBy: adminId,
    enabled: true, available: true, inventoryMode: modes[componentId] ?? (componentId.startsWith('ribbon-') ? 'status_only' : 'tracked'),
    inventoryQuantity: componentId.startsWith('ribbon-') ? null : quantities[componentId] ?? 20,
  })));
}
