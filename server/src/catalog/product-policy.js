import { productPersonalizationIssues } from '../../../shared/product-personalization.mjs';
// Shared publication/inventory rules. No cart, checkout, or database mutation here.
export function displayProductFilter() {
  return { visibility: 'public', status: { $in: ['draft', 'ready', 'hold'] } };
}

export function approvedProductPriceFilter() {
  return { pricePiastres: { $gt: 0 } };
}

export function publicProductFilter() {
  return {
    visibility: 'public',
    pricePiastres: { $gt: 0 },
    'purchaseSetup.options': { $ne: 'unresolved' },
    $or: [{ 'inventory.approved': true }, { 'variants.0': { $exists: true } }],
    $and: [{$or:[{purchaseSetup:null},{'purchaseSetup.version':1,'purchaseSetup.options':'single',$or:[{variants:{$size:0}},{variants:{$exists:false}}]},{'purchaseSetup.version':1,'purchaseSetup.options':'variants','variants.0':{$exists:true}}]}],
  };
}
export function purchaseSetupAllows(product) {
  if (!product.purchaseSetup) return true;
  return product.purchaseSetup.version === 1 && (product.purchaseSetup.options === 'single' && !product.variants?.length
    || product.purchaseSetup.options === 'variants' && product.variants?.length > 0);
}
export const ownerVariantStock = product => product.variants?.length > 0;
// A configured variant owns its stock counter; the parent availability switch
// still disables the entire product, but its unused quantity cannot block variants.
// Legacy import status never controls purchasing. Real inventory still does.
export function orderableProductStockFilter() {
  const stock = { $or: [{ 'inventory.mode': 'made_to_order' }, { 'inventory.mode': 'tracked', 'inventory.quantity': { $gt: 0 } }] };
  return { $and: [
    { 'inventory.available': true, $or: [{ 'inventory.approved': true }, { 'variants.0': { $exists: true } }] },
    { $or: [
      { variants: { $elemMatch: { 'inventory.approved': true, 'inventory.available': true, ...stock, $and:[{$or:[{pricePiastres:null},{pricePiastres:{$gt:0}}]}] } } },
      { $and: [{ $or: [{ variants: { $size: 0 } }, { variants: { $exists: false } }] }, stock] },
    ] },
  ] };
}
export function soldOutProductStockFilter() {
  return {$and:[publicProductFilter(),{$nor:[orderableProductStockFilter()]},{$or:[
    {$and:[{$or:[{variants:{$size:0}},{variants:{$exists:false}}]},{'inventory.approved':true}]},
    {'variants.0':{$exists:true},variants:{$not:{$elemMatch:{'inventory.approved':{$ne:true}}}}},
  ]}]};
}
export function getPublicationIssues(product) {
  const issues = [];
  const add = (field, message) => issues.push({ field, message });
  for (const message of productPersonalizationIssues(product.personalization)) add('personalization.fields', message);
  if (product.priceApproved === true && (!Number.isSafeInteger(product.pricePiastres) || product.pricePiastres <= 0)) add('priceApproved', 'A supplied confirmed price must be positive');
  if (!product.categoryId) add('categoryId', 'Published products require a main category');
  if (!product.mainImageKey) add('mainImageKey', 'Published products require a selected main image');
  return issues;
}
export function getStockDeduction(inventory, requestedQuantity) {
  if (!Number.isSafeInteger(requestedQuantity) || requestedQuantity < 1) throw new Error('Quantity must be a positive integer');
  if (!inventory?.available) throw new Error('Item is unavailable');
  if (inventory.mode === 'made_to_order') return 0;
  if (inventory.mode !== 'tracked' || !Number.isSafeInteger(inventory.quantity) || inventory.quantity < requestedQuantity) throw new Error('Insufficient tracked stock');
  return requestedQuantity;
}
