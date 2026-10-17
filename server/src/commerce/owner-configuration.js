import { ownerInventory } from '../catalog/owner-workflow.js';
import { randomUUID } from 'node:crypto';

export function ownerComponentInput(input, current = {}) {
  if (input.ownerWorkflow !== true) return input;
  const { ownerWorkflow: _workflow, ...patch } = input;
  const policy = { ...(current.requestPolicy?.toObject?.() || current.requestPolicy || {}), ...input.requestPolicy };
  policy.enabled = Boolean(policy.services?.length && policy.availability === 'available');
  if (policy.pricing === 'free') policy.unitPricePiastres = 0;
  else if (policy.pricing !== 'fixed' || !Number.isSafeInteger(policy.unitPricePiastres) || policy.unitPricePiastres <= 0) { policy.pricing = 'pending'; policy.unitPricePiastres = null; }
  patch.requestPolicy = policy;
  patch.ownerManaged = true;
  patch.pricePiastres = policy.unitPricePiastres;
  patch.priceApproved = policy.pricing === 'free' || policy.pricing === 'fixed';
  patch.compareAtPiastres = patch.pricePiastres !== null && current.compareAtPiastres >= patch.pricePiastres ? current.compareAtPiastres : null;
  patch.enabledForCustomization = policy.enabled;
  if (input.inventory) patch.inventory = ownerInventory(current.inventory, input.inventory);
  patch.configurationApproved = Boolean(policy.enabled && patch.priceApproved && (patch.inventory || current.inventory)?.approved);
  // Import review notes/flags are historical information, not an approval action.
  delete patch.reviewRequired;
  return patch;
}

export function ownerTemplateInput(input, currentKey) {
  if (input.ownerWorkflow !== true) return input;
  const { ownerWorkflow: _workflow, ...patch } = input;
  return { ...patch, key: patch.key || currentKey || `template_${randomUUID().replaceAll('-', '')}`, status: 'approved', active: input.active !== false };
}
