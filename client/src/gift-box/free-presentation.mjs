import { ARTWORK_METRICS } from './artwork-metrics.mjs';
import { BOX_ARTWORK_DIMENSIONS } from './artwork-dimensions.mjs';
import { getDraftGeometry } from '../../../shared/gift-box/geometry-drafts.mjs';
import { pointInRegion } from '../../../shared/gift-box/geometry.mjs';
import { boundFreePlacement } from '../../../shared/gift-box/commerce-contract.mjs';
import { LEGACY_FREE_PRESENTATION,isFreePresentation,verticalSceneScale,sceneY } from '../../../shared/gift-box/presentation.mjs';
export { FREE_PRESENTATION,LEGACY_FREE_PRESENTATION } from '../../../shared/gift-box/presentation.mjs';

// A visual revision only: old saved designs retain their original framing.
export function freePresentation(boxId,version=LEGACY_FREE_PRESENTATION) {
  const [sourceWidth, sourceHeight] = BOX_ARTWORK_DIMENSIONS[boxId] || [1, 1];
  const aspect = sourceWidth / sourceHeight;
  const [left, top, right, bottom] = ARTWORK_METRICS[boxId]?.visibleBounds || [0, 0, 1, 1];
  const visibleAspect = (right - left + 1) / (bottom - top + 1);
  const width = Math.min(.84, .8 * visibleAspect / aspect);
  const height = width * aspect / visibleAspect;
  return { aspect:aspect/verticalSceneScale(version), box: { x: (1 - width) / 2, y:sceneY((.98-height)/2,version), width, height:height/verticalSceneScale(version) } };
}

// Photo traces are used for rendering and descriptive placement only. No
// snapping, packing restrictions or commerce approval depends on these shapes.
export function sourcePointInWorkspace(boxId, [x,y], presentationVersion) {
  if (!isFreePresentation(presentationVersion)) return [x / 1.5 + .05 / 1.5,y / 1.12 + .03 / 1.12];
  const {box} = freePresentation(boxId,presentationVersion), metric = ARTWORK_METRICS[boxId];
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

// An insertion suggestion only. Dragging/saving never uses this search, and
// crowded gifts can still add items: there is no packing or capacity decision.
export function initialFreePosition(boxId,item,instances,presentationVersion) {
  const {box,aspect}=freePresentation(boxId,presentationVersion);
  const interior=freeInteriorPosition(boxId,item,presentationVersion);
  const toy=item.componentId.startsWith('plush-');
  const preferred=boundFreePlacement({x:interior.x+box.width*(toy ? -.12 : .16),y:interior.y+(toy ? 0 : item.height*.35)},item);
  const candidates=[preferred];
  for(let row=0;row<=20;row++) for(let column=0;column<=20;column++) candidates.push({x:(1-item.width)*column/20,y:(1-item.height)*row/20});
  const masks=(getDraftGeometry(boxId)?.foregroundMasks || []).map(mask=>({type:'polygon',points:mask.points.map(point=>sourcePointInWorkspace(boxId,point,presentationVersion))}));
  const gap=.008;
  let best=preferred,bestScore=Infinity;
  for(const position of candidates) {
    const overlap=instances.reduce((sum,other)=>{
      const width=Math.max(0,Math.min(position.x+item.width,other.x+other.width+gap)-Math.max(position.x,other.x-gap));
      const height=Math.max(0,Math.min(position.y+item.height,other.y+other.height+gap*aspect)-Math.max(position.y,other.y-gap*aspect));
      return sum+width*height/Math.min(item.width*item.height,other.width*other.height);
    },0);
    const zone=freePlacementZone(boxId,item,position,presentationVersion);
    let hidden=0;
    if(zone==='inside') for(const x of [.2,.5,.8]) for(const y of [.2,.5,.8]) {
      if(masks.some(mask=>pointInRegion([position.x+item.width*x,position.y+item.height*y],mask))) hidden++;
    }
    const score=overlap*100+Math.max(0,hidden/9-.4)*20+(zone==='inside' ? 0 : 2)+(position.x-preferred.x)**2+((position.y-preferred.y)/aspect)**2;
    if(score<bestScore) {best=position;bestScore=score;}
  }
  return {...best,placementZone:freePlacementZone(boxId,item,best,presentationVersion)};
}
