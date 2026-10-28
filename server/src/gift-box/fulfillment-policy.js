import { z } from 'zod';
import { ASSET_VERSION, CATALOG_VERSION, GEOMETRY_VERSION, deepFreeze, getFixedComponent } from '../../../shared/gift-box/definitions.mjs';
import { GIFT_BOX_COMMERCE_DRAFT_REFERENCE_VERSION } from '../../../shared/gift-box/commerce-contract.mjs';
import { giftBoxV2CommerceInput } from './commerce-contract.js';
import { builderError, componentId, MAX_ADDITIONAL_ITEMS, MAX_ITEM_QUANTITY } from './validation.js';

export const GIFT_BOX_FULFILLMENT_POLICY_CONTRACT_VERSION = 'gift-box-fulfillment-policy-v1';
// No real box has an owner-reviewed fulfillment policy. A draft photo region,
// approved business setting or apparently plausible arrangement cannot add one.
export const GIFT_BOX_FULFILLMENT_POLICIES = deepFreeze([]);
export const getGiftBoxFulfillmentPolicy = boxId => GIFT_BOX_FULFILLMENT_POLICIES.find(policy => policy.boxId === boxId) ?? null;

const label = z.string().regex(/^[a-z][a-z0-9-]{0,79}$/);
const version = z.string().regex(/^[a-z][a-z0-9.-]{0,99}$/);
const units = z.number().int().min(0).max(MAX_ADDITIONAL_ITEMS);
const categories = ['flower', 'plush', 'chocolate'];
const timestamp = z.iso.datetime({ offset: true }).nullable();
const categoryLimits = z.object({ flower: units, plush: units, chocolate: units }).strict();

export const giftBoxFulfillmentPolicyInput = z.object({
  contractVersion: z.literal(GIFT_BOX_FULFILLMENT_POLICY_CONTRACT_VERSION),
  policyId: label, policyVersion: version, boxId: componentId,
  status: z.enum(['pending', 'approved', 'withdrawn']),
  approvedBy: z.string().min(1).max(120).refine(value => value.isWellFormed() && !/[\u0000-\u001f\u007f]/u.test(value)).nullable(),
  approvedAt: timestamp, withdrawnAt: timestamp,
  catalogVersion: z.literal(CATALOG_VERSION), assetVersion: z.literal(ASSET_VERSION), geometryVersion: z.literal(GEOMETRY_VERSION),
  draftGeometryVersion: z.literal(GIFT_BOX_COMMERCE_DRAFT_REFERENCE_VERSION),
  regions: z.array(z.object({ regionId: label, zone: z.enum(['inside', 'beside']), compartmentId: label.nullable() }).strict()).max(32),
  compartments: z.array(z.object({ id: label, maxUnits: units }).strict()).max(8),
  componentRules: z.array(z.object({
    componentId, maxQuantity: z.number().int().min(1).max(MAX_ITEM_QUANTITY),
    allowedRegionIds: z.array(label).max(32), oversizedPlush: z.boolean(), allowOversizedInside: z.boolean(),
  }).strict()).max(100),
  limits: z.object({
    maxUnits: units, maxByCategory: categoryLimits,
    // Each rule bounds the sum of the listed categories when at least two of
    // those categories are present. These are reviewed counts, not dimensions.
    mixedContentLimits: z.array(z.object({ categories: z.array(z.enum(categories)).min(2).max(3), maxUnits: units }).strict()).max(4),
  }).strict(),
}).strict().superRefine((policy, context) => {
  const issue = (path, message) => context.addIssue({ code: 'custom', path, message });
  if (getFixedComponent(policy.boxId)?.category !== 'box') issue(['boxId'], 'Choose one recognized box.');
  if (policy.status === 'approved' && (!policy.approvedBy?.trim() || !policy.approvedAt || policy.withdrawnAt)) issue(['status'], 'Active approval requires review metadata and no withdrawal.');
  if (policy.status === 'pending' && (policy.approvedBy !== null || policy.approvedAt !== null || policy.withdrawnAt !== null)) issue(['status'], 'Pending policies cannot claim approval or withdrawal.');
  if (policy.status === 'withdrawn' && !policy.withdrawnAt) issue(['withdrawnAt'], 'Record policy withdrawal explicitly.');
  const regions = new Map(policy.regions.map(region => [region.regionId, region]));
  const compartments = new Map(policy.compartments.map(compartment => [compartment.id, compartment]));
  if (regions.size !== policy.regions.length) issue(['regions'], 'Policy regions must have distinct identities.');
  if (compartments.size !== policy.compartments.length) issue(['compartments'], 'Compartments must have distinct identities.');
  if (new Set(policy.componentRules.map(rule => rule.componentId)).size !== policy.componentRules.length) issue(['componentRules'], 'Each component needs one policy rule.');
  for (const [index, region] of policy.regions.entries()) {
    if (region.compartmentId !== null && (!compartments.has(region.compartmentId) || region.zone !== 'inside')) issue(['regions', index], 'Only an inside region can belong to one recognized compartment.');
  }
  for (const [index, rule] of policy.componentRules.entries()) {
    const definition = getFixedComponent(rule.componentId);
    if (!definition || definition.category === 'box') { issue(['componentRules', index, 'componentId'], 'Use a recognized non-box builder component.'); continue; }
    const placed = categories.includes(definition.category);
    if (new Set(rule.allowedRegionIds).size !== rule.allowedRegionIds.length || rule.allowedRegionIds.some(id => !regions.has(id))) issue(['componentRules', index, 'allowedRegionIds'], 'Use distinct recognized policy regions.');
    if (placed && !rule.allowedRegionIds.length || !placed && rule.allowedRegionIds.length) issue(['componentRules', index, 'allowedRegionIds'], 'Only placed components require approved regions.');
    if (!placed && rule.maxQuantity !== 1) issue(['componentRules', index, 'maxQuantity'], 'Finishing components are selected once per box.');
    if (definition.category !== 'plush' && (rule.oversizedPlush || rule.allowOversizedInside || rule.allowedRegionIds.some(id => regions.get(id)?.zone === 'beside'))) issue(['componentRules', index], 'Beside and oversized permissions apply only to plush toys.');
    if (rule.allowOversizedInside && !rule.oversizedPlush) issue(['componentRules', index, 'allowOversizedInside'], 'Explicit inside approval applies only to an oversized plush.');
  }
  const mixedSets = new Set();
  for (const [index, rule] of policy.limits.mixedContentLimits.entries()) {
    const key = [...rule.categories].sort().join(',');
    if (new Set(rule.categories).size !== rule.categories.length || mixedSets.has(key)) issue(['limits', 'mixedContentLimits', index], 'Use distinct category combinations.');
    mixedSets.add(key);
  }
  if (policy.boxId === 'box-11') {
    if (policy.compartments.length !== 2) issue(['compartments'], 'Box 11 requires two separately reviewed compartments.');
    if (policy.regions.filter(region => region.zone === 'inside').some(region => region.compartmentId === null)) issue(['regions'], 'Every Box 11 inside region belongs to exactly one compartment; shared bridging regions are prohibited.');
    if (policy.compartments.some(compartment => !policy.regions.some(region => region.zone === 'inside' && region.compartmentId === compartment.id))) issue(['compartments'], 'Each Box 11 compartment needs its own inside region.');
  }
});

export function assertGiftBoxFulfillment(rawConfiguration, rawPolicy) {
  const configuration = giftBoxV2CommerceInput.parse(rawConfiguration);
  if (!rawPolicy) throw builderError(409, 'GIFT_BOX_FULFILLMENT_UNAPPROVED', 'This box requires a reviewed physical fulfillment policy before direct commerce.');
  const parsed = giftBoxFulfillmentPolicyInput.safeParse(rawPolicy);
  if (!parsed.success) throw builderError(409, 'GIFT_BOX_FULFILLMENT_POLICY_INVALID', 'The fulfillment policy is invalid or uses unsupported versions.');
  const policy = parsed.data;
  if (policy.status === 'withdrawn') throw builderError(409, 'GIFT_BOX_FULFILLMENT_WITHDRAWN', 'The physical fulfillment policy has been withdrawn.');
  if (policy.status !== 'approved') throw builderError(409, 'GIFT_BOX_FULFILLMENT_UNAPPROVED', 'This box requires an approved physical fulfillment policy.');
  if (policy.boxId !== configuration.selection.boxId) throw builderError(409, 'GIFT_BOX_FULFILLMENT_POLICY_MISMATCH', 'Use the current policy for the selected box.');
  const rules = new Map(policy.componentRules.map(rule => [rule.componentId, rule]));
  const selection = [...configuration.selection.items, { componentId: configuration.selection.ribbonId, quantity: 1 },
    ...(configuration.selection.giftCard ? [{ componentId: configuration.selection.giftCard.componentId, quantity: 1 }] : [])];
  for (const item of selection) {
    const rule = rules.get(item.componentId);
    if (!rule || item.quantity > rule.maxQuantity) throw builderError(409, 'GIFT_BOX_FULFILLMENT_INCOMPATIBLE', 'A selected component or quantity is incompatible with this box policy.');
  }
  const counts = Object.fromEntries(categories.map(category => [category, 0]));
  for (const item of configuration.selection.items) counts[getFixedComponent(item.componentId).category] += item.quantity;
  if (configuration.placements.length > policy.limits.maxUnits || categories.some(category => counts[category] > policy.limits.maxByCategory[category])
    || policy.limits.mixedContentLimits.some(rule => rule.categories.filter(category => counts[category] > 0).length >= 2
      && rule.categories.reduce((sum, category) => sum + counts[category], 0) > rule.maxUnits)) {
    throw builderError(409, 'GIFT_BOX_FULFILLMENT_LIMIT', 'The selection exceeds the reviewed conservative content limits.');
  }
  const regions = new Map(policy.regions.map(region => [region.regionId, region]));
  const compartmentCounts = new Map(policy.compartments.map(compartment => [compartment.id, 0]));
  for (const placement of configuration.placements) {
    const rule = rules.get(placement.componentId), region = regions.get(placement.regionId);
    if (!region || region.zone !== placement.zone || !rule.allowedRegionIds.includes(region.regionId)
      || rule.oversizedPlush && placement.zone === 'inside' && !rule.allowOversizedInside) {
      throw builderError(409, 'GIFT_BOX_FULFILLMENT_PLACEMENT', 'A placement lacks approval for this region, zone or oversized plush.');
    }
    if (region.compartmentId !== null) compartmentCounts.set(region.compartmentId, compartmentCounts.get(region.compartmentId) + 1);
  }
  if (policy.compartments.some(compartment => compartmentCounts.get(compartment.id) > compartment.maxUnits)) {
    throw builderError(409, 'GIFT_BOX_FULFILLMENT_COMPARTMENT_LIMIT', 'A compartment exceeds its separately reviewed content limit.');
  }
  // Coordinates and region labels remain visual metadata. This result reports
  // compatibility with explicit owner rules; it is not a packing simulation or
  // certification of a physical footprint across a compartment boundary.
  return deepFreeze({ directCommerceEligible: true, physicalFitCertifiedByGeometry: false,
    policyReference: { contractVersion: policy.contractVersion, policyId: policy.policyId, policyVersion: policy.policyVersion,
      boxId: policy.boxId, approvedBy: policy.approvedBy, approvedAt: policy.approvedAt,
      catalogVersion: policy.catalogVersion, assetVersion: policy.assetVersion, geometryVersion: policy.geometryVersion,
      draftGeometryVersion: policy.draftGeometryVersion } });
}
