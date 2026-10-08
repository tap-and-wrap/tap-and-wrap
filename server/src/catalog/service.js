import { Product } from '../models/Product.js';
import { Category } from '../models/Category.js';
import { ComponentOption } from '../models/ComponentOption.js';
import { publicProductFilter, orderableProductStockFilter } from './product-policy.js';
import { mediaUrlForKey, publicProductCard, publicProductDetail } from './public-presentation.js';
import { stagingProductPresentation, isStagingPreviewEnabled } from './staging-preview.js';
import { env } from '../config/env.js';
import { assertDatabaseWriteAllowed } from '../config/database-safety.js';

const QUERY_TIMEOUT_MS = 3000;
const LIST_FIELDS = '_id name slug categoryId subcategoryId mainImageKey pricePiastres compareAtPiastres priceApproved sku inventory.mode inventory.available inventory.quantity inventory.approved featured featuredOrder bestSeller bestSellerOrder createdAt';
const PUBLIC_LIST_FIELDS = `${LIST_FIELDS} variants.inventory personalization.fields.required customization.enabled`;
const ADMIN_LIST_FIELDS = `${LIST_FIELDS} externalCatalogId catalogRole status published priceApproved inventory.quantity inventory.approved reviewRequired updatedAt`;
const PUBLIC_DETAIL_FIELDS = `${LIST_FIELDS} description galleryKeys variants personalization customization updatedAt`;
const ADMIN_DETAIL_FIELDS = `${ADMIN_LIST_FIELDS} description galleryKeys variants personalization customization merchantReviewNotes reviewReasons variantSourceNotes catalogConfidence`;
const CATEGORY_FIELDS = '_id name slug parentId imageKey active featured order createdAt updatedAt';
const SORTS = {
  featured: { featured: -1, featuredOrder: 1, createdAt: -1, _id: -1 },
  best_sellers: { bestSeller: -1, bestSellerOrder: 1, createdAt: -1, _id: -1 },
  newest: { createdAt: -1, _id: -1 },
  price_asc: { pricePiastres: 1, _id: 1 },
  price_desc: { pricePiastres: -1, _id: -1 },
  name_asc: { name: 1, _id: 1 },
  name_desc: { name: -1, _id: -1 },
};

export function catalogError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function paginationFor(query) {
  const page = query.page ?? 1;
  const limit = Math.min(query.limit ?? 20, 20);
  return { page, limit, skip: (page - 1) * limit };
}

function paginationResult(pagination, total) {
  return { page: pagination.page, limit: pagination.limit, total, pages: Math.ceil(total / pagination.limit) };
}

function sameId(left, right) {
  return String(left ?? '') === String(right ?? '');
}

async function activeCategories() {
  const main = await Category.find({ active: true, parentId: null }).select('_id').lean().maxTimeMS(QUERY_TIMEOUT_MS);
  const mainIds = main.map((category) => category._id);
  const children = await Category.find({ active: true, parentId: { $in: mainIds } }).select('_id parentId').lean().maxTimeMS(QUERY_TIMEOUT_MS);
  return { mainIds, childIds: children.map((category) => category._id) };
}

async function visibleProductFilter(categories) {
  const { mainIds, childIds } = categories ?? await activeCategories();
  return {
    $and: [
      publicProductFilter(),
      { categoryId: { $in: mainIds } },
      { $or: [{ subcategoryId: null }, { subcategoryId: { $in: childIds } }] },
    ],
  };
}

async function categoryFromSlug(slugValue, publicOnly = false) {
  const category = await Category.findOne({ slug: slugValue }).select('_id parentId active').lean().maxTimeMS(QUERY_TIMEOUT_MS);
  if (!category) throw catalogError(404, 'CATEGORY_NOT_FOUND', 'Category not found');
  if (publicOnly) {
    if (!category.active) throw catalogError(404, 'CATEGORY_NOT_FOUND', 'Category not found');
    if (category.parentId) {
      const parent = await Category.findOne({ _id: category.parentId, active: true, parentId: null }).select('_id').lean().maxTimeMS(QUERY_TIMEOUT_MS);
      if (!parent) throw catalogError(404, 'CATEGORY_NOT_FOUND', 'Category not found');
    }
  }
  return category;
}

async function filtersForQuery(query, admin) {
  const filters = {};
  if (query.q) filters.$text = { $search: query.q };
  for (const field of ['featured', 'bestSeller']) {
    if (query[field] !== undefined) filters[field] = query[field];
  }
  if (query.minPrice !== undefined && query.maxPrice !== undefined && query.minPrice > query.maxPrice) {
    throw catalogError(400, 'INVALID_PRICE_RANGE', 'Minimum price cannot exceed maximum price');
  }
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    filters.pricePiastres = {};
    if (query.minPrice !== undefined) filters.pricePiastres.$gte = query.minPrice;
    if (query.maxPrice !== undefined) filters.pricePiastres.$lte = query.maxPrice;
  }
  if (query.availability) {
    const available = orderableProductStockFilter();
    filters.$and = query.availability === 'available' ? [available] : [{ $nor: [available] }];
  }
  if (query.category) {
    const category = await categoryFromSlug(query.category, !admin);
    filters[category.parentId ? 'subcategoryId' : 'categoryId'] = category._id;
  }
  if (query.subcategory) {
    const category = await categoryFromSlug(query.subcategory, !admin);
    if (!category.parentId) throw catalogError(400, 'INVALID_SUBCATEGORY', 'The subcategory filter must identify a subcategory');
    if (filters.categoryId && !sameId(filters.categoryId, category.parentId)) {
      throw catalogError(400, 'INVALID_SUBCATEGORY', 'The subcategory does not belong to the selected category');
    }
    if (filters.subcategoryId && !sameId(filters.subcategoryId, category._id)) {
      throw catalogError(400, 'INVALID_SUBCATEGORY', 'Conflicting subcategory filters');
    }
    filters.subcategoryId = category._id;
  }
  if (admin) {
    for (const field of ['status', 'priceApproved', 'reviewRequired']) {
      if (query[field] !== undefined) filters[field] = query[field];
    }
    if (query.inventoryApproved !== undefined) filters['inventory.approved'] = query.inventoryApproved;
    if (query.inventoryMode !== undefined) filters['inventory.mode'] = query.inventoryMode;
    if (query.available !== undefined) filters['inventory.available'] = query.available;
  }
  return filters;
}

export async function listProducts(query, { admin = false } = {}) {
  const pagination = paginationFor(!admin && query.bestSeller === true ? { ...query, limit: Math.min(query.limit ?? 8, 8) } : query);
  const filters = await filtersForQuery(query, admin);
  const visibility = admin ? null : await visibleProductFilter();
  const filter = admin ? filters : { $and: [visibility, filters] };
  const { pricePiastres: _priceBounds, ...rangeFilters } = filters;
  const rangeFilter = admin ? { $and: [rangeFilters, { pricePiastres: { $type: 'number' } }] } : { $and: [visibility, rangeFilters] };
  const [products, total, priceRanges] = await Promise.all([
    Product.find(filter).select(admin ? ADMIN_LIST_FIELDS : PUBLIC_LIST_FIELDS)
      .populate(admin ? [] : [{ path: 'categoryId', select: 'name slug' }, { path: 'subcategoryId', select: 'name slug' }])
      .sort(SORTS[query.sort ?? 'newest']).skip(pagination.skip).limit(pagination.limit).lean().maxTimeMS(QUERY_TIMEOUT_MS),
    Product.countDocuments(filter).maxTimeMS(QUERY_TIMEOUT_MS),
    Product.aggregate([{ $match: rangeFilter }, { $group: { _id: null, min: { $min: '$pricePiastres' }, max: { $max: '$pricePiastres' } } }])
      .option({ maxTimeMS: QUERY_TIMEOUT_MS }),
  ]);
  return {
    products: admin ? products : products.map(publicProductCard),
    pagination: paginationResult(pagination, total),
    priceRange: { min: priceRanges[0]?.min ?? null, max: priceRanges[0]?.max ?? null },
  };
}

export async function getPublicProduct(slugValue) {
  const visibility = await visibleProductFilter();
  const product = await Product.findOne({ $and: [visibility, { slug: slugValue }] })
    .select(PUBLIC_DETAIL_FIELDS)
    .populate([{ path: 'categoryId', select: 'name slug' }, { path: 'subcategoryId', select: 'name slug' }])
    .lean().maxTimeMS(QUERY_TIMEOUT_MS);
  if (!product) throw catalogError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
  const related = await Product.find({ $and: [visibility, { categoryId: product.categoryId._id, _id: { $ne: product._id } }] })
    .select(PUBLIC_LIST_FIELDS).sort(SORTS.featured).limit(4)
    .populate([{ path: 'categoryId', select: 'name slug' }, { path: 'subcategoryId', select: 'name slug' }])
    .lean().maxTimeMS(QUERY_TIMEOUT_MS);
  return { ...publicProductDetail(product), relatedProducts: related.map(publicProductCard) };
}

export async function getAdminProduct(id) {
  const product = await Product.findById(id).select(ADMIN_DETAIL_FIELDS).lean().maxTimeMS(QUERY_TIMEOUT_MS);
  if (!product) throw catalogError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
  return product;
}

export async function getStagingProductPreview(id) {
  if (!isStagingPreviewEnabled(Product.db)) throw catalogError(404, 'STAGING_PREVIEW_UNAVAILABLE', 'Draft preview requires an explicitly enabled, validated staging database.');
  const product = await Product.findById(id)
    .select(`${PUBLIC_DETAIL_FIELDS} externalCatalogId catalogRole status reviewRequired`)
    .populate([{ path: 'categoryId', select: 'name slug active' }, { path: 'subcategoryId', select: 'name slug active' }])
    .lean().maxTimeMS(QUERY_TIMEOUT_MS);
  if (!product) throw catalogError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
  return stagingProductPresentation(product);
}

async function validateProductCategories(categoryId, subcategoryId) {
  const main = await Category.findOne({ _id: categoryId, parentId: null }).select('_id').lean().maxTimeMS(QUERY_TIMEOUT_MS);
  if (!main) throw catalogError(400, 'INVALID_CATEGORY', 'Choose an existing main category');
  if (subcategoryId) {
    const child = await Category.findOne({ _id: subcategoryId, parentId: categoryId }).select('_id').lean().maxTimeMS(QUERY_TIMEOUT_MS);
    if (!child) throw catalogError(400, 'INVALID_SUBCATEGORY', 'Choose a subcategory belonging to the main category');
  }
}

function mergeInventory(current, patch) {
  const previous = current?.toObject ? current.toObject() : (current ?? {});
  const result = { ...previous, ...patch };
  const changed = ['mode', 'quantity', 'available'].some((field) => patch[field] !== undefined && patch[field] !== previous[field]);
  if (changed && patch.approved === undefined) result.approved = false;
  if (result.mode === 'made_to_order') {
    if (patch.quantity !== undefined && patch.quantity !== null) {
      throw catalogError(400, 'INVALID_INVENTORY', 'Made by Request inventory must not have a stock quantity');
    }
    result.quantity = null;
  } else if (result.mode === 'tracked' && result.quantity == null) {
    result.quantity = 10;
    if (patch.approved === undefined) result.approved = false;
  }
  return result;
}

function normalizeVariants(current, next) {
  return next.map((variant) => {
    const previous = current?.find((entry) => entry.key === variant.key);
    const normalized = { ...variant };
    if (previous && variant.pricePiastres === previous.pricePiastres && variant.priceApproved === undefined) {
      normalized.priceApproved = previous.priceApproved;
    }
    if (previous) normalized.inventory = mergeInventory(previous.inventory, variant.inventory ?? {});
    else if (variant.inventory) normalized.inventory = mergeInventory(undefined, variant.inventory);
    return normalized;
  });
}

export async function createProduct(input) {
  assertDatabaseWriteAllowed(Product.db, env);
  await validateProductCategories(input.categoryId, input.subcategoryId);
  const product = new Product(input);
  if (input.inventory) product.inventory = mergeInventory(product.inventory, input.inventory);
  if (input.variants) product.variants = normalizeVariants([], input.variants);
  assertDatabaseWriteAllowed(Product.db, env);
  await product.save();
  return getAdminProduct(product._id);
}

export async function updateProduct(id, input) {
  assertDatabaseWriteAllowed(Product.db, env);
  const product = await Product.findById(id).maxTimeMS(QUERY_TIMEOUT_MS);
  if (!product) throw catalogError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
  await validateProductCategories(input.categoryId ?? product.categoryId, input.subcategoryId !== undefined ? input.subcategoryId : product.subcategoryId);
  const patch = { ...input };
  if (input.pricePiastres !== undefined && input.pricePiastres !== product.pricePiastres && input.priceApproved === undefined) patch.priceApproved = false;
  if (input.compareAtPiastres !== undefined && input.compareAtPiastres !== product.compareAtPiastres && input.priceApproved === undefined) patch.priceApproved = false;
  if (input.inventory) patch.inventory = mergeInventory(product.inventory, input.inventory);
  if (input.variants) patch.variants = normalizeVariants(product.variants, input.variants);
  if (input.customization) patch.customization = { ...product.customization.toObject(), ...input.customization };
  product.set(patch);
  assertDatabaseWriteAllowed(Product.db, env);
  await product.save();
  return getAdminProduct(product._id);
}

async function categoryCounts(categoryIds, admin, categories) {
  if (!categoryIds.length) return new Map();
  const relevant = { $or: [{ categoryId: { $in: categoryIds } }, { subcategoryId: { $in: categoryIds } }] };
  const filter = admin ? relevant : { $and: [await visibleProductFilter(categories), relevant] };
  const rows = await Product.aggregate([
    { $match: filter },
    { $project: { categories: ['$categoryId', '$subcategoryId'] } },
    { $unwind: '$categories' },
    { $match: { categories: { $in: categoryIds } } },
    { $group: { _id: '$categories', count: { $sum: 1 } } },
  ]).option({ maxTimeMS: QUERY_TIMEOUT_MS });
  return new Map(rows.map((row) => [String(row._id), row.count]));
}

export async function listCategories(query, { admin = false } = {}) {
  const pagination = paginationFor(query);
  const filter = {};
  let categoryVisibility;
  if (!admin) {
    categoryVisibility = await activeCategories();
    const { mainIds, childIds } = categoryVisibility;
    filter._id = { $in: [...mainIds, ...childIds] };
    filter.active = true;
  } else if (query.active !== undefined) filter.active = query.active;
  if (query.parent === 'root') filter.parentId = null;
  else if (query.parent) filter.parentId = (await categoryFromSlug(query.parent, !admin))._id;
  if (query.featured !== undefined) filter.featured = query.featured;
  const [categories, total] = await Promise.all([
    Category.find(filter).select(CATEGORY_FIELDS).sort({ order: 1, name: 1, _id: 1 })
      .skip(pagination.skip).limit(pagination.limit).lean().maxTimeMS(QUERY_TIMEOUT_MS),
    Category.countDocuments(filter).maxTimeMS(QUERY_TIMEOUT_MS),
  ]);
  const counts = await categoryCounts(categories.map((category) => category._id), admin, categoryVisibility);
  return {
    categories: categories.map((category) => {
      const { imageKey, ...publicCategory } = category;
      return { ...(admin ? category : { ...publicCategory, imageUrl: mediaUrlForKey(imageKey) }), productCount: counts.get(String(category._id)) ?? 0 };
    }),
    pagination: paginationResult(pagination, total),
  };
}

export async function getPublicCategory(slugValue) {
  const reference = await categoryFromSlug(slugValue, true);
  const category = await Category.findOne({ _id: reference._id, active: true }).select(CATEGORY_FIELDS).lean().maxTimeMS(QUERY_TIMEOUT_MS);
  if (!category) throw catalogError(404, 'CATEGORY_NOT_FOUND', 'Category not found');
  const parent = category.parentId ? await Category.findOne({ _id: category.parentId, active: true, parentId: null }).select('_id name slug').lean().maxTimeMS(QUERY_TIMEOUT_MS) : null;
  if (category.parentId && !parent) throw catalogError(404, 'CATEGORY_NOT_FOUND', 'Category not found');
  const counts = await categoryCounts([category._id], false);
  const { imageKey, ...publicCategory } = category;
  return { ...publicCategory, parent: parent ? { _id: String(parent._id), name: parent.name, slug: parent.slug } : null, imageUrl: mediaUrlForKey(imageKey), productCount: counts.get(String(category._id)) || 0 };
}

async function validateCategoryParent(parentId, id) {
  if (!parentId) return;
  if (id && sameId(parentId, id)) throw catalogError(400, 'INVALID_CATEGORY_PARENT', 'A category cannot be its own parent');
  const parent = await Category.findOne({ _id: parentId, parentId: null }).select('_id').lean().maxTimeMS(QUERY_TIMEOUT_MS);
  if (!parent) throw catalogError(400, 'INVALID_CATEGORY_PARENT', 'Choose an existing main category as parent');
}

export async function createCategory(input) {
  assertDatabaseWriteAllowed(Category.db, env);
  await validateCategoryParent(input.parentId);
  assertDatabaseWriteAllowed(Category.db, env);
  const category = await Category.create(input);
  return Category.findById(category._id).select(CATEGORY_FIELDS).lean().maxTimeMS(QUERY_TIMEOUT_MS);
}

export async function updateCategory(id, input) {
  assertDatabaseWriteAllowed(Category.db, env);
  const category = await Category.findById(id).maxTimeMS(QUERY_TIMEOUT_MS);
  if (!category) throw catalogError(404, 'CATEGORY_NOT_FOUND', 'Category not found');
  if (input.parentId !== undefined && !sameId(input.parentId, category.parentId)) {
    await validateCategoryParent(input.parentId, id);
    const [usedByProduct, usedByComponent, hasChildren] = await Promise.all([
      Product.exists({ $or: [{ categoryId: id }, { subcategoryId: id }] }).maxTimeMS(QUERY_TIMEOUT_MS),
      ComponentOption.exists({ $or: [{ categoryId: id }, { subcategoryId: id }] }).maxTimeMS(QUERY_TIMEOUT_MS),
      Category.exists({ parentId: id }).maxTimeMS(QUERY_TIMEOUT_MS),
    ]);
    if (usedByProduct || usedByComponent || hasChildren) {
      throw catalogError(409, 'CATEGORY_IN_USE', 'A category referenced by catalog entries or subcategories cannot change its parent');
    }
  }
  category.set(input);
  assertDatabaseWriteAllowed(Category.db, env);
  await category.save();
  return Category.findById(category._id).select(CATEGORY_FIELDS).lean().maxTimeMS(QUERY_TIMEOUT_MS);
}
