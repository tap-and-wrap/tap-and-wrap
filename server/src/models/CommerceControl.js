import mongoose from 'mongoose';

// A narrowly scoped promotion-capacity fence, not a global checkout lock.
const schema = new mongoose.Schema({
  _id: { type: String, enum: ['bundle-activation'], required: true },
  revision: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
}, { strict: 'throw', timestamps: true });
export const CommerceControl = mongoose.models.CommerceControl || mongoose.model('CommerceControl', schema);
