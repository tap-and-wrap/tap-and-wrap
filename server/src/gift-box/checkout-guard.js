import mongoose from 'mongoose';
import { GiftBoxFulfillmentPolicyFence } from '../models/GiftBoxFulfillmentPolicyFence.js';
import { env } from '../config/env.js';
import { assertDatabaseWriteAllowed } from '../config/database-safety.js';
import { assertUploadOwner } from '../commerce/uploads.js';
import { fingerprint } from '../commerce/pricing.js';
import { commerceError } from '../commerce/errors.js';
import { giftBoxFulfillmentPolicyInput } from './fulfillment-policy.js';
import { setGiftBoxCartPoliciesForDisposableTest } from './cart-pricing.js';

const capabilities = new WeakMap();
let testHooks = null;
export function assertGiftBoxDisposableCheckoutTarget() {
  if (process.env.NODE_ENV !== 'test' || env.nodeEnv !== 'test' || env.databaseTarget !== 'local'
    || env.mongoUri || process.env.MONGODB_URI || process.env.CATALOG_IMPORT_STAGING_URI) {
    throw commerceError(503, 'GIFT_BOX_INTERNAL_CHECKOUT_TEST_ONLY', 'Internal gift checkout requires a disposable test fixture.');
  }
  const target = assertDatabaseWriteAllowed(GiftBoxFulfillmentPolicyFence.db, env);
  if (!target.disposableTest || GiftBoxFulfillmentPolicyFence.db.name !== 'tap_wrap_catalog_test' || GiftBoxFulfillmentPolicyFence.db.host !== '127.0.0.1') {
    throw commerceError(503, 'GIFT_BOX_INTERNAL_CHECKOUT_TEST_ONLY', 'Internal gift checkout requires the exact disposable loopback database.');
  }
}
export async function createGiftBoxCheckoutCapabilityForDisposableTest(owner) {
  assertGiftBoxDisposableCheckoutTarget(); assertUploadOwner(owner);
  const hello = await GiftBoxFulfillmentPolicyFence.db.db.admin().command({ hello: 1 });
  if (!hello.setName) throw commerceError(503, 'TRANSACTIONS_REQUIRED', 'A disposable replica set is required.');
  const capability = Object.freeze({});
  capabilities.set(capability, { owner, client: GiftBoxFulfillmentPolicyFence.db.getClient() });
  return capability;
}
export function assertGiftBoxCheckoutCapability(capability, owner) {
  assertGiftBoxDisposableCheckoutTarget();
  const accepted = capabilities.get(capability);
  if (!accepted || accepted.owner !== owner || accepted.client !== GiftBoxFulfillmentPolicyFence.db.getClient()) {
    throw commerceError(503, 'GIFT_BOX_CHECKOUT_DISABLED', 'Public gift-box checkout remains unavailable.');
  }
}

// This helper is test composition only; no request or flag can call it. The
// separate restricted owner workflow publishes stored policies transactionally.
// The exact test guard is rechecked before every fixture DDL/write and lookup.
export async function setGiftBoxCheckoutPoliciesForDisposableTest(rawPolicies) {
  assertGiftBoxDisposableCheckoutTarget();
  if (!Array.isArray(rawPolicies) || rawPolicies.length > 12) throw new Error('Use a bounded synthetic policy set.');
  const policies = rawPolicies.map(policy => giftBoxFulfillmentPolicyInput.parse(policy));
  if (policies.some(policy => policy.status !== 'approved') || new Set(policies.map(policy => policy.boxId)).size !== policies.length) throw new Error('Use distinct explicitly approved synthetic policies.');
  assertGiftBoxDisposableCheckoutTarget(); await GiftBoxFulfillmentPolicyFence.createCollection();
  assertGiftBoxDisposableCheckoutTarget(); await GiftBoxFulfillmentPolicyFence.createIndexes();
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      assertGiftBoxDisposableCheckoutTarget();
      await GiftBoxFulfillmentPolicyFence.updateMany({ boxId: { $nin: policies.map(policy => policy.boxId) } }, { $set: { status: 'withdrawn' }, $inc: { __v: 1 } }, { session });
      for (const policy of policies) {
        await GiftBoxFulfillmentPolicyFence.updateOne({ boxId: policy.boxId }, { $set: {
          policyId: policy.policyId, policyVersion: policy.policyVersion, policyHash: fingerprint(policy), status: 'approved',
        }, $inc: { __v: 1 } }, { session, upsert: true, runValidators: true });
      }
    });
  } finally { await session.endSession(); }
  setGiftBoxCartPoliciesForDisposableTest(policies);
}
export async function withdrawGiftBoxCheckoutPolicyForDisposableTest(boxId) {
  assertGiftBoxDisposableCheckoutTarget();
  const result = await GiftBoxFulfillmentPolicyFence.updateOne({ boxId }, { $set: { status: 'withdrawn' }, $inc: { __v: 1 } });
  if (result.matchedCount !== 1) throw new Error('No synthetic policy fence exists for this box.');
}
export function setGiftBoxCheckoutHooksForDisposableTest(hooks = {}) {
  assertGiftBoxDisposableCheckoutTarget();
  const allowed = ['beforeInventory', 'afterInventory', 'beforePolicyFence', 'beforeCommit', 'afterCommit'];
  if (!hooks || typeof hooks !== 'object' || Object.keys(hooks).some(key => !allowed.includes(key) || typeof hooks[key] !== 'function')) throw new Error('Use only explicit isolated checkout lifecycle hooks.');
  testHooks = { client: GiftBoxFulfillmentPolicyFence.db.getClient(), hooks: { ...hooks } };
}
export async function runGiftBoxCheckoutTestHook(capability, owner, phase, values) {
  if (!capability) return;
  assertGiftBoxCheckoutCapability(capability, owner);
  if (testHooks?.client === GiftBoxFulfillmentPolicyFence.db.getClient()) await testHooks.hooks[phase]?.({ owner, ...values });
}

export async function readGiftBoxCheckoutPolicyFences(lines, { session } = {}) {
  const gifts = lines.filter(line => line.kind === 'gift_box_v2');
  if (!gifts.length) return [];
  const { verifyDatabaseSchema } = await import('../config/schema.js');
  await verifyDatabaseSchema(env, { models: [GiftBoxFulfillmentPolicyFence], timeoutMs: 3000 });
  const records = await GiftBoxFulfillmentPolicyFence.find({ boxId: { $in: [...new Set(gifts.map(line => line.configuration.selection.boxId))] } }).session(session || null).lean().maxTimeMS(3000);
  const byBox = new Map(records.map(record => [record.boxId, record]));
  const result = [];
  for (const line of gifts) {
    const record = byBox.get(line.configuration.selection.boxId);
    if (!record || record.status !== 'approved' || record.policyHash !== line.giftPolicyHash
      || record.policyId !== line.giftFulfillment.policyReference.policyId || record.policyVersion !== line.giftFulfillment.policyReference.policyVersion
      || !Number.isSafeInteger(record.__v) || record.__v < 0) {
      throw commerceError(409, 'GIFT_BOX_FULFILLMENT_WITHDRAWN', 'The current physical fulfillment policy requires renewed review.');
    }
    if (!result.some(entry => entry.boxId === record.boxId)) result.push(record);
  }
  return result;
}
export async function fenceGiftBoxCheckoutPolicies(records, session) {
  if (!session?.inTransaction()) throw commerceError(503, 'CHECKOUT_TRANSACTION_REQUIRED', 'Policy fences require the order transaction.');
  for (const record of records) {
    assertDatabaseWriteAllowed(GiftBoxFulfillmentPolicyFence.db, env);
    const result = await GiftBoxFulfillmentPolicyFence.updateOne({ _id: record._id, boxId: record.boxId, status: 'approved',
      policyId: record.policyId, policyVersion: record.policyVersion, policyHash: record.policyHash, __v: record.__v }, { $inc: { __v: 1 } }, { session });
    if (result.matchedCount !== 1) throw commerceError(409, 'GIFT_BOX_FULFILLMENT_WITHDRAWN', 'Physical fulfillment approval changed. Review checkout again.');
  }
}
