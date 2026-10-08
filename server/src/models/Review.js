import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
  authorLabel: { type: String, required: true, trim: true, maxlength: 100 },
  rating: { type: Number, required: true, min: 1, max: 5, validate: Number.isInteger },
  text: { type: String, required: true, trim: true, maxlength: 3000 },
  status: { type: String, enum: ['draft', 'published', 'hidden'], default: 'draft' },
  approved: { type: Boolean, default: false },
  consentConfirmed: { type: Boolean, default: false },
  sourceNote: { type: String, trim: true, maxlength: 2000, default: '' },
  featured: { type: Boolean, default: false },
  displayOrder: { type: Number, min: 0, max: 100000, default: 0, validate: Number.isSafeInteger },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, strict: 'throw', optimisticConcurrency: true });
schema.pre('validate', function () {
  if (this.status === 'published' && (!this.approved || !this.consentConfirmed || !this.sourceNote?.trim())) {
    this.invalidate('status', 'Publication requires owner approval, permission to quote and a private source note.');
  }
});
schema.index({ productId: 1, status: 1, approved: 1, createdAt: -1, _id: -1 });
schema.index({ status: 1, approved: 1, featured: 1, displayOrder: 1, _id: 1 });
schema.index({ updatedAt: -1, _id: -1 });
schema.index({ authorLabel: 'text', text: 'text' }, { name: 'review_search', default_language: 'none' });
export const Review = mongoose.models.Review || mongoose.model('Review', schema);

