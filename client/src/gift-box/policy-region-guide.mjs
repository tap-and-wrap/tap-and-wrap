import { getDraftGeometry } from '../../../shared/gift-box/geometry-drafts.mjs';

// UI authoring aid only: stable IDs used by the current photo-based builder.
// These are not physical capacity measurements, tested compartment limits,
// permissions for any components, or an approval of geometry/artwork.
export function builderPreviewRegionGuide(boxId) {
  const proposal = getDraftGeometry(boxId);
  if (!proposal) return null;
  const compartments = boxId === 'box-11' ? [
    { id: 'lower-well', maxUnits: '' },
    { id: 'raised-well', maxUnits: '' },
  ] : [];
  const regions = proposal.regions.map((region, index) => ({
    regionId: region.id,
    zone: 'inside',
    compartmentId: boxId === 'box-11' ? compartments[index]?.id ?? null : null,
  }));
  regions.push(...proposal.besideRegions.map(region => ({
    regionId: region.id, zone: 'beside', compartmentId: null,
  })));
  return { boxId, regions, compartments, version: proposal.version,
    artworkBlocked: proposal.assetBlocked === true, productionApproved: false };
}

// Explicitly invoked by an administrator to avoid typing incompatible IDs.
// Never overwrite a saved region/compartment setup, fill quantities, change
// a compatible component, or grant any permission. The returned draft still
// requires the normal form validation and the independent review workflow.
export function addBuilderPreviewRegionNames(boxId, rules) {
  if (rules.regions.length || rules.compartments.length) return null;
  const guide = builderPreviewRegionGuide(boxId);
  if (!guide) return null;
  return { ...rules, regions: guide.regions.map(region => ({ ...region })),
    compartments: guide.compartments.map(compartment => ({ ...compartment })) };
}
