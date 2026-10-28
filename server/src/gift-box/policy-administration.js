import mongoose from 'mongoose';
import { z } from 'zod';
import { FIXED_COMPONENTS, getFixedComponent } from '../../../shared/gift-box/definitions.mjs';
import { GiftBoxPhysicalPolicy } from '../models/GiftBoxPhysicalPolicy.js';
import { GiftBoxPolicyPublication } from '../models/GiftBoxPolicyPublication.js';
import { GiftBoxFulfillmentPolicyFence } from '../models/GiftBoxFulfillmentPolicyFence.js';
import { GiftBoxComponentSetting } from '../models/GiftBoxComponentSetting.js';
import { User } from '../models/User.js';
import { AdminAudit } from '../models/AdminAudit.js';
import { env } from '../config/env.js';
import { assertDatabaseWriteAllowed } from '../config/database-safety.js';
import { verifyDatabaseSchema } from '../config/schema.js';
import { assertExpectedRevision } from '../utils/admin-revision.js';
import { recordAdminAudit } from '../commerce/audit.js';
import { fingerprint } from '../commerce/pricing.js';
import { ensureBuilderBackend } from './catalog.js';
import { builderError } from './validation.js';
import { physicalPolicyModels, verifiedPublication, publicationWithdrawalReference } from './policy-store.js';
import { policyDraftInput, policyApprovalInput, policyWithdrawalInput, canonicalizePolicyDraft,
  validatePolicyApprovalReady, buildApprovedPolicy, policyContentHash } from './policy-contract.js';

const boxIdentity = z.string().refine(value => getFixedComponent(value)?.category === 'box', 'Choose one of the 12 predefined boxes.');
export const physicalPolicyHistoryQuery = z.object({ historyPage: z.coerce.number().int().min(1).max(50).default(1) }).strict();
const resource = boxId => `gift-box-policy:${boxId}`;
const conflict = () => builderError(409, 'EDIT_CONFLICT', 'This policy changed. Your draft was not applied. Reload the current revision before saving.');
async function ensurePolicyStorage() {
  await ensureBuilderBackend();
  await verifyDatabaseSchema(env, { models: [...physicalPolicyModels, AdminAudit, User], timeoutMs: 6000 });
}
function requireActor(actor) {
  if (actor?.role !== 'admin' || actor.active === false || !mongoose.isObjectIdOrHexString(actor._id)) throw builderError(403, 'ADMIN_REQUIRED', 'Verified administrator authorization is required.');
}
async function fenceAdministrator(actor, session) {
  requireActor(actor);
  const current = await User.findById(actor._id).select('role active authVersion __v').session(session).lean().maxTimeMS(3000);
  if (current?.role !== 'admin' || current.active !== true || (actor.authVersion !== undefined && (current.authVersion || 0) !== actor.authVersion)) {
    throw builderError(403, 'ADMIN_REQUIRED', 'Administrator authorization changed. Verify your session again.');
  }
  const result = await User.updateOne({ _id: current._id, role: 'admin', active: true,
    authVersion: current.authVersion === undefined ? { $exists: false } : current.authVersion,
    __v: current.__v === undefined ? { $exists: false } : current.__v }, { $inc: { __v: 1 } }, { session, timestamps: false });
  if (result.matchedCount !== 1) throw builderError(403, 'ADMIN_REQUIRED', 'Administrator authorization changed. Verify your session again.');
  return { _id: current._id, role: 'admin', active: true };
}
async function transaction(actor, operation) {
  requireActor(actor); await ensurePolicyStorage();
  assertDatabaseWriteAllowed(GiftBoxPhysicalPolicy.db, env);
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      assertDatabaseWriteAllowed(GiftBoxPhysicalPolicy.db, env);
      const verifiedActor = await fenceAdministrator(actor, session);
      result = await operation(session, verifiedActor);
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    return result;
  } catch (error) {
    if (error.code === 11000 || error instanceof mongoose.Error.VersionError) throw conflict();
    if (error.code === 20 || error.codeName === 'IllegalOperation') throw builderError(503, 'TRANSACTIONS_REQUIRED', 'Physical policy changes require a transaction-capable dedicated database.');
    throw error;
  } finally { await session.endSession(); }
}
async function loadHead(boxId, expectedRevision, actor, session) {
  let head = await GiftBoxPhysicalPolicy.findOne({ boxId }).session(session).maxTimeMS(3000);
  assertExpectedRevision(head || { __v: 0 }, expectedRevision);
  if (!head) head = new GiftBoxPhysicalPolicy({ boxId, createdBy: actor._id, updatedBy: actor._id });
  return head;
}
async function saveHead(head, actor, session) {
  const creating = head.isNew;
  head.updatedBy = actor._id; head.markModified('updatedBy');
  assertDatabaseWriteAllowed(GiftBoxPhysicalPolicy.db, env);
  await head.save({ session });
  if (creating) {
    const claimed = await GiftBoxPhysicalPolicy.updateOne({ _id: head._id, __v: 0 }, { $inc: { __v: 1 } }, { session });
    if (claimed.matchedCount !== 1) throw conflict();
    head.__v = 1;
  }
}
function presentPublication(record, head) {
  const withdrawn = head?.withdrawals?.find(entry => String(entry.publicationId) === String(record._id));
  return { id: String(record._id), version: record.version, policy: record.policy, packing: record.packing,
    policyHash: record.policyHash, contentHash: record.contentHash, evidence: record.evidence, attestations: record.attestations,
    approvedBy: String(record.approvedBy), approvedAt: new Date(record.approvedAt).toISOString(),
    compatibleWithCurrentContract: Boolean(verifiedPublication(record)),
    status: String(head?.activePublicationId) === String(record._id) ? 'approved' : withdrawn ? 'withdrawn' : 'superseded',
    withdrawnAt: withdrawn ? new Date(withdrawn.at).toISOString() : null, withdrawalReason: withdrawn?.reason ?? null };
}
async function presentHead(boxId, head, { session, details = false, historyPage = 1 } = {}) {
  const active = head?.activePublicationId ? await GiftBoxPolicyPublication.findById(head.activePublicationId).session(session || null).lean().maxTimeMS(3000) : null;
  const history = details ? await GiftBoxPolicyPublication.find({ boxId }).sort({ version: -1 }).skip((historyPage - 1) * 20).limit(20).session(session || null).lean().maxTimeMS(3000) : [];
  const audits = details ? await AdminAudit.find({ resourceType: 'configuration', resourceId: resource(boxId) })
    .sort({ createdAt: -1, _id: -1 }).limit(40).session(session || null).lean().maxTimeMS(3000) : [];
  return { boxId, revision: head?.__v ?? 0,
    status: active ? 'approved' : head?.draft ? 'draft' : head?.versionCounter ? 'withdrawn' : 'pending',
    draft: head?.draft ?? null, activePublication: active ? presentPublication(active, head) : null,
    history: history.map(record => presentPublication(record, head)), historyTotal: head?.versionCounter ?? 0, historyPage,
    historyHasMore: historyPage * 20 < (head?.versionCounter ?? 0),
    audit: audits.map(audit => ({ id: String(audit._id), action: audit.action, actorId: String(audit.actorId), createdAt: audit.createdAt,
      details: Object.fromEntries(Object.entries(audit.details || {}).filter(([key]) => ['boxId', 'revision', 'version', 'policyHash', 'contentHash', 'previousVersion', 'reasonHash'].includes(key))) })),
  };
}
export async function listPhysicalPolicies() {
  await ensurePolicyStorage();
  const heads = await GiftBoxPhysicalPolicy.find({}).lean().maxTimeMS(3000);
  const settings = await GiftBoxComponentSetting.find({}).select('componentId displayName').lean().maxTimeMS(3000);
  const byBox = new Map(heads.map(head => [head.boxId, head])), byId = new Map(settings.map(setting => [setting.componentId, setting]));
  const policies = [];
  for (const definition of FIXED_COMPONENTS.filter(definition => definition.category === 'box')) policies.push(await presentHead(definition.id, byBox.get(definition.id)));
  return { policies, publicCommerceEnabled: false,
    components: FIXED_COMPONENTS.map(definition => ({ componentId: definition.id, category: definition.category, displayName: byId.get(definition.id)?.displayName ?? null })) };
}
export async function getPhysicalPolicy(boxId, rawQuery = {}) {
  boxIdentity.parse(boxId); const query = physicalPolicyHistoryQuery.parse(rawQuery);
  await ensurePolicyStorage();
  const head = await GiftBoxPhysicalPolicy.findOne({ boxId }).lean().maxTimeMS(3000);
  return presentHead(boxId, head, { details: true, historyPage: query.historyPage });
}
export async function savePhysicalPolicyDraft(boxId, raw, actor) {
  requireActor(actor); boxIdentity.parse(boxId); const input = policyDraftInput.parse(raw);
  const draft = canonicalizePolicyDraft(boxId, { rules: input.rules, packing: input.packing });
  return transaction(actor, async (session, verifiedActor) => {
    const head = await loadHead(boxId, input.expectedRevision, verifiedActor, session);
    head.draft = draft; head.markModified('draft'); await saveHead(head, verifiedActor, session);
    await recordAdminAudit(verifiedActor, { action: 'gift_box.policy.draft_saved', resourceType: 'configuration', resourceId: resource(boxId),
      details: { boxId, revision: head.__v, contentHash: policyContentHash(boxId, draft.rules, draft.packing) } }, { session });
    return presentHead(boxId, head.toObject(), { session, details: true });
  });
}
export async function approvePhysicalPolicy(boxId, raw, actor) {
  requireActor(actor); boxIdentity.parse(boxId); const input = policyApprovalInput.parse(raw);
  return transaction(actor, async (session, verifiedActor) => {
    const head = await loadHead(boxId, input.expectedRevision, verifiedActor, session);
    if (!head.draft) throw builderError(409, 'GIFT_BOX_POLICY_DRAFT_REQUIRED', 'Save a reviewed draft before approving a new version.');
    const draft = validatePolicyApprovalReady(boxId, head.draft);
    if (head.versionCounter >= 1000) throw builderError(409, 'GIFT_BOX_POLICY_HISTORY_LIMIT', 'This policy requires reviewed history archival before another version.');
    const previousVersion = head.versionCounter, version = previousVersion + 1, approvedAt = new Date();
    const policy = buildApprovedPolicy({ boxId, rules: draft.rules, version, approvedBy: String(verifiedActor._id), approvedAt });
    const policyHash = fingerprint(policy), contentHash = policyContentHash(boxId, draft.rules, draft.packing);
    const [publication] = await GiftBoxPolicyPublication.create([{ boxId, version, policy, packing: draft.packing,
      evidence: input.evidence, attestations: { packingTested: true, safeTransport: true, lidChecked: true, physicalAccuracyComputerVerified: false },
      policyHash, contentHash, approvedBy: verifiedActor._id, approvedAt }], { session });
    // Publish the immutable content, administration head, operational conflict
    // boundary and audit together. A fence record alone grants no approval.
    assertDatabaseWriteAllowed(GiftBoxFulfillmentPolicyFence.db, env);
    await GiftBoxFulfillmentPolicyFence.updateOne({ boxId }, { $set: { policyId: policy.policyId, policyVersion: policy.policyVersion,
      policyHash, status: 'approved' }, $inc: { __v: 1 } }, { session, upsert: true, runValidators: true });
    head.activePublicationId = publication._id; head.versionCounter = version; head.draft = null;
    await saveHead(head, verifiedActor, session);
    await recordAdminAudit(verifiedActor, { action: 'gift_box.policy.approved', resourceType: 'configuration', resourceId: resource(boxId),
      details: { boxId, revision: head.__v, version, previousVersion, policyHash, contentHash,
        packingTested: true, safeTransport: true, lidChecked: true } }, { session });
    return presentHead(boxId, head.toObject(), { session, details: true });
  });
}
export async function withdrawPhysicalPolicy(boxId, raw, actor) {
  requireActor(actor); boxIdentity.parse(boxId); const input = policyWithdrawalInput.parse(raw);
  return transaction(actor, async (session, verifiedActor) => {
    const head = await loadHead(boxId, input.expectedRevision, verifiedActor, session);
    const publication = head.activePublicationId ? await GiftBoxPolicyPublication.findById(head.activePublicationId).session(session).lean().maxTimeMS(3000) : null;
    const policy = publicationWithdrawalReference(publication);
    if (!policy || policy.boxId !== boxId) throw builderError(409, 'GIFT_BOX_POLICY_NOT_ACTIVE', 'There is no current reviewed policy to withdraw.');
    assertDatabaseWriteAllowed(GiftBoxFulfillmentPolicyFence.db, env);
    const fenced = await GiftBoxFulfillmentPolicyFence.updateOne({ boxId, status: 'approved', policyId: policy.policyId,
      policyVersion: policy.policyVersion, policyHash: publication.policyHash }, { $set: { status: 'withdrawn' }, $inc: { __v: 1 } }, { session });
    if (fenced.matchedCount !== 1) throw builderError(409, 'GIFT_BOX_POLICY_FENCE_CONFLICT', 'The policy fence changed or is inconsistent. Review it before retrying.');
    const reasonHash = fingerprint({ reason: input.reason });
    head.withdrawals.push({ publicationId: publication._id, version: publication.version, actorId: verifiedActor._id, at: new Date(), reason: input.reason, reasonHash });
    head.activePublicationId = null; await saveHead(head, verifiedActor, session);
    await recordAdminAudit(verifiedActor, { action: 'gift_box.policy.withdrawn', resourceType: 'configuration', resourceId: resource(boxId),
      details: { boxId, revision: head.__v, version: publication.version, policyHash: publication.policyHash, contentHash: publication.contentHash, reasonHash } }, { session });
    return presentHead(boxId, head.toObject(), { session, details: true });
  });
}
