import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import mongoose from 'mongoose';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { Session } from '../src/models/Session.js';
import { AdminAudit } from '../src/models/AdminAudit.js';
import { Cart } from '../src/models/Cart.js';
import { Order } from '../src/models/Order.js';
import { CheckoutIntent } from '../src/models/CheckoutIntent.js';
import { GiftBoxComponentSetting } from '../src/models/GiftBoxComponentSetting.js';
import { GiftBoxPhysicalPolicy } from '../src/models/GiftBoxPhysicalPolicy.js';
import { GiftBoxPolicyPublication } from '../src/models/GiftBoxPolicyPublication.js';
import { GiftBoxFulfillmentPolicyFence } from '../src/models/GiftBoxFulfillmentPolicyFence.js';
import { savePhysicalPolicyDraft, approvePhysicalPolicy, withdrawPhysicalPolicy } from '../src/gift-box/policy-administration.js';
import { policyContentHash } from '../src/gift-box/policy-contract.js';
import { loadPublishedGiftBoxPolicies } from '../src/gift-box/policy-store.js';
import { assertGiftBoxFulfillment, getGiftBoxFulfillmentPolicy } from '../src/gift-box/fulfillment-policy.js';
import { setGiftBoxCartPoliciesForDisposableTest, clearGiftBoxCartPoliciesForDisposableTest } from '../src/gift-box/cart-pricing.js';
import { setGiftBoxCheckoutHooksForDisposableTest } from '../src/gift-box/checkout-guard.js';
import { addCartItem, quoteCart } from '../src/commerce/cart.js';
import { prepareCheckout, placeOrder, prepareGiftBoxCheckoutForDisposableTest, placeGiftBoxOrderForDisposableTest } from '../src/commerce/orders.js';
import { fingerprint } from '../src/commerce/pricing.js';
import { newSessionToken, hashSession, makeCsrfToken } from '../src/utils/tokens.js';
import { startTestDatabase } from './helpers/database.js';
import { giftCartConfiguration, giftCartInput, giftCartPolicy, seedGiftCartSettings } from './helpers/gift-box-cart-fixtures.js';

const prefix = '/api/v1/admin/gift-box/fulfillment-policies';
const owner = `guest:${'7'.repeat(64)}`;
const original = { builder: env.giftBoxBuilderBackendEnabled, checkout: env.checkoutEnabled };
const evidence = 'Synthetic disposable packing trial with the listed units, closure and transport checks. No real approval.';
const customer = { name: 'Synthetic policy customer', email: 'policy-customer@example.test', phone: '01012345678', governorate: 'cairo', address: '10 Isolated Trial Street, Cairo' };
const approval = expectedRevision => ({ expectedRevision, confirmPackingTested: true, confirmSafeTransport: true, confirmLidChecked: true, evidence });
let database, server, base, admin, otherAdmin, customerAccount;

function draft({ box11 = false } = {}) {
  const policy = giftCartPolicy();
  const rules = { regions: policy.regions, compartments: policy.compartments, componentRules: policy.componentRules, limits: policy.limits };
  rules.limits.mixedContentLimits = [
    ['flower', 'plush'], ['flower', 'chocolate'], ['plush', 'chocolate'], ['flower', 'plush', 'chocolate'],
  ].map(categories => ({ categories, maxUnits: 20 }));
  if (box11) {
    rules.compartments = [{ id: 'left-well', maxUnits: 10 }, { id: 'right-well', maxUnits: 10 }];
    rules.regions = [{ regionId: 'test-cart-inside', zone: 'inside', compartmentId: 'left-well' },
      { regionId: 'right-inside', zone: 'inside', compartmentId: 'right-well' }];
  }
  return { rules, packing: { lidMode: 'must_close', clearanceNotes: 'Synthetic fixture lid and clearance restrictions only.',
    transportNotes: 'Synthetic fixture packing and transport instructions only.',
    plushHandlingNotes: 'Synthetic fixture plush support and orientation instructions only.',
    compartmentNotes: box11 ? 'Synthetic fixture uses separate wells and prohibits bridging.' : '' } };
}
async function account(role, suffix) {
  const user = await User.create({ name: `Synthetic ${suffix}`, email: `${suffix}@example.test`, passwordHash: 'isolated-fixture', role });
  const token = newSessionToken(), csrf = makeCsrfToken(env.sessionSecret);
  await Session.create({ userId: user._id, tokenHash: hashSession(token), expiresAt: new Date(Date.now() + 3600000) });
  return { user, headers: { Cookie: `tw_session=${token}; tw_csrf=${csrf}`, Origin: env.clientOrigin, 'x-csrf-token': csrf } };
}
async function request(route, { method = 'GET', body, headers = admin?.headers ?? {} } = {}) {
  const response = await fetch(`${base}${route}`, { method, headers: { ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, ...(await response.json()), headers: response.headers };
}
const get = (boxId = 'box-2', options) => request(`${prefix}/${boxId}`, options);
const save = (body = { expectedRevision: 0, ...draft() }, boxId = 'box-2', options = {}) => request(`${prefix}/${boxId}/draft`, { method: 'PUT', body, ...options });
const approve = (body, boxId = 'box-2', options = {}) => request(`${prefix}/${boxId}/approve`, { method: 'POST', body, ...options });
const withdraw = (body, boxId = 'box-2', options = {}) => request(`${prefix}/${boxId}/withdraw`, { method: 'POST', body, ...options });
async function publish(boxId = 'box-2', values = draft()) {
  const saved = await save({ expectedRevision: 0, ...values }, boxId);
  assert.equal(saved.status, 200, JSON.stringify(saved.error));
  const published = await approve(approval(saved.data.policy.revision), boxId);
  assert.equal(published.status, 200, JSON.stringify(published.error));
  return published.data.policy;
}
async function review() {
  const checkoutKey = randomUUID();
  await prepareGiftBoxCheckoutForDisposableTest(owner, { checkoutKey, paymentMethod: 'instapay', governorate: 'cairo' });
  return { checkoutKey, paymentMethod: 'instapay', customer };
}
const counts = async () => ({ state: await GiftBoxPhysicalPolicy.countDocuments(), publications: await GiftBoxPolicyPublication.countDocuments(),
  fences: await GiftBoxFulfillmentPolicyFence.countDocuments(), audits: await AdminAudit.countDocuments() });

before(async () => {
  assert.equal(original.builder, false);
  database = await startTestDatabase({ models: Object.values(mongoose.models), transactions: true });
  // Explicit schema creation is confined to the fresh owned disposable fixture.
  for (const Model of [GiftBoxComponentSetting, GiftBoxPhysicalPolicy, GiftBoxPolicyPublication, GiftBoxFulfillmentPolicyFence]) {
    await Model.createCollection(); await Model.createIndexes();
  }
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(async () => {
  assert.equal(mongoose.connection.host, '127.0.0.1'); assert.equal(mongoose.connection.name, 'tap_wrap_catalog_test');
  assert.equal(process.env.NODE_ENV, 'test'); assert.ok(!process.env.MONGODB_URI && !process.env.CATALOG_IMPORT_STAGING_URI);
  // Publication documents are append-only in application code. Test cleanup uses
  // the native collection only after the exact disposable fixture assertions.
  for (const Model of Object.values(mongoose.models)) {
    if (Model === GiftBoxPolicyPublication) await Model.collection.deleteMany({});
    else await Model.deleteMany({});
  }
  env.giftBoxBuilderBackendEnabled = true; env.checkoutEnabled = true;
  setGiftBoxCartPoliciesForDisposableTest([]); setGiftBoxCheckoutHooksForDisposableTest();
  admin = await account('admin', 'policy-admin'); otherAdmin = await account('admin', 'policy-other-admin'); customerAccount = await account('customer', 'policy-customer');
});
after(async () => {
  if (database) { setGiftBoxCheckoutHooksForDisposableTest(); setGiftBoxCartPoliciesForDisposableTest([]); }
  env.giftBoxBuilderBackendEnabled = original.builder; env.checkoutEnabled = original.checkout;
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await database?.stop();
});

test('all twelve boxes remain pending without implicit drafts, physical approval or publication on read', async () => {
  const result = await request(prefix);
  assert.equal(result.status, 200);
  assert.deepEqual(result.data.policies.map(value => value.boxId), Array.from({ length: 12 }, (_, index) => `box-${index + 1}`));
  for (const policy of result.data.policies) {
    assert.equal(policy.revision, 0); assert.equal(policy.activePublication, null); assert.deepEqual(policy.history, []);
    assert.equal(getGiftBoxFulfillmentPolicy(policy.boxId), null);
  }
  assert.match(result.headers.get('cache-control'), /private.*no-store/); assert.match(result.headers.get('x-robots-tag'), /noindex/);
  assert.deepEqual(await counts(), { state: 0, publications: 0, fences: 0, audits: 0 });
  const policies = await loadPublishedGiftBoxPolicies(['box-1', 'box-2', 'box-11']); assert.equal(policies.size, 0);
});

test('policy routes preserve backend feature closure and read-only ordinary readiness', async () => {
  env.giftBoxBuilderBackendEnabled = false;
  assert.equal((await request(prefix)).status, 404);
  assert.equal((await save()).status, 404);
  assert.equal((await request('/health/ready')).status, 200);
  assert.deepEqual(await counts(), { state: 0, publications: 0, fences: 0, audits: 0 });
});

test('administration requires a verified administrator and exact Origin plus CSRF for mutations', async () => {
  for (const [headers, status] of [[{}, 401], [customerAccount.headers, 403]]) {
    assert.equal((await request(prefix, { headers })).status, status);
    assert.equal((await save(undefined, 'box-2', { headers })).status, status);
  }
  for (const headers of [{ ...admin.headers, 'x-csrf-token': '' }, { ...admin.headers, Origin: 'https://untrusted.example' },
    { ...admin.headers, Origin: 'null' }, { Cookie: admin.headers.Cookie, 'x-csrf-token': admin.headers['x-csrf-token'] }]) {
    assert.equal((await save(undefined, 'box-2', { headers })).status, 403);
  }
  await User.updateOne({ _id: otherAdmin.user._id }, { $set: { active: false } });
  assert.equal((await save(undefined, 'box-2', { headers: otherAdmin.headers })).status, 401);
  await assert.rejects(savePhysicalPolicyDraft('box-2', { expectedRevision: 0, ...draft() }, customerAccount.user), { code: 'ADMIN_REQUIRED' });
  assert.deepEqual(await counts(), { state: 0, publications: 0, fences: 0, audits: 0 });
});

test('approval rechecks the saved administrator identity after account revocation', async () => {
  const saved = await save(); assert.equal(saved.status, 200);
  await User.updateOne({ _id: admin.user._id }, { $set: { role: 'customer' } });
  await assert.rejects(approvePhysicalPolicy('box-2', approval(saved.data.policy.revision), admin.user));
  assert.equal(await GiftBoxPolicyPublication.countDocuments(), 0); assert.equal(await GiftBoxFulfillmentPolicyFence.countDocuments(), 0);
  assert.equal((await approve(approval(saved.data.policy.revision))).status, 403);
});

test('an unsupplied draft is editable but never implicitly approved or operational', async () => {
  const result = await save({ expectedRevision: 0, rules: null, packing: null });
  assert.equal(result.status, 200); assert.equal(result.data.policy.revision, 1);
  assert.equal(result.data.policy.activePublication, null);
  const blocked = await approve(approval(1)); assert.ok([400, 409].includes(blocked.status));
  assert.equal(await GiftBoxPolicyPublication.countDocuments(), 0); assert.equal(await GiftBoxFulfillmentPolicyFence.countDocuments(), 0);
  assert.equal(await AdminAudit.countDocuments({ action: 'gift_box.policy.draft_saved' }), 1);
});

test('unknown identities, malformed rules and client-supplied approval or hash metadata are rejected without writes', async () => {
  for (const boxId of ['box-99', 'rose-red', '__proto__']) assert.equal((await save(undefined, boxId)).status, 400);
  for (const body of [{ ...draft() }, { expectedRevision: -1, ...draft() }, { expectedRevision: 0, ...draft(), status: 'approved' },
    { expectedRevision: 0, ...draft(), policyHash: 'a'.repeat(64) }, { expectedRevision: 0, ...draft(), approvedBy: String(admin.user._id) }]) {
    assert.equal((await save(body)).status, 400);
  }
  for (const change of [value => { value.rules.componentRules[0].componentId = 'unknown'; },
    value => { value.rules.componentRules.push(structuredClone(value.rules.componentRules[0])); },
    value => { value.rules.componentRules[0].allowedRegionIds = ['missing-region']; },
    value => { value.rules.regions[0].certifiedFit = true; },
    value => { value.rules.limits.maxUnits = Number.MAX_SAFE_INTEGER; }]) {
    const body = { expectedRevision: 0, ...draft() }; change(body); assert.equal((await save(body)).status, 400);
  }
  assert.deepEqual(await counts(), { state: 0, publications: 0, fences: 0, audits: 0 });
});

test('BOX-11 requires separate compartments and disallows shared or bridging region claims', async () => {
  const invalid = draft({ box11: true }); invalid.rules.regions[0].compartmentId = null;
  assert.equal((await save({ expectedRevision: 0, ...invalid }, 'box-11')).status, 400);
  const missing = draft({ box11: true }); missing.rules.compartments.pop();
  assert.equal((await save({ expectedRevision: 0, ...missing }, 'box-11')).status, 400);
  const extra = draft({ box11: true }); extra.rules.regions.push({ regionId: 'bridge', zone: 'inside', compartmentId: null });
  assert.equal((await save({ expectedRevision: 0, ...extra }, 'box-11')).status, 400);
  const state = await publish('box-11', draft({ box11: true }));
  const configuration = giftCartConfiguration(); configuration.selection.boxId = 'box-11';
  assert.equal(assertGiftBoxFulfillment(configuration, state.activePublication.policy).physicalFitCertifiedByGeometry, false);
  configuration.placements[0].regionId = 'bridge';
  assert.throws(() => assertGiftBoxFulfillment(configuration, state.activePublication.policy), { code: 'GIFT_BOX_FULFILLMENT_PLACEMENT' });
});

test('concurrent draft creation and stale revisions permit one winner with one atomic audit', async () => {
  const body = { expectedRevision: 0, ...draft() };
  const results = await Promise.all([save(body), save(body, 'box-2', { headers: otherAdmin.headers })]);
  assert.deepEqual(results.map(value => value.status).sort(), [200, 409]);
  assert.equal(await GiftBoxPhysicalPolicy.countDocuments(), 1); assert.equal(await AdminAudit.countDocuments(), 1);
  const stale = await save(body); assert.equal(stale.status, 409); assert.equal(stale.error.code, 'EDIT_CONFLICT');
  const state = (await get()).data.policy;
  const edited = await save({ expectedRevision: state.revision, ...draft() }); assert.equal(edited.data.policy.revision, state.revision + 1);
  assert.equal(await AdminAudit.countDocuments(), 2);
});

test('approval requires all explicit attestations, substantive packing evidence and complete conservative rules', async () => {
  const saved = await save(); const revision = saved.data.policy.revision;
  for (const body of [{ expectedRevision: revision }, { ...approval(revision), evidence: '' }, { ...approval(revision), evidence: 'Untested' },
    { ...approval(revision), confirmPackingTested: false }, { ...approval(revision), confirmSafeTransport: false }, { ...approval(revision), confirmLidChecked: false },
    { ...approval(revision), approvedAt: '2026-10-28T08:00:00Z' }, { ...approval(revision), approvedBy: 'forged' }, { ...approval(revision), policyVersion: 'v999' }]) {
    assert.equal((await approve(body)).status, 400);
  }
  const incomplete = draft(); incomplete.packing.clearanceNotes = ''; incomplete.rules.limits.mixedContentLimits.pop();
  const changed = await save({ expectedRevision: revision, ...incomplete }); assert.equal(changed.status, 200);
  const blocked = await approve(approval(changed.data.policy.revision)); assert.ok([400, 409].includes(blocked.status));
  assert.equal(await GiftBoxPolicyPublication.countDocuments(), 0); assert.equal(await GiftBoxFulfillmentPolicyFence.countDocuments(), 0);
});

test('explicit approval publishes one immutable version with server identity, timestamp and matching content/fence hashes', async () => {
  const began = Date.now(), state = await publish(), publication = state.activePublication;
  assert.equal(publication.version, 1); assert.equal(publication.status, 'approved');
  assert.equal(publication.policy.policyId, 'gift-box-box-2'); assert.equal(publication.policy.policyVersion, 'v1');
  assert.equal(publication.approvedBy, String(admin.user._id)); assert.equal(publication.policy.approvedBy, String(admin.user._id));
  assert.ok(new Date(publication.approvedAt).getTime() >= began); assert.ok(new Date(publication.approvedAt).getTime() <= Date.now());
  assert.equal(publication.policyHash, fingerprint(publication.policy));
  assert.equal(publication.contentHash, policyContentHash('box-2', draft().rules, draft().packing));
  assert.equal(publication.evidence, evidence); assert.equal(publication.policy.withdrawnAt, null);
  assert.deepEqual(publication.attestations, { packingTested: true, safeTransport: true, lidChecked: true, physicalAccuracyComputerVerified: false });
  const fence = await GiftBoxFulfillmentPolicyFence.findOne({ boxId: 'box-2' }).lean();
  assert.equal(fence.status, 'approved'); assert.equal(fence.policyHash, publication.policyHash); assert.equal(fence.policyVersion, 'v1');
  assert.equal(state.history.length, 1); assert.equal(await AdminAudit.countDocuments({ action: 'gift_box.policy.approved' }), 1);
  const policies = await loadPublishedGiftBoxPolicies(['box-2']); assert.deepEqual(policies.get('box-2'), publication.policy);
});

test('two explicit approval actions racing on one draft publish exactly one version and approval audit', async () => {
  const saved = await save(); const revision = saved.data.policy.revision;
  const results = await Promise.all([approve(approval(revision)), approve(approval(revision), 'box-2', { headers: otherAdmin.headers })]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  assert.equal(await GiftBoxPolicyPublication.countDocuments(), 1);
  assert.equal(await AdminAudit.countDocuments({ action: 'gift_box.policy.approved' }), 1);
  const state = (await get()).data.policy; assert.equal(state.activePublication.version, 1); assert.equal(state.history.length, 1);
  assert.equal((await GiftBoxFulfillmentPolicyFence.findOne({ boxId: 'box-2' }).lean()).policyHash, state.activePublication.policyHash);
});

test('equivalent draft collection ordering has a stable content hash while changed packing evidence remains distinguishable', async () => {
  const first = draft(), reordered = structuredClone(first);
  reordered.rules.componentRules.reverse(); reordered.rules.limits.mixedContentLimits.reverse();
  reordered.rules.limits.mixedContentLimits.forEach(rule => rule.categories.reverse());
  assert.equal(policyContentHash('box-2', first.rules, first.packing), policyContentHash('box-2', reordered.rules, reordered.packing));
  reordered.packing.transportNotes += ' Additional secured wrapping.';
  assert.notEqual(policyContentHash('box-2', first.rules, first.packing), policyContentHash('box-2', reordered.rules, reordered.packing));
  assert.equal(await GiftBoxPolicyPublication.countDocuments(), 0);
});

test('editing an approved draft preserves its active version until explicit new approval and retains immutable history', async () => {
  const first = await publish(), before = structuredClone(first.activePublication);
  const changed = draft(); changed.rules.componentRules[0].maxQuantity = 4;
  const saved = await save({ expectedRevision: first.revision, ...changed }); assert.equal(saved.status, 200);
  assert.equal(saved.data.policy.activePublication.id, before.id);
  assert.deepEqual(saved.data.policy.activePublication.policy, before.policy);
  const second = await approve(approval(saved.data.policy.revision)); assert.equal(second.status, 200);
  const state = second.data.policy;
  assert.equal(state.activePublication.version, 2); assert.equal(state.history.length, 2);
  assert.equal(state.history.find(publication => publication.version === 1).status, 'superseded');
  const storedFirst = await GiftBoxPolicyPublication.findOne({ boxId: 'box-2', version: 1 }).lean();
  assert.deepEqual(storedFirst.policy, before.policy); assert.equal(storedFirst.policyHash, before.policyHash);
  const fence = await GiftBoxFulfillmentPolicyFence.findOne({ boxId: 'box-2' }).lean(); assert.equal(fence.policyVersion, 'v2');
  assert.equal(await AdminAudit.countDocuments({ action: 'gift_box.policy.approved' }), 2);
});

test('published payloads reject document/query changes and duplicate box/version identities', async () => {
  await publish();
  const publication = await GiftBoxPolicyPublication.findOne({ boxId: 'box-2', version: 1 });
  const originalDocument = publication.toObject();
  publication.evidence = 'Attempted replacement evidence that must never be saved.';
  // Strict Mongoose assignment records an immutable-field validation error;
  // saving that document must reject and retain its original persisted value.
  await assert.rejects(publication.save(), /immutable|cannot be rewritten/i);
  await assert.rejects(GiftBoxPolicyPublication.updateOne({ _id: publication._id }, { $set: { evidence: 'forged' } }));
  const duplicate = { ...originalDocument }; delete duplicate._id; delete duplicate.__v;
  await assert.rejects(GiftBoxPolicyPublication.create(duplicate), error => error.code === 11000);
  const stored = await GiftBoxPolicyPublication.findById(publication._id).lean(); assert.equal(stored.evidence, originalDocument.evidence);
  assert.equal(await GiftBoxPolicyPublication.countDocuments(), 1);
});

test('audit failure rolls back draft creation, publication and operational fence together', async () => {
  const createAudit = AdminAudit.create;
  AdminAudit.create = async () => { throw new Error('Synthetic policy audit failure'); };
  try { await assert.rejects(savePhysicalPolicyDraft('box-2', { expectedRevision: 0, ...draft() }, admin.user), /Synthetic policy audit failure/); }
  finally { AdminAudit.create = createAudit; }
  assert.deepEqual(await counts(), { state: 0, publications: 0, fences: 0, audits: 0 });
  const saved = await save();
  AdminAudit.create = async () => { throw new Error('Synthetic policy audit failure'); };
  try { await assert.rejects(approvePhysicalPolicy('box-2', approval(saved.data.policy.revision), admin.user), /Synthetic policy audit failure/); }
  finally { AdminAudit.create = createAudit; }
  assert.equal(await GiftBoxPolicyPublication.countDocuments(), 0); assert.equal(await GiftBoxFulfillmentPolicyFence.countDocuments(), 0);
  assert.equal((await get()).data.policy.revision, saved.data.policy.revision); assert.equal(await AdminAudit.countDocuments(), 1);
});

test('withdrawal requires an explicit reason and current revision, and audit failure preserves the active publication/fence', async () => {
  const state = await publish();
  assert.equal((await withdraw({ expectedRevision: state.revision, reason: '' })).status, 400);
  assert.equal((await withdraw({ expectedRevision: state.revision - 1, reason: 'Synthetic incompatible packing discovered.' })).status, 409);
  const createAudit = AdminAudit.create;
  AdminAudit.create = async () => { throw new Error('Synthetic policy withdrawal audit failure'); };
  try { await assert.rejects(withdrawPhysicalPolicy('box-2', { expectedRevision: state.revision, reason: 'Synthetic incompatible packing discovered.' }, admin.user), /Synthetic policy withdrawal audit failure/); }
  finally { AdminAudit.create = createAudit; }
  assert.equal((await get()).data.policy.activePublication.id, state.activePublication.id);
  assert.equal((await GiftBoxFulfillmentPolicyFence.findOne({ boxId: 'box-2' }).lean()).status, 'approved');
  assert.equal(await AdminAudit.countDocuments({ action: 'gift_box.policy.withdrawn' }), 0);
});

test('withdrawal removes eligibility immediately without mutating the published policy or inventing another approval', async () => {
  const state = await publish(), originalPolicy = structuredClone(state.activePublication.policy);
  const reason = 'Synthetic packing evidence no longer applies.';
  const result = await withdraw({ expectedRevision: state.revision, reason });
  assert.equal(result.status, 200); assert.equal(result.data.policy.activePublication, null);
  assert.equal(result.data.policy.history[0].status, 'withdrawn'); assert.ok(result.data.policy.history[0].withdrawnAt);
  assert.equal(result.data.policy.history[0].withdrawalReason, reason);
  assert.equal((await loadPublishedGiftBoxPolicies(['box-2'])).size, 0);
  assert.equal((await GiftBoxFulfillmentPolicyFence.findOne({ boxId: 'box-2' }).lean()).status, 'withdrawn');
  assert.deepEqual((await GiftBoxPolicyPublication.findOne({ boxId: 'box-2', version: 1 }).lean()).policy, originalPolicy);
  assert.equal(await GiftBoxPolicyPublication.countDocuments(), 1); assert.equal(await AdminAudit.countDocuments({ action: 'gift_box.policy.withdrawn' }), 1);
  const audit = await AdminAudit.findOne({ action: 'gift_box.policy.withdrawn' }).lean();
  assert.equal(audit.details.reasonHash, fingerprint({ reason }));
});

test('a policy using retired asset references remains withdrawable without reapproving or rewriting its historical version', async () => {
  const state = await publish();
  const retiredPolicy = { ...state.activePublication.policy, assetVersion: 'synthetic-retired-asset-v0' };
  const retiredHash = fingerprint(retiredPolicy);
  // Simulate an immutable historical version from a future application's point
  // of view. Native writes are confined to this exact disposable fixture.
  assert.equal(process.env.NODE_ENV, 'test'); assert.equal(mongoose.connection.name, 'tap_wrap_catalog_test'); assert.equal(mongoose.connection.host, '127.0.0.1');
  await GiftBoxPolicyPublication.collection.updateOne({ _id: new mongoose.Types.ObjectId(state.activePublication.id) }, { $set: { policy: retiredPolicy, policyHash: retiredHash } });
  await GiftBoxFulfillmentPolicyFence.updateOne({ boxId: 'box-2' }, { $set: { policyHash: retiredHash }, $inc: { __v: 1 } });
  assert.equal((await loadPublishedGiftBoxPolicies(['box-2'])).size, 0);
  const before = (await get()).data.policy; assert.equal(before.activePublication.compatibleWithCurrentContract, false);
  const result = await withdraw({ expectedRevision: before.revision, reason: 'Synthetic retired references require withdrawal before a new packing review.' });
  assert.equal(result.status, 200, JSON.stringify(result.error)); assert.equal(result.data.policy.activePublication, null);
  assert.equal(result.data.policy.history[0].compatibleWithCurrentContract, false);
  assert.equal((await GiftBoxFulfillmentPolicyFence.findOne({ boxId: 'box-2' }).lean()).status, 'withdrawn');
  const publication = await GiftBoxPolicyPublication.findById(state.activePublication.id).lean();
  assert.deepEqual(publication.policy, retiredPolicy); assert.equal(publication.policyHash, retiredHash);
});

test('an operational fence mismatch fails closed rather than trusting only the saved approved document', async () => {
  await publish(); await seedGiftCartSettings(admin.user._id);
  await GiftBoxFulfillmentPolicyFence.updateOne({ boxId: 'box-2' }, { $set: { policyHash: 'a'.repeat(64) }, $inc: { __v: 1 } });
  await assert.rejects(addCartItem(owner, giftCartInput()), error => error.code?.startsWith('GIFT_BOX_'));
  assert.equal(await Cart.countDocuments(), 0); assert.equal(await Order.countDocuments(), 0);
});

test('owner approval alone cannot open the runtime Add to Cart launch gate', async () => {
  await publish(); await seedGiftCartSettings(admin.user._id);
  clearGiftBoxCartPoliciesForDisposableTest();
  await assert.rejects(addCartItem(owner, giftCartInput()), { code: 'GIFT_BOX_CART_LAUNCH_DISABLED' });
  assert.equal(await Cart.countDocuments(), 0); assert.equal(await Order.countDocuments(), 0);
  assert.equal((await GiftBoxComponentSetting.findOne({ componentId: 'rose-red' }).lean()).inventoryQuantity, 20);
});

test('published incompatibility and mixed-content prohibitions are applied to actual configured gifts', async () => {
  const rules = draft(); rules.rules.limits.mixedContentLimits.find(rule => rule.categories.length === 3).maxUnits = 0;
  const state = await publish('box-2', rules);
  assert.throws(() => assertGiftBoxFulfillment(giftCartConfiguration(), state.activePublication.policy), { code: 'GIFT_BOX_FULFILLMENT_LIMIT' });
  const configuration = giftCartConfiguration({ roses: 1, plush: false, chocolate: false, card: false });
  configuration.selection.items[0].componentId = 'rose-yellow'; configuration.placements[0].componentId = 'rose-yellow';
  assert.throws(() => assertGiftBoxFulfillment(configuration, state.activePublication.policy), { code: 'GIFT_BOX_FULFILLMENT_INCOMPATIBLE' });
});

test('withdrawal during internal checkout rolls back consumption and leaves the reviewed cart without creating an order', async () => {
  const state = await publish(); await seedGiftCartSettings(admin.user._id); await addCartItem(owner, giftCartInput());
  const input = await review(); let withdrew = false;
  setGiftBoxCheckoutHooksForDisposableTest({ beforePolicyFence: async () => {
    if (!withdrew) { withdrew = true; await withdrawPhysicalPolicy('box-2', { expectedRevision: state.revision, reason: 'Synthetic withdrawal raced before the transaction fence.' }, admin.user); }
  } });
  await assert.rejects(placeGiftBoxOrderForDisposableTest(owner, input), error => error.code?.startsWith('GIFT_BOX_'));
  assert.equal(await Order.countDocuments(), 0); assert.equal(await Cart.countDocuments(), 1);
  assert.equal((await CheckoutIntent.findOne().lean()).state, 'open');
  assert.equal((await GiftBoxComponentSetting.findOne({ componentId: 'rose-red' }).lean()).inventoryQuantity, 20);
  assert.equal((await GiftBoxFulfillmentPolicyFence.findOne({ boxId: 'box-2' }).lean()).status, 'withdrawn');
});

test('order policy references remain immutable after withdrawal while new quotes and public checkout stay closed', async () => {
  const state = await publish(); await seedGiftCartSettings(admin.user._id); await addCartItem(owner, giftCartInput());
  const input = await review(); const order = await placeGiftBoxOrderForDisposableTest(owner, input);
  const before = await Order.findById(order.id).lean(); const reference = structuredClone(before.lines[0].giftBox.fulfillment.policyReference);
  assert.equal(reference.policyVersion, 'v1');
  await withdraw({ expectedRevision: state.revision, reason: 'Synthetic policy withdrawn after an earlier completed order.' });
  const after = await Order.findById(order.id).lean(); assert.deepEqual(after.lines[0].giftBox.fulfillment.policyReference, reference);
  const recovered = await placeGiftBoxOrderForDisposableTest(owner, input); assert.equal(recovered.id, order.id);
  assert.equal(await Order.countDocuments(), 1);
  await assert.rejects(addCartItem(owner, giftCartInput()), error => error.code?.startsWith('GIFT_BOX_'));
  // A publication is not a launch instruction: normal runtime checkout retains
  // the unconditional gift fence even when the global flag is on.
  const renewed = await save({ expectedRevision: (await get()).data.policy.revision, ...draft() });
  await approve(approval(renewed.data.policy.revision)); await addCartItem(owner, giftCartInput());
  await assert.rejects(prepareCheckout(owner, { checkoutKey: randomUUID(), paymentMethod: 'instapay', governorate: 'cairo' }), { code: 'GIFT_BOX_CHECKOUT_DISABLED' });
  const quote = await quoteCart(owner); assert.equal(quote.items[0].checkoutAllowed, false);
});


test('real customer cart and checkout reuse published policy and inventory, never synthetic approvals', async () => {
  const previous = env.giftBoxDirectCommerceEnabled;
  try {
    await seedGiftCartSettings(admin.user._id);
    env.giftBoxDirectCommerceEnabled = true;
    await assert.rejects(addCartItem(owner, giftCartInput(giftCartConfiguration())), { code: 'GIFT_BOX_FULFILLMENT_UNAPPROVED' });
    await publish();
    const result = await addCartItem(owner, giftCartInput(giftCartConfiguration()));
    assert.equal(result.cart.items.length, 1);
    assert.equal(result.cart.items[0].kind, 'gift_box_v2');
    assert.equal(result.checkoutEnabled, true);
    const checkoutKey = randomUUID();
    const quote = await prepareCheckout(owner, { checkoutKey, paymentMethod: 'instapay', governorate: 'cairo' });
    assert.ok(quote.totals.totalPiastres > 0);
    const placed = await placeOrder(owner, { checkoutKey, paymentMethod: 'instapay', customer });
    const stored = await Order.findById(placed.id).lean();
    assert.equal(stored.lines.length, 1);
    assert.equal(stored.lines[0].kind, 'gift_box_v2');
    assert.equal(stored.lines[0].giftBox.configuration.selection.boxId, 'box-2');
    assert.ok(stored.inventoryClaims.some(item => item.kind === 'gift_box_component'));
    assert.equal(stored.paymentMethod, 'instapay');
    assert.equal(stored.charges[0].amountPiastres, null);
    assert.equal(await Cart.countDocuments({ owner }), 0);
  } finally { env.giftBoxDirectCommerceEnabled = previous; }
});
