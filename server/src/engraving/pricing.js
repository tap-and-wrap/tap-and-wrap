import { fingerprint } from '../commerce/pricing.js';
import { validateUploadReferences } from '../commerce/uploads.js';
import { commerceError } from '../commerce/errors.js';
import { currentConfiguration, requireEngraving } from './configuration.js';
import { anySpecificationInput, snapshotInput, visualSnapshotInput, visualConfigurationValid } from './contracts.js';
import { engravingUploadIds, engravingFileEntries, fontById, iconById } from '../../../shared/engraving/definitions.mjs';
const invalid = message => { throw commerceError(409, 'ENGRAVING_REVIEW_REQUIRED', message); };
export async function engravingQuote(spec, owner, { session, files = true, fence = false, allowClosed = false } = {}) {
  if (!allowClosed) requireEngraving();
  const specification = anySpecificationInput.parse(spec);
  const record = await currentConfiguration(specification.typeId, { session, fence });
  const configuration = record.configuration;
  if (record.version !== specification.configurationVersion) invalid('The engraving options or price changed. Edit and review this item again.');
  if (specification.typeId === 'other' && !specification.description) invalid('Briefly describe your item.');
  if (specification.placement.kind === 'selected' && !configuration.placements.some(option => option.id === specification.placement.placementId && option.status === 'active')) invalid('Choose a currently available placement.');
  const visual = specification.contractVersion === 'engraving-spec-v2';
  const content = specification.content || {};
  if (visual && !visualConfigurationValid(specification, configuration)) invalid('Choose approved fonts and keep your design within the configured text limits.');
  if (content.mode === 'text') {
    if (/\p{Script=Arabic}/u.test(content.text) && fontById(content.fontId)?.language !== 'ar') invalid('Choose an Arabic-supporting font for Arabic text.');
    const lines = content.text.replaceAll('\r\n', '\n').split('\n');
    if (!configuration.fontIds.includes(content.fontId) || [...content.text].length > configuration.maxCharacters || lines.length > configuration.maxLines || lines.some(line => [...line].length > configuration.maxCharactersPerLine)) invalid('Choose an approved font and keep text within the configured line and character limits.');
  }
  if (content.mode === 'icons' && !configuration.iconIds.includes(content.iconId)) invalid('Choose an approved symbol.');
  const ids = engravingUploadIds(specification);
  if (new Set(ids).size !== ids.length) invalid('Use separate images for the item, surface and artwork.');
  let uploads = [];
  if (files) {
    uploads = await validateUploadReferences(ids, owner, { purpose: 'engraving_service', session });
    const roles = new Map(engravingFileEntries(specification).map(([, id, role]) => [id, role]));
    if (uploads.some(upload => upload.engravingItemKey !== specification.itemKey || upload.fieldKey !== roles.get(String(upload._id)) || upload.sizeBytes > 8388608)) invalid('An image belongs to another item or image role. Replace it.');
  }
  const reviewFingerprint = fingerprint({ owner, configuration: record.configuration, version: record.version });
  return { specification, configuration, configurationVersion: record.version, reviewFingerprint, uploadIds: ids,
    attachments: uploads.length ? { status: 'temporary', expiresAt: new Date(Math.min(...uploads.map(upload => new Date(upload.expiresAt).getTime()))), replacementRequired: false } : null,
    unitPricePiastres: configuration.pricePiastres, lineTotalPiastres: configuration.pricePiastres, quantity: 1, kind: visual ? 'engraving_service_v2' : 'engraving_service_v1', name: `${configuration.name} engraving`,
    identity: `engraving:${specification.itemKey}`, inventoryClaims: [], valid: true };
}
export async function quoteEngravingLine(line, owner, options = {}) {
  const quoted = await engravingQuote(line.specification, owner, options);
  if (line.kind && line.kind !== quoted.kind || line.quantity !== 1 || line.reviewFingerprint !== quoted.reviewFingerprint) invalid('Review the current engraving price and options before adding this item.');
  return { ...quoted, id: line.id };
}
export function engravingSnapshot(quoted) {
  if (quoted.specification.contractVersion === 'engraving-spec-v2') {
    const ids = [...new Set(quoted.specification.design.layers.filter(layer => layer.type === 'text').map(layer => layer.fontId))];
    return visualSnapshotInput.parse({ snapshotVersion: 'engraving-order-v2', specification: quoted.specification, configuration: quoted.configuration, configurationVersion: quoted.configurationVersion, fonts: ids.map(id => Object.fromEntries(['id','label','source','license'].map(key => [key, fontById(id)[key]]))), customerOwnedItem: true, suitabilityReviewRequired: true });
  }
  const font = quoted.specification.content.mode === 'text' ? fontById(quoted.specification.content.fontId) : null;
  return snapshotInput.parse({ snapshotVersion: 'engraving-order-v1', specification: quoted.specification, configuration: quoted.configuration, configurationVersion: quoted.configurationVersion,
    font: font ? Object.fromEntries(['id','label','source','license'].map(key => [key, font[key]])) : null,
    icon: quoted.specification.content.mode === 'icons' ? iconById(quoted.specification.content.iconId) : null, customerOwnedItem: true, suitabilityReviewRequired: true });
}
export function publicEngravingLine(line) {
  if (line.specification.contractVersion === 'engraving-spec-v2') return publicVisualEngravingLine(line);
  const { uploadIds, identity, inventoryClaims, ...safe } = line;
  void uploadIds; void identity; void inventoryClaims;
  // Upload references are returned only to the verified owner through the dedicated
  // edit endpoint. Public summaries carry role/count metadata, never storage keys.
  const { itemPhotoUploadId, surfacePhotoUploadId, content, ...spec } = safe.specification;
  const { artworkUploadId, ...safeContent } = content;
  return { id: safe.id, kind: safe.kind, name: safe.name, quantity: 1, valid: safe.valid, unitPricePiastres: safe.unitPricePiastres, lineTotalPiastres: safe.lineTotalPiastres,
    engraving: { ...spec, content: safeContent, typeName: safe.configuration.name, placementLabel: spec.placement.kind === 'help' ? 'Help me choose the best placement' : safe.configuration.placements.find(value => value.id === spec.placement.placementId)?.label,
      files: { item: Boolean(itemPhotoUploadId), surface: Boolean(surfacePhotoUploadId), artwork: Boolean(artworkUploadId) } }, attachments: safe.attachments };
}

export function publicVisualEngravingLine(line) {
  const spec = line.specification;
  return { id: line.id, kind: line.kind, name: line.name, quantity: 1, valid: line.valid, unitPricePiastres: line.unitPricePiastres, lineTotalPiastres: line.lineTotalPiastres, attachments: line.attachments, engraving: { contractVersion: spec.contractVersion, itemKey: spec.itemKey, typeName: line.configuration.name, description: spec.description, placement: spec.placement, placementLabel: spec.placement.kind === 'help' ? 'Help me choose the best placement' : line.configuration.placements.find(value => value.id === spec.placement.placementId)?.label, specialRequests: spec.specialRequests, layers: spec.design.layers.map(({ assetId, ...layer }) => { void assetId; return layer; }), files: { surface: true, items: spec.itemPhotoUploadIds.length, artwork: spec.design.layers.filter(layer => layer.type === 'image').length } } };
}
