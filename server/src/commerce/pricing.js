import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { Product } from '../models/Product.js';
import { Category } from '../models/Category.js';
import { publicProductFilter } from '../catalog/product-policy.js';
import { mediaUrlForKey, inventoryCanOrder, productCanOrder } from '../catalog/public-presentation.js';
import { quoteCustomization } from './customization.js';
import { validateUploadReferences } from './uploads.js';
import { commerceError, checkedMoney } from './errors.js';

export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
export function fingerprint(value) { return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex'); }
export async function loadEligibleProduct(id, { session, context } = {}) {
  if (!mongoose.isObjectIdOrHexString(id)) throw commerceError(400, 'INVALID_PRODUCT', 'Choose a valid product.');
  const product = context ? context.products.get(String(id)) : await Product.findOne({ ...publicProductFilter(), _id: id }).session(session || null).lean().maxTimeMS(3000);
  if (!product) throw commerceError(409, 'PRODUCT_UNAVAILABLE', 'This product is no longer approved for ordering.');
  const mainRecord = context?.categories.get(String(product.categoryId));
  const childRecord = context?.categories.get(String(product.subcategoryId));
  const main = context ? mainRecord?.active && !mainRecord.parentId : await Category.exists({ _id: product.categoryId, parentId: null, active: true }).session(session || null);
  const child = !product.subcategoryId || (context ? childRecord?.active && String(childRecord.parentId) === String(product.categoryId) : await Category.exists({ _id: product.subcategoryId, parentId: product.categoryId, active: true }).session(session || null));
  if (!main || !child || !productCanOrder(product)) throw commerceError(409, 'PRODUCT_UNAVAILABLE', 'This product is currently unavailable.');
  return product;
}

export async function validateFields(definitions, input = {}, owner, { productId, purpose = 'personalization', session, context } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw commerceError(400, 'INVALID_PERSONALIZATION', 'Provide the configured personalization fields.');
  const allowed = new Set(definitions.map(field => field.key));
  if (Object.keys(input).some(key => !allowed.has(key))) throw commerceError(400, 'INVALID_PERSONALIZATION', 'An unsupported personalization field was provided.');
  const values = {}, uploads = [];
  for (const field of definitions) {
    const value = input[field.key];
    if (field.type === 'image') {
      const ids = value ?? [];
      const minimum = Math.max(field.minFiles || 0, field.required ? 1 : 0);
      if (!Array.isArray(ids) || ids.length < minimum || ids.length > field.maxFiles || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !mongoose.isObjectIdOrHexString(id))) {
        throw commerceError(400, 'INVALID_PHOTOS', `${field.label} requires ${minimum}–${field.maxFiles} distinct uploaded images.`);
      }
      const records = await validateUploadReferences(ids, owner, { purpose, session, context });
      for (const record of records) {
        if (String(record.productId) !== String(productId) || record.fieldKey !== field.key || record.sizeBytes > (field.maxBytes || 8 * 1024 * 1024)
          || !(field.acceptedMimeTypes || ['image/jpeg', 'image/png', 'image/webp']).includes(record.mimeType)) {
          throw commerceError(400, 'INVALID_PHOTOS', 'The uploaded image does not match this product field.');
        }
      }
      values[field.key] = ids; uploads.push(...ids);
    } else {
      if (value !== undefined && typeof value !== 'string') throw commerceError(400, 'INVALID_PERSONALIZATION', `${field.label} must be text.`);
      const text = (value || '').trim();
      if (field.required && !text) throw commerceError(400, 'REQUIRED_PERSONALIZATION', `${field.label} is required.`);
      if (Array.from(text).length > (field.maxLength ?? field.maxChars ?? 5000) || (field.type === 'select' && text && !field.choices?.includes(text))) {
        throw commerceError(400, 'INVALID_PERSONALIZATION', `${field.label} contains an unsupported value.`);
      }
      if (text) values[field.key] = text;
    }
  }
  if (new Set(uploads).size !== uploads.length || uploads.length > 10) throw commerceError(400, 'INVALID_PHOTOS', 'Use distinct images, with at most ten images per item.');
  return { values, uploadIds: uploads };
}

export async function quoteCartLine(line, owner, { session, context } = {}) {
  if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 99) throw commerceError(400, 'INVALID_QUANTITY', 'Quantity must be between 1 and 99.');
  const product = await loadEligibleProduct(line.productId, { session, context });
  const variant = product.variants?.find(value => value.key === line.variantKey);
  if ((product.variants?.length && !variant) || (!product.variants?.length && line.variantKey)) throw commerceError(400, 'VARIANT_REQUIRED', 'Choose an available configured variant.');
  const stock = variant?.inventory || product.inventory;
  if (!inventoryCanOrder(stock) || (stock.mode === 'tracked' && stock.quantity < line.quantity)) throw commerceError(409, 'INSUFFICIENT_STOCK', 'The requested quantity is unavailable.');
  const basePrice = variant?.pricePiastres == null ? product.pricePiastres : variant.pricePiastres;
  if (variant?.pricePiastres != null && !variant.priceApproved) throw commerceError(409, 'PRICE_UNAPPROVED', 'The selected price is not approved.');
  const personalized = await validateFields(product.personalization?.fields || [], line.personalization || {}, owner, { productId: product._id, session, context });
  let adjustment = 0, customization = null, customValues = null, componentClaims = [], extraUploads = [];
  if (line.customization) {
    const quote = await quoteCustomization(product, line.customization, { session, context, requireFields: true });
    const fields = await validateFields(quote.fields || [], line.customization.fields || {}, owner, { productId: product._id, purpose: 'artwork', session, context });
    adjustment = quote.adjustmentPiastres; customization = { ...quote.snapshot, fields: fields.values };
    customValues = { ...line.customization, fields: fields.values };
    componentClaims = quote.inventoryClaims || []; extraUploads = fields.uploadIds;
  }
  const uploadIds = [...personalized.uploadIds, ...extraUploads];
  if (new Set(uploadIds).size !== uploadIds.length || uploadIds.length > 10) throw commerceError(400, 'INVALID_PHOTOS', 'Use at most ten distinct photos or artwork images per item.');
  const unitPricePiastres = checkedMoney(basePrice + adjustment);
  const identityData = { productId: String(product._id), variantKey: variant?.key || null, personalization: personalized.values, customization: customValues };
  return {
    id: line.id, ...identityData, identity: fingerprint(identityData), name: product.name, slug: product.slug,
    sku: variant?.sku || product.sku || '', description: product.description || '',
    categoryId: String(product.categoryId), subcategoryId: product.subcategoryId ? String(product.subcategoryId) : null,
    variantLabel: variant?.attributes?.map(attribute => `${attribute.name}: ${attribute.value}`).join(', ') || null,
    quantity: line.quantity, mainImageUrl: mediaUrlForKey(product.mainImageKey), unitPricePiastres,
    lineTotalPiastres: checkedMoney(unitPricePiastres * line.quantity), customizationSnapshot: customization, uploadIds,
    inventoryClaims: [{ kind: 'product', id: String(product._id), variantKey: variant?.key || null, quantity: line.quantity, mode: stock.mode, expectedUpdatedAt: product.updatedAt },
      ...componentClaims.map(claim => ({ ...claim, quantity: checkedMoney(claim.quantityPerUnit * line.quantity) }))],
    priceVersion: product.updatedAt?.toISOString(), valid: true,
  };
}
export function publicCartLine(quote) {
  const { inventoryClaims, identity, priceVersion, customizationSnapshot, description, ...line } = quote;
  return { ...line, customization: customizationSnapshot || line.customization };
}
