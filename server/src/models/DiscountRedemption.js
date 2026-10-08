import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  discountId: { type: mongoose.Schema.Types.ObjectId, ref: 'DiscountCode', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, amountPiastres: { type: Number, required: true },
}, { timestamps: true, strict: 'throw' });
schema.index({ orderId: 1, discountId: 1 }, { unique: true });
schema.index({ discountId: 1, userId: 1 });
export const DiscountRedemption = mongoose.model('DiscountRedemption', schema);
