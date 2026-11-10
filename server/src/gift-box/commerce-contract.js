import { createHash } from 'node:crypto';
import { z } from 'zod';
import { ASSET_VERSION, CATALOG_VERSION, GEOMETRY_VERSION, deepFreeze, getFixedComponent } from '../../../shared/gift-box/definitions.mjs';
import {
  GIFT_BOX_FREE_PLACEMENT_VERSION, GIFT_BOX_COMMERCE_KIND, GIFT_BOX_COMMERCE_CONTRACT_VERSION,
  GIFT_BOX_CONFIGURATION_IDENTITY_VERSION, GIFT_BOX_COMMERCE_COORDINATE_SYSTEM,
  GIFT_BOX_COMMERCE_DRAFT_REFERENCE_VERSION,
} from '../../../shared/gift-box/commerce-contract.mjs';
import { componentId, giftCardMessage, MAX_ITEM_QUANTITY, MAX_ADDITIONAL_ITEMS } from './validation.js';
import { parseGiftBoxPersonalizationIntent } from '../../../shared/gift-box/personalization-intent.mjs';
import { photoPrintFootprint } from '../../../shared/gift-box/photo-presentation.mjs';
import { FREE_PRESENTATIONS,presentationAspect } from '../../../shared/gift-box/presentation.mjs';

const recognizedId = categories => componentId.refine(id => categories.includes(getFixedComponent(id)?.category), 'Choose a recognized component in the required category.');
const coordinate = z.number().finite().min(0).max(1).transform(value => value === 0 ? 0 : value);
const selection = z.object({
  boxId: recognizedId(['box']),
  items: z.array(z.object({ componentId: recognizedId(['flower', 'plush', 'chocolate']), quantity: z.number().int().min(1).max(MAX_ITEM_QUANTITY) }).strict()).max(100).default([]),
  ribbonId: recognizedId(['ribbon']).nullable(),
  giftCard: z.object({ componentId: recognizedId(['gift_card']), message: giftCardMessage.default('') }).strict().nullable().default(null),
}).strict().superRefine((input, context) => {
  if (new Set(input.items.map(item => item.componentId)).size !== input.items.length) context.addIssue({ code: 'custom', path: ['items'], message: 'Each component must occur in one quantity line.' });
  if (input.items.reduce((total, item) => total + item.quantity, 0) > MAX_ADDITIONAL_ITEMS) context.addIssue({ code: 'custom', path: ['items'], message: 'The selection exceeds the computational item limit.' });
});

export const giftBoxV2CommerceInput = z.object({
  kind: z.literal(GIFT_BOX_COMMERCE_KIND),
  contractVersion: z.enum([GIFT_BOX_COMMERCE_CONTRACT_VERSION, GIFT_BOX_FREE_PLACEMENT_VERSION]),
  catalogVersion: z.literal(CATALOG_VERSION), assetVersion: z.literal(ASSET_VERSION),
  geometryVersion: z.literal(GEOMETRY_VERSION),
  draftGeometryVersion: z.literal(GIFT_BOX_COMMERCE_DRAFT_REFERENCE_VERSION),
  coordinateSystem: z.literal(GIFT_BOX_COMMERCE_COORDINATE_SYSTEM),
  presentationVersion: z.enum(FREE_PRESENTATIONS).optional(),
  selection,
  personalizationIntent: z.custom(value => { try {
    const intent = parseGiftBoxPersonalizationIntent(value);
    return intent.photoPrints.length + intent.engravings.length + (intent.sticker ? 1 : 0) > 0;
  } catch { return false; } }, 'Invalid personalized Gift Box selection.').optional(),
  ribbonPlacement: z.object({ x: coordinate, y: coordinate, width: coordinate, height: coordinate, zone: z.enum(['inside','beside']), layer: z.number().int().min(0).max(1000) }).strict().nullable().optional(),
  placements: z.array(z.object({
    instanceId: z.uuid(), componentId: recognizedId(['flower', 'plush', 'chocolate']),
    x: coordinate, y: coordinate, zone: z.enum(['inside', 'beside']),
    regionId: z.string().regex(/^[a-z][a-z0-9-]{0,79}$/),
    width: coordinate.optional(), height: coordinate.optional(),
    layer: z.number().int().min(0).max(1000),
  }).strict()).max(MAX_ADDITIONAL_ITEMS),
}).strict().superRefine((input, context) => {
  const free = input.contractVersion === GIFT_BOX_FREE_PLACEMENT_VERSION;
  if (!free && input.presentationVersion) context.addIssue({ code:'custom',message:'Presentation revision requires free placement.' });
  if (input.personalizationIntent && (['gift-box-personalization-intent-v2','gift-box-personalization-intent-v3'].includes(input.personalizationIntent.version)) !== free) context.addIssue({ code:'custom',message:'Personalization coordinates must match the placement contract version.' });
  if (input.personalizationIntent?.sticker?.placement && input.personalizationIntent.sticker.placement.boxId !== input.selection.boxId) context.addIssue({code:'custom',message:'Sticker placement must match the selected box.'});
  const issue = message => context.addIssue({ code: 'custom', message });
  const visible = item => item && item.width > 0 && item.height > 0 && item.x + item.width <= 1.000001 && item.y + item.height <= 1.000001;
  if (free) {
    const aspect=presentationAspect(input.selection.boxId,input.presentationVersion);
    if (Array.isArray(input.personalizationIntent?.photoPrints) && input.personalizationIntent.photoPrints.some(photo=>photo.aspectRatio !== undefined && !visible({...photo,...photoPrintFootprint(photo.aspectRatio,aspect,input.presentationVersion)}))) issue('Every photo must remain within the visible workspace.');
    if (input.placements.some(item => !visible(item) || item.regionId !== 'workspace')) issue('Every object needs a visible workspace footprint.');
    if (!Object.hasOwn(input, 'ribbonPlacement') || Boolean(input.ribbonPlacement) !== Boolean(input.selection.ribbonId) || input.ribbonPlacement && !visible(input.ribbonPlacement)) issue('Persist the selected ribbon position.');
  } else if (Object.hasOwn(input, 'ribbonPlacement') || input.placements.some(item => item.width !== undefined || item.height !== undefined)) issue('v1 placement fields cannot be reinterpreted.');
  if (new Set(input.placements.map(item => item.instanceId.toLowerCase())).size !== input.placements.length) context.addIssue({ code: 'custom', path: ['placements'], message: 'Every placed item needs a distinct instance UUID.' });
  const quantities = new Map(input.selection.items.map(item => [item.componentId, item.quantity]));
  const placed = new Map();
  input.placements.forEach((item, index) => {
    placed.set(item.componentId, (placed.get(item.componentId) ?? 0) + 1);
    if (input.contractVersion !== GIFT_BOX_FREE_PLACEMENT_VERSION && item.zone === 'beside' && !['plush', 'chocolate'].includes(getFixedComponent(item.componentId)?.category)) context.addIssue({ code: 'custom', path: ['placements', index, 'zone'], message: 'Only plush toys and chocolates may use beside-box proposals.' });
  });
  if (placed.size !== quantities.size || [...quantities].some(([id, quantity]) => placed.get(id) !== quantity)) context.addIssue({ code: 'custom', path: ['placements'], message: 'Place every selected item exactly once with its matching component identity.' });
});

const compareText = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const placementKey = item => JSON.stringify([item.componentId, item.zone, item.regionId, item.x, item.y, item.layer, ...(item.width === undefined ? [] : [item.width,item.height])]);

export function canonicalizeGiftBoxConfiguration(raw) {
  const input = giftBoxV2CommerceInput.parse(raw);
  // UUIDs are local editing handles, not part of the chosen arrangement. Sort
  // complete tuples before assigning deterministic handles, so associating a
  // different component with a position still produces a different identity.
  const placements = [...input.placements].sort((a, b) => compareText(placementKey(a), placementKey(b))).map((item, index) => ({
    instanceId: `00000000-0000-4000-8000-${(index + 1).toString(16).padStart(12, '0')}`,
    componentId: item.componentId, x: item.x, y: item.y, zone: item.zone, regionId: item.regionId, ...(item.width === undefined ? {} : { width: item.width, height: item.height }), layer: item.layer,
  }));
  return deepFreeze({
    kind: input.kind, contractVersion: input.contractVersion,
    catalogVersion: input.catalogVersion, assetVersion: input.assetVersion,
    geometryVersion: input.geometryVersion, draftGeometryVersion: input.draftGeometryVersion,
    coordinateSystem: input.coordinateSystem,
    ...(input.presentationVersion ? { presentationVersion: input.presentationVersion } : {}),
    selection: { boxId: input.selection.boxId,
      items: [...input.selection.items].sort((a, b) => compareText(a.componentId, b.componentId)),
      ribbonId: input.selection.ribbonId, giftCard: input.selection.giftCard },
    // Match the strict Zod schema's property order. Snapshot parsing otherwise
    // changes JSON serialization and invalidates the signed configuration ID
    // for every personalized gift (legacy gifts retain identical serialization).
    ...(input.personalizationIntent ? { personalizationIntent: parseGiftBoxPersonalizationIntent(input.personalizationIntent) } : {}),
    ...(input.contractVersion === GIFT_BOX_FREE_PLACEMENT_VERSION ? { ribbonPlacement: input.ribbonPlacement } : {}),
    placements,
  });
}

export function identifyGiftBoxConfiguration(raw) {
  const configuration = canonicalizeGiftBoxConfiguration(raw);
  const hash = createHash('sha256').update(`${GIFT_BOX_CONFIGURATION_IDENTITY_VERSION}\n${JSON.stringify(configuration)}`, 'utf8').digest('hex');
  return deepFreeze({ configuration, configurationId: `${GIFT_BOX_CONFIGURATION_IDENTITY_VERSION}:${hash}` });
}
