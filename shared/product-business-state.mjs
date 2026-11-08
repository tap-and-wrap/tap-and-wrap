import { productPersonalizationIssues } from './product-personalization.mjs';

export const positiveProductPrice = value => Number.isSafeInteger(value) && value > 0;
export function confirmedInventoryAvailable(inventory) {
  return inventory?.approved === true && inventory.available === true && (inventory.mode === 'made_to_order'
    || inventory.mode === 'tracked' && Number.isSafeInteger(inventory.quantity) && inventory.quantity > 0);
}

// Publication is a merchant visibility decision. Legacy import status, review
// warnings and price-approval bookkeeping cannot make an unpriced page a draft.
// Inventory approval remains evidence of an actual count / made-to-order rule.
export function productBusinessState(product) {
  const categoriesActive = Boolean(product?.categoryId || product?.category)
    && product?.categoryId?.active !== false && product?.category?.active !== false
    && product?.subcategoryId?.active !== false && product?.subcategory?.active !== false;
  const published = product?.visibility === 'public' && categoriesActive;
  const priced = positiveProductPrice(product?.pricePiastres);
  const variants = product?.variants || [];
  const setup = product?.purchaseSetup;
  const optionsResolved = (!setup || setup.version === 1 && ['single','variants'].includes(setup.options))
    && (product?.purchaseSetup?.options !== 'single' || variants.length === 0)
    && (product?.purchaseSetup?.options !== 'variants' || variants.length > 0);
  const configured = optionsResolved && !productPersonalizationIssues(product?.personalization).length;
  const stock = variants.length ? variants.map(variant => variant.inventory) : [product?.inventory];
  const confirmed = stock.every(inventory => inventory?.approved === true);
  const available = product?.inventory?.available === true && (variants.length
    ? variants.some(variant => confirmedInventoryAvailable(variant.inventory) && (variant.pricePiastres == null || positiveProductPrice(variant.pricePiastres)))
    : confirmedInventoryAvailable(product?.inventory));
  const orderable = published && priced && configured && available && Boolean(product?.mainImageKey || product?.mainImageUrl);
  const state = !published ? 'hidden' : !priced ? 'price_on_request' : !configured ? 'options_required'
    : !confirmed && !available ? 'confirm_stock' : !available ? 'out_of_stock'
      : stock.some(inventory => confirmedInventoryAvailable(inventory) && inventory.mode === 'made_to_order') ? 'made_to_order' : 'available';
  return { published, priced, confirmedStock: confirmed, orderingAvailable: orderable, state };
}
