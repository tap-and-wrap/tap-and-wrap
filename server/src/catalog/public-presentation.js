import { isSafeImageReference } from './fields.js';

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
  if (!product.inventory?.approved || !product.inventory.available) return false;
  return product.variants?.length ? product.variants.some((variant) => inventoryCanOrder(variant.inventory)) : inventoryCanOrder(product.inventory);
}

export function categoryPresentation(category) {
  if (!category || !category.name) return null;
  return { _id: String(category._id), name: category.name, slug: category.slug };
}

export function publicProductCard(product) {
  return {
    _id: String(product._id),
    name: product.name,
    slug: product.slug,
    category: categoryPresentation(product.categoryId),
    subcategory: categoryPresentation(product.subcategoryId),
    mainImageUrl: mediaUrlForKey(product.mainImageKey),
    pricePiastres: product.priceApproved ? product.pricePiastres : null,
    compareAtPiastres: product.priceApproved ? product.compareAtPiastres ?? null : null,
    priceApproved: Boolean(product.priceApproved),
    featured: Boolean(product.featured),
    bestSeller: Boolean(product.bestSeller),
    orderingAvailable: productCanOrder(product),
    requiresOptions: Boolean(product.variants?.length || product.personalization?.fields?.some((field) => field.required) || product.customization?.enabled),
  };
}

function publicInventory(inventory) {
  return { mode: inventory.mode, quantity: inventory.mode === 'tracked' ? inventory.quantity : null, available: inventoryCanOrder(inventory) };
}

export function publicProductDetail(product) {
  return {
    ...publicProductCard(product),
    description: product.description,
    galleryUrls: (product.galleryKeys || []).map((key) => mediaUrlForKey(key)).filter(Boolean),
    inventory: publicInventory(product.inventory),
    variants: (product.variants || []).map((variant) => ({
      key: variant.key,
      attributes: variant.attributes,
      pricePiastres: variant.pricePiastres == null ? (product.priceApproved ? product.pricePiastres : null) : variant.priceApproved ? variant.pricePiastres : null,
      inventory: publicInventory(variant.inventory),
      orderingAvailable: inventoryCanOrder(variant.inventory),
    })),
    personalization: { fields: product.personalization?.fields || [] },
    customization: {
      enabled: Boolean(product.customization?.enabled),
      templateId: product.customization?.templateId ? String(product.customization.templateId) : null,
      serviceKind: product.customization?.serviceKind || null,
      serviceEntryEligible: Boolean(product.customization?.serviceEntryEligible),
    },
  };
}
