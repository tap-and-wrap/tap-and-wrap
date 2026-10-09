import mongoose from 'mongoose';
import { imageReference, safeInteger } from '../catalog/fields.js';
const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 160 },
  nameNormalized: { type: String, required: true, select: false },
  slug: { type: String, required: true, trim: true, maxlength: 240, match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/, unique: true },
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
  importCategoryKey: { type: String, immutable: true, maxlength: 1000, select: false },
  relationshipRevision: { type: Number, default: 0, validate: safeInteger, select: false },
  imageKey: { type: String, default: null, validate: imageReference },
  active: { type: Boolean, default: true },
  featured: { type: Boolean, default: false },
  order: { type: Number, default: 0, required: true, validate: safeInteger },
}, { timestamps: true, strict: 'throw', optimisticConcurrency: true });
schema.pre('validate', function () {
  this.nameNormalized = this.name?.trim().toLowerCase();
  if (this.parentId && this.parentId.equals(this._id)) this.invalidate('parentId', 'A category cannot be its own parent');
});
schema.index({ parentId: 1, nameNormalized: 1 }, { unique: true });
schema.index({ importCategoryKey: 1 }, { unique: true, partialFilterExpression: { importCategoryKey: { $type: 'string' } } });
schema.index({ active: 1, parentId: 1, order: 1, _id: 1 });
export const Category = mongoose.model('Category', schema);
