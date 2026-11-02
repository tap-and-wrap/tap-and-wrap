import mongoose from 'mongoose';
import { getFixedComponent } from '../../../shared/gift-box/definitions.mjs';

// An operational fence cannot grant physical approval. Checkout must also match
// a separately trusted, reviewed policy. Restricted policy publication updates
// this boundary atomically with immutable reviewed content and its audit.
const schema = new mongoose.Schema({
  boxId: { type: String, required: true, immutable: true, validate: value => getFixedComponent(value)?.category === 'box' },
  policyId: { type: String, required: true, maxlength: 80 },
  policyVersion: { type: String, required: true, maxlength: 100 },
  policyHash: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
  status: { type: String, enum: ['approved', 'withdrawn'], required: true },
}, { timestamps: true, strict: 'throw', optimisticConcurrency: true, autoCreate: false, autoIndex: false });
schema.index({ boxId: 1 }, { unique: true });
export const GiftBoxFulfillmentPolicyFence = mongoose.models.GiftBoxFulfillmentPolicyFence || mongoose.model('GiftBoxFulfillmentPolicyFence', schema);
