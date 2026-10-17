import { productHref } from './product-paths.mjs';
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Monotonic write fences prevent hide/unhide (or category withdrawal/reopening)
// from reviving a former SEO publication whose visible content happens to match.
export function productRoutingVersion(product) {
  const revision = value => {
    if (value?.__v == null) return 0; // Explicit legacy missing-version convention.
    if (!Number.isSafeInteger(value.__v) || value.__v < 0) throw new Error('Invalid product routing revision');
    return value.__v;
  };
  return JSON.stringify([String(product._id), revision(product), String(product.categoryId?._id || ''), revision(product.categoryId), product.subcategoryId ? String(product.subcategoryId._id) : null, revision(product.subcategoryId)]);
}
export function cleanText(value, maximum = 160) {
  if (typeof value !== 'string') return '';
  const withoutControls = [...value].map((character) => character.codePointAt(0) < 32 || character.codePointAt(0) === 127 ? ' ' : character).join('');
  return [...withoutControls.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()].slice(0, maximum).join('');
}

export function publicImageUrl(value, allowedOrigins) {
  if (!value || typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
    if (allowedOrigins && !allowedOrigins.includes(url.origin)) return null;
    if (/(?:^|\/)(?:private|temporary|payment-proofs|proofs|personalization|artwork)(?:\/|$)/i.test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}

export function productSeoSignature(product) {
  const category = (value) => value ? { id: String(value._id || ''), name: cleanText(value.name, 160), slug: SLUG.test(value.slug || '') ? value.slug : null } : null;
  const mode = (value) => ['tracked', 'made_to_order'].includes(value?.inventoryMode || value?.inventory?.mode) ? value.inventoryMode || value.inventory.mode : null;
  const price = (value) => Number.isSafeInteger(value) && value >= 0 ? value : null;
  return JSON.stringify({ publicPath: product?.slug ? productHref(product) : null, name: cleanText(product?.name, 160), slug: SLUG.test(product?.slug || '') ? product.slug : null, description: cleanText(product?.description, 10000), category: category(product?.category), subcategory: category(product?.subcategory), image: publicImageUrl(product?.mainImageUrl), price: price(product?.pricePiastres), compareAt: Number.isSafeInteger(product?.compareAtPiastres) && product.compareAtPiastres > product?.pricePiastres ? product.compareAtPiastres : null, orderingAvailable: product?.orderingAvailable === true, inventoryMode: mode(product), variants: (product?.variants || []).map((variant) => ({ price: price(variant.pricePiastres), orderingAvailable: product?.orderingAvailable === true && variant.orderingAvailable === true, inventoryMode: mode(variant) })) });
}

