import { createHash } from 'node:crypto';
import { z } from 'zod';
import { deepFreeze } from '../../../shared/gift-box/definitions.mjs';
import { giftBoxV2CommerceInput, identifyGiftBoxConfiguration } from './commerce-contract.js';
import { assertGiftBoxFulfillment } from './fulfillment-policy.js';
import { assertInventory } from './inventory.js';
import { calculateEstimate, multiplyPiastres, requireComponent } from './pricing.js';
import { builderError } from './validation.js';

export const GIFT_BOX_COMMERCE_QUOTE_VERSION = 'gift-box-commerce-quote-v1';
export const giftBoxV2CommerceQuoteInput = z.object({
  configuration: giftBoxV2CommerceInput,
  quantity: z.number().int().min(1).max(99).default(1),
}).strict();

// The caller supplies one coherent, saved business-settings snapshot and a policy
// from trusted server configuration. Neither is accepted in the customer envelope.
// This module imports no models and performs no reads, writes or provider actions.
export function prepareGiftBoxV2CommerceQuote(raw, savedSettings, { fulfillmentPolicy = null } = {}) {
  const input = giftBoxV2CommerceQuoteInput.parse(raw);
  const { configuration, configurationId } = identifyGiftBoxConfiguration(input.configuration);
  if (!Array.isArray(savedSettings) || savedSettings.some(setting => !setting || typeof setting.componentId !== 'string')
    || new Set(savedSettings.map(setting => setting.componentId)).size !== savedSettings.length) {
    throw builderError(409, 'GIFT_BOX_SETTINGS_INVALID', 'A coherent saved component-settings snapshot is required.');
  }
  const estimate = calculateEstimate(configuration.selection, savedSettings);
  const settings = new Map(savedSettings.map(setting => [setting.componentId, setting]));
  const components = estimate.items.map(item => {
    const setting = settings.get(item.componentId);
    if (typeof setting.displayName !== 'string' || !setting.displayName.trim() || setting.displayName.length > 120
      || !setting.displayName.isWellFormed() || /[\u0000-\u001f\u007f]/u.test(setting.displayName)
      || !/^[a-f0-9]{24}$/i.test(String(setting.priceApprovedBy))
      || !(setting.priceApprovedAt instanceof Date) || !Number.isFinite(setting.priceApprovedAt.getTime())
      || !Number.isSafeInteger(setting.__v) || setting.__v < 0) {
      throw builderError(409, 'GIFT_BOX_SETTINGS_INVALID', 'A selected component needs valid saved business settings.');
    }
    const quantityForLine = multiplyPiastres(item.quantity, input.quantity);
    const definition = requireComponent(item.componentId, [item.category]);
    // Independent builder stock only. Product/ComponentOption inventory is never
    // consulted, inferred, synchronized, reserved or deducted by this preparation.
    assertInventory(definition, setting, quantityForLine);
    return {
      componentId: item.componentId, category: item.category, displayName: item.displayName,
      unit: item.unit, quantityPerBox: item.quantity, quantityForLine,
      unitPricePiastres: item.unitPricePiastres, perBoxSubtotalPiastres: item.lineSubtotalPiastres,
      lineSubtotalPiastres: multiplyPiastres(item.lineSubtotalPiastres, input.quantity),
      priceApproval: item.priceApproval, settingsRevision: item.settingsRevision,
      inventory: { owner: 'GiftBoxComponentSetting', componentId: item.componentId, mode: item.inventoryMode,
        requiredQuantity: quantityForLine, trackedDemand: item.inventoryMode === 'tracked' ? quantityForLine : 0 },
      ...(item.colorHex ? { colorHex: item.colorHex } : {}),
    };
  });
  const lineTotalPiastres = multiplyPiastres(estimate.componentSubtotalPiastres, input.quantity);
  const fulfillment = assertGiftBoxFulfillment(configuration, fulfillmentPolicy);
  const quoted = {
    quoteVersion: GIFT_BOX_COMMERCE_QUOTE_VERSION, kind: 'gift_box_v2', currency: 'EGP',
    configurationId, configuration, quantity: input.quantity, components,
    unitPricePiastres: estimate.componentSubtotalPiastres, lineTotalPiastres, fulfillment,
    delivery: { status: 'pending_confirmation', pricePiastres: null },
    promotions: { eligible: false, reason: 'reviewed_builder_discount_policy_required' },
    // Policy compatibility is only one prerequisite. Artwork/geometry and launch
    // authorization remain independent, closed gates during this foundation phase.
    directCommerceEligible: false, addToCartAllowed: false, checkoutAllowed: false,
    physicalFitCertified: false, inventoryReserved: false, inventoryDeducted: false,
    blockers: [...new Set([...estimate.blockers, 'GIFT_BOX_V2_DIRECT_COMMERCE_DISABLED'])],
  };
  // Current quote identity is deliberately separate from permanent configuration
  // identity. Price/revision/policy/quantity changes require fresh quote review.
  const quoteId = `${GIFT_BOX_COMMERCE_QUOTE_VERSION}:${createHash('sha256').update(JSON.stringify(quoted)).digest('hex')}`;
  return deepFreeze({ ...quoted, quoteId });
}
