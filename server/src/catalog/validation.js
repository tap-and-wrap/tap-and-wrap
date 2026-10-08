import { z } from 'zod';
import { isSafeImageReference } from './fields.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Expected a MongoDB object ID');
const slug = z.string().trim().min(1).max(300).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Expected a lowercase slug');
const money = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const quantity = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const boundedText = (maximum) => z.string().trim().max(maximum);
const imageKey = z.string().trim().min(1).max(500).refine(isSafeImageReference, 'Expected a safe relative image key');
const bool = z.boolean();

export const inventorySchema = z.object({
  mode: z.enum(['tracked', 'made_to_order']).optional(),
  quantity: quantity.nullable().optional(),
  approved: bool.optional(),
  available: bool.optional(),
}).strict();

const variantSchema = z.object({
  key: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,79}$/),
  sku: boundedText(100).optional(),
  attributes: z.array(z.object({ name: boundedText(80).min(1), value: boundedText(120).min(1) }).strict()).max(10),
  pricePiastres: money.nullable().optional(),
  priceApproved: bool.optional(),
  inventory: inventorySchema.optional(),
}).strict();

const personalizationFieldSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,49}$/),
  label: boundedText(160).min(1),
  type: z.enum(['image', 'short_text', 'long_text', 'select']),
  required: bool.optional(),
  minFiles: z.number().int().nonnegative().max(10).optional(),
  maxFiles: z.number().int().positive().max(10).optional(),
  maxLength: z.number().int().positive().max(5000).optional(),
  choices: z.array(boundedText(160).min(1)).max(50).optional(),
  acceptedMimeTypes: z.array(z.enum(['image/jpeg', 'image/png', 'image/webp'])).min(1).max(3).optional(),
  maxBytes: z.number().int().min(1).max(10 * 1024 * 1024).optional(),
}).strict();

const productFields = {
  name: boundedText(240).min(1),
  slug,
  description: boundedText(10000).optional(),
  categoryId: objectId,
  subcategoryId: objectId.nullable().optional(),
  mainImageKey: imageKey.nullable().optional(),
  galleryKeys: z.array(imageKey).max(23).optional(),
  pricePiastres: money.nullable().optional(),
  compareAtPiastres: money.nullable().optional(),
  priceApproved: bool.optional(),
  inventory: inventorySchema.optional(),
  status: z.enum(['draft', 'ready', 'hold']).optional(),
  sku: boundedText(100).optional(),
  variants: z.array(variantSchema).max(30).optional(),
  personalization: z.object({ fields: z.array(personalizationFieldSchema).max(20) }).strict().optional(),
  customization: z.object({
    enabled: bool.optional(),
    templateId: objectId.nullable().optional(),
    serviceKind: z.enum(['gift_box', 'laser_engraving', 'tray', 'generic']).nullable().optional(),
    serviceEntryEligible: bool.optional(),
  }).strict().optional(),
  reviewRequired: bool.optional(),
  merchantReviewNotes: boundedText(10000).optional(),
  featured: bool.optional(),
  featuredOrder: money.optional(),
  bestSeller: bool.optional(),
  bestSellerOrder: money.optional(),
};

export const createProductSchema = z.object(productFields).strict();
export const updateProductSchema = createProductSchema.partial().refine((body) => Object.keys(body).length > 0, 'Provide at least one field');
export const publicationSchema = z.object({ status: z.enum(['draft', 'ready', 'hold']) }).strict();

const categoryFields = {
  name: boundedText(160).min(1),
  slug: slug.max(240),
  parentId: objectId.nullable().optional(),
  imageKey: imageKey.nullable().optional(),
  active: bool.optional(),
  featured: bool.optional(),
  order: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
};

export const createCategorySchema = z.object(categoryFields).strict();
export const updateCategorySchema = createCategorySchema.partial().refine((body) => Object.keys(body).length > 0, 'Provide at least one field');

const positiveIntegerQuery = z.string().regex(/^[1-9]\d{0,5}$/).transform(Number);
const booleanQuery = z.enum(['true', 'false']).transform((value) => value === 'true');
const commonQueryFields = {
  page: positiveIntegerQuery.refine((value) => value <= 200, 'Page cannot exceed 200').optional(),
  limit: positiveIntegerQuery.transform((value) => Math.min(value, 20)).optional(),
  q: boundedText(100).min(1).optional(),
  category: slug.optional(),
  subcategory: slug.optional(),
  sort: z.enum(['featured', 'best_sellers', 'newest', 'price_asc', 'price_desc', 'name_asc', 'name_desc']).optional(),
  availability: z.enum(['available', 'sold_out']).optional(),
  minPrice: z.string().regex(/^\d+$/).transform(Number).refine(Number.isSafeInteger).optional(),
  maxPrice: z.string().regex(/^\d+$/).transform(Number).refine(Number.isSafeInteger).optional(),
  featured: booleanQuery.optional(),
  bestSeller: booleanQuery.optional(),
};

export const publicProductQuerySchema = z.object(commonQueryFields).strict();
export const adminProductQuerySchema = z.object({
  ...commonQueryFields,
  status: z.enum(['draft', 'ready', 'hold']).optional(),
  priceApproved: booleanQuery.optional(),
  inventoryApproved: booleanQuery.optional(),
  inventoryMode: z.enum(['tracked', 'made_to_order']).optional(),
  available: booleanQuery.optional(),
  reviewRequired: booleanQuery.optional(),
}).strict();

export const categoryQuerySchema = z.object({
  page: positiveIntegerQuery.refine((value) => value <= 200, 'Page cannot exceed 200').optional(),
  limit: positiveIntegerQuery.transform((value) => Math.min(value, 20)).optional(),
  parent: z.union([z.literal('root'), slug]).optional(),
  featured: booleanQuery.optional(),
  active: booleanQuery.optional(),
}).strict();

export function parseInput(schema, value) {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const error = new Error('Invalid catalog request');
  error.status = 400;
  error.code = 'VALIDATION_ERROR';
  error.details = result.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message }));
  throw error;
}

export function parseObjectId(value) {
  return parseInput(objectId, value);
}

export function parseSlug(value) {
  return parseInput(slug, value);
}
