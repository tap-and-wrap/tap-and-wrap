import { productEngravingCapable, productSurfaceId } from '../../../shared/product-engraving.mjs';
import { isSafeImageReference } from './fields.js';
import { ownerVariantStock } from './product-policy.js';
import { optionalPhotoFields, productPersonalizationFields } from '../../../shared/product-personalization.mjs';
import { productBusinessState, positiveProductPrice, confirmedInventoryAvailable } from '../../../shared/product-business-state.mjs';

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
  return confirmedInventoryAvailable(inventory);
}

export function productCanOrder(product) {
  return productBusinessState(product).orderingAvailable;
}

export function categoryPresentation(category) {
  if (!category || !category.name) return null;
  return { _id: String(category._id), name: category.name, slug: category.slug };
}

export function publicProductCard(product) {
  const business = productBusinessState(product);
  const browseOnly = !business.orderingAvailable;
  const priceApproved = business.priced;
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
    businessState: business.state,
    published: business.published,
    browseOnly,
    visibility: product.visibility,
    featured: Boolean(product.featured),
    bestSeller: Boolean(product.bestSeller),
    orderingAvailable: !browseOnly && priceApproved && productCanOrder(product),
    requiresOptions: Boolean(product.variants?.length || product.personalization?.requiredBeforePurchase || productPersonalizationFields(product.personalization).some(field => field.required) || product.customization?.enabled),
  };
}

function publicInventory(inventory = {}) {
  return { mode: inventory.mode, quantity: inventory.approved === true && inventory.mode === 'tracked' ? inventory.quantity : null, available: inventoryCanOrder(inventory) };
}

export function publicProductDetail(product) {
  const card = publicProductCard(product);
  return {
    ...card,
    productEngraving: publicProductEngraving(product),
    description: product.description,
    galleryUrls: (product.galleryKeys || []).map((key) => mediaUrlForKey(key)).filter(Boolean),
    inventory: ownerVariantStock(product) ? { mode: product.inventory?.mode, quantity: null, available: product.inventory?.available === true } : publicInventory(product.inventory),
    variants: (product.variants || []).map((variant) => ({
      key: variant.key,
      stockConfirmed: variant.inventory?.approved === true,
      priceApproved: variant.pricePiastres == null ? card.priceApproved : positiveProductPrice(variant.pricePiastres),
      attributes: variant.attributes,
      pricePiastres: variant.pricePiastres == null ? (card.priceApproved ? product.pricePiastres : null) : positiveProductPrice(variant.pricePiastres) ? variant.pricePiastres : null,
      inventory: publicInventory(variant.inventory),
      orderingAvailable: card.orderingAvailable && inventoryCanOrder(variant.inventory) && (variant.pricePiastres == null || positiveProductPrice(variant.pricePiastres)),
    })),
    personalization: { ...(optionalPhotoFields(product.personalization).length ? { photoSpaces: optionalPhotoFields(product.personalization).map(({ key, label, instructions }) => ({ key, label, instructions })), photoSpacesVersion: product.personalization.photoSpacesVersion } : {}), requiredBeforePurchase: product.personalization?.requiredBeforePurchase === true, fields: productPersonalizationFields(product.personalization) },
    customization: {
      enabled: Boolean(product.customization?.enabled),
      templateId: product.customization?.templateId ? String(product.customization.templateId) : null,
      serviceKind: product.customization?.serviceKind || null,
      serviceEntryEligible: Boolean(product.customization?.serviceEntryEligible),
    },
  };
}

export function publicProductEngraving(product) {
  if (!productEngravingCapable(product)) return null;
  const c = product.productEngraving, src = mediaUrlForKey(c.imageKey);
  return src ? { version: c.version, surface: { id: productSurfaceId(product._id, c.version), src, width: c.width, height: c.height }, fontIds: c.fontIds, materials: c.materials, placements: c.placements } : null;
}
