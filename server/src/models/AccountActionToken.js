import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  purpose: { type: String, enum: ['password_reset', 'email_verification'], required: true, immutable: true },
  tokenHash: { type: String, required: true, unique: true, match: /^[0-9a-f]{64}$/, immutable: true, select: false },
  email: { type: String, required: true, maxlength: 254, immutable: true, select: false },
  expiresAt: { type: Date, required: true, immutable: true },
  consumedAt: { type: Date, default: null },
}, { timestamps: true, strict: 'throw' });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
schema.index({ userId: 1, purpose: 1, consumedAt: 1, createdAt: -1 });
export const AccountActionToken = mongoose.models.AccountActionToken || mongoose.model('AccountActionToken', schema);
