export const CATALOG_SORTS = [
  { value: 'featured', label: 'Featured' },
  { value: 'best_sellers', label: 'Best Sellers' },
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price Low–High' },
  { value: 'price_desc', label: 'Price High–Low' },
  { value: 'name_asc', label: 'Name A–Z' },
  { value: 'name_desc', label: 'Name Z–A' },
];

export function formatCatalogPrice(piastres) {
  if (!Number.isSafeInteger(piastres) || piastres < 0) return 'Price unavailable';
  return new Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 2 }).format(piastres / 100);
}

export function egpToPiastres(value) {
  if (value === '') return '';
  if (!/^\d+(?:\.\d{0,2})?$/.test(String(value))) return null;
  const [whole, fraction = ''] = String(value).split('.');
  const result = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  return result <= BigInt(Number.MAX_SAFE_INTEGER) ? String(result) : null;
}

export function piastresToInput(value) {
  if (value === '' || value === null || value === undefined) return '';
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) return '';
  const amount = BigInt(number);
  const fraction = String(amount % 100n).padStart(2, '0').replace(/0+$/, '');
  return `${amount / 100n}${fraction ? `.${fraction}` : ''}`;
}

export function readCatalogParams(searchParams) {
  const positiveInteger = (value, fallback) => /^\d+$/.test(value || '') && Number.isSafeInteger(Number(value)) && Number(value) > 0 && Number(value) <= 200 ? Number(value) : fallback;
  const price = (key) => /^\d+$/.test(searchParams.get(key) || '') && Number.isSafeInteger(Number(searchParams.get(key))) ? searchParams.get(key) : '';
  const sort = searchParams.get('sort') || 'featured';
  return {
    q: (searchParams.get('q') || '').trim().slice(0, 100),
    category: searchParams.get('category') || '',
    subcategory: searchParams.get('subcategory') || '',
    availability: ['available', 'sold_out'].includes(searchParams.get('availability')) ? searchParams.get('availability') : '',
    minPrice: price('minPrice'),
    maxPrice: price('maxPrice'),
    sort: CATALOG_SORTS.some((item) => item.value === sort) ? sort : 'featured',
    page: positiveInteger(searchParams.get('page'), 1),
    limit: 20,
  };
}

export function catalogApiParams(params) {
  return Object.fromEntries(Object.entries(params).filter(([, value]) => value !== '' && value !== undefined && value !== null));
}

// URL bounds are integer piastres, while the editor holds decimal EGP strings.
export function catalogPriceErrors(searchParams) {
  const errors = {};
  for (const key of ['minPrice', 'maxPrice']) {
    const value = searchParams.get(key);
    if (value !== null && value !== '' && (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))) {
      errors[key] = 'This URL price filter is invalid. Enter a non-negative EGP amount.';
    }
  }
  const minimum = searchParams.get('minPrice');
  const maximum = searchParams.get('maxPrice');
  if (!Object.keys(errors).length && minimum && maximum && BigInt(minimum) > BigInt(maximum)) {
    errors.range = 'Minimum price must be less than or equal to maximum price.';
  }
  return errors;
}

export function applyCatalogFilters(searchParams, filters) {
  const next = new URLSearchParams(searchParams);
  for (const key of ['category', 'subcategory', 'availability', 'minPrice', 'maxPrice']) {
    if (filters[key] === '' || filters[key] === undefined) next.delete(key);
    else next.set(key, String(filters[key]));
  }
  next.delete('page');
  return next;
}

export function variantLabel(variant) {
  return variant.attributes?.length ? variant.attributes.map((attribute) => `${attribute.name}: ${attribute.value}`).join(' · ') : variant.key;
}
