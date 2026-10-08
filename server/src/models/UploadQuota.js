import mongoose from 'mongoose';

const uploadQuotaSchema = new mongoose.Schema({
  owner: { type: String, required: true, unique: true, maxlength: 100 },
  activeCount: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
  activeBytes: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
}, { timestamps: true, strict: 'throw' });

export const UploadQuota = mongoose.models.UploadQuota || mongoose.model('UploadQuota', uploadQuotaSchema);
