import mongoose from 'mongoose';
export const safeInteger = { validator: value => value == null || (Number.isSafeInteger(value) && value >= 0), message: 'Must be a nonnegative safe integer' };
export function boundedArray(maximum) {
  return { validator: values => Array.isArray(values) && values.length <= maximum, message: `Maximum ${maximum} entries` };
}
export function isSafeImageReference(value) {
  if (value == null) return true;
  return typeof value === 'string' && value.length > 0 && value.length <= 500 &&
    !/[:\\\u0000-\u001f\u007f?#%]/.test(value) && !value.startsWith('/') &&
    !value.split('/').some(part => !part || part === '.' || part === '..') && /\.(webp|png|jpe?g)$/i.test(value);
}
export const imageReference = { validator: isSafeImageReference, message: 'Use a safe relative image reference, not a URL or filesystem path' };
export const inventorySchema = new mongoose.Schema({
  mode: { type: String, enum: ['tracked', 'made_to_order'], default: 'tracked', required: true },
  quantity: { type: Number, default: 10, validate: safeInteger },
  approved: { type: Boolean, default: false },
  available: { type: Boolean, default: true },
}, { _id: false, strict: 'throw' });
inventorySchema.pre('validate', function () {
  if (this.mode === 'made_to_order') this.quantity = null;
  else if (!Number.isSafeInteger(this.quantity) || this.quantity < 0) this.invalidate('quantity', 'Tracked inventory requires a nonnegative integer quantity');
});
export const catalogIdentityFields = {
  externalCatalogId: { type: String, trim: true, maxlength: 100, match: /^[A-Za-z0-9][A-Za-z0-9_-]*$/, unique: true, sparse: true },
  name: { type: String, required: true, trim: true, maxlength: 240 },
  slug: { type: String, required: true, trim: true, maxlength: 300, match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/, unique: true },
  description: { type: String, default: '', maxlength: 10000 },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  subcategoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
  mainImageKey: { type: String, default: null, validate: imageReference },
  galleryKeys: { type: [String], default: [], validate: [boundedArray(23), { validator: values => values.every(value => typeof value === 'string' && isSafeImageReference(value)) && new Set(values).size === values.length, message: 'Gallery must contain distinct safe relative image references' }] },
  sku: { type: String, trim: true, maxlength: 100 },
};
const sourceSchema = new mongoose.Schema({
  mainCategory: String, subcategory: String, stockStatus: String,
  quantity: { type: Number, default: null }, priceEGP: { type: Number, default: null }, compareAtPriceEGP: { type: Number, default: null }, publishStatus: String,
}, { _id: false, strict: 'throw' });
const importSchema = new mongoose.Schema({
  fingerprint: { type: String, match: /^[a-f0-9]{64}$/ }, workbookSha256: { type: String, match: /^[a-f0-9]{64}$/ }, rowNumber: { type: Number, min: 2, validate: safeInteger },
}, { _id: false, strict: 'throw' });
export const importMetadataFields = {
  catalogConfidence: { type: String, enum: ['High', 'Medium'] },
  merchantReviewNotes: { type: String, default: '', maxlength: 10000 },
  variantSourceNotes: { type: String, default: '', maxlength: 10000 },
  reviewRequired: { type: Boolean, default: false }, reviewReasons: { type: [String], default: [], validate: boundedArray(20) },
  catalogSource: { type: sourceSchema }, importSource: { type: importSchema },
};
