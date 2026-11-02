import { builderError } from './validation.js';

export function inventoryEligibility(definition, setting, quantity = 1) {
  if (!setting || setting.available !== true) return { eligible: false, reason: 'unavailable' };
  if (definition.category === 'ribbon') {
    return { eligible: setting.inventoryMode === 'status_only' && setting.inventoryQuantity === null,
      reason: setting.inventoryMode === 'status_only' && setting.inventoryQuantity === null ? null : 'inventory_pending' };
  }
  if (setting.inventoryMode === 'made_to_order') return { eligible: true, reason: null };
  if (setting.inventoryMode !== 'tracked' || !Number.isSafeInteger(setting.inventoryQuantity) || setting.inventoryQuantity < 0) return { eligible: false, reason: 'inventory_pending' };
  return { eligible: quantity <= setting.inventoryQuantity, reason: quantity <= setting.inventoryQuantity ? null : 'insufficient_stock' };
}

export function assertInventory(definition, setting, quantity) {
  const result = inventoryEligibility(definition, setting, quantity);
  if (result.eligible) return;
  const code = result.reason === 'insufficient_stock' ? 'GIFT_BOX_STOCK_EXCEEDED'
    : result.reason === 'inventory_pending' ? 'GIFT_BOX_INVENTORY_PENDING' : 'GIFT_BOX_COMPONENT_UNAVAILABLE';
  throw builderError(409, code, result.reason === 'insufficient_stock'
    ? 'A selected quantity exceeds current tracked stock. Review your selection.'
    : 'A selected component is unavailable or needs confirmed inventory settings.');
}

// This edits business settings only. Estimates and requests never call a stock mutation.
export function applyInventoryPatch(definition, setting, patch) {
  if (definition.category === 'ribbon') {
    if (['inventoryMode', 'inventoryQuantity', 'confirmInventoryQuantity'].some(key => Object.hasOwn(patch, key))) {
      throw builderError(400, 'GIFT_BOX_RIBBON_INVENTORY', 'Ribbon inventory is an availability toggle, without a mode or numeric quantity.');
    }
    setting.inventoryMode = 'status_only';
    setting.inventoryQuantity = null;
    return;
  }
  const targetMode = patch.inventoryMode ?? setting.inventoryMode;
  if (targetMode === 'tracked' && setting.inventoryMode !== 'tracked'
    && (!Object.hasOwn(patch, 'inventoryQuantity') || patch.confirmInventoryQuantity !== true)) {
    throw builderError(400, 'GIFT_BOX_STOCK_CONFIRMATION_REQUIRED', 'Confirm a valid quantity when switching to tracked inventory.');
  }
  if (Object.hasOwn(patch, 'inventoryQuantity') && targetMode !== 'tracked') {
    throw builderError(400, 'GIFT_BOX_STOCK_MODE', 'Numeric stock can only be edited in tracked inventory mode.');
  }
  if (Object.hasOwn(patch, 'inventoryMode')) setting.inventoryMode = patch.inventoryMode;
  if (Object.hasOwn(patch, 'inventoryQuantity')) setting.inventoryQuantity = patch.inventoryQuantity;
}
