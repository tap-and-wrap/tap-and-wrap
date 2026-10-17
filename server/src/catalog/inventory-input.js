import { inventorySchema, parseInput } from './validation.js';
const catalogError = (status, code, message) => Object.assign(new Error(message), { status, code });

// Approval is evidence supplied by the merchant, never a model/import default.
export function mergeInventory(current, input) {
  const patch = parseInput(inventorySchema, input);
  const previous = current?.toObject ? current.toObject() : (current ?? {});
  const result = { mode: 'tracked', quantity: 0, approved: false, available: true, ...previous, ...patch };
  const changed = ['mode', 'quantity', 'available'].some(key => patch[key] !== undefined && patch[key] !== previous[key]);
  if (changed && patch.approved === undefined) result.approved = false;
  if (result.mode === 'made_to_order') {
    if (patch.quantity != null) throw catalogError(400, 'INVALID_INVENTORY', 'Made by Request inventory must not have a stock quantity.');
    result.quantity = null;
  } else {
    const newlyApproved = result.approved === true && (previous.approved !== true || previous.mode !== 'tracked');
    if (newlyApproved && (!Object.hasOwn(patch, 'quantity') || !Number.isSafeInteger(patch.quantity))) {
      throw catalogError(400, 'INVALID_INVENTORY', 'Enter the actual stock quantity, including zero, when approving tracked inventory. Imported quantities are not verified stock.');
    }
    if (result.quantity == null) {
      if (result.approved) throw catalogError(400, 'INVALID_INVENTORY', 'Approved tracked inventory requires an actual quantity.');
      result.quantity = 0;
    }
  }
  return result;
}
