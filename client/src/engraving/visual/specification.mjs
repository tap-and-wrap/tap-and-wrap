export function visualResources(visual) {
  return [
    ...(visual.design.surface ? [{ assetId: visual.design.surface.assetId, role: 'surface_photo' }] : []),
    ...visual.itemPhotos.map(assetId => ({ assetId, role: 'item_photo' })),
    ...visual.design.layers.filter(layer => layer.type === 'image').map(layer => ({ assetId: layer.assetId, role: 'personal_artwork' })),
  ];
}

export function visualSpecification(draft, type, uploaded = {}) {
  const refs = visualResources(draft.visual);
  const ids = new Map(refs.map(({ assetId }, index) => [assetId, uploaded[assetId] || String(index + 1).padStart(24, '0')]));
  const design = structuredClone(draft.visual.design);
  if (design.surface) design.surface.assetId = ids.get(design.surface.assetId);
  for (const layer of design.layers) if (layer.type === 'image') layer.assetId = ids.get(layer.assetId);
  return { contractVersion: 'engraving-spec-v2', itemKey: draft.itemKey, typeId: draft.typeId, configurationVersion: type.version,
    description: draft.description, placement: draft.placement, surfacePhotoUploadId: design.surface?.assetId,
    itemPhotoUploadIds: draft.visual.itemPhotos.map(assetId => ids.get(assetId)), design, specialRequests: draft.specialRequests };
}
