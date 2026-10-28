import { getDraftGeometry } from '../../../shared/gift-box/geometry-drafts.mjs';
import { pointInRegion } from '../../../shared/gift-box/geometry.mjs';
import { getFixedComponent } from '../../../shared/gift-box/definitions.mjs';
import { ARTWORK_METRICS } from './artwork-metrics.mjs';

// Ratios are visual proposals relative to the photographed well's width.
// They are never dimensions, capacity limits, or approved production scales.
export const STUDY_SIZES = Object.freeze({ flower:.22, plush:.58, chocolate:.28 });
const anchorOffsets = { flower:.5, plush:.92, chocolate:.65 };
const scene = { x:-.05, y:-.03, width:1.50, height:1.12 };
export const getStudyScene = extended => extended ? scene : { x:0,y:0,width:1,height:1 };
export function regionBounds(region) {
  if (region.type !== 'polygon') return region;
  const xs=region.points.map(point=>point[0]), ys=region.points.map(point=>point[1]);
  return { x:Math.min(...xs), y:Math.min(...ys), width:Math.max(...xs)-Math.min(...xs), height:Math.max(...ys)-Math.min(...ys) };
}
export function studyFootprint(boxId, componentId, reviewSize) {
  const draft=getDraftGeometry(boxId), metric=ARTWORK_METRICS[componentId], category=getFixedComponent(componentId)?.category;
  if (!draft || !metric || !STUDY_SIZES[category]) return null;
  const [left,top,right,bottom]=metric.visibleBounds, width=right-left+1, height=bottom-top+1;
  const wellWidth=Math.max(...draft.regions.map(region=>regionBounds(region).width));
  const ratio=Number.isFinite(reviewSize)&&reviewSize>=.02&&reviewSize<=.8 ? reviewSize : STUDY_SIZES[category];
  const longSide=wellWidth*ratio;
  const visualWidth=longSide*width/Math.max(width,height), visualHeight=longSide*height/Math.max(width,height)*draft.sourceSize[0]/draft.sourceSize[1];
  return { size:visualWidth, width:visualWidth, height:visualHeight, anchorOffsetY:anchorOffsets[category], scaleReview:'draft-only' };
}
const pointCache = new WeakMap();
function contains(point, region) {
  if (region.type==='rectangle') return point[0]>=region.x&&point[0]<=region.x+region.width&&point[1]>=region.y&&point[1]<=region.y+region.height;
  return pointInRegion(point,region);
}
function samplePoints(region) {
  if (pointCache.has(region)) return pointCache.get(region);
  const bounds=regionBounds(region), points=[];
  for(let row=1;row<24;row++)for(let column=1;column<24;column++){
    const point=[bounds.x+bounds.width*column/24,bounds.y+bounds.height*row/24];
    if(contains(point,region))points.push(point);
  }
  pointCache.set(region,points);return points;
}
export function studyAnchor(item, position=item) { return [position.x+item.width/2,position.y+item.height*item.anchorOffsetY]; }
export function positionStudyItem(boxId,item,position,zone=item.placementZone||'inside') {
  const draft=getDraftGeometry(boxId), regions=zone==='beside'?draft?.besideRegions:draft?.regions;
  if(!regions?.length||![position.x,position.y].every(Number.isFinite))return {x:item.x,y:item.y};
  const proposed=studyAnchor(item,position);
  let region=regions.find(value=>contains(proposed,value)), anchor=proposed;
  if(!region){
    let distance=Infinity;
    for(const candidate of regions)for(const point of samplePoints(candidate)){
      const next=((point[0]-proposed[0])*draft.sourceSize[0]/draft.sourceSize[1])**2+(point[1]-proposed[1])**2;
      if(next<distance){distance=next;anchor=point;region=candidate;}
    }
  }
  const bounds=getStudyScene(zone==='beside');
  return {x:Math.max(bounds.x,Math.min(bounds.x+bounds.width-item.width,anchor[0]-item.width/2)),
    y:Math.max(bounds.y,Math.min(bounds.y+bounds.height-item.height,anchor[1]-item.height*item.anchorOffsetY)),
    regionId:region?.id,layerBase:region?.layerBase||20,placementZone:zone};
}
export function initialStudyPosition(boxId,item,existingCount,zone='inside') {
  const regions=zone==='beside'?getDraftGeometry(boxId).besideRegions:getDraftGeometry(boxId).regions;
  const category=getFixedComponent(item.componentId).category;
  const region=regions[existingCount%regions.length], bounds=regionBounds(region);
  const columns={flower:[.18,.82,.40,.60,.50],plush:[.50,.30,.70],chocolate:[.65,.35,.50,.22,.78]}[category], column=columns[existingCount%columns.length];
  const row={plush:.44,flower:.60,chocolate:.77}[category];
  return positionStudyItem(boxId,item,{x:bounds.x+bounds.width*column-item.width/2,y:bounds.y+bounds.height*row-item.height*item.anchorOffsetY},zone);
}
