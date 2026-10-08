import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, match: /^[0-9a-f]{64}$/ },
  expiresAt: { type: Date, required: true },
  count: { type: Number, required: true, default: 0, min: 0, max: 100, validate: Number.isSafeInteger },
}, { timestamps: true, strict: 'throw' });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const EmailRateWindow = mongoose.models.EmailRateWindow || mongoose.model('EmailRateWindow', schema);
