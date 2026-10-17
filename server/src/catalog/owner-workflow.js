import { mergeInventory } from './inventory-input.js';

export function ownerInventory(current, input) {
  if (!input) return undefined;
  const patch = { ...input };
  if (!Object.hasOwn(patch, 'approved') && current?.approved === true
    && (patch.mode === undefined || patch.mode === current.mode)
    && (patch.quantity === undefined || patch.quantity === current.quantity)) patch.approved = true;
  if ((patch.mode || current?.mode || 'tracked') === 'tracked' && Object.hasOwn(patch, 'quantity') && !Number.isSafeInteger(patch.quantity)) {
    throw Object.assign(new Error('Enter an actual nonnegative whole quantity, or leave existing unconfirmed stock unchanged.'), { status: 400, code: 'INVALID_INVENTORY' });
  }
  // Only a supplied real count / explicit Made by Request can establish stock.
  // The editor sends approved:false while preserving an inherited placeholder.
  if (patch.approved !== false && (Object.hasOwn(patch, 'quantity') && Number.isSafeInteger(patch.quantity)
    || patch.mode === 'made_to_order')) patch.approved = true;
  return mergeInventory(current, patch);
}

export function ownerProductInput(input, current = {}) {
  if (input.ownerWorkflow !== true) return input;
  const { ownerWorkflow: _workflow, optionStructure, ...patch } = input;
  patch.purchaseSetup = { version: 1, options: optionStructure ?? current.purchaseSetup?.options ?? 'unresolved' };
  if (Object.hasOwn(input, 'pricePiastres')) patch.priceApproved = Number.isSafeInteger(input.pricePiastres) && input.pricePiastres > 0;
  if (input.inventory) patch.inventory = ownerInventory(current.inventory, input.inventory);
  if (input.variants) patch.variants = input.variants.map(variant => ({ ...variant,
    priceApproved: variant.pricePiastres != null ? Number.isSafeInteger(variant.pricePiastres) && variant.pricePiastres > 0 : false,
    inventory: ownerInventory(current.variants?.find(old => old.key === variant.key)?.inventory, variant.inventory),
  }));
  return patch;
}
