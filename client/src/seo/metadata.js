import { SLUG, cleanText, publicImageUrl, productSeoSignature } from '../../../shared/product-seo.mjs';
export { SLUG, cleanText, publicImageUrl, productSeoSignature };
import { productHref } from '../../../shared/product-paths.mjs';
import { categoryHref } from '../../../shared/category-paths.mjs';
export const BRAND_NAME = 'Tap & Wrap';
export const HERO_HEADLINE = 'Makes someone’s heart flap with Tap & Wrap.';
export const PUBLIC_STATIC_ROUTES = Object.freeze({
  '/': { title: 'Tap & Wrap | Thoughtful Gifts & Personalization', description: 'Explore Tap & Wrap gifts, product personalization, gift-box building and configured laser engraving.', heading: HERO_HEADLINE },
  '/shop': { title: 'Shop Gifts | Tap & Wrap', description: 'Browse approved Tap & Wrap gifts by category, availability and price.', heading: 'Shop Our Gifts' },
  '/customize': { title: 'Personalized Gifts | Tap & Wrap', description: 'Explore Build Your Gift Box and Laser Engraving, with options configured for eligible products.', heading: 'Make It Yours' },
  '/customize/gift-box': { title: 'Build Your Gift Box | Tap & Wrap', description: 'Request a bespoke gift box without upfront payment, with a reviewed quotation shared through WhatsApp.', heading: 'Build Your Gift Box' },
  '/customize/laser-engraving': { title: 'Laser Engraving | Tap & Wrap', description: 'Request laser engraving with owner-reviewed options and a quotation through WhatsApp before payment.', heading: 'Laser Engraving' },
});
export const CONTENT_ROUTES = Object.freeze(['/about', '/contact', '/privacy-policy', '/refund-policy', '/shipping-policy', '/terms-of-service']);
export const PRIVATE_ROUTE = /^\/(?:admin(?:\/|$)|cart(?:\/|$)|checkout(?:\/|$)|orders(?:\/|$)|my-orders(?:\/|$)|track-order(?:\/|$)|login(?:\/|$)|signup(?:\/|$)|reset-password(?:\/|$)|forgot-password(?:\/|$)|verify-email(?:\/|$))/;

export const PRIVATE_PAGE_TITLES = Object.freeze({ cart: 'Your Cart', checkout: 'Checkout', orders: 'Order Details', 'my-orders': 'My Orders', 'track-order': 'Track Your Order', login: 'Sign In', signup: 'Create an Account', 'forgot-password': 'Reset Your Password', 'reset-password': 'Reset Your Password', 'verify-email': 'Verify Your Email', admin: 'Admin Dashboard' });

export function privatePageTitle(pathname) {
  if (/^\/products\/[a-z0-9-]+\/customize\/?$/.test(pathname)) return 'Customize This Product | Tap & Wrap';
  return `${PRIVATE_PAGE_TITLES[pathname.split('/')[1]] || 'Your Account'} | Tap & Wrap`;
}

export function canonicalOrigin(value) {
  if (!value || typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) return null;
    if (/^(?:localhost|127\.|0\.|\[?::1\]?)/i.test(url.hostname)) return null;
    return url.origin;
  } catch { return null; }
}

export function canonicalUrl(originValue, pathname = '/') {
  const origin = canonicalOrigin(originValue);
  if (!origin || typeof pathname !== 'string' || !pathname.startsWith('/') || pathname.startsWith('//') || /[?#\\]/.test(pathname) || [...pathname].some((character) => character.codePointAt(0) < 32 || character.codePointAt(0) === 127)) return null;
  return `${origin}${pathname === '/' ? '/' : pathname.replace(/\/+$/, '')}`;
}

export function serializeJsonLd(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

export function breadcrumbs(origin, entries) {
  const elements = entries.map(({ name, pathname }, index) => ({ '@type': 'ListItem', position: index + 1, name: cleanText(name), item: canonicalUrl(origin, pathname) }));
  return elements.every((entry) => entry.name && entry.item) ? { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: elements } : null;
}

export function organizationSchema(origin) {
  const url = canonicalUrl(origin, '/');
  return url ? { '@context': 'https://schema.org', '@type': 'Organization', name: BRAND_NAME, url, logo: `${canonicalOrigin(origin)}/tap-wrap-logo.webp` } : null;
}

export function offerAvailability(product) {
  if (product?.orderingAvailable !== true) return 'https://schema.org/OutOfStock';
  if (product?.inventoryMode === 'made_to_order' || product?.inventory?.mode === 'made_to_order') return 'https://schema.org/PreOrder';
  if (product?.inventoryMode === 'tracked' || product?.inventory?.mode === 'tracked') return 'https://schema.org/InStock';
  // Approval does not imply immediate stock when an inventory mode is unknown.
  return null;
}

export function productMetadata(product, origin, { indexable = true, checkoutEnabled = false, mediaOrigins, mediaVerified } = {}) {
  const explicitlyPrivate = product?.browseOnly === true || product?.visibility && product.visibility !== 'public' || product?.preview?.enabled === true || product?.status && product.status !== 'ready' || product?.published === false || product?.reviewRequired === true || product?.inventory?.approved === false || product?.variants?.some((variant) => variant.priceApproved === false || variant.inventory?.approved === false);
  const eligible = !explicitlyPrivate && product?.priceApproved === true && Number.isSafeInteger(product.pricePiastres) && product.pricePiastres > 0 && SLUG.test(product.slug || '') && Boolean(cleanText(product.name));
  // In the explicitly enabled, non-purchasable catalog showcase, drafts have real
  // titles and URLs but must never generate indexable Product or Offer markup.
  const previewDisplay = product?.browseOnly === true && product?.preview?.enabled !== true && SLUG.test(product?.slug || '') && Boolean(cleanText(product?.name));
  const displayable = eligible || previewDisplay;
  const pathname = displayable ? productHref(product) : '/products/unavailable';
  const imageUrl = displayable ? publicImageUrl(product.mainImageUrl, mediaOrigins) : null;
  const title = displayable ? `${cleanText(product.name, 120)} | Tap & Wrap` : 'Product unavailable | Tap & Wrap';
  const description = displayable ? cleanText(product.description) || `Explore ${cleanText(product.name, 100)} from Tap & Wrap.` : 'This product is not available.';
  const url = canonicalUrl(origin, pathname);
  const structuredData = [];
  const indexEligible = eligible && Boolean(imageUrl) && mediaVerified !== false;
  if (indexEligible && indexable && url) {
    const schema = { '@context': 'https://schema.org', '@type': 'Product', name: cleanText(product.name, 160), description, url, brand: { '@type': 'Brand', name: BRAND_NAME } };
    if (imageUrl) schema.image = [imageUrl];
    // A disabled checkout is not an offer. No merchant price is advertised as purchasable until launch authorization.
    if (checkoutEnabled) {
      const variantOffers = (product.variants || []).filter((variant) => Number.isSafeInteger(variant.pricePiastres) && variant.pricePiastres > 0);
      const prices = variantOffers.length ? variantOffers.map((variant) => variant.pricePiastres) : [product.pricePiastres];
      schema.offers = { '@type': prices.length > 1 ? 'AggregateOffer' : 'Offer', url, priceCurrency: 'EGP' };
      const states = (variantOffers.length ? variantOffers : [product]).map((entry) => offerAvailability(product.orderingAvailable === true ? entry : { ...entry, orderingAvailable: false }));
      if (states.every((state) => state && state === states[0])) schema.offers.availability = states[0];
      if (prices.length > 1) Object.assign(schema.offers, { lowPrice: (Math.min(...prices) / 100).toFixed(2), highPrice: (Math.max(...prices) / 100).toFixed(2), offerCount: prices.length });
      else schema.offers.price = (prices[0] / 100).toFixed(2);
    }
    structuredData.push(schema);
    const entries = [{ name: 'Home', pathname: '/' }, { name: 'Shop', pathname: '/shop' }];
    if (product.category?.slug && SLUG.test(product.category.slug)) entries.push({ name: product.category.name, pathname: categoryHref(product.category) });
    entries.push({ name: product.name, pathname });
    const crumb = breadcrumbs(origin, entries);
    if (crumb) structuredData.push(crumb);
  }
  return { title, description, pathname, imageUrl, structuredData, productSignature: eligible ? productSeoSignature(product) : null, indexable: indexEligible && indexable };
}
