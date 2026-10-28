import mongoose from 'mongoose';
import { getFixedComponent } from '../../../shared/gift-box/definitions.mjs';

const withdrawal = new mongoose.Schema({
  publicationId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  version: { type: Number, required: true, immutable: true, min: 1, max: 1000, validate: Number.isSafeInteger },
  actorId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  at: { type: Date, required: true, immutable: true },
  reason: { type: String, required: true, immutable: true, maxlength: 2000 },
  reasonHash: { type: String, required: true, immutable: true, match: /^[a-f0-9]{64}$/ },
}, { _id: false, strict: 'throw' });

// A mutable administration head, separate from immutable reviewed versions and
// the operational checkout fence. Missing heads are presented as pending.
const schema = new mongoose.Schema({
  boxId: { type: String, required: true, immutable: true, validate: value => getFixedComponent(value)?.category === 'box' },
  draft: { type: mongoose.Schema.Types.Mixed, default: null },
  activePublicationId: { type: mongoose.Schema.Types.ObjectId, default: null },
  versionCounter: { type: Number, default: 0, min: 0, max: 1000, validate: Number.isSafeInteger },
  withdrawals: { type: [withdrawal], default: [], validate: value => value.length <= 1000 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, required: true },
}, { timestamps: true, strict: 'throw', optimisticConcurrency: true, autoCreate: false, autoIndex: false });
schema.index({ boxId: 1 }, { unique: true });
export const GiftBoxPhysicalPolicy = mongoose.models.GiftBoxPhysicalPolicy || mongoose.model('GiftBoxPhysicalPolicy', schema);
