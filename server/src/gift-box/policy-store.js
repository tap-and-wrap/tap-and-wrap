import { GiftBoxPhysicalPolicy } from '../models/GiftBoxPhysicalPolicy.js';
import { GiftBoxPolicyPublication } from '../models/GiftBoxPolicyPublication.js';
import { GiftBoxFulfillmentPolicyFence } from '../models/GiftBoxFulfillmentPolicyFence.js';
import { env } from '../config/env.js';
import { giftBoxFulfillmentPolicyInput } from './fulfillment-policy.js';
import { validatePolicyApprovalReady, policyContentHash, policyApprovalInput } from './policy-contract.js';
import { fingerprint } from '../commerce/pricing.js';
import { getFixedComponent } from '../../../shared/gift-box/definitions.mjs';

export const physicalPolicyModels = [GiftBoxPhysicalPolicy, GiftBoxPolicyPublication, GiftBoxFulfillmentPolicyFence];

// Denying a past approval must not depend on current catalog/media literals or
// current packing requirements. This reference never grants quote eligibility.
export function publicationWithdrawalReference(record) {
  if (!record || getFixedComponent(record.boxId)?.category !== 'box' || !Number.isSafeInteger(record.version)
    || record.version < 1 || record.version > 1000 || !/^[a-f0-9]{64}$/.test(record.policyHash)) return null;
  return { boxId: record.boxId, policyId: `gift-box-${record.boxId}`, policyVersion: `v${record.version}`, policyHash: record.policyHash };
}

export function verifiedPublication(record) {
  if (!record) return null;
  try {
    const policy = giftBoxFulfillmentPolicyInput.parse(record.policy);
    const rules = { regions: policy.regions, compartments: policy.compartments, componentRules: policy.componentRules, limits: policy.limits };
    validatePolicyApprovalReady(record.boxId, { rules, packing: record.packing });
    policyApprovalInput.parse({ expectedRevision: 0, confirmPackingTested: true, confirmSafeTransport: true, confirmLidChecked: true, evidence: record.evidence });
    if (fingerprint(record.attestations) !== fingerprint({ packingTested: true, safeTransport: true, lidChecked: true, physicalAccuracyComputerVerified: false })) return null;
    if (policy.status !== 'approved' || policy.boxId !== record.boxId || policy.policyId !== `gift-box-${record.boxId}`
      || !Number.isSafeInteger(record.version) || record.version < 1 || record.version > 1000 || policy.policyVersion !== `v${record.version}`
      || policy.approvedBy !== String(record.approvedBy) || policy.approvedAt !== new Date(record.approvedAt).toISOString()
      || fingerprint(policy) !== record.policyHash || policyContentHash(record.boxId, rules, record.packing) !== record.contentHash) return null;
    return policy;
  } catch { return null; }
}

// Each caller loads one coherent cart/checkout snapshot. There is no process
// cache, publication fallback, inferred approval or startup database write.
export async function loadPublishedGiftBoxPolicies(boxIds, { session } = {}) {
  const policies = new Map();
  if (!boxIds.length) return policies;
  const { verifyDatabaseSchema } = await import('../config/schema.js');
  try { await verifyDatabaseSchema(env, { models: physicalPolicyModels, timeoutMs: 3000 }); }
  catch (error) {
    // An unprepared policy collection grants no approval. Existing ordinary
    // commerce and honest invalid gift rows can still be read.
    if (error.code === 'DATABASE_SCHEMA_NOT_READY') return policies;
    throw error;
  }
  const heads = await GiftBoxPhysicalPolicy.find({ boxId: { $in: [...new Set(boxIds)] }, activePublicationId: { $ne: null } })
    .session(session || null).lean().maxTimeMS(3000);
  if (!heads.length) return policies;
  const publications = await GiftBoxPolicyPublication.find({ _id: { $in: heads.map(head => head.activePublicationId) } })
    .session(session || null).lean().maxTimeMS(3000);
  const fences = await GiftBoxFulfillmentPolicyFence.find({ boxId: { $in: heads.map(head => head.boxId) } })
    .session(session || null).lean().maxTimeMS(3000);
  const byId = new Map(publications.map(record => [String(record._id), record]));
  const byBox = new Map(fences.map(record => [record.boxId, record]));
  for (const head of heads) {
    const publication = byId.get(String(head.activePublicationId)), fence = byBox.get(head.boxId);
    const policy = verifiedPublication(publication);
    if (policy && policy.boxId === head.boxId && publication.version === head.versionCounter
      && fence?.status === 'approved' && fence.policyId === policy.policyId && fence.policyVersion === policy.policyVersion
      && fence.policyHash === publication.policyHash && Number.isSafeInteger(fence.__v) && fence.__v >= 0) {
      policies.set(head.boxId, policy);
    }
  }
  return policies;
}
