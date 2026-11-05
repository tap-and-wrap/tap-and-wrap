import test from 'node:test';
import assert from 'node:assert/strict';
import { FIXED_COMPONENTS } from '../../../shared/gift-box/definitions.mjs';
import { FREE_PRESENTATION,LEGACY_FREE_PRESENTATION,presentationAspect,sceneY } from '../../../shared/gift-box/presentation.mjs';
import { customerGiftComponentName } from '../../../shared/gift-box/customer-label.mjs';
import { photoPrintFootprint } from '../../../shared/gift-box/photo-presentation.mjs';
import { boundFreePlacement } from '../../../shared/gift-box/commerce-contract.mjs';
import { freePresentation,freePlacementZone,sourcePointInWorkspace } from './free-presentation.mjs';
import { getDraftGeometry } from '../../../shared/gift-box/geometry-drafts.mjs';
import { pointInRegion } from '../../../shared/gift-box/geometry.mjs';
import { ARTWORK_METRICS } from './artwork-metrics.mjs';
import { freeFootprint,initialArrangement,changeArrangement } from './state.mjs';

const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
const boxes=FIXED_COMPONENTS.filter(item=>item.category==='box');
const components=FIXED_COMPONENTS.filter(item=>['flower','plush','chocolate'].includes(item.category));

test('new scenes insert rose, toy and chocolate into sensible clear positions on representative boxes',()=>{
  for(const number of [1,5,7,11,12]) {
    let state={...initialArrangement(),freePlacement:true};
    state=changeArrangement(state,{type:'box',id:`box-${number}`,presentationVersion:FREE_PRESENTATION});
    for(const componentId of ['rose-red','plush-1','chocolate-18']) {
      state=changeArrangement(state,{type:'add',id:componentId,instanceId:crypto.randomUUID(),study:true,flexible:true});
      const item=state.instances.at(-1);
      assert.equal(item.placementZone,freePlacementZone(state.boxId,item,item,state.presentationVersion));
      if(componentId==='rose-red') assert.equal(item.placementZone,'inside',`${state.boxId} rose starts on the floor`);
      if(item.placementZone==='inside') {
        const masks=getDraftGeometry(state.boxId).foregroundMasks.map(mask=>({type:'polygon',points:mask.points.map(point=>sourcePointInWorkspace(state.boxId,point,state.presentationVersion))}));
        let hidden=0;
        for(const x of [.1,.3,.5,.7,.9]) for(const y of [.1,.3,.5,.7,.9]) if(masks.some(mask=>pointInRegion([item.x+item.width*x,item.y+item.height*y],mask))) hidden++;
        assert.ok(hidden/25<=.5,`${state.boxId}: ${componentId} is obscured by foreground artwork`);
      }
      for(const previous of state.instances.slice(0,-1)) {
        const overlap=Math.max(0,Math.min(item.x+item.width,previous.x+previous.width)-Math.max(item.x,previous.x))*Math.max(0,Math.min(item.y+item.height,previous.y+previous.height)-Math.max(item.y,previous.y));
        assert.ok(overlap<1e-8,`${state.boxId}: ${componentId} overlaps ${previous.componentId}`);
      }
    }
  }
});

test('box selection preserves the negotiated presentation version, including historical v1',()=>{
  for(const version of [LEGACY_FREE_PRESENTATION,FREE_PRESENTATION]) {
    let state={...initialArrangement(),freePlacement:true};
    state=changeArrangement(state,{type:'box',id:'box-2',presentationVersion:version});
    assert.equal(state.presentationVersion,version);
    state=changeArrangement(state,{type:'box',id:'box-5'});
    assert.equal(state.presentationVersion,version);
  }
});
test('twelve v1 frames remain frozen and v2 adds twenty percent vertical space without resizing their artwork',()=>{
  for(const {id} of boxes) {
    const old=freePresentation(id,LEGACY_FREE_PRESENTATION),next=freePresentation(id,FREE_PRESENTATION);
    assert.deepEqual(freePresentation(id),old);
    close(next.aspect,old.aspect/1.2);close(next.box.width,old.box.width);close(next.box.x,old.box.x);
    close(next.box.height/next.aspect,old.box.height/old.aspect);
    close(next.box.y/next.aspect-old.box.y/old.aspect,.1/old.aspect);
    close((1-next.box.y-next.box.height)/next.aspect-(1-old.box.y-old.box.height)/old.aspect,.1/old.aspect);
    close(old.box.y+old.box.height/2,.49);
  }
});
test('all 3 roses, 17 soft toys and 20 chocolates preserve visible image ratios on all twelve box scenes',()=>{
  assert.equal(components.length,40);
  for(const box of boxes) for(const item of components) {
    const old=freeFootprint(box.id,item.id,LEGACY_FREE_PRESENTATION),size=freeFootprint(box.id,item.id,FREE_PRESENTATION);
    const b=ARTWORK_METRICS[item.id].visibleBounds,ratio=(b[2]-b[0]+1)/(b[3]-b[1]+1);
    close(size.width*presentationAspect(box.id,FREE_PRESENTATION)/size.height,ratio);
    assert.ok(size.width>0&&size.height>0&&size.width<1&&size.height<1);
    if(item.category==='flower'){close(size.width,old.width*.845);close(size.height*1.2,old.height*.845);}
    if(item.category==='plush'){close(size.width,old.width);close(size.height*1.2,old.height);}
    if(item.category==='chocolate') {
      assert.ok(size.width<=freePresentation(box.id,FREE_PRESENTATION).box.width*.25+1e-9);
      assert.ok(size.height/presentationAspect(box.id,FREE_PRESENTATION)<=freePresentation(box.id,FREE_PRESENTATION).box.width*.30+1e-9);
    }
    for(const x of [-1,0,.5,1,2]) for(const y of [-1,0,.5,1,2]) {
      const bounded=boundFreePlacement({x,y},size);
      assert.ok(bounded.x>=0&&bounded.y>=0&&bounded.x+size.width<=1.000001&&bounded.y+size.height<=1.000001);
    }
  }
});
test('wide and tall package identities remain intact while their proportional height limits differ',()=>{
  const tall=freeFootprint('box-2','chocolate-18',FREE_PRESENTATION),wide=freeFootprint('box-2','chocolate-14',FREE_PRESENTATION);
  assert.ok(tall.height>wide.height*2);assert.ok(tall.width<wide.width);
  for(const ratio of [.05,.5,1,2,20]) {
    const old=photoPrintFootprint(ratio,presentationAspect('box-2',LEGACY_FREE_PRESENTATION),LEGACY_FREE_PRESENTATION);
    const next=photoPrintFootprint(ratio,presentationAspect('box-2',FREE_PRESENTATION),FREE_PRESENTATION);
    close(old.width,next.width);close(old.height,next.height*1.2);
    close(sceneY(.4,FREE_PRESENTATION)*1.2-.1,.4);
  }
});
test('only generic legacy customer labels are normalized and source snapshots remain untouched',()=>{
  for(const [displayName,expected] of [['Plush 1','Soft Toy 1'],['Plush Toy 12','Soft Toy 12'],['Plush Toys','Soft Toys'],['Handmade Plush Bear','Handmade Plush Bear'],['Purchased Plush One','Purchased Plush One']]) {
    const item=Object.freeze({category:'plush',componentId:'plush-1',displayName});
    assert.equal(customerGiftComponentName(item),expected);assert.equal(item.displayName,displayName);
  }
});
