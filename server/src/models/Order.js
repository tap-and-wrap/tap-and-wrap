import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  orderNumber: { type: String, required: true, unique: true, match: /^[1-9][0-9]{5}$/ },
  owner: { type: String, required: true }, userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  checkoutKey: { type: String, required: true }, requestHash: { type: String, required: true },
  customer: { type: mongoose.Schema.Types.Mixed, required: true },
  trackingConsentId: { type: mongoose.Schema.Types.ObjectId, ref: 'TrackingConsent', default: null, immutable: true },
  lines: { type: [mongoose.Schema.Types.Mixed], required: true, immutable: true },
  totals: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true },
  inventoryClaims: { type: [mongoose.Schema.Types.Mixed], default: [], immutable: true },
  paymentMethod: { type: String, enum: ['cod', 'instapay'], required: true, immutable: true },
  paymentState: { type: String, enum: ['unpaid', 'awaiting_verification', 'paid', 'rejected'], required: true },
  fulfillmentState: { type: String, enum: ['received', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'], default: 'received' },
  paymentProofId: { type: mongoose.Schema.Types.ObjectId, ref: 'Upload', default: null, immutable: true },
  uploadIds: { type: [mongoose.Schema.Types.ObjectId], default: [], immutable: true },
  history: { type: [mongoose.Schema.Types.Mixed], default: [] },
  restockedAt: { type: Date, default: null }, revision: { type: Number, default: 0 },
}, { timestamps: true, strict: 'throw', optimisticConcurrency: true });
schema.index({ owner: 1, checkoutKey: 1 }, { unique: true });
schema.index({ createdAt: -1, _id: -1 });
schema.index({ userId: 1, createdAt: -1, _id: -1 });
schema.index({ fulfillmentState: 1, createdAt: -1, _id: -1 });
schema.index({ paymentState: 1, createdAt: -1, _id: -1 });
export const Order = mongoose.model('Order', schema);
