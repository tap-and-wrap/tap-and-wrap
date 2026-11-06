import { z } from 'zod';
import { APPEARANCES, PERSONAL_TYPES, FONT_REGISTRY, ICON_REGISTRY, engravingUploadIds } from '../../../shared/engraving/definitions.mjs';
const slug = z.string().regex(/^[a-z][a-z0-9-]{0,79}$/);
const text = max => z.string().trim().max(max).refine(value => value.isWellFormed() && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value));
const id = z.string().regex(/^[a-f0-9]{24}$/i);
const status = z.enum(['active','disabled','retired']);
export const configurationInput = z.object({ typeId: slug, name: text(120).min(1), pricePiastres: z.number().int().positive().max(100000000), displayOrder: z.number().int().min(0).max(10000), status,
  placements: z.array(z.object({ id: slug, label: text(120).min(1), status, displayOrder: z.number().int().min(0).max(10000) }).strict()).max(30).refine(values => new Set(values.map(value => value.id)).size === values.length),
  fontIds: z.array(z.enum(FONT_REGISTRY.map(font => font.id))).max(20).refine(values => new Set(values).size === values.length),
  iconIds: z.array(z.enum(ICON_REGISTRY.map(icon => icon.id))).max(30).refine(values => new Set(values).size === values.length),
  assetsApproved: z.boolean(), maxLines: z.number().int().min(1).max(5), maxCharacters: z.number().int().min(1).max(500), maxCharactersPerLine: z.number().int().min(1).max(200),
}).strict().refine(value => value.status !== 'active' || value.assetsApproved && value.fontIds.length > 0 && value.iconIds.length > 0, 'Approve production assets and choose fonts/icons before enabling a type.');
export const specificationInput = z.object({ contractVersion: z.literal('engraving-spec-v1'), itemKey: z.uuid(), typeId: slug, configurationVersion: z.number().int().positive(), description: text(300),
  placement: z.discriminatedUnion('kind', [z.object({ kind: z.literal('help') }).strict(), z.object({ kind: z.literal('selected'), placementId: slug }).strict()]),
  content: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('text'), text: text(2000).min(1), fontId: z.enum(FONT_REGISTRY.map(font => font.id)) }).strict(),
    z.object({ mode: z.literal('icons'), iconId: z.enum(ICON_REGISTRY.map(icon => icon.id)) }).strict(),
    z.object({ mode: z.literal('personal'), subtype: z.enum(PERSONAL_TYPES), artworkUploadId: id }).strict(),
  ]), requestedAppearance: z.enum(APPEARANCES), specialRequests: text(1000), itemPhotoUploadId: id, surfacePhotoUploadId: id.optional(),
}).strict();
export const engravingCartInput = z.object({ kind: z.literal('engraving_service_v1'), operationKey: z.uuid(), quantity: z.literal(1), specification: specificationInput, reviewFingerprint: z.string().regex(/^[a-f0-9]{64}$/), replaceLineId: z.uuid().optional(), replaceFingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional() }).strict();
// Quotes use the same strict specification. Local placeholder IDs may be used before
// upload, but a quote never claims to verify ownership/files; Add always does so.
export const quoteInput = z.object({ specification: specificationInput }).strict();
export const snapshotInput = z.object({ snapshotVersion: z.literal('engraving-order-v1'), specification: specificationInput, configuration: configurationInput,
  configurationVersion: z.number().int().positive(), font: z.object({ id: z.string(), label: z.string(), source: z.string(), license: z.string() }).strict().nullable(),
  icon: z.object({ id: z.string(), label: z.string(), asset: z.string(), version: z.number().int() }).strict().nullable(), customerOwnedItem: z.literal(true), suitabilityReviewRequired: z.literal(true),
}).strict().superRefine((value, context) => {
  if (value.configuration.typeId !== value.specification.typeId || value.configurationVersion !== value.specification.configurationVersion) context.addIssue({ code: 'custom', message: 'Snapshot configuration must match the specification.' });
  const spec=value.specification,content=spec.content,config=value.configuration;
  const expectedFont=FONT_REGISTRY.find(font=>font.id===content.fontId),expectedIcon=ICON_REGISTRY.find(icon=>icon.id===content.iconId);
  const correctFont=content.mode==='text' ? value.font && config.fontIds.includes(content.fontId) && ['id','label','source','license'].every(key=>value.font[key]===expectedFont?.[key]) : value.font===null;
  const correctIcon=content.mode==='icons' ? value.icon && config.iconIds.includes(content.iconId) && ['id','label','asset','version'].every(key=>value.icon[key]===expectedIcon?.[key]) : value.icon===null;
  const ids=engravingUploadIds(spec);
  if(!correctFont||!correctIcon||new Set(ids).size!==ids.length||config.status!=='active'||!config.assetsApproved
    ||spec.placement.kind==='selected'&&!config.placements.some(placement=>placement.id===spec.placement.placementId&&placement.status==='active')) context.addIssue({code:'custom',message:'Snapshot the exact approved assets, placement and distinct private file roles.'});
});
export const engravingOrderLineInput=z.object({kind:z.literal('engraving_service_v1'),name:text(240).min(1),quantity:z.literal(1),unitPricePiastres:z.number().int().positive().max(100000000),lineTotalPiastres:z.number().int().positive().max(100000000),engraving:snapshotInput}).strict().superRefine((line,context)=>{
  if(line.lineTotalPiastres!==line.unitPricePiastres||line.engraving.configuration.pricePiastres!==line.unitPricePiastres)context.addIssue({code:'custom',message:'Charge exactly the approved type price once.'});
});
export function validEngravingLine(line) {
  return engravingOrderLineInput.safeParse(line).success;
}
