import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true, select: false },
  granted: { type: Boolean, required: true, default: false },
  policyVersion: { type: String, required: true, maxlength: 80 },
  expiresAt: { type: Date, required: true },
}, { timestamps: true, strict: 'throw' });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const TrackingConsent = mongoose.models.TrackingConsent || mongoose.model('TrackingConsent', schema);
