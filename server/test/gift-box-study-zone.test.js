import test from 'node:test';
import assert from 'node:assert/strict';
import { dropZoneForStudyItem, positionStudyItem, studyFootprint } from '../../client/src/gift-box/placement-study.mjs';
import { changeArrangement, initialArrangement, estimateSelection } from '../../client/src/gift-box/state.mjs';

test('dragging plush/chocolate across the photo-derived boundary picks inside or beside',()=>{
  for (const componentId of ['plush-1','chocolate-1']) {
    const boxId='box-2', item={componentId,...studyFootprint(boxId,componentId),placementZone:'inside'};
    const outside={x:1.10-item.width/2,y:.60-item.height*item.anchorOffsetY};
    assert.equal(dropZoneForStudyItem(boxId,item,outside),'beside');
    const outsidePosition=positionStudyItem(boxId,item,outside,'beside');
    assert.equal(outsidePosition.placementZone,'beside');
    const inside={x:.50-item.width/2,y:.55-item.height*item.anchorOffsetY};
    assert.equal(dropZoneForStudyItem(boxId,{...item,placementZone:'beside'},inside),'inside');
    assert.equal(positionStudyItem(boxId,item,inside,'inside').placementZone,'inside');
  }
});
test('roses cannot become beside-box items and zone switches leave the quote untouched',()=>{
  const boxId='box-2',rose={componentId:'rose-red',...studyFootprint(boxId,'rose-red'),placementZone:'inside'};
  assert.equal(dropZoneForStudyItem(boxId,rose,{x:1.10,y:.50}),'inside');
  let state={...initialArrangement(),boxId};
  state=changeArrangement(state,{type:'add',id:'chocolate-1',instanceId:'one',study:true});
  const before=estimateSelection(state);
  state=changeArrangement(state,{type:'move',id:'one',study:true,zone:'beside',position:{x:1.1,y:.5}});
  assert.equal(state.instances[0].placementZone,'beside');
  assert.deepEqual(estimateSelection(state),before);
  state=changeArrangement(state,{type:'move',id:'one',study:true,zone:'inside',position:{x:.40,y:.40}});
  assert.equal(state.instances[0].placementZone,'inside');
  assert.deepEqual(estimateSelection(state),before);
});
