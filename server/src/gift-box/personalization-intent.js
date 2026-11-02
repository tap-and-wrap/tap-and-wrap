import { parseGiftBoxPersonalizationIntent } from '../../../shared/gift-box/personalization-intent.mjs';
import { deepFreeze } from '../../../shared/gift-box/definitions.mjs';

// Future bridge ONLY. A valid shape does not mean the file IDs belong to the
// customer, are complete/retained, or are approved for this purpose. The next
// integration must verify those facts against the existing private Upload
// model and authorize real print/engraving options and server-side prices.
export function inspectUnverifiedGiftBoxPersonalizationIntent(raw) {
  const intent = parseGiftBoxPersonalizationIntent(raw);
  return deepFreeze({ intent, uploadOwnershipVerified: false, physicalFitVerified: false,
    manufacturingApproved: false, priceApproved: false, checkoutAllowed: false });
}
