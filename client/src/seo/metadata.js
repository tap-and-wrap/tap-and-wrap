export const BRAND_NAME = 'Tap & Wrap';
export const HERO_HEADLINE = 'Makes someone’s heart flap with Tap & Wrap.';
export const PUBLIC_STATIC_ROUTES = Object.freeze({
  '/': { title: 'Tap & Wrap | Thoughtful Gifts & Personalization', description: 'Explore Tap & Wrap gifts, product personalization, gift-box building and configured laser engraving.', heading: HERO_HEADLINE },
  '/shop': { title: 'Shop Gifts | Tap & Wrap', description: 'Browse approved Tap & Wrap gifts by category, availability and price.', heading: 'Shop Our Gifts' },
  '/customize': { title: 'Personalized Gifts | Tap & Wrap', description: 'Explore Build Your Gift Box and Laser Engraving, with options configured for eligible products.', heading: 'Make It Yours' },
  '/customize/gift-box': { title: 'Build Your Gift Box | Tap & Wrap', description: 'Build a gift box using the available, approved box types and configured component options.', heading: 'Build Your Gift Box' },
  '/customize/laser-engraving': { title: 'Laser Engraving | Tap & Wrap', description: 'Explore laser engraving for explicitly eligible Tap & Wrap products and configured materials.', heading: 'Laser Engraving' },
});
export const CONTENT_ROUTES = Object.freeze(['/about', '/contact', '/privacy-policy', '/refund-policy', '/shipping-policy', '/terms-of-service']);
export const PRIVATE_ROUTE = /^\/(?:admin(?:\/|$)|cart(?:\/|$)|checkout(?:\/|$)|orders(?:\/|$)|my-orders(?:\/|$)|track-order(?:\/|$)|login(?:\/|$)|signup(?:\/|$)|reset-password(?:\/|$)|forgot-password(?:\/|$)|verify-email(?:\/|$))/;
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
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

export function cleanText(value, maximum = 160) {
  if (typeof value !== 'string') return '';
  const withoutControls = [...value].map((character) => character.codePointAt(0) < 32 || character.codePointAt(0) === 127 ? ' ' : character).join('');
  return [...withoutControls.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()].slice(0, maximum).join('');
}

export function canonicalUrl(originValue, pathname = '/') {
  const origin = canonicalOrigin(originValue);
  if (!origin || typeof pathname !== 'string' || !pathname.startsWith('/') || pathname.startsWith('//') || /[?#\\]/.test(pathname) || [...pathname].some((character) => character.codePointAt(0) < 32 || character.codePointAt(0) === 127)) return null;
  return `${origin}${pathname === '/' ? '/' : pathname.replace(/\/+$/, '')}`;
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

export function productSeoSignature(product) {
  const category = (value) => value ? { id: String(value._id || ''), name: cleanText(value.name, 160), slug: SLUG.test(value.slug || '') ? value.slug : null } : null;
  const mode = (value) => ['tracked', 'made_to_order'].includes(value?.inventoryMode || value?.inventory?.mode) ? value.inventoryMode || value.inventory.mode : null;
  const price = (value) => Number.isSafeInteger(value) && value >= 0 ? value : null;
  return JSON.stringify({ name: cleanText(product?.name, 160), slug: SLUG.test(product?.slug || '') ? product.slug : null, description: cleanText(product?.description, 160), category: category(product?.category), subcategory: category(product?.subcategory), image: publicImageUrl(product?.mainImageUrl), price: price(product?.pricePiastres), compareAt: Number.isSafeInteger(product?.compareAtPiastres) && product.compareAtPiastres > product?.pricePiastres ? product.compareAtPiastres : null, orderingAvailable: product?.orderingAvailable === true, inventoryMode: mode(product), variants: (product?.variants || []).map((variant) => ({ price: price(variant.pricePiastres), orderingAvailable: product?.orderingAvailable === true && variant.orderingAvailable === true, inventoryMode: mode(variant) })) });
}

export function productMetadata(product, origin, { indexable = true, checkoutEnabled = false, mediaOrigins, mediaVerified } = {}) {
  const explicitlyPrivate = product?.preview?.enabled === true || product?.status && product.status !== 'ready' || product?.published === false || product?.reviewRequired === true || product?.inventory?.approved === false || product?.variants?.some((variant) => variant.priceApproved === false || variant.inventory?.approved === false);
  const eligible = !explicitlyPrivate && product?.priceApproved === true && Number.isSafeInteger(product.pricePiastres) && product.pricePiastres >= 0 && SLUG.test(product.slug || '') && Boolean(cleanText(product.name));
  const pathname = eligible ? `/products/${product.slug}` : '/products/unavailable';
  const imageUrl = eligible ? publicImageUrl(product.mainImageUrl, mediaOrigins) : null;
  const title = eligible ? `${cleanText(product.name, 120)} | Tap & Wrap` : 'Product unavailable | Tap & Wrap';
  const description = eligible ? cleanText(product.description) || `Explore ${cleanText(product.name, 100)} from Tap & Wrap.` : 'This product is not available.';
  const url = canonicalUrl(origin, pathname);
  const structuredData = [];
  const indexEligible = eligible && Boolean(imageUrl) && mediaVerified !== false;
  if (indexEligible && indexable && url) {
    const schema = { '@context': 'https://schema.org', '@type': 'Product', name: cleanText(product.name, 160), description, url, brand: { '@type': 'Brand', name: BRAND_NAME } };
    if (imageUrl) schema.image = [imageUrl];
    // A disabled checkout is not an offer. No merchant price is advertised as purchasable until launch authorization.
    if (checkoutEnabled) {
      const variantOffers = (product.variants || []).filter((variant) => Number.isSafeInteger(variant.pricePiastres) && variant.pricePiastres >= 0);
      const prices = variantOffers.length ? variantOffers.map((variant) => variant.pricePiastres) : [product.pricePiastres];
      schema.offers = { '@type': prices.length > 1 ? 'AggregateOffer' : 'Offer', url, priceCurrency: 'EGP' };
      const states = (variantOffers.length ? variantOffers : [product]).map((entry) => offerAvailability(product.orderingAvailable === true ? entry : { ...entry, orderingAvailable: false }));
      if (states.every((state) => state && state === states[0])) schema.offers.availability = states[0];
      if (prices.length > 1) Object.assign(schema.offers, { lowPrice: (Math.min(...prices) / 100).toFixed(2), highPrice: (Math.max(...prices) / 100).toFixed(2), offerCount: prices.length });
      else schema.offers.price = (prices[0] / 100).toFixed(2);
    }
    structuredData.push(schema);
    const entries = [{ name: 'Home', pathname: '/' }, { name: 'Shop', pathname: '/shop' }];
    if (product.category?.slug && SLUG.test(product.category.slug)) entries.push({ name: product.category.name, pathname: `/categories/${product.category.slug}` });
    entries.push({ name: product.name, pathname });
    const crumb = breadcrumbs(origin, entries);
    if (crumb) structuredData.push(crumb);
  }
  return { title, description, pathname, imageUrl, structuredData, productSignature: eligible ? productSeoSignature(product) : null, indexable: indexEligible && indexable };
}
