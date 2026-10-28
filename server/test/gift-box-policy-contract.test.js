import test from 'node:test';
import assert from 'node:assert/strict';
import { ZodError } from 'zod';
import { FIXED_COMPONENTS } from '../../shared/gift-box/definitions.mjs';
import { giftCartConfiguration, giftCartPolicy } from './helpers/gift-box-cart-fixtures.js';
import { assertGiftBoxFulfillment, GIFT_BOX_FULFILLMENT_POLICIES } from '../src/gift-box/fulfillment-policy.js';
import { policyDraftInput, policyApprovalInput, policyWithdrawalInput, buildPendingPolicy, buildApprovedPolicy,
  canonicalizePolicyDraft, policyContentHash, validatePolicyApprovalReady } from '../src/gift-box/policy-contract.js';

// These are synthetic count rules and packing descriptions for pure tests only.
// They are not merchant capacities, measurements or evidence of actual fit.
const adminId = '100000000000000000000001';
const approvalDate = new Date('2026-10-28T09:00:00Z');
function draft(boxId = 'box-2') {
  const { regions, compartments, componentRules, limits } = giftCartPolicy();
  limits.mixedContentLimits = [
    { categories: ['flower', 'plush'], maxUnits: 20 }, { categories: ['flower', 'chocolate'], maxUnits: 20 },
    { categories: ['plush', 'chocolate'], maxUnits: 20 }, { categories: ['flower', 'plush', 'chocolate'], maxUnits: 20 },
  ];
  if (boxId === 'box-11') {
    compartments.push({ id: 'test-lower', maxUnits: 10 }, { id: 'test-upper', maxUnits: 10 });
    regions[0].compartmentId = 'test-lower';
    regions.push({ regionId: 'test-upper-inside', zone: 'inside', compartmentId: 'test-upper' });
  }
  return { rules: { regions, compartments, componentRules, limits }, packing: {
    lidMode: 'must_close', clearanceNotes: 'Synthetic lid and clearance test instructions.',
    transportNotes: 'Synthetic support and transport test instructions.',
    plushHandlingNotes: 'Synthetic supported plush orientation instructions.',
    compartmentNotes: boxId === 'box-11' ? 'Synthetic separate lower and upper well instructions.' : '',
  } };
}
const approval = () => ({ expectedRevision: 0, confirmPackingTested: true, confirmSafeTransport: true,
  confirmLidChecked: true, evidence: 'Synthetic packing-trial description for isolated tests.' });
const approved = (value = draft(), boxId = 'box-2') => buildApprovedPolicy({ boxId, rules: value.rules,
  version: 1, approvedBy: adminId, approvedAt: approvalDate });

test('all 12 boxes can have an unsupplied draft without inferring physical approval', () => {
  for (const box of FIXED_COMPONENTS.filter(item => item.category === 'box')) {
    const empty = { rules: null, packing: null };
    assert.deepEqual(policyDraftInput.parse({ expectedRevision: 0, ...empty }), { expectedRevision: 0, ...empty });
    assert.deepEqual(canonicalizePolicyDraft(box.id, empty), empty);
    assert.throws(() => validatePolicyApprovalReady(box.id, empty), ZodError);
    assert.match(policyContentHash(box.id, null, null), /^[a-f0-9]{64}$/);
  }
  assert.deepEqual(GIFT_BOX_FULFILLMENT_POLICIES, []);
  for (const boxId of ['box-13', 'rose-red', '__proto__']) assert.throws(() => canonicalizePolicyDraft(boxId, { rules: null, packing: null }), ZodError);
});

test('draft rules reuse strict policy validation and keep every approval field absent', () => {
  const input = draft(), before = structuredClone(input);
  const saved = canonicalizePolicyDraft('box-2', input), pending = buildPendingPolicy('box-2', input.rules);
  assert.equal(pending.status, 'pending'); assert.equal(pending.approvedBy, null); assert.equal(pending.approvedAt, null);
  assert.equal(pending.withdrawnAt, null); assert.equal(pending.policyVersion, 'pending');
  assert.ok(Object.isFrozen(saved)); assert.ok(Object.isFrozen(saved.rules.componentRules));
  assert.equal(Object.isFrozen(input), false); assert.deepEqual(input, before);
  assert.throws(() => assertGiftBoxFulfillment(giftCartConfiguration(), pending), { code: 'GIFT_BOX_FULFILLMENT_UNAPPROVED' });
});

test('unknown fields and client approval, version, hash or capacity claims are rejected', () => {
  for (const key of ['approvedBy', 'approvedAt', 'policyVersion', 'policyId', 'contentHash', 'status', 'physicallyApproved', 'dimensionsCm']) {
    assert.throws(() => policyDraftInput.parse({ expectedRevision: 0, ...draft(), [key]: 'forged' }), ZodError);
    assert.throws(() => policyApprovalInput.parse({ ...approval(), [key]: 'forged' }), ZodError);
  }
  const unknownRule = draft(); unknownRule.rules.componentRules[0].physicalFit = true;
  assert.throws(() => canonicalizePolicyDraft('box-2', unknownRule), ZodError);
  const unknownPacking = draft(); unknownPacking.packing.guaranteedFit = true;
  assert.throws(() => canonicalizePolicyDraft('box-2', unknownPacking), ZodError);
  const malicious = JSON.parse('{"expectedRevision":0,"rules":null,"packing":null,"__proto__":{"approved":true}}');
  assert.throws(() => policyDraftInput.parse(malicious), ZodError);
  assert.equal({}.approved, undefined);
});

test('invalid rule identities, quantities, categories and cross-field associations fail closed', () => {
  for (const mutate of [
    value => { value.rules.componentRules[0].componentId = 'chocolate-999'; },
    value => { value.rules.componentRules[0].componentId = 'box-2'; },
    value => { value.rules.componentRules[0].maxQuantity = 0; },
    value => { value.rules.componentRules[0].maxQuantity = 1.1; },
    value => { value.rules.componentRules[0].allowedRegionIds = ['unknown-region']; },
    value => { value.rules.componentRules.push(structuredClone(value.rules.componentRules[0])); },
    value => { value.rules.regions.push(structuredClone(value.rules.regions[0])); },
    value => { value.rules.limits.maxUnits = Number.MAX_SAFE_INTEGER; },
    value => { value.rules.limits.mixedContentLimits[0].categories = ['plush', 'box']; },
  ]) {
    const input = draft(); mutate(input);
    assert.throws(() => canonicalizePolicyDraft('box-2', input), ZodError);
  }
});

test('revision contracts reject unsafe, negative, coerced and fractional revisions', () => {
  for (const expectedRevision of [-1, 1.5, '1', Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => policyDraftInput.parse({ expectedRevision, ...draft() }), ZodError);
    assert.throws(() => policyApprovalInput.parse({ ...approval(), expectedRevision }), ZodError);
    assert.throws(() => policyWithdrawalInput.parse({ expectedRevision, reason: 'Synthetic explicit withdrawal reason.' }), ZodError);
  }
});

test('approval action requires all explicit attestations and bounded substantive evidence', () => {
  assert.equal(policyApprovalInput.parse(approval()).confirmPackingTested, true);
  for (const field of ['confirmPackingTested', 'confirmSafeTransport', 'confirmLidChecked']) {
    const missing = approval(); delete missing[field];
    assert.throws(() => policyApprovalInput.parse(missing), ZodError);
    assert.throws(() => policyApprovalInput.parse({ ...approval(), [field]: false }), ZodError);
    assert.throws(() => policyApprovalInput.parse({ ...approval(), [field]: 'true' }), ZodError);
  }
  for (const evidence of ['', ' '.repeat(30), 'too short', 'a'.repeat(2001), '\ud800'.repeat(30), 'Evidence\u0000'.repeat(5)]) {
    assert.throws(() => policyApprovalInput.parse({ ...approval(), evidence }), ZodError);
  }
  assert.equal(policyApprovalInput.parse({ ...approval(), evidence: `  ${'🌹'.repeat(2000)}  ` }).evidence, '🌹'.repeat(2000));
  assert.throws(() => policyApprovalInput.parse({ ...approval(), evidence: '🌹'.repeat(2001) }), ZodError);
});

test('withdrawal requires an explicit bounded literal review reason', () => {
  assert.equal(policyWithdrawalInput.parse({ expectedRevision: 3, reason: '  Withdrawn after a synthetic retest.  ' }).reason, 'Withdrawn after a synthetic retest.');
  for (const reason of ['', 'short', ' '.repeat(50), '🌹'.repeat(1001), 'x\u0000'.repeat(10)]) {
    assert.throws(() => policyWithdrawalInput.parse({ expectedRevision: 3, reason }), ZodError);
  }
  assert.throws(() => policyWithdrawalInput.parse({ expectedRevision: 3, reason: 'Synthetic reason.', approvedBy: adminId }), ZodError);
});

test('approval readiness requires supplied packing, relevant instructions and an explicit lid mode', () => {
  assert.deepEqual(validatePolicyApprovalReady('box-2', draft()), canonicalizePolicyDraft('box-2', draft()));
  for (const field of ['clearanceNotes', 'transportNotes', 'plushHandlingNotes']) {
    const input = draft(); input.packing[field] = ' ';
    assert.doesNotThrow(() => canonicalizePolicyDraft('box-2', input));
    assert.throws(() => validatePolicyApprovalReady('box-2', input), ZodError);
  }
  const noPacking = draft(); noPacking.packing = null;
  assert.throws(() => validatePolicyApprovalReady('box-2', noPacking), ZodError);
  const unknownLid = draft(); unknownLid.packing.lidMode = 'guaranteed-fit';
  assert.throws(() => canonicalizePolicyDraft('box-2', unknownLid), ZodError);
  const noPlush = draft(); noPlush.rules.componentRules = noPlush.rules.componentRules.filter(rule => rule.componentId !== 'plush-1'); noPlush.packing.plushHandlingNotes = '';
  assert.doesNotThrow(() => validatePolicyApprovalReady('box-2', noPlush));
  for (const lidMode of ['open_presentation', 'not_applicable']) assert.doesNotThrow(() => validatePolicyApprovalReady('box-2', { ...draft(), packing: { ...draft().packing, lidMode } }));
});

test('approval readiness requires all conservative mixed combinations and a selected-compatible ribbon', () => {
  const missingCombination = draft(); missingCombination.rules.limits.mixedContentLimits.pop();
  assert.doesNotThrow(() => canonicalizePolicyDraft('box-2', missingCombination));
  assert.throws(() => validatePolicyApprovalReady('box-2', missingCombination), ZodError);
  const noRibbon = draft(); noRibbon.rules.componentRules = noRibbon.rules.componentRules.filter(rule => rule.componentId !== 'ribbon-navy');
  assert.throws(() => validatePolicyApprovalReady('box-2', noRibbon), ZodError);
  const zero = draft(); zero.rules.limits.mixedContentLimits.forEach(rule => { rule.maxUnits = 0; });
  assert.doesNotThrow(() => validatePolicyApprovalReady('box-2', zero));
  assert.throws(() => assertGiftBoxFulfillment(giftCartConfiguration(), approved(zero)), { code: 'GIFT_BOX_FULFILLMENT_LIMIT' });
});

test('canonical content identity normalizes order-insensitive rule collections without changing associations', () => {
  const first = draft(); first.rules.regions.push({ regionId: 'test-beside', zone: 'beside', compartmentId: null });
  first.rules.componentRules.find(rule => rule.componentId === 'plush-1').allowedRegionIds.push('test-beside');
  const reordered = structuredClone(first);
  reordered.rules.regions.reverse(); reordered.rules.componentRules.reverse();
  reordered.rules.componentRules.forEach(rule => rule.allowedRegionIds.reverse());
  reordered.rules.limits.mixedContentLimits.reverse(); reordered.rules.limits.mixedContentLimits.forEach(rule => rule.categories.reverse());
  reordered.packing.clearanceNotes = `  ${reordered.packing.clearanceNotes}  `;
  assert.equal(policyContentHash('box-2', first.rules, first.packing), policyContentHash('box-2', reordered.rules, reordered.packing));
  assert.deepEqual(canonicalizePolicyDraft('box-2', first), canonicalizePolicyDraft('box-2', reordered));
  const changed = structuredClone(first); changed.rules.componentRules.find(rule => rule.componentId === 'plush-1').allowedRegionIds = ['test-beside'];
  assert.notEqual(policyContentHash('box-2', first.rules, first.packing), policyContentHash('box-2', changed.rules, changed.packing));
});

test('different tested content and handling instructions retain distinct content hashes', () => {
  const first = draft(), originalHash = policyContentHash('box-2', first.rules, first.packing);
  for (const mutate of [
    value => { value.rules.limits.maxUnits -= 1; },
    value => { value.rules.componentRules[0].maxQuantity -= 1; },
    value => { value.packing.lidMode = 'open_presentation'; },
    value => { value.packing.transportNotes += ' Additional reviewed support.'; },
  ]) {
    const changed = structuredClone(first); mutate(changed);
    assert.notEqual(policyContentHash('box-2', changed.rules, changed.packing), originalHash);
  }
  assert.notEqual(policyContentHash('box-3', first.rules, first.packing), originalHash);
});

test('published policy uses server identity, version and approval metadata without granting physical simulation claims', () => {
  const input = draft(), policy = approved(input);
  assert.equal(policy.policyId, 'gift-box-box-2'); assert.equal(policy.policyVersion, 'v1');
  assert.equal(policy.approvedBy, adminId); assert.equal(policy.approvedAt, approvalDate.toISOString()); assert.equal(policy.status, 'approved');
  assert.ok(Object.isFrozen(policy.componentRules));
  assert.equal(assertGiftBoxFulfillment(giftCartConfiguration(), policy).physicalFitCertifiedByGeometry, false);
  const next = buildApprovedPolicy({ boxId: 'box-2', rules: input.rules, version: 2, approvedBy: '200000000000000000000002', approvedAt: new Date('2026-10-29T09:00:00Z') });
  assert.equal(next.policyVersion, 'v2'); assert.equal(policy.policyVersion, 'v1');
  for (const patch of [{ version: 0 }, { version: 1.5 }, { version: '2' }, { approvedBy: 'browser-admin' }, { approvedAt: '2026-10-28T09:00:00Z' }, { approvedAt: new Date(NaN) }]) {
    assert.throws(() => buildApprovedPolicy({ boxId: 'box-2', rules: input.rules, version: 1, approvedBy: adminId, approvedAt: approvalDate, ...patch }), ZodError);
  }
});

test('Box 11 draft and approval preserve two compartments and require reviewed anti-bridging instructions', () => {
  const input = draft('box-11');
  assert.doesNotThrow(() => validatePolicyApprovalReady('box-11', input));
  const pending = buildPendingPolicy('box-11', input.rules); assert.equal(pending.compartments.length, 2);
  const noInstructions = structuredClone(input); noInstructions.packing.compartmentNotes = '';
  assert.throws(() => validatePolicyApprovalReady('box-11', noInstructions), ZodError);
  for (const mutate of [
    value => { value.rules.compartments.pop(); },
    value => { value.rules.regions[0].compartmentId = null; },
    value => { value.rules.regions[0].compartmentId = 'bridge-between-wells'; },
    value => { value.rules.regions.push({ regionId: 'shared-bridge', zone: 'inside', compartmentId: null }); },
  ]) {
    const invalid = structuredClone(input); mutate(invalid);
    assert.throws(() => canonicalizePolicyDraft('box-11', invalid), ZodError);
  }
});

test('packing instructions are bounded literal Unicode and never accept invented measurement fields', () => {
  const input = draft(); input.packing.clearanceNotes = '🌹'.repeat(1000);
  assert.equal(Array.from(canonicalizePolicyDraft('box-2', input).packing.clearanceNotes).length, 1000);
  for (const value of ['🌹'.repeat(1001), '\ud800', 'bad\u0000text']) {
    const invalid = draft(); invalid.packing.clearanceNotes = value;
    assert.throws(() => canonicalizePolicyDraft('box-2', invalid), ZodError);
  }
  const unsafe = draft(); unsafe.packing.boxWidthCm = 10;
  assert.throws(() => canonicalizePolicyDraft('box-2', unsafe), ZodError);
});
