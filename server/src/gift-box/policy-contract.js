import { z } from 'zod';
import { ASSET_VERSION, CATALOG_VERSION, GEOMETRY_VERSION, deepFreeze, getFixedComponent } from '../../../shared/gift-box/definitions.mjs';
import { GIFT_BOX_COMMERCE_DRAFT_REFERENCE_VERSION } from '../../../shared/gift-box/commerce-contract.mjs';
import { fingerprint } from '../commerce/pricing.js';
import { giftBoxFulfillmentPolicyInput, GIFT_BOX_FULFILLMENT_POLICY_CONTRACT_VERSION } from './fulfillment-policy.js';

export const GIFT_BOX_POLICY_CONTENT_VERSION = 'gift-box-policy-content-v1';
const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1);
const boxIdentity = z.string().refine(value => getFixedComponent(value)?.category === 'box', 'Choose one of the 12 predefined boxes.');
const text = (minimum, maximum) => z.string().trim().max(maximum * 2)
  .refine(value => value.isWellFormed() && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value), 'Use valid literal text without unsupported control characters.')
  .refine(value => Array.from(value).length >= minimum && Array.from(value).length <= maximum, `Use ${minimum}–${maximum} Unicode characters.`);

// Reuse the existing strict rule fields. Cross-field and box-specific validation
// always runs through buildPendingPolicy before a draft can be stored.
const rules = z.object({
  regions: giftBoxFulfillmentPolicyInput.shape.regions,
  compartments: giftBoxFulfillmentPolicyInput.shape.compartments,
  componentRules: giftBoxFulfillmentPolicyInput.shape.componentRules,
  limits: giftBoxFulfillmentPolicyInput.shape.limits,
}).strict();

export const policyPackingInput = z.object({
  lidMode: z.enum(['must_close', 'open_presentation', 'not_applicable']),
  clearanceNotes: text(0, 1000), transportNotes: text(0, 1000),
  plushHandlingNotes: text(0, 1000), compartmentNotes: text(0, 1000),
}).strict();

export const policyDraftInput = z.object({ expectedRevision: revision, rules: rules.nullable(), packing: policyPackingInput.nullable() }).strict();
export const policyApprovalInput = z.object({
  expectedRevision: revision,
  confirmPackingTested: z.literal(true), confirmSafeTransport: z.literal(true), confirmLidChecked: z.literal(true),
  evidence: text(20, 2000),
}).strict();
export const policyWithdrawalInput = z.object({ expectedRevision: revision, reason: text(10, 1000) }).strict();

const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
function sortedRules(rawRules) {
  const value = rules.parse(rawRules);
  return {
    regions: value.regions.toSorted((a, b) => compare(a.regionId, b.regionId)),
    compartments: value.compartments.toSorted((a, b) => compare(a.id, b.id)),
    componentRules: value.componentRules.map(rule => ({ ...rule, allowedRegionIds: rule.allowedRegionIds.toSorted(compare) }))
      .toSorted((a, b) => compare(a.componentId, b.componentId)),
    limits: { ...value.limits, mixedContentLimits: value.limits.mixedContentLimits.map(rule => ({ ...rule, categories: rule.categories.toSorted(compare) }))
      .toSorted((a, b) => compare(a.categories.join(','), b.categories.join(','))) },
  };
}

const references = () => ({ catalogVersion: CATALOG_VERSION, assetVersion: ASSET_VERSION, geometryVersion: GEOMETRY_VERSION,
  draftGeometryVersion: GIFT_BOX_COMMERCE_DRAFT_REFERENCE_VERSION });

export function buildPendingPolicy(boxId, rawRules) {
  boxIdentity.parse(boxId);
  return deepFreeze(giftBoxFulfillmentPolicyInput.parse({
    contractVersion: GIFT_BOX_FULFILLMENT_POLICY_CONTRACT_VERSION,
    policyId: `gift-box-${boxId}`, policyVersion: 'pending', boxId,
    status: 'pending', approvedBy: null, approvedAt: null, withdrawnAt: null,
    ...references(), ...sortedRules(rawRules),
  }));
}

export function canonicalizePolicyDraft(boxId, rawDraft) {
  boxIdentity.parse(boxId);
  const parsed = z.object({ rules: rules.nullable(), packing: policyPackingInput.nullable() }).strict().parse(rawDraft);
  let canonicalRules = null;
  if (parsed.rules !== null) {
    const policy = buildPendingPolicy(boxId, parsed.rules);
    canonicalRules = { regions: policy.regions, compartments: policy.compartments, componentRules: policy.componentRules, limits: policy.limits };
  }
  return deepFreeze({ rules: canonicalRules, packing: parsed.packing });
}

export function policyContentHash(boxId, rawRules, rawPacking) {
  const draft = canonicalizePolicyDraft(boxId, { rules: rawRules, packing: rawPacking });
  return fingerprint({ contentVersion: GIFT_BOX_POLICY_CONTENT_VERSION, boxId, ...references(), ...draft });
}

const approvalReady = z.object({ boxId: boxIdentity, rules, packing: policyPackingInput }).strict().superRefine((value, context) => {
  const issue = (path, message) => context.addIssue({ code: 'custom', path, message });
  const requireNote = (field, message) => { if (Array.from(value.packing[field]).length < 10) issue(['packing', field], message); };
  requireNote('clearanceNotes', 'Describe the checked lid/clearance condition, or explain why no lid applies.');
  requireNote('transportNotes', 'Describe how the tested contents are supported and transported safely.');
  if (value.rules.componentRules.some(rule => getFixedComponent(rule.componentId)?.category === 'plush')) {
    requireNote('plushHandlingNotes', 'Describe tested plush orientation, support and inside/beside handling.');
  }
  if (value.boxId === 'box-11') requireNote('compartmentNotes', 'Describe the two tested Box 11 compartments and how bridging is prevented.');
  if (!value.rules.componentRules.some(rule => getFixedComponent(rule.componentId)?.category === 'ribbon')) {
    issue(['rules', 'componentRules'], 'Approve at least one compatible ribbon for a completed gift box.');
  }
  const combinations = new Set(value.rules.limits.mixedContentLimits.map(rule => rule.categories.toSorted(compare).join(',')));
  for (const combination of ['flower,plush', 'chocolate,flower', 'chocolate,plush', 'chocolate,flower,plush']) {
    if (!combinations.has(combination)) issue(['rules', 'limits', 'mixedContentLimits'], 'Review all three mixed-category pairs and the three-category combination explicitly; zero prohibits a combination.');
  }
});

export function validatePolicyApprovalReady(boxId, rawDraft) {
  const draft = canonicalizePolicyDraft(boxId, rawDraft);
  approvalReady.parse({ boxId, ...draft });
  return draft;
}

// Server metadata is an explicit separate argument. No HTTP input contract
// accepts an actor, timestamp, version, hash, status or physical-fit claim.
export function buildApprovedPolicy({ boxId, rules: rawRules, version, approvedBy, approvedAt }) {
  const policy = buildPendingPolicy(boxId, rawRules);
  z.number().int().min(1).max(Number.MAX_SAFE_INTEGER - 1).parse(version);
  const actor = z.string().regex(/^[a-f0-9]{24}$/i).parse(approvedBy).toLowerCase();
  const date = z.date().parse(approvedAt);
  return deepFreeze(giftBoxFulfillmentPolicyInput.parse({ ...policy, policyVersion: `v${version}`, status: 'approved',
    approvedBy: actor, approvedAt: date.toISOString() }));
}
