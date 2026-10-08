// Shared publication/inventory rules. No cart, checkout, or database mutation here.
export function publicProductFilter() {
  return {
    status: 'ready', published: true, priceApproved: true, pricePiastres: { $gte: 0 },
    'inventory.approved': true, reviewRequired: false,
    $nor: [
      { variants: { $elemMatch: { pricePiastres: { $ne: null }, priceApproved: { $ne: true } } } },
      { variants: { $elemMatch: { 'inventory.approved': { $ne: true } } } },
    ],
  };
}
// A configured variant owns its stock counter; the parent availability switch
// still disables the entire product, but its unused quantity cannot block variants.
export function orderableProductStockFilter() {
  const stock = { $or: [{ 'inventory.mode': 'made_to_order' }, { 'inventory.mode': 'tracked', 'inventory.quantity': { $gt: 0 } }] };
  return { $and: [
    { 'inventory.approved': true, 'inventory.available': true },
    { $or: [
      { variants: { $elemMatch: { 'inventory.approved': true, 'inventory.available': true, ...stock } } },
      { $and: [{ $or: [{ variants: { $size: 0 } }, { variants: { $exists: false } }] }, stock] },
    ] },
  ] };
}
export function getPublicationIssues(product) {
  const issues = [];
  const add = (field, message) => issues.push({ field, message });
  if (!product.priceApproved || !Number.isSafeInteger(product.pricePiastres) || product.pricePiastres < 0) add('priceApproved', 'Ready products require an explicitly approved integer price');
  if (!product.inventory?.approved) add('inventory.approved', 'Ready products require approved stock or an approved Made by Request mode');
  if (product.reviewRequired) add('reviewRequired', 'Resolve catalog review flags before making a product Ready');
  if (!product.categoryId) add('categoryId', 'Ready products require a main category');
  if (!product.mainImageKey) add('mainImageKey', 'Ready products require a selected main image');
  for (const variant of product.variants ?? []) {
    if (variant.pricePiastres != null && !variant.priceApproved) add('variants', 'Variant prices must be approved before publication');
    if (!variant.inventory?.approved) add('variants', 'Variant inventory must be approved before publication');
  }
  return issues;
}
export function getStockDeduction(inventory, requestedQuantity) {
  if (!Number.isSafeInteger(requestedQuantity) || requestedQuantity < 1) throw new Error('Quantity must be a positive integer');
  if (!inventory?.available) throw new Error('Item is unavailable');
  if (inventory.mode === 'made_to_order') return 0;
  if (inventory.mode !== 'tracked' || !Number.isSafeInteger(inventory.quantity) || inventory.quantity < requestedQuantity) throw new Error('Insufficient tracked stock');
  return requestedQuantity;
}
