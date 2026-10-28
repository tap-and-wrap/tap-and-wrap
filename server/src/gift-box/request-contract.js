import { z } from 'zod';
import { ASSET_VERSION, CATALOG_VERSION, GEOMETRY_VERSION } from '../../../shared/gift-box/definitions.mjs';
import { GIFT_BOX_REQUEST_CONTRACT_VERSION, GIFT_BOX_REQUEST_COORDINATE_SYSTEM, GIFT_BOX_REQUEST_KIND } from '../../../shared/gift-box/request-contract.mjs';
import { componentId, estimateInput, MAX_ADDITIONAL_ITEMS } from './validation.js';

const text = max => z.string().trim().min(1).max(max).refine(value => value.isWellFormed() && !/[\u0000-\u001f\u007f]/u.test(value), 'Use plain text without control characters.');
const coordinate = z.number().finite().min(0).max(1);
export const giftBoxV2RequestInput = z.object({
  kind: z.literal(GIFT_BOX_REQUEST_KIND), contractVersion: z.literal(GIFT_BOX_REQUEST_CONTRACT_VERSION),
  requestKey: z.uuid(), catalogVersion: z.literal(CATALOG_VERSION), assetVersion: z.literal(ASSET_VERSION), geometryVersion: z.literal(GEOMETRY_VERSION),
  // A trace label only. Draft polygons/scales are never imported as server approval.
  draftGeometryVersion: z.string().regex(/^gift-box-photo-study-\d{4}-\d{2}-\d{2}\.\d{1,6}$/),
  coordinateSystem: z.literal(GIFT_BOX_REQUEST_COORDINATE_SYSTEM), selection: estimateInput,
  placements: z.array(z.object({
    instanceId: z.uuid(), componentId, x: coordinate, y: coordinate,
    zone: z.enum(['inside', 'beside']), regionId: z.string().regex(/^[a-z][a-z0-9-]{0,79}$/),
    layer: z.number().int().min(0).max(1000),
  }).strict()).max(MAX_ADDITIONAL_ITEMS),
  customer: z.object({ name: text(100).min(2), phone: text(25).min(10), email: z.union([z.email().max(254), z.literal('')]).optional() }).strict(),
}).strict().superRefine((input, context) => {
  if (new Set(input.placements.map(item => item.instanceId)).size !== input.placements.length) context.addIssue({ code: 'custom', path: ['placements'], message: 'Every placed item needs its own distinct instance UUID.' });
  const quantities = new Map(input.selection.items.map(item => [item.componentId, item.quantity]));
  const actual = new Map();
  for (const item of input.placements) actual.set(item.componentId, (actual.get(item.componentId) || 0) + 1);
  if (actual.size !== quantities.size || [...quantities].some(([id, quantity]) => actual.get(id) !== quantity)) context.addIssue({ code: 'custom', path: ['placements'], message: 'Place every selected item exactly once with its selected component identity.' });
});
