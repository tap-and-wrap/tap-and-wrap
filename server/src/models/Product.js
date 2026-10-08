import mongoose from 'mongoose';
import { inventorySchema, catalogIdentityFields, importMetadataFields, boundedArray, safeInteger } from '../catalog/fields.js';
import { getPublicationIssues } from '../catalog/product-policy.js';

const attributeSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  value: { type: String, required: true, trim: true, maxlength: 120 },
}, { _id: false, strict: 'throw' });
const variantSchema = new mongoose.Schema({
  key: { type: String, required: true, match: /^[a-z0-9][a-z0-9_-]{0,79}$/ },
  sku: { type: String, trim: true, maxlength: 100 },
  attributes: { type: [attributeSchema], validate: boundedArray(10), default: [] },
  pricePiastres: { type: Number, default: null, validate: safeInteger },
  priceApproved: { type: Boolean, default: false },
  inventory: { type: inventorySchema, default: () => ({}) },
}, { _id: false, strict: 'throw' });
variantSchema.pre('validate', function () {
  if (this.priceApproved && !Number.isSafeInteger(this.pricePiastres)) this.invalidate('pricePiastres', 'Variant approval requires an integer price');
});
const fieldSchema = new mongoose.Schema({
  key: { type: String, required: true, match: /^[a-z][a-z0-9_]{0,49}$/ },
  label: { type: String, required: true, trim: true, maxlength: 160 },
  type: { type: String, required: true, enum: ['image', 'short_text', 'long_text', 'select'] },
  required: { type: Boolean, default: false },
  minFiles: { type: Number, validate: safeInteger },
  maxFiles: { type: Number, validate: safeInteger },
  maxLength: { type: Number, validate: safeInteger },
  choices: { type: [String], default: [], validate: boundedArray(50) },
  acceptedMimeTypes: { type: [String], default: ['image/jpeg', 'image/png', 'image/webp'], validate: { validator: values => values.length > 0 && values.every(value => ['image/jpeg', 'image/png', 'image/webp'].includes(value)), message: 'Only JPEG, PNG and WebP images are supported' } },
  maxBytes: { type: Number, default: 8 * 1024 * 1024, min: 1, max: 10 * 1024 * 1024, validate: safeInteger },
}, { _id: false, strict: 'throw' });
fieldSchema.pre('validate', function () {
  if (this.type === 'image' && (!Number.isSafeInteger(this.maxFiles) || this.maxFiles < 1 || this.maxFiles > 10 || (this.minFiles ?? 0) > this.maxFiles)) this.invalidate('maxFiles', 'Image fields require a maximum of 1–10 files and a valid minimum');
  if (['short_text', 'long_text'].includes(this.type) && (!Number.isSafeInteger(this.maxLength) || this.maxLength < 1 || this.maxLength > 5000)) this.invalidate('maxLength', 'Text fields require a maximum length of 1–5000');
  if (this.type === 'select' && (!this.choices.length || this.choices.some(x => !x.trim() || x.length > 160) || new Set(this.choices).size !== this.choices.length)) this.invalidate('choices', 'Selection fields require distinct, nonempty choices');
});
const personalizationSchema = new mongoose.Schema({
  fields: { type: [fieldSchema], default: [], validate: boundedArray(20) },
}, { _id: false, strict: 'throw' });
const customizationSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomizationTemplate', default: null },
  serviceKind: { type: String, enum: ['gift_box', 'laser_engraving', 'tray', 'generic', null], default: null },
  serviceEntryEligible: { type: Boolean, default: false },
}, { _id: false, strict: 'throw' });

const schema = new mongoose.Schema({
  ...catalogIdentityFields,
  ...importMetadataFields,
  catalogRole: { type: String, enum: ['Product', 'Customizable Product', 'Variant Product'], default: 'Product' },
  pricePiastres: { type: Number, default: null, validate: safeInteger },
  compareAtPiastres: { type: Number, default: null, validate: safeInteger },
  priceApproved: { type: Boolean, default: false },
  inventory: { type: inventorySchema, default: () => ({}) },
  variants: { type: [variantSchema], default: [], validate: boundedArray(30) },
  personalization: { type: personalizationSchema, default: () => ({}) },
  customization: { type: customizationSchema, default: () => ({}) },
  featured: { type: Boolean, default: false },
  featuredOrder: { type: Number, default: 0, validate: safeInteger },
  bestSeller: { type: Boolean, default: false },
  bestSellerOrder: { type: Number, default: 0, validate: safeInteger },
  status: { type: String, enum: ['draft', 'ready', 'hold'], default: 'draft' },
  // Compatibility with the starter; status is the authoritative control.
  published: { type: Boolean, default: false },
  commerceRevision: { type: Number, default: 0, validate: safeInteger },
}, { timestamps: true, strict: 'throw', optimisticConcurrency: true });

schema.pre('validate', function () {
  this.published = this.status === 'ready';
  if (this.galleryKeys.length && this.mainImageKey !== this.galleryKeys[0]) this.invalidate('mainImageKey', 'Main image must be the first gallery reference');
  if (this.mainImageKey && !this.galleryKeys.length) this.invalidate('galleryKeys', 'Main image must be present in the gallery');
  if (this.priceApproved && !Number.isSafeInteger(this.pricePiastres)) this.invalidate('pricePiastres', 'Approval requires an integer price');
  if (this.compareAtPiastres != null && (this.pricePiastres == null || this.compareAtPiastres < this.pricePiastres)) this.invalidate('compareAtPiastres', 'Compare-at price must be at least the base price');
  if (new Set(this.variants.map(v => v.key)).size !== this.variants.length) this.invalidate('variants', 'Variant keys must be unique within a product');
  if (new Set(this.personalization.fields.map(f => f.key)).size !== this.personalization.fields.length) this.invalidate('personalization.fields', 'Personalization keys must be unique');
  if ((this.customization.enabled || this.customization.serviceEntryEligible) && (!this.customization.templateId || !this.customization.serviceKind)) this.invalidate('customization', 'Enabled customization requires an explicit service and template');
  if (this.status === 'ready') for (const issue of getPublicationIssues(this)) this.invalidate(issue.field, issue.message);
});
schema.index({ name: 'text' }, { name: 'product_name_search' });
schema.index({ status: 1, featured: -1, featuredOrder: 1, createdAt: -1, _id: -1 });
schema.index({ status: 1, bestSeller: -1, bestSellerOrder: 1, createdAt: -1, _id: -1 });
schema.index({ status: 1, priceApproved: 1, 'inventory.approved': 1, categoryId: 1, createdAt: -1, _id: -1 });
schema.index({ status: 1, categoryId: 1, subcategoryId: 1, createdAt: -1, _id: -1 });
schema.index({ status: 1, pricePiastres: 1, _id: 1 });
schema.index({ status: 1, name: 1, _id: 1 });
schema.index({ createdAt: -1, _id: -1 });
export const Product = mongoose.model('Product', schema);
