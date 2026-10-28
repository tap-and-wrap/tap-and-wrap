import { z } from 'zod';
import { deepFreeze, getFixedComponent } from '../../../shared/gift-box/definitions.mjs';
import { giftBoxV2CommerceInput, identifyGiftBoxConfiguration } from './commerce-contract.js';
import { addPiastres, multiplyPiastres } from './pricing.js';

export const GIFT_BOX_ORDER_SNAPSHOT_VERSION = 'gift-box-order-v1';
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const quantity = integer.min(1);
const text = z.string().min(1).max(120).refine(value => value.isWellFormed() && !/[\u0000-\u001f\u007f]/u.test(value));
const timestamp = z.string().max(60).refine(value => Number.isFinite(Date.parse(value)));
const mode = z.enum(['tracked', 'made_to_order', 'status_only']);
const component = z.object({
  componentId: text, category: z.enum(['box', 'flower', 'plush', 'chocolate', 'ribbon', 'gift_card']),
  displayName: text, unit: text, quantityPerBox: quantity, quantityForLine: quantity,
  unitPricePiastres: integer, perBoxSubtotalPiastres: integer, lineSubtotalPiastres: integer,
  priceApproval: z.enum(['paid', 'complimentary']), settingsRevision: integer,
  priceApprovedBy: z.string().regex(/^[a-f0-9]{24}$/i), priceApprovedAt: timestamp,
  inventory: z.object({ owner: z.literal('GiftBoxComponentSetting'), componentId: text, mode,
    requiredQuantity: quantity, trackedDemand: integer }).strict(),
  colorHex: z.string().regex(/^#[a-f0-9]{6}$/i).optional(),
}).strict();
const policyReference = z.object({
  contractVersion: z.literal('gift-box-fulfillment-policy-v1'), policyId: text, policyVersion: text,
  boxId: text, approvedBy: text, approvedAt: timestamp, catalogVersion: text, assetVersion: text,
  geometryVersion: text, draftGeometryVersion: text,
}).strict();
const claim = z.object({ kind: z.literal('gift_box_component'), id: text, mode, quantity,
  consumedQuantity: integer, settingsRevision: integer }).strict();

// This is an immutable order-time format. It does not query the current catalog,
// business settings, stock or policy registry when reading a historical order.
export const giftBoxOrderLineInput = z.object({
  kind: z.literal('gift_box_v2'), name: z.literal('Build Your Gift Box'),
  quantity: quantity.max(99), unitPricePiastres: integer, lineTotalPiastres: integer,
  giftBox: z.object({
    snapshotVersion: z.literal(GIFT_BOX_ORDER_SNAPSHOT_VERSION),
    configuration: giftBoxV2CommerceInput,
    configurationId: z.string().regex(/^gift-box-configuration-v1:[a-f0-9]{64}$/),
    components: z.array(component).min(2).max(103),
    fulfillment: z.object({ directCommerceEligible: z.literal(true), physicalFitCertifiedByGeometry: z.literal(false), policyReference }).strict(),
    inventoryClaims: z.array(claim).min(2).max(103),
    artwork: z.object({ status: z.literal('unavailable') }).strict(),
  }).strict(),
}).strict().superRefine((line, context) => {
  const fail = message => context.addIssue({ code: 'custom', message });
  const saved = line.giftBox;
  let identity;
  try { identity = identifyGiftBoxConfiguration(saved.configuration); }
  catch { fail('Save a valid canonical configuration.'); return; }
  if (identity.configurationId !== saved.configurationId || JSON.stringify(identity.configuration) !== JSON.stringify(saved.configuration)) fail('Save the server-derived canonical configuration and identity.');
  const selection = saved.configuration.selection;
  const expected = new Map([{ componentId: selection.boxId, quantity: 1 }, ...selection.items,
    { componentId: selection.ribbonId, quantity: 1 }, ...(selection.giftCard ? [{ componentId: selection.giftCard.componentId, quantity: 1 }] : [])]
    .map(item => [item.componentId, item.quantity]));
  if (new Set(saved.components.map(item => item.componentId)).size !== saved.components.length || saved.components.length !== expected.size) fail('Snapshot every selected component exactly once.');
  if (new Set(saved.inventoryClaims.map(item => item.id)).size !== saved.inventoryClaims.length || saved.inventoryClaims.length !== expected.size) fail('Save one explicit inventory source per component.');
  let unitTotal = 0, lineTotal = 0;
  try {
    for (const item of saved.components) {
      const definition = getFixedComponent(item.componentId);
      const required = multiplyPiastres(item.quantityPerBox, line.quantity);
      const tracked = item.inventory.mode === 'tracked' ? required : 0;
      const consumed = saved.inventoryClaims.find(value => value.id === item.componentId);
      if (!definition || definition.category !== item.category || expected.get(item.componentId) !== item.quantityPerBox
        || item.quantityForLine !== required || item.perBoxSubtotalPiastres !== multiplyPiastres(item.unitPricePiastres, item.quantityPerBox)
        || item.lineSubtotalPiastres !== multiplyPiastres(item.perBoxSubtotalPiastres, line.quantity)
        || (item.unitPricePiastres === 0 ? item.priceApproval !== 'complimentary' : item.priceApproval !== 'paid')
        || item.inventory.componentId !== item.componentId || item.inventory.requiredQuantity !== required || item.inventory.trackedDemand !== tracked
        || (item.category === 'ribbon') !== (item.inventory.mode === 'status_only')
        || !consumed || consumed.mode !== item.inventory.mode || consumed.quantity !== required || consumed.consumedQuantity !== tracked || consumed.settingsRevision !== item.settingsRevision) fail('Component prices, quantities and inventory claims must match the saved configuration.');
      unitTotal = addPiastres(unitTotal, item.perBoxSubtotalPiastres);
      lineTotal = addPiastres(lineTotal, item.lineSubtotalPiastres);
    }
    if (unitTotal !== line.unitPricePiastres || lineTotal !== line.lineTotalPiastres || multiplyPiastres(unitTotal, line.quantity) !== lineTotal) fail('Charge the completed gift exactly once.');
  } catch { fail('Snapshot amounts and quantities must use safe integer arithmetic.'); }
  const policy = saved.fulfillment.policyReference, configuration = saved.configuration;
  if (policy.boxId !== selection.boxId || ['catalogVersion', 'assetVersion', 'geometryVersion', 'draftGeometryVersion'].some(key => policy[key] !== configuration[key])) fail('The saved policy must approve the selected box and reference versions.');
});

export function giftBoxOrderLine(quoted) {
  const components = quoted.giftComponents.map(item => ({ ...item,
    priceApprovedBy: String(item.priceApprovedBy), priceApprovedAt: new Date(item.priceApprovedAt).toISOString(),
    inventory: { ...item.inventory } }));
  return deepFreeze(giftBoxOrderLineInput.parse({
    kind: 'gift_box_v2', name: 'Build Your Gift Box', quantity: quoted.quantity,
    unitPricePiastres: quoted.unitPricePiastres, lineTotalPiastres: quoted.lineTotalPiastres,
    giftBox: { snapshotVersion: GIFT_BOX_ORDER_SNAPSHOT_VERSION,
      configuration: quoted.configuration, configurationId: quoted.configurationId, components,
      fulfillment: quoted.giftFulfillment,
      inventoryClaims: components.map(item => ({ kind: 'gift_box_component', id: item.componentId,
        mode: item.inventory.mode, quantity: item.quantityForLine, consumedQuantity: item.inventory.trackedDemand,
        settingsRevision: item.settingsRevision })), artwork: { status: 'unavailable' } },
  }));
}

export function validOrderLineKinds(lines) {
  return Array.isArray(lines) && lines.every(line => line && typeof line === 'object'
    && (line.kind === undefined || line.kind === 'product' || line.kind === 'gift_box_v2' && giftBoxOrderLineInput.safeParse(line).success));
}
