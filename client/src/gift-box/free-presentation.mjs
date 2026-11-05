import { ARTWORK_METRICS } from './artwork-metrics.mjs';
import { BOX_ARTWORK_DIMENSIONS } from './artwork-dimensions.mjs';
import { getDraftGeometry } from '../../../shared/gift-box/geometry-drafts.mjs';
import { pointInRegion } from '../../../shared/gift-box/geometry.mjs';

// A visual revision only: old saved designs retain their original framing.
export const FREE_PRESENTATION = 'gift-box-presentation-v1';
export function freePresentation(boxId) {
  const [sourceWidth, sourceHeight] = BOX_ARTWORK_DIMENSIONS[boxId] || [1, 1];
  const aspect = sourceWidth / sourceHeight;
  const [left, top, right, bottom] = ARTWORK_METRICS[boxId]?.visibleBounds || [0, 0, 1, 1];
  const visibleAspect = (right - left + 1) / (bottom - top + 1);
  const width = Math.min(.84, .8 * visibleAspect / aspect);
  const height = width * aspect / visibleAspect;
  return { aspect, box: { x: (1 - width) / 2, y: (.98 - height) / 2, width, height } };
}

// Photo traces are used for rendering and descriptive placement only. No
// snapping, packing restrictions or commerce approval depends on these shapes.
export function sourcePointInWorkspace(boxId, [x,y], presentationVersion) {
  if (presentationVersion !== FREE_PRESENTATION) return [x / 1.5 + .05 / 1.5,y / 1.12 + .03 / 1.12];
  const {box} = freePresentation(boxId), metric = ARTWORK_METRICS[boxId];
  const [l,t,r,b] = metric.visibleBounds;
  return [box.x + (x * metric.width - l) / (r-l+1) * box.width,
    box.y + (y * metric.height - t) / (b-t+1) * box.height];
}

export function freePlacementZone(boxId, item, position, presentationVersion) {
  const draft = getDraftGeometry(boxId);
  if (!draft) return 'beside';
  const anchor = [position.x + item.width / 2,position.y + item.height * (item.componentId?.startsWith('plush-') ? .85 : .5)];
  const origin = sourcePointInWorkspace(boxId,[0,0],presentationVersion), end = sourcePointInWorkspace(boxId,[1,1],presentationVersion);
  const source = [(anchor[0]-origin[0])/(end[0]-origin[0]),(anchor[1]-origin[1])/(end[1]-origin[1])];
  return draft.regions.some(region => pointInRegion(source,region)) ? 'inside' : 'beside';
}

export function freeForegroundMasks(boxId,presentationVersion) {
  return (getDraftGeometry(boxId)?.foregroundMasks || []).map(mask => ({id:mask.id,
    clipPath:`polygon(${mask.points.map(point => sourcePointInWorkspace(boxId,point,presentationVersion).map(value=>`${value*100}%`).join(' ')).join(',')})`}));
}

export function freeInteriorPosition(boxId,item,presentationVersion) {
  const region=getDraftGeometry(boxId)?.regions[0];
  if (!region) return {x:.4,y:.3};
  const source=region.type === 'ellipse' ? [region.x+region.width/2,region.y+region.height/2]
    : region.points.reduce((sum,point)=>[sum[0]+point[0]/region.points.length,sum[1]+point[1]/region.points.length],[0,0]);
  const [x,y]=sourcePointInWorkspace(boxId,source,presentationVersion);
  return {x:x-item.width/2,y:y-item.height*.85};
}
