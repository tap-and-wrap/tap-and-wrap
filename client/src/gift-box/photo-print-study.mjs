import { getDraftGeometry } from '../../../shared/gift-box/geometry-drafts.mjs';
import { pointInRegion } from '../../../shared/gift-box/geometry.mjs';
import { positionStudyItem, regionBounds, studyAnchor } from './placement-study.mjs';

// A browser-only illustration of a printed photograph. This is not a measured
// print size or proof that a particular box can physically contain the photo.
export const PHOTO_PRINT_STUDY_WIDTH = 0.15;
const sourceAspect = boxId => {
  const size = getDraftGeometry(boxId)?.sourceSize;
  return size ? size[0] / size[1] : 1;
};
export function photoPrintFootprint(boxId) {
  return { width: PHOTO_PRINT_STUDY_WIDTH, height: PHOTO_PRINT_STUDY_WIDTH * 4 / 3 * sourceAspect(boxId), anchorOffsetY: 0.5 };
}
function contains(point, region) {
  if (region.type === 'rectangle') return point[0] >= region.x && point[0] <= region.x + region.width && point[1] >= region.y && point[1] <= region.y + region.height;
  return pointInRegion(point, region);
}
export function photoPrintPosition(boxId, index, saved) {
  const draft = getDraftGeometry(boxId);
  if (!draft || draft.assetBlocked) return null;
  const size = photoPrintFootprint(boxId);
  if (saved && ['inside','beside'].includes(saved.placementZone) && [saved.x,saved.y].every(Number.isFinite)) {
    return { ...size, ...positionStudyItem(boxId, { ...size, placementZone: saved.placementZone }, saved, saved.placementZone) };
  }
  const region = draft.besideRegions?.[0];
  if (!region) return null;
  const bounds = regionBounds(region);
  const column = index % 2, row = Math.floor(index / 2);
  return { ...size, ...positionStudyItem(boxId, { ...size, placementZone:'beside' }, {
    x: bounds.x + bounds.width * (column ? 0.63 : 0.19) - size.width / 2,
    y: bounds.y + bounds.height * (0.22 + (row % 3) * 0.26) - size.height / 2,
  }, 'beside') };
}
export function movePhotoPrint(boxId, position, target, forcedZone = null) {
  const draft = getDraftGeometry(boxId);
  if (!draft || draft.assetBlocked || !position || ![target?.x,target?.y].every(Number.isFinite)) return position;
  const anchor = studyAnchor(position, target);
  const zone = forcedZone === 'inside' || forcedZone === 'beside' ? forcedZone
    : draft.regions.some(region => contains(anchor,region)) ? 'inside'
    : draft.besideRegions?.some(region => contains(anchor,region)) ? 'beside'
    : position.placementZone;
  return { ...photoPrintFootprint(boxId), ...positionStudyItem(boxId, position, target, zone) };
}
