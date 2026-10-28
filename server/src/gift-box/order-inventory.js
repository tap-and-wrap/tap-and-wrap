import mongoose from 'mongoose';
import { getFixedComponent } from '../../../shared/gift-box/definitions.mjs';
import { GiftBoxComponentSetting } from '../models/GiftBoxComponentSetting.js';
import { assertDatabaseWriteAllowed } from '../config/database-safety.js';
import { env } from '../config/env.js';
import { commerceError } from '../commerce/errors.js';

const invalid = () => { throw commerceError(409, 'INVALID_INVENTORY_SOURCE', 'An inventory source requires review.'); };
const restockReview = () => { throw commerceError(409, 'RESTOCK_REVIEW_REQUIRED', 'A builder inventory source changed. Review it before restoring stock.'); };
function requireTransaction(session) {
  if (session?.inTransaction?.() !== true) throw commerceError(503, 'TRANSACTION_REQUIRED', 'Inventory changes require the guarded order transaction.');
}

// These are server-derived quote claims. A Product with the same name, SKU or
// photograph never participates in builder consumption or restoration.
export function normalizeGiftInventoryClaim(claim) {
  if (!claim || claim.kind !== 'gift_box_component') invalid();
  const definition = typeof claim.id === 'string' && getFixedComponent(claim.id);
  if (!definition || claim.variantKey != null || !Number.isSafeInteger(claim.expectedRevision) || claim.expectedRevision < 0
    || !Number.isSafeInteger(claim.unitPricePiastres) || claim.unitPricePiastres < 0
    || !mongoose.isObjectIdOrHexString(claim.priceApprovedBy)
    || !(claim.priceApprovedAt instanceof Date || typeof claim.priceApprovedAt === 'string')) invalid();
  const approvedAt = new Date(claim.priceApprovedAt);
  if (!Number.isFinite(approvedAt.getTime())
    || !(claim.unitPricePiastres > 0 && claim.priceApproval === 'paid'
      || claim.unitPricePiastres === 0 && claim.priceApproval === 'complimentary')
    || (definition.category === 'ribbon' ? claim.mode !== 'status_only' : !['tracked', 'made_to_order'].includes(claim.mode))) invalid();
  return { kind: 'gift_box_component', id: claim.id, variantKey: null, mode: claim.mode, quantity: claim.quantity,
    expectedRevision: claim.expectedRevision, unitPricePiastres: claim.unitPricePiastres,
    priceApproval: claim.priceApproval, priceApprovedBy: String(claim.priceApprovedBy), priceApprovedAt: approvedAt,
    ...(typeof claim.displayName === 'string' ? { displayName: claim.displayName } : {}) };
}

export function sameGiftInventoryApproval(left, right) {
  return left.mode === right.mode && left.expectedRevision === right.expectedRevision
    && left.unitPricePiastres === right.unitPricePiastres && left.priceApproval === right.priceApproval
    && left.priceApprovedBy === right.priceApprovedBy && left.priceApprovedAt.getTime() === right.priceApprovedAt.getTime()
    && left.displayName === right.displayName;
}

export async function consumeGiftInventory(claim, session) {
  requireTransaction(session);
  claim = normalizeGiftInventoryClaim(claim);
  if (!Number.isSafeInteger(claim.quantity) || claim.quantity < 1) invalid();
  const filter = { componentId: claim.id, __v: claim.expectedRevision, enabled: true, available: true,
    inventoryMode: claim.mode, pricePiastres: claim.unitPricePiastres, priceApproval: claim.priceApproval,
    priceApprovedBy: claim.priceApprovedBy, priceApprovedAt: claim.priceApprovedAt };
  // Every mode writes the revision. Even a status-only ribbon or a made-to-order
  // item must conflict with concurrent price, availability or mode edits.
  const increment = { __v: 1 };
  if (claim.mode === 'tracked') {
    filter.inventoryQuantity = { $gte: claim.quantity };
    increment.inventoryQuantity = -claim.quantity;
  } else if (claim.mode === 'status_only') filter.inventoryQuantity = { $type: 10 };
  assertDatabaseWriteAllowed(GiftBoxComponentSetting.db, env);
  if (!(await GiftBoxComponentSetting.updateOne(filter, { $inc: increment }, { session })).matchedCount) {
    throw commerceError(409, 'GIFT_BOX_INVENTORY_CHANGED', 'Builder prices, availability or stock changed. Review your gift box.');
  }
}

export async function restoreGiftInventory(claim, quantity, session) {
  requireTransaction(session);
  // Existing tracked claims retain their consumption evidence even when a
  // returned quantity is smaller. Never infer numeric stock for other modes.
  if (!Number.isSafeInteger(quantity) || quantity < 1 || !getFixedComponent(claim.id)
    || getFixedComponent(claim.id).category === 'ribbon' || claim.mode !== 'tracked'
    || !Number.isSafeInteger(claim.consumedQuantity) || claim.consumedQuantity < quantity) restockReview();
  assertDatabaseWriteAllowed(GiftBoxComponentSetting.db, env);
  if (!(await GiftBoxComponentSetting.updateOne({ componentId: claim.id, inventoryMode: 'tracked',
    inventoryQuantity: { $gte: 0, $lte: Number.MAX_SAFE_INTEGER - quantity } },
  { $inc: { inventoryQuantity: quantity, __v: 1 } }, { session })).matchedCount) restockReview();
}
