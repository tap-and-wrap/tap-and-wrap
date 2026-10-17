import mongoose from 'mongoose';

// Verified public catalog images only. No customer files, signed URLs or TTL deletion.
const schema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, match: /^catalog-media\/v1\/[a-f0-9]{64}\.(png|jpg|webp)$/ },
  sha256: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
  mimeType: { type: String, required: true, enum: ['image/png', 'image/jpeg', 'image/webp'] },
  sizeBytes: { type: Number, required: true }, width: { type: Number, required: true }, height: { type: Number, required: true },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, strict: 'throw' });
schema.index({ createdAt: -1, _id: -1 });
export const CatalogMedia = mongoose.model('CatalogMedia', schema);
