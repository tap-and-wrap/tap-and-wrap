import mongoose from 'mongoose';

const integer = (min, max) => ({ type: Number, min, max, validate: Number.isSafeInteger });
const itemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  variantKey: { type: String, maxlength: 80, default: null },
  quantity: { ...integer(1, 20), required: true }
}, { _id: false, strict: 'throw' });
const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  active: { type: Boolean, default: false },
  published: { type: Boolean, default: false },
  description: { type: String, trim: true, maxlength: 2000, default: '' },
  items: { type: [itemSchema], required: true, validate: (value) => value.length >= 2 && value.length <= 20 },
  discountKind: { type: String, enum: ['fixed', 'percentage'], required: true },
  discountValue: { ...integer(1, 100000000), required: true },
  maxApplications: { ...integer(1, 100), default: 1 },
  priority: { ...integer(0, 10000), default: 0 },
  startsAt: { type: Date, default: null },
  endsAt: { type: Date, default: null }
}, { timestamps: true, strict: 'throw' });
schema.index({ active: 1, priority: 1, _id: 1 });
schema.index({ published: 1, active: 1, priority: 1, _id: 1 });
schema.index({ updatedAt: -1, _id: -1 });
schema.index({ name: 'text' }, { name: 'bundle_rule_search', default_language: 'none' });
schema.pre('validate', function validateBundle() {
  const keys = this.items.map((item) => `${item.productId}:${item.variantKey ?? ''}`);
  if (new Set(keys).size !== keys.length) this.invalidate('items', 'Bundle product and variant entries must be unique.');
  if (this.discountKind === 'percentage' && this.discountValue > 10000) this.invalidate('discountValue', 'Percentage uses basis points from 1 to 10000.');
  if (this.startsAt && this.endsAt && this.startsAt >= this.endsAt) this.invalidate('endsAt', 'Expiry must be after the start date.');
});
export const BundleRule = mongoose.models.BundleRule || mongoose.model('BundleRule', schema);
export default BundleRule;
