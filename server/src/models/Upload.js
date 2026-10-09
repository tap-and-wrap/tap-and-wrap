import mongoose from 'mongoose';

const uploadSchema = new mongoose.Schema({
  owner: { type: String, required: true, maxlength: 100, index: true },
  purpose: { type: String, enum: ['personalization', 'artwork', 'payment_proof'], required: true },
  state: { type: String, enum: ['pending', 'verifying', 'complete', 'retained', 'deleting', 'failed'], default: 'pending', required: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  fieldKey: { type: String, maxlength: 80 },
  checkoutKey: { type: String, maxlength: 128, select: false },
  mimeType: { type: String, enum: ['image/jpeg', 'image/png', 'image/webp'], required: true },
  sizeBytes: { type: Number, min: 1, max: 10485760, required: true, validate: Number.isSafeInteger },
  temporaryKey: { type: String, required() { return this.state !== 'retained'; }, select: false },
  objectKey: { type: String, select: false },
  etag: { type: String, select: false },
  width: { type: Number, min: 1, max: 12000 },
  height: { type: Number, min: 1, max: 12000 },
  signedExpiresAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  cartId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cart' },
  quotaReleased: { type: Boolean, default: false },
  failureCode: { type: String, maxlength: 60 },
  cleanupLeaseUntil: Date,
  cleanupLeaseToken: { type: String, select: false },
  cleanupAttempts: { type: Number, default: 0, min: 0, max: 6, validate: Number.isSafeInteger },
  cleanupNextAttemptAt: Date,
  cleanupReviewRequired: { type: Boolean, default: false },
  cleanupFailureCode: { type: String, enum: ['STORAGE_DELETE_FAILED'] },
  verificationLeaseUntil: Date,
}, { timestamps: true, strict: 'throw' });

// No TTL: deleting a MongoDB record before deleting the private object would leak storage.
uploadSchema.index({ state: 1, expiresAt: 1, cleanupLeaseUntil: 1 });
uploadSchema.index({ owner: 1, state: 1, createdAt: -1 });
uploadSchema.index({ orderId: 1, purpose: 1 });
uploadSchema.index({ state: 1, signedExpiresAt: 1 });
uploadSchema.index({ cleanupReviewRequired: 1, cleanupNextAttemptAt: 1, expiresAt: 1 });

export const Upload = mongoose.models.Upload || mongoose.model('Upload', uploadSchema);
