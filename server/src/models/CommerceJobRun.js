import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  runId: { type: String, required: true, unique: true, maxlength: 36 },
  state: { type: String, enum: ['running', 'completed', 'partial', 'stopped', 'interrupted'], required: true },
  startedAt: { type: Date, required: true },
  finishedAt: Date,
  leaseUntil: { type: Date, required: true },
  stages: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { strict: 'throw', timestamps: true });
schema.index({ state: 1, leaseUntil: 1 });
schema.index({ startedAt: -1, _id: -1 });
// No invented audit-retention period or TTL. Owner policy is a launch prerequisite.
export const CommerceJobRun = mongoose.models.CommerceJobRun || mongoose.model('CommerceJobRun', schema);
