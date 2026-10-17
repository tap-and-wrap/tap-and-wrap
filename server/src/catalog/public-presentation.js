import { isSafeImageReference } from './fields.js';
import { productPersonalizationFields, productPersonalizationIssues } from '../../../shared/product-personalization.mjs';

// Storage references become public only through an explicitly configured HTTPS origin.
export function mediaUrlForKey(key, baseUrl = process.env.CATALOG_MEDIA_BASE_URL || '') {
  if (!key || !isSafeImageReference(key) || !baseUrl) return null;
  try {
    const base = new URL(baseUrl);
    if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) return null;
    base.pathname = `${base.pathname.replace(/\/+$/, '')}/${key.split('/').map(encodeURIComponent).join('/')}`;
    return base.href;
  } catch {
    return null;
  }
}

export function inventoryCanOrder(inventory) {
  if (!inventory?.approved || !inventory.available) return false;
  if (inventory.mode === 'made_to_order') return true;
  return inventory.mode === 'tracked' && Number.isSafeInteger(inventory.quantity) && inventory.quantity > 0;
}

export function productCanOrder(product) {
  if (productPersonalizationIssues(product.personalization).length) return false;
  if (product.visibility !== 'public' || product.status !== 'ready' || product.published !== true || product.reviewRequired === true ||
      product.priceApproved !== true || !Number.isSafeInteger(product.pricePiastres) || product.pricePiastres <= 0 ||
      !product.mainImageKey || !product.categoryId || !product.inventory?.approved || !product.inventory.available) return false;
  if (product.variants?.some(variant => (variant.pricePiastres != null &&
      (!variant.priceApproved || variant.pricePiastres <= 0)) || !variant.inventory?.approved)) return false;
  return product.variants?.length ? product.variants.some(variant => inventoryCanOrder(variant.inventory)) : inventoryCanOrder(product.inventory);
}

export function categoryPresentation(category) {
  if (!category || !category.name) return null;
  return { _id: String(category._id), name: category.name, slug: category.slug };
}

export function publicProductCard(product) {
  const browseOnly = product.visibility !== 'public' || product.status !== 'ready' || product.published !== true || product.reviewRequired === true || product.priceApproved !== true || !Number.isSafeInteger(product.pricePiastres) || product.pricePiastres <= 0 || product.inventory?.approved !== true || product.variants?.some(variant => (variant.pricePiastres != null && (variant.priceApproved !== true || variant.pricePiastres <= 0)) || variant.inventory?.approved !== true) || product.categoryId?.active === false || product.subcategoryId?.active === false;
  const priceApproved = product.priceApproved === true && Number.isSafeInteger(product.pricePiastres) && product.pricePiastres > 0;
  return {
    _id: String(product._id),
    name: product.name,
    slug: product.slug,
    publicPath: product.publicPath || `/products/${product.slug}`,
    category: categoryPresentation(product.categoryId),
    subcategory: categoryPresentation(product.subcategoryId),
    mainImageUrl: mediaUrlForKey(product.mainImageKey),
    pricePiastres: priceApproved ? product.pricePiastres : null,
    compareAtPiastres: priceApproved ? product.compareAtPiastres ?? null : null,
    priceApproved,
    browseOnly,
    visibility: product.visibility,
    featured: Boolean(product.featured),
    bestSeller: Boolean(product.bestSeller),
    orderingAvailable: !browseOnly && priceApproved && productCanOrder(product),
    requiresOptions: Boolean(product.variants?.length || product.personalization?.requiredBeforePurchase || productPersonalizationFields(product.personalization).some(field => field.required) || product.customization?.enabled),
  };
}

function publicInventory(inventory) {
  return { mode: inventory.mode, quantity: inventory.approved === true && inventory.mode === 'tracked' ? inventory.quantity : null, available: inventoryCanOrder(inventory) };
}

export function publicProductDetail(product) {
  const card = publicProductCard(product);
  return {
    ...card,
    description: product.description,
    galleryUrls: (product.galleryKeys || []).map((key) => mediaUrlForKey(key)).filter(Boolean),
    inventory: card.browseOnly ? { mode: product.inventory?.mode, quantity: null, available: false } : publicInventory(product.inventory),
    variants: (product.variants || []).map((variant) => ({
      key: variant.key,
      priceApproved: variant.pricePiastres == null ? card.priceApproved : variant.priceApproved === true && Number.isSafeInteger(variant.pricePiastres) && variant.pricePiastres > 0,
      attributes: variant.attributes,
      pricePiastres: variant.pricePiastres == null ? (card.priceApproved ? product.pricePiastres : null) : variant.priceApproved === true && Number.isSafeInteger(variant.pricePiastres) && variant.pricePiastres > 0 ? variant.pricePiastres : null,
      inventory: card.browseOnly ? { mode: variant.inventory?.mode, quantity: null, available: false } : publicInventory(variant.inventory),
      orderingAvailable: card.orderingAvailable && inventoryCanOrder(variant.inventory),
    })),
    personalization: { requiredBeforePurchase: product.personalization?.requiredBeforePurchase === true, fields: productPersonalizationFields(product.personalization) },
    customization: {
      enabled: Boolean(product.customization?.enabled),
      templateId: product.customization?.templateId ? String(product.customization.templateId) : null,
      serviceKind: product.customization?.serviceKind || null,
      serviceEntryEligible: Boolean(product.customization?.serviceEntryEligible),
    },
  };
}
