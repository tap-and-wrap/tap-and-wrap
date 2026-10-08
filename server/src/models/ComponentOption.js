import mongoose from 'mongoose';
import { inventorySchema, catalogIdentityFields, importMetadataFields, safeInteger } from '../catalog/fields.js';
// Source-classified components and packaging candidates never enter public product queries.
const schema = new mongoose.Schema({
  enabledForCustomization: { type: Boolean, default: false },
  configurationApproved: { type: Boolean, default: false },
  commerceRevision: { type: Number, default: 0, validate: safeInteger },
  ...catalogIdentityFields, ...importMetadataFields,
  catalogRole: { type: String, required: true, enum: ['Customization Option', 'Gift Packaging'] },
  pricePiastres: { type: Number, default: null, validate: safeInteger },
  compareAtPiastres: { type: Number, default: null, validate: safeInteger }, priceApproved: { type: Boolean, default: false },
  inventory: { type: inventorySchema, default: () => ({}) },
  status: { type: String, enum: ['draft', 'hold'], default: 'draft' },
}, { timestamps: true, strict: 'throw', optimisticConcurrency: true });
schema.pre('validate', function () {
  if (this.galleryKeys.length && this.mainImageKey !== this.galleryKeys[0]) this.invalidate('mainImageKey', 'Main image must be first in the gallery');
  if (this.mainImageKey && !this.galleryKeys.length) this.invalidate('galleryKeys', 'Main image must be in the gallery');
  if (this.priceApproved && !Number.isSafeInteger(this.pricePiastres)) this.invalidate('pricePiastres', 'Approval requires an integer price');
  if (this.compareAtPiastres != null && (this.pricePiastres == null || this.compareAtPiastres < this.pricePiastres)) this.invalidate('compareAtPiastres', 'Compare-at price must be at least the base price');
});
schema.index({ categoryId: 1, createdAt: -1, _id: -1 });
schema.index({ name: 'text' }, { name: 'component_name_search', default_language: 'none' });
schema.index({ updatedAt: -1, _id: -1 });
export const ComponentOption = mongoose.model('ComponentOption', schema);
