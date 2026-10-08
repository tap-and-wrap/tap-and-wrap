import mongoose from 'mongoose';

const money = { type: Number, required: true, min: 0, max: 100000000, validate: Number.isSafeInteger };
const schema = new mongoose.Schema({
  key: { type: String, enum: ['egypt-v1'], default: 'egypt-v1', unique: true, required: true },
  cairoGizaPiastres: { ...money, default: 9000 },
  otherGovernoratesPiastres: { ...money, default: 12000 },
  approved: { type: Boolean, default: false },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true, strict: 'throw', optimisticConcurrency: true });
export const ShippingConfig = mongoose.models.ShippingConfig || mongoose.model('ShippingConfig', schema);
export default ShippingConfig;
