export const PRODUCT_SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export function productNameSegment(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 180).replace(/-$/, '');
}
export function productHref(product) {
  return /^\/products\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product?.publicPath || '') ? product.publicPath : `/products/${encodeURIComponent(product.slug)}`;
}
export function productAddressCandidates(product) {
  const id = productNameSegment(String(product._id));
  const identifier = productNameSegment(product.externalCatalogId) || id;
  const base = productNameSegment(product.name) || `product-${identifier}`;
  return [base, `${base}-${identifier}`, `${base}-product-${id}`,
    ...Array.from({ length: 16 }, (_, i) => `${base}-product-${id}-${i + 2}`)];
}

// Offline proposal only. Existing reservations always win; reserve ALL historic
// slugs before allocating any new friendly address, independent of visibility.
export function planProductAddresses(products, existing = []) {
  if (products.length > 10_000 || existing.length > 100_000) throw new Error('Alias planning limit exceeded');
  const owners = new Map();
  const canonical = new Map();
  const entries = [];
  const reserve = (slug, id, isCanonical = false) => {
    if (!PRODUCT_SEGMENT.test(slug) || slug.length > 300) throw new Error('Invalid product address');
    if (owners.has(slug) && owners.get(slug) !== id) throw new Error('Product address is already reserved');
    if (isCanonical && canonical.has(id) && canonical.get(id) !== slug) throw new Error('Multiple canonical product addresses');
    owners.set(slug, id);
    if (isCanonical) canonical.set(id, slug);
  };
  for (const entry of existing) {
    if (typeof entry.canonical !== 'boolean') throw new Error('Invalid product address reservation');
    reserve(entry.slug, String(entry.productId), entry.canonical);
  }
  const ids = new Set();
  const sorted = [...products].sort((a, b) => String(a._id).localeCompare(String(b._id), 'en'));
  for (const product of sorted) {
    const id = String(product._id);
    if (!id || ids.has(id)) throw new Error('Duplicate product identity');
    ids.add(id); reserve(product.slug, id);
  }
  for (const product of sorted) {
    const id = String(product._id);
    const slug = canonical.get(id) || productAddressCandidates(product).find(candidate => !owners.has(candidate) || owners.get(candidate) === id);
    if (!slug) throw new Error('No safe product address remains');
    reserve(slug, id, true);
    entries.push({ productId: id, externalCatalogId: product.externalCatalogId || null, name: product.name,
      legacySlug: product.slug, canonicalSlug: slug, publicPath: `/products/${slug}`, disambiguated: slug !== productNameSegment(product.name) });
  }
  return { entries, collisionCount: entries.filter(entry => entry.disambiguated).length };
}
