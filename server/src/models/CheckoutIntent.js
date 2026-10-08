import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  owner: { type: String, required: true }, checkoutKey: { type: String, required: true },
  fingerprint: { type: String, required: true }, quote: { type: mongoose.Schema.Types.Mixed, required: true },
  paymentMethod: { type: String, enum: ['cod', 'instapay'], required: true },
  state: { type: String, enum: ['open', 'consumed'], default: 'open' },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null }, expiresAt: { type: Date, required: true },
}, { timestamps: true, strict: 'throw' });
schema.index({ owner: 1, checkoutKey: 1 }, { unique: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 86400 });
export const CheckoutIntent = mongoose.model('CheckoutIntent', schema);
