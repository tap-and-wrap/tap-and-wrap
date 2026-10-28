import { ASSET_ISSUES, ASSET_VERSION, CATALOG_VERSION, GEOMETRY_VERSION, getFixedComponent } from '../../../shared/gift-box/definitions.mjs';
import { builderError, estimateInput } from './validation.js';
import { assertInventory } from './inventory.js';

export function addPiastres(a, b) {
  if (![a, b].every(value => Number.isSafeInteger(value) && value >= 0) || a > Number.MAX_SAFE_INTEGER - b) throw builderError(400, 'GIFT_BOX_AMOUNT_OVERFLOW', 'The calculated component amount exceeds supported limits.');
  return a + b;
}
export function multiplyPiastres(price, quantity) {
  if (!Number.isSafeInteger(price) || price < 0 || !Number.isSafeInteger(quantity) || quantity < 1
    || price > Math.floor(Number.MAX_SAFE_INTEGER / quantity)) throw builderError(400, 'GIFT_BOX_AMOUNT_OVERFLOW', 'The calculated component amount exceeds supported limits.');
  const result = price * quantity;
  if (!Number.isSafeInteger(result)) throw builderError(400, 'GIFT_BOX_AMOUNT_OVERFLOW', 'The calculated component amount exceeds supported limits.');
  return result;
}
export function approvedPrice(setting) {
  if (!setting || !Number.isSafeInteger(setting.pricePiastres) || setting.pricePiastres < 0
    || !setting.priceApprovedBy || !setting.priceApprovedAt) return null;
  return setting.pricePiastres > 0 && setting.priceApproval === 'paid' || setting.pricePiastres === 0 && setting.priceApproval === 'complimentary' ? setting.pricePiastres : null;
}
export function requireComponent(id, allowedCategories) {
  const definition = getFixedComponent(id);
  if (!definition) throw builderError(400, 'GIFT_BOX_COMPONENT_UNKNOWN', 'Choose an existing fixed builder component.');
  if (!allowedCategories.includes(definition.category)) throw builderError(400, 'GIFT_BOX_COMPONENT_CATEGORY', 'A component was used in the wrong selection category.');
  return definition;
}
export function selectionLines(raw) {
  const input = estimateInput.parse(raw);
  const lines = [{ definition: requireComponent(input.boxId, ['box']), quantity: 1 },
    ...input.items.map(item => ({ definition: requireComponent(item.componentId, ['flower', 'plush', 'chocolate']), quantity: item.quantity }))];
  for (const [id, category] of [[input.ribbonId, 'ribbon'], [input.giftCard?.componentId, 'gift_card']]) {
    if (!id) continue;
    // No placeholder identity, color or pricing policy can satisfy a pending category.
    const definition = requireComponent(id, [category]);
    lines.push({ definition, quantity: 1 });
  }
  return { input, lines };
}
export function calculateEstimate(raw, savedSettings) {
  const { input, lines } = selectionLines(raw);
  const settings = new Map(savedSettings.map(setting => [setting.componentId, setting]));
  let subtotal = 0;
  const items = lines.map(({ definition, quantity }) => {
    const setting = settings.get(definition.id);
    if (!setting || setting.enabled !== true) throw builderError(409, 'GIFT_BOX_COMPONENT_UNAVAILABLE', 'A selected component is unavailable. Review the catalog.');
    const price = approvedPrice(setting);
    if (price === null) throw builderError(409, 'GIFT_BOX_PRICE_PENDING', 'A selected component needs an approved saved price.');
    assertInventory(definition, setting, quantity);
    const lineSubtotalPiastres = multiplyPiastres(price, quantity);
    subtotal = addPiastres(subtotal, lineSubtotalPiastres);
    return { componentId: definition.id, category: definition.category, displayName: setting.displayName,
      quantity, unit: definition.unit ?? (definition.category === 'flower' ? 'individual-rose' : definition.category === 'box' ? 'one-box' : 'one-plush-toy'),
      ...(definition.category === 'ribbon' ? { colorHex: definition.approvedColorHex } : {}),
      unitPricePiastres: price, lineSubtotalPiastres, priceApproval: setting.priceApproval, settingsRevision: setting.__v,
      inventoryMode: setting.inventoryMode, inventoryQuantity: definition.category === 'ribbon' ? null : setting.inventoryQuantity ?? null,
      available: setting.available === true };
  });
  return { catalogVersion: CATALOG_VERSION, assetVersion: ASSET_VERSION, geometryVersion: GEOMETRY_VERSION,
    kind: 'component-estimate', currency: 'EGP', items, componentSubtotalPiastres: subtotal,
    delivery: { status: 'pending_confirmation', pricePiastres: null },
    giftCard: input.giftCard ?? null, arrangementApproved: false, submissionAllowed: false, orderConversionAllowed: false,
    physicalFitReviewRequired: true,
    blockers: ['GEOMETRY_REVIEW_REQUIRED', 'V2_PUBLIC_SUBMISSION_DISABLED', ...ASSET_ISSUES.filter(issue => issue.blocksProduction && items.some(item => item.componentId === issue.componentId)).map(issue => issue.id)] };
}
