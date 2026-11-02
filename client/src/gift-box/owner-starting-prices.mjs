// Owner's October 28 starting price schedule, in integer piastres.
// Admin-only review/import data. Never use this as a storefront, cart, or API price fallback.
import { FIXED_COMPONENTS } from '../../../shared/gift-box/definitions.mjs';

export const OWNER_STARTING_PRICE_VERSION = 'owner-starting-prices-2026-10-28';
const ribbonNames = [
  'Cream / Ivory', 'Blush Pink', 'Champagne', 'White', 'Burgundy / Dark Red',
  'Dusty Pink', 'Mint', 'Coral / Soft Pink-Red', 'Red', 'Navy', 'Black',
  'Grey-Blue / Blue-Grey', 'Mint Green', 'Classic Green', 'Emerald',
  'Baby Blue', 'Silver', 'Gold', 'Lavender', 'Beige', 'Peach',
];
const roseNames = { 'rose-red': 'Red Rose', 'rose-yellow': 'Yellow Rose', 'rose-black': 'Black Rose' };
const prices = { box: 20000, flower: 3000, plush: 50000, chocolate: 10000, ribbon: 5000, gift_card: 5000 };
function proposedName(item) {
  switch (item.category) {
    case 'box': return `Box ${item.sourceNumber}`;
    case 'flower': return roseNames[item.id];
    case 'plush': return `Plush ${item.sourceNumber}`;
    case 'chocolate': return `Chocolate ${item.sourceNumber}`;
    case 'ribbon': return ribbonNames[item.initialDisplayOrder - 1];
    case 'gift_card': return 'Gift Card';
    default: throw new Error('Unexpected Gift Box component category.');
  }
}
export const OWNER_STARTING_PRICES = Object.freeze(FIXED_COMPONENTS.map(item => Object.freeze({
  componentId: item.id, category: item.category, displayName: proposedName(item), pricePiastres: prices[item.category],
})));
if (OWNER_STARTING_PRICES.length !== 74 || new Set(OWNER_STARTING_PRICES.map(x => x.componentId)).size !== 74
  || OWNER_STARTING_PRICES.some(x => !x.displayName || !Number.isSafeInteger(x.pricePiastres) || x.pricePiastres <= 0)) {
  throw new Error('Owner price plan no longer matches the pinned 74-component catalog.');
}

// No inventory/availability/commerce fields may be written by this import.
// Already-approved prices that differ from this historical schedule are NOT overwritten.
export function compareOwnerStartingPrices(liveComponents) {
  if (!Array.isArray(liveComponents) || liveComponents.length !== OWNER_STARTING_PRICES.length) {
    throw new Error('The complete 74-component administrative catalog is required.');
  }
  const byId = new Map(liveComponents.map(item => [item.componentId, item]));
  if (byId.size !== OWNER_STARTING_PRICES.length) throw new Error('Duplicate component identities in the administrative catalog.');
  const updates = [], unchanged = [], conflicts = [];
  for (const proposal of OWNER_STARTING_PRICES) {
    const live = byId.get(proposal.componentId);
    if (!live || live.category !== proposal.category || !Number.isSafeInteger(live.revision) || live.revision < 0) {
      throw new Error(`Unrecognized or incomplete admin component: ${proposal.componentId}`);
    }
    if (live.pricePiastres !== null && live.pricePiastres !== proposal.pricePiastres) {
      conflicts.push({ componentId: proposal.componentId, existingPricePiastres: live.pricePiastres, proposedPricePiastres: proposal.pricePiastres });
      continue;
    }
    if (live.pricePiastres === null && live.pricing !== 'pending') {
      conflicts.push({ componentId: proposal.componentId, reason: 'Unexpected price approval state.' });
      continue;
    }
    const patch = { expectedRevision: live.revision };
    if (live.pricePiastres === null) patch.pricePiastres = proposal.pricePiastres;
    if (!live.displayName) patch.displayName = proposal.displayName;
    if (Object.keys(patch).length === 1) unchanged.push(proposal.componentId);
    else updates.push({ componentId: proposal.componentId, patch });
  }
  return { version: OWNER_STARTING_PRICE_VERSION, updates, unchanged, conflicts };
}
