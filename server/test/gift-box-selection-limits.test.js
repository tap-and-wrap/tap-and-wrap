import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_BOX_CATEGORY_LIMITS, resolveBoxCategoryLimits, countBuilderCategories, exceedingBuilderCategories } from '../../shared/gift-box/selection-limits.mjs';
import { assertBoxSelectionLimits } from '../src/gift-box/limits.js';
import { canAdd } from '../../client/src/gift-box/state.mjs';

test('missing physical policy does not invent 25 / 2 / 6 business limits', () => {
  assert.equal(DEFAULT_BOX_CATEGORY_LIMITS, null);
  for (let n=1;n<=12;n++) assert.equal(resolveBoxCategoryLimits(`box-${n}`), null);
  const counts=assertBoxSelectionLimits({boxId:'box-2',items:[
    {componentId:'rose-red',quantity:30},{componentId:'plush-1',quantity:4},{componentId:'chocolate-1',quantity:9}
  ]},{}).counts;
  assert.deepEqual(counts,{flower:30,plush:4,chocolate:9});
  assert.deepEqual(exceedingBuilderCategories(counts,null),[]);
});
test('approved reviewed limits are still enforceable and per box, including zero', () => {
  const policy={'box-2':{flower:7,plush:0,chocolate:3}};
  assert.deepEqual(resolveBoxCategoryLimits('box-2',policy),policy['box-2']);
  assert.equal(resolveBoxCategoryLimits('box-3',policy),null);
  assert.throws(()=>assertBoxSelectionLimits({boxId:'box-2',items:[{componentId:'plush-1',quantity:1}]},policy),{code:'GIFT_BOX_CATEGORY_LIMIT'});
  assert.deepEqual(exceedingBuilderCategories({flower:8,plush:0,chocolate:3},policy['box-2']),['flower']);
  assert.equal(resolveBoxCategoryLimits('box-2',{'box-2':{flower:-1,plush:2,chocolate:6}}),null);
});
test('unapproved totals are computationally bounded, not presented as physical capacity',()=>{
  assert.throws(()=>countBuilderCategories([{componentId:'rose-red',quantity:-1}],()=> 'flower'),RangeError);
  assert.throws(()=>countBuilderCategories([{componentId:'rose-red',quantity:201}],()=> 'flower'),RangeError);
  assert.deepEqual(countBuilderCategories([{componentId:'unknown',quantity:1}],()=>undefined),{flower:0,plush:0,chocolate:0});
});
test('visual editor permits more than old limits, yet honors owner-approved ceilings and safe state bounds',()=>{
  const roses={boxId:'box-2',instances:Array.from({length:26},(_,i)=>({componentId:i<13?'rose-red':'rose-yellow'}))};
  assert.equal(canAdd(roses,'rose-black'),true);
  const plush={boxId:'box-2',instances:[{componentId:'plush-1'},{componentId:'plush-2'}]};
  assert.equal(canAdd(plush,'plush-3'),true);
  const approved={'box-2':{flower:26,plush:2,chocolate:6}};
  assert.equal(canAdd(roses,'rose-black',undefined,approved),false);
  assert.equal(canAdd(plush,'plush-3',undefined,approved),false);
  assert.equal(canAdd({boxId:'box-2',instances:Array.from({length:100},()=>({componentId:'plush-1'}))},'plush-1'),false);
});
