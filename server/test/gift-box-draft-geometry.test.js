import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DRAFT_BOX_GEOMETRY, getDraftGeometry } from '../../shared/gift-box/geometry-drafts.mjs';
import { validRegion, pointInRegion, reviewPlacement } from '../../shared/gift-box/geometry.mjs';
import { FIXED_COMPONENTS } from '../../shared/gift-box/definitions.mjs';
import { ARTWORK_METRICS } from '../../client/src/gift-box/artwork-metrics.mjs';
import { initialStudyPosition, positionStudyItem, studyAnchor, studyFootprint } from '../../client/src/gift-box/placement-study.mjs';
import { arrangementReducer, estimateSelection, initialArrangement } from '../../client/src/gift-box/state.mjs';

test('all twelve photo proposals remain separate from authoritative blocked geometry',()=>{
  assert.deepEqual(DRAFT_BOX_GEOMETRY.map(item=>item.boxId),Array.from({length:12},(_,i)=>`box-${i+1}`));
  for(const draft of DRAFT_BOX_GEOMETRY){
    assert.equal(draft.reviewStatus,'unreviewed');assert.equal(draft.productionApproved,false);
    assert.equal(draft.physicalDimensions,null);assert.equal(draft.capacity,null);assert.equal(draft.approvedItemScales,null);
    assert.equal(reviewPlacement(draft.boxId,{}).code,'GEOMETRY_REVIEW_REQUIRED');assert.ok(Object.isFrozen(draft));
    assert.ok(draft.regions.every(validRegion));assert.ok(draft.foregroundMasks.every(validRegion));
    assert.ok(draft.regions.every(region=>region.type!=='rectangle'));
    assert.ok(draft.foregroundMasks.length);assert.ok(draft.requiresSceneExtension);
  }
});
test('raised lids and square outer shells are excluded from the proposed floors',()=>{
  for(const n of [4,5,6,7,8,9,10]){
    const draft=getDraftGeometry(`box-${n}`);
    assert.ok(draft.regions.every(region=>!pointInRegion([.5,.25],region)));
  }
  for(const n of [5,6]){const region=getDraftGeometry(`box-${n}`).regions[0];assert.equal(region.type,'polygon');assert.equal(pointInRegion([.24,.75],region),false);}
  const basket=getDraftGeometry('box-12').regions[0];
  assert.equal(pointInRegion([.05,.4],basket),false);assert.equal(pointInRegion([.5,.9],basket),false);assert.equal(pointInRegion([.5,.55],basket),true);
});
test('box 11 has two independent circular projections and an intervening occlusion layer',()=>{
  const draft=getDraftGeometry('box-11');assert.equal(draft.regions.length,2);
  assert.ok(draft.regions.every(region=>region.type==='ellipse'));
  const [lower,upper]=draft.regions;
  assert.ok(upper.y+upper.height<lower.y);
  const raised=draft.foregroundMasks.find(mask=>mask.id==='raised-container-body');
  assert.ok(lower.layerBase<raised.layer&&raised.layer<upper.layerBase);
  assert.ok(draft.foregroundMasks.find(mask=>mask.id==='raised-front-wall').layer>upper.layerBase);
});
test('visible bounds and source aspect ratios match the audited manifest',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../../shared/gift-box/asset-manifest.v2.json',import.meta.url),'utf8'));
  for(const item of manifest.files.filter(file=>file.role==='placement'))assert.deepEqual(ARTWORK_METRICS[item.componentId],{width:item.width,height:item.height,visibleBounds:item.visibleBounds});
  for(const draft of DRAFT_BOX_GEOMETRY)assert.deepEqual(draft.sourceSize,[ARTWORK_METRICS[draft.boxId].width,ARTWORK_METRICS[draft.boxId].height]);
});
test('draft proportions follow visible artwork rather than transparent padding or a square frame',()=>{
  const box='box-2', rose=studyFootprint(box,'rose-red'),toy=studyFootprint(box,'plush-1'),bar=studyFootprint(box,'chocolate-20'),bag=studyFootprint(box,'chocolate-3');
  assert.ok(toy.height>rose.height*2);assert.ok(rose.width>bar.width*.65);assert.ok(bar.width>bar.height*1.5);assert.ok(bag.height>bag.width);
  const metric=ARTWORK_METRICS['plush-1'], [l,t,r,b]=metric.visibleBounds;
  assert.ok(Math.abs(toy.height/toy.width-(b-t+1)/(r-l+1)*1374/1145)<1e-10);
});
test('new draft anchors and extreme pointer movement remain in proposed regions for every box and component',()=>{
  for(const draft of DRAFT_BOX_GEOMETRY)for(const definition of FIXED_COMPONENTS.filter(item=>['flower','plush','chocolate'].includes(item.category))){
    const item={componentId:definition.id,...studyFootprint(draft.boxId,definition.id)};
    for(const count of [0,1,3,9]){
      Object.assign(item,initialStudyPosition(draft.boxId,item,count));
      assert.ok(draft.regions.some(region=>pointInRegion(studyAnchor(item),region)),`${draft.boxId}/${definition.id}/initial`);
      for(const position of [{x:10,y:-10},{x:-10,y:10}]){
        const next=positionStudyItem(draft.boxId,item,position);
        assert.ok(draft.regions.some(region=>pointInRegion(studyAnchor(item,next),region)),`${draft.boxId}/${definition.id}/move`);
      }
    }
  }
});
test('beside proposals preserve component quantities and remain undoable without a price change',()=>{
  let history={present:{...initialArrangement(),boxId:'box-2'},past:[]};
  history=arrangementReducer(history,{type:'add',id:'plush-1',instanceId:'toy',study:true});
  const before=history.present,selection=estimateSelection(before);
  history=arrangementReducer(history,{type:'study-zone',id:'toy',zone:'beside',study:true});
  assert.equal(history.present.instances[0].placementZone,'beside');assert.ok(history.present.instances[0].x>1);
  assert.deepEqual(estimateSelection(history.present),selection);
  history=arrangementReducer(history,{type:'undo'});assert.deepEqual(history.present,before);
  assert.equal(arrangementReducer(history,{type:'study-zone',id:'toy',zone:'beside',study:false}),history);
});
test('box changes clear prior placements and recompute only draft proportions without changing IDs',()=>{
  let history={present:{...initialArrangement(),boxId:'box-2'},past:[]};
  history=arrangementReducer(history,{type:'add',id:'plush-1',instanceId:'toy',study:true});const old=history.present.instances[0];
  history=arrangementReducer(history,{type:'study-zone',id:'toy',zone:'beside',study:true});
  history=arrangementReducer(history,{type:'box',id:'box-6'});const item=history.present.instances[0];
  assert.equal(item.id,'toy');assert.equal(item.x,null);assert.equal(item.y,null);assert.equal(item.zone,'unplaced');assert.equal(item.placementZone,null);assert.equal(item.regionId,null);assert.equal(item.layerBase,null);assert.notEqual(item.width,old.width);
});
