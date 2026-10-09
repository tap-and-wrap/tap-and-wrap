import mongoose from 'mongoose';

const integer = (min, max) => ({ type: Number, min, max, validate: Number.isSafeInteger });
const schema = new mongoose.Schema({
  code: { type: String, required: true, uppercase: true, trim: true, match: /^[A-Z0-9][A-Z0-9_-]{2,39}$/, unique: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  active: { type: Boolean, default: false },
  kind: { type: String, enum: ['fixed', 'percentage'], required: true },
  value: { ...integer(1, 100000000), required: true },
  minimumSubtotalPiastres: { ...integer(0, 100000000), default: 0 },
  maximumDiscountPiastres: { ...integer(0, 100000000), validate: (value) => value === null || Number.isSafeInteger(value), default: null },
  productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  categoryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
  authenticatedOnly: { type: Boolean, default: false },
  stackWithBundles: { type: Boolean, default: false },
  startsAt: { type: Date, default: null },
  endsAt: { type: Date, default: null },
  usageLimit: { ...integer(1, 1000000), validate: (value) => value === null || Number.isSafeInteger(value), default: null },
  perCustomerLimit: { ...integer(1, 1000), validate: (value) => value === null || Number.isSafeInteger(value), default: null },
  usedCount: { ...integer(0, 1000000), default: 0 }
}, { timestamps: true, strict: 'throw', optimisticConcurrency: true });
schema.index({ active: 1, startsAt: 1, endsAt: 1 });
schema.index({ updatedAt: -1, _id: -1 });
schema.index({ name: 'text', code: 'text' }, { name: 'discount_code_search', default_language: 'none' });
schema.pre('validate', function validateDiscount() {
  if (this.kind === 'percentage' && this.value > 10000) this.invalidate('value', 'Percentage uses basis points from 1 to 10000.');
  if (this.startsAt && this.endsAt && this.startsAt >= this.endsAt) this.invalidate('endsAt', 'Expiry must be after the start date.');
  if (this.perCustomerLimit && !this.authenticatedOnly) this.invalidate('perCustomerLimit', 'Per-customer limits require authenticated checkout.');
});
export const DiscountCode = mongoose.models.DiscountCode || mongoose.model('DiscountCode', schema);
export default DiscountCode;
