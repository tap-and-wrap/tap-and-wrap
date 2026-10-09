export function catalogId(value) {
  if (typeof value === 'string') return value;
  return value?.id || value?._id || '';
}

export function priceInput(value) {
  if (value === null || value === undefined) return '';
  const amount = BigInt(value);
  return `${amount / 100n}.${String(amount % 100n).padStart(2, '0')}`;
}

export function parsePriceInput(value, label = 'Price') {
  const input = String(value).trim();
  if (!input) return null;
  if (!/^\d+(?:\.\d{1,2})?$/.test(input)) {
    throw priceValidationError(`${label} must be a non-negative EGP amount with up to two decimal places.`, label);
  }
  const [whole, fraction = ''] = input.split('.');
  const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) throw priceValidationError(`${label} is too large.`, label);
  return Number(amount);
}

function priceValidationError(message, label) {
  const error = new Error(message);
  const variant = /^Variant (\d+) price$/.exec(label);
  error.details = [{ field: variant ? `variants.${Number(variant[1]) - 1}.pricePiastres` : label === 'Compare-at price' ? 'compareAtPiastres' : 'pricePiastres', message }];
  return error;
}

export function integerInput(value, label) {
  const input = String(value).trim();
  if (!/^\d+$/.test(input) || !Number.isSafeInteger(Number(input))) {
    throw new Error(`${label} must be a non-negative whole number.`);
  }
  return Number(input);
}

function inventoryDraft(inventory = {}) {
  return {
    mode: inventory.mode || 'tracked',
    quantity: inventory.mode === 'made_to_order' ? '' : String(inventory.quantity ?? 10),
    approved: inventory.approved === true,
    available: inventory.available !== false,
  };
}

export function createProductDraft(product = {}) {
  return {
    name: product.name || '',
    slug: product.slug || '',
    description: product.description || '',
    categoryId: catalogId(product.categoryId || product.category),
    subcategoryId: catalogId(product.subcategoryId || product.subcategory),
    price: priceInput(product.pricePiastres),
    compareAt: priceInput(product.compareAtPiastres),
    priceApproved: product.priceApproved === true,
    sku: product.sku || '',
    status: product.status || 'draft',
    inventory: inventoryDraft(product.inventory),
    galleryKeys: [...(product.galleryKeys || [])],
    variants: (product.variants || []).map((variant) => ({
      key: variant.key || '',
      sku: variant.sku || '',
      attributes: (variant.attributes || []).map((attribute) => ({ name: attribute.name, value: attribute.value })),
      price: priceInput(variant.pricePiastres),
      priceApproved: variant.priceApproved === true,
      inventory: inventoryDraft(variant.inventory),
    })),
    reviewRequired: product.reviewRequired === true,
    featured: product.featured === true,
    bestSeller: product.bestSeller === true,
    featuredOrder: String(product.featuredOrder ?? 0),
    bestSellerOrder: String(product.bestSellerOrder ?? 0),
  };
}

function inventoryPayload(inventory, label) {
  return {
    mode: inventory.mode,
    quantity: inventory.mode === 'made_to_order' ? null : integerInput(inventory.quantity, `${label} quantity`),
    approved: inventory.approved,
    available: inventory.available,
  };
}

export function createProductPayload(draft) {
  const galleryKeys = draft.galleryKeys.map((value) => value.trim()).filter(Boolean);
  if (galleryKeys.length > 23) throw new Error('A product can have at most 23 image references.');
  if (new Set(galleryKeys).size !== galleryKeys.length) throw new Error('Image references must be unique.');
  const pricePiastres = parsePriceInput(draft.price);
  const compareAtPiastres = parsePriceInput(draft.compareAt, 'Compare-at price');
  if (draft.priceApproved && pricePiastres === null) throw priceValidationError('Enter a price before approving it.', 'Price');
  if (compareAtPiastres !== null && pricePiastres !== null && compareAtPiastres < pricePiastres) {
    throw priceValidationError('Compare-at price must be at least the product price.', 'Compare-at price');
  }
  return {
    name: draft.name.trim(),
    slug: draft.slug.trim(),
    description: draft.description,
    categoryId: draft.categoryId,
    subcategoryId: draft.subcategoryId || null,
    pricePiastres,
    compareAtPiastres,
    priceApproved: draft.priceApproved,
    sku: draft.sku.trim(),
    status: draft.status,
    inventory: inventoryPayload(draft.inventory, 'Product'),
    mainImageKey: galleryKeys[0] || null,
    galleryKeys,
    variants: draft.variants.map((variant, index) => {
      const variantPrice = parsePriceInput(variant.price, `Variant ${index + 1} price`);
      if (variant.priceApproved && variantPrice === null) throw new Error(`Enter a price before approving variant ${index + 1}.`);
      return {
        key: variant.key.trim(),
        sku: variant.sku.trim(),
        attributes: variant.attributes.map(({ name, value }) => ({ name: name.trim(), value: value.trim() })),
        pricePiastres: variantPrice,
        priceApproved: variant.priceApproved,
        inventory: inventoryPayload(variant.inventory, `Variant ${index + 1}`),
      };
    }),
    reviewRequired: draft.reviewRequired,
    featured: draft.featured,
    bestSeller: draft.bestSeller,
    featuredOrder: integerInput(draft.featuredOrder, 'Featured order'),
    bestSellerOrder: integerInput(draft.bestSellerOrder, 'Best Seller order'),
  };
}

export function adminErrorMessage(error) {
  const status = error?.status || error?.response?.status;
  if (status === 503) return 'The catalog service is unavailable. A configured staging database and API are required.';
  if (status === 401) return 'Your session has expired. Sign in again before saving.';
  if (status === 403) return 'Administrator permission is required for this action.';
  return error?.response?.data?.error?.message || error?.message || 'The request could not be completed. Please try again.';
}

export function slugFromName(name) {
  return name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
