import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, immutable: true },
  operationKey: { type: String, required: true, immutable: true },
  requestHash: { type: String, required: true, immutable: true },
  direction: { type: String, enum: ['collection', 'refund'], required: true, immutable: true },
  scope: { type: String, required: true, immutable: true },
  allocations: { type: [mongoose.Schema.Types.Mixed], default: [], immutable: true },
  reducePayable: { type: Boolean, default: false, immutable: true },
  amountPiastres: { type: Number, required: true, min: 1, max: Number.MAX_SAFE_INTEGER, validate: Number.isSafeInteger, immutable: true },
  method: { type: String, enum: ['cod', 'instapay'], required: true, immutable: true },
  reference: { type: String, required: true, maxlength: 120, immutable: true },
  referenceKey: { type: String, required: true, unique: true, immutable: true },
  refundOf: { type: mongoose.Schema.Types.ObjectId, ref: 'OrderSettlement', immutable: true },
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  reason: { type: String, required: true, maxlength: 500, immutable: true },
}, { timestamps: { createdAt: true, updatedAt: false }, strict: 'throw' });
schema.index({ orderId: 1, operationKey: 1 }, { unique: true });
schema.index({ orderId: 1, createdAt: 1, _id: 1 });
schema.pre('validate', function () {
  // Empty allocations are supported for historical single-scope records only.
  if (!this.allocations.length) return;
  const parts = this.allocations;
  const total = parts.reduce((value, part) => value + part.amountPiastres, 0);
  if (parts.length > 31 || new Set(parts.map(part => part.scope)).size !== parts.length
    || parts.some(part => typeof part.scope !== 'string' || !part.scope || part.scope.length > 80 || !Number.isSafeInteger(part.amountPiastres) || part.amountPiastres < 1)
    || !Number.isSafeInteger(total) || total !== this.amountPiastres) this.invalidate('allocations', 'Allocations must be distinct, bounded and sum to the recorded actual amount');
});
export const OrderSettlement = mongoose.model('OrderSettlement', schema);
