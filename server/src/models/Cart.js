import mongoose from 'mongoose';
const line = new mongoose.Schema({
  id: { type: String, required: true }, identity: { type: String, required: true },
  productId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Product' },
  name: { type: String, maxlength: 240 }, slug: { type: String, maxlength: 300 }, mainImageUrl: { type: String, maxlength: 2000, default: null },
  variantKey: { type: String, default: null }, quantity: { type: Number, min: 1, max: 99, required: true },
  personalization: { type: mongoose.Schema.Types.Mixed, default: {} }, customization: { type: mongoose.Schema.Types.Mixed, default: null },
}, { _id: false, strict: 'throw' });
const schema = new mongoose.Schema({
  owner: { type: String, required: true, unique: true }, items: { type: [line], default: [], validate: value => value.length <= 30 },
  expiresAt: { type: Date, required: true },
}, { timestamps: true, strict: 'throw', optimisticConcurrency: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const Cart = mongoose.model('Cart', schema);
