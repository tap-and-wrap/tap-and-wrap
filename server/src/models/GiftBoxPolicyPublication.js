import mongoose from 'mongoose';
import { getFixedComponent } from '../../../shared/gift-box/definitions.mjs';
import { giftBoxFulfillmentPolicyInput } from '../gift-box/fulfillment-policy.js';
import { validatePolicyApprovalReady, policyContentHash, policyApprovalInput } from '../gift-box/policy-contract.js';
import { fingerprint } from '../commerce/pricing.js';
import { env } from '../config/env.js';
import { assertDatabaseWriteAllowed } from '../config/database-safety.js';

const immutableError = () => Object.assign(new Error('Published physical policy versions cannot be rewritten.'), { status: 409, code: 'GIFT_BOX_POLICY_IMMUTABLE' });
const schema = new mongoose.Schema({
  boxId: { type: String, required: true, immutable: true, validate: value => getFixedComponent(value)?.category === 'box' },
  version: { type: Number, required: true, immutable: true, min: 1, max: 1000, validate: Number.isSafeInteger },
  policy: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true },
  packing: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true },
  evidence: { type: String, required: true, immutable: true, maxlength: 4000 },
  attestations: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true },
  policyHash: { type: String, required: true, immutable: true, match: /^[a-f0-9]{64}$/ },
  contentHash: { type: String, required: true, immutable: true, match: /^[a-f0-9]{64}$/ },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  approvedAt: { type: Date, required: true, immutable: true },
}, { timestamps: { createdAt: true, updatedAt: false }, strict: 'throw', autoCreate: false, autoIndex: false });
schema.index({ boxId: 1, version: 1 }, { unique: true });
schema.index({ 'policy.policyId': 1, 'policy.policyVersion': 1 }, { unique: true });
schema.pre('validate', function () {
  if (!this.isNew && this.isModified()) throw immutableError();
  const policy = giftBoxFulfillmentPolicyInput.parse(this.policy);
  const rules = { regions: policy.regions, compartments: policy.compartments, componentRules: policy.componentRules, limits: policy.limits };
  validatePolicyApprovalReady(this.boxId, { rules, packing: this.packing });
  policyApprovalInput.parse({ expectedRevision: 0, confirmPackingTested: true, confirmSafeTransport: true, confirmLidChecked: true, evidence: this.evidence });
  if (fingerprint(this.attestations) !== fingerprint({ packingTested: true, safeTransport: true, lidChecked: true, physicalAccuracyComputerVerified: false })) throw immutableError();
  if (policy.boxId !== this.boxId || policy.status !== 'approved' || policy.policyId !== `gift-box-${this.boxId}`
    || policy.policyVersion !== `v${this.version}` || policy.approvedBy !== String(this.approvedBy)
    || policy.approvedAt !== this.approvedAt?.toISOString() || fingerprint(policy) !== this.policyHash
    || policyContentHash(this.boxId, rules, this.packing) !== this.contentHash) throw immutableError();
});
schema.pre('save', function () { if (!this.isNew && this.isModified()) throw immutableError(); });
for (const operation of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'bulkWrite']) {
  schema.pre(operation, function () { throw immutableError(); });
}
// Existing isolated suites clear all model fixtures. This is not an application
// deletion API: deletion remains forbidden outside the exact disposable target.
function disposableCleanupOnly() {
  if (process.env.NODE_ENV !== 'test' || env.nodeEnv !== 'test' || env.databaseTarget !== 'local'
    || env.mongoUri || process.env.MONGODB_URI || process.env.CATALOG_IMPORT_STAGING_URI) throw immutableError();
  const target = assertDatabaseWriteAllowed(GiftBoxPolicyPublication.db, env);
  if (!target.disposableTest || GiftBoxPolicyPublication.db.host !== '127.0.0.1' || GiftBoxPolicyPublication.db.name !== 'tap_wrap_catalog_test') throw immutableError();
}
for (const operation of ['deleteOne', 'deleteMany', 'findOneAndDelete']) schema.pre(operation, disposableCleanupOnly);
schema.pre('deleteOne', { document: true, query: false }, disposableCleanupOnly);
export const GiftBoxPolicyPublication = mongoose.models.GiftBoxPolicyPublication || mongoose.model('GiftBoxPolicyPublication', schema);
