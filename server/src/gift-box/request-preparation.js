import { deepFreeze } from '../../../shared/gift-box/definitions.mjs';
import { GIFT_BOX_REQUEST_SCENE } from '../../../shared/gift-box/request-contract.mjs';
import { normalizePhone } from '../commerce/orders.js';
import { fingerprint } from '../commerce/pricing.js';
import { calculateEstimate, requireComponent } from './pricing.js';
import { giftBoxV2RequestInput } from './request-contract.js';
import { builderError } from './validation.js';

// Pure preparation from an explicit saved-settings snapshot. No stock write,
// database connection, media lookup, notification or submission activation.
export function normalizeGiftBoxV2Request(raw) {
  const input = giftBoxV2RequestInput.parse(raw);
  for (const placement of input.placements) {
    const definition = requireComponent(placement.componentId, ['flower', 'plush', 'chocolate']);
    if (placement.zone === 'beside' && definition.category !== 'plush') throw builderError(400, 'GIFT_BOX_PLACEMENT_ZONE', 'Only plush toys may use the beside-box proposal.');
  }
  const normalized = { ...input, customer: { name: input.customer.name, phone: normalizePhone(input.customer.phone), email: input.customer.email || null },
    selection: { ...input.selection, ribbonId: input.selection.ribbonId ?? null, giftCard: input.selection.giftCard ?? null,
      items: [...input.selection.items].sort((a, b) => a.componentId.localeCompare(b.componentId)) },
    placements: [...input.placements].sort((a, b) => a.instanceId.localeCompare(b.instanceId)) };
  return normalized;
}
export function prepareGiftBoxV2Request(raw, savedSettings) {
  const normalized = normalizeGiftBoxV2Request(raw);
  // calculateEstimate rejects client prices, missing/unapproved settings and
  // insufficient/unavailable stock using the entire requested quantity.
  const estimate = calculateEstimate(normalized.selection, savedSettings);
  const { requestKey, customer, ...configuration } = normalized;
  return deepFreeze({ requestKey, customer, requestHash: fingerprint(normalized), snapshot: {
    ...configuration, scene: { ...GIFT_BOX_REQUEST_SCENE }, estimate,
    geometryReviewStatus: 'unreviewed', physicalFitReviewRequired: true, arrangementApproved: false,
    physicalFitReview: { required: true, authoritativeGeometryStatus: 'unreviewed', draftVersionVerified: false, regionIdsVerified: false, placementTraceStatus: 'unverified-customer-proposal' },
    submissionAllowed: false, orderConversionAllowed: false, inventoryReserved: false,
  } });
}
