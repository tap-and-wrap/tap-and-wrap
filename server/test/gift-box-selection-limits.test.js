import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_BOX_CATEGORY_LIMITS, resolveBoxCategoryLimits, countBuilderCategories, exceedingBuilderCategories } from '../../shared/gift-box/selection-limits.mjs';
import { assertBoxSelectionLimits } from '../src/gift-box/limits.js';
import { canAdd } from '../../client/src/gift-box/state.mjs';

test('all boxes start at 25 flowers / 2 plush / 6 chocolates without physical certification', () => {
  for (let index = 1; index <= 12; index++) assert.deepEqual(resolveBoxCategoryLimits(`box-${index}`), DEFAULT_BOX_CATEGORY_LIMITS);
});
test('mixed-color roses share one flower ceiling', () => {
  const items = [{ componentId: 'rose-red', quantity: 15 }, { componentId: 'rose-yellow', quantity: 10 },
    { componentId: 'plush-1', quantity: 2 }, { componentId: 'chocolate-1', quantity: 6 }];
  assert.deepEqual(assertBoxSelectionLimits({ boxId: 'box-2', items }, {}).counts, { flower: 25, plush: 2, chocolate: 6 });
  assert.throws(() => assertBoxSelectionLimits({ boxId: 'box-2', items: [...items.slice(0, 1),
    { componentId: 'rose-yellow', quantity: 11 }, ...items.slice(2)] }, {}), { code: 'GIFT_BOX_CATEGORY_LIMIT' });
  assert.deepEqual(exceedingBuilderCategories({ flower: 26, plush: 2, chocolate: 6 }, DEFAULT_BOX_CATEGORY_LIMITS), ['flower']);
});
test('current approved per-box limits can be lower or higher, including zero', () => {
  const overrides = { 'box-2': { flower: 7, plush: 0, chocolate: 3 } };
  assert.deepEqual(resolveBoxCategoryLimits('box-2', overrides), overrides['box-2']);
  assert.deepEqual(resolveBoxCategoryLimits('box-3', overrides), DEFAULT_BOX_CATEGORY_LIMITS);
  assert.throws(() => assertBoxSelectionLimits({ boxId: 'box-2', items: [{ componentId: 'plush-1', quantity: 1 }] }, overrides), { code: 'GIFT_BOX_CATEGORY_LIMIT' });
  assert.deepEqual(resolveBoxCategoryLimits('box-2', { 'box-2': { flower: -1, plush: 2, chocolate: 6 } }), DEFAULT_BOX_CATEGORY_LIMITS);
});
test('invalid quantities cannot inflate category counts', () => {
  assert.throws(() => countBuilderCategories([{ componentId: 'rose-red', quantity: -1 }], () => 'flower'), RangeError);
  assert.deepEqual(countBuilderCategories([{ componentId: 'unknown', quantity: 1 }], () => undefined), { flower: 0, plush: 0, chocolate: 0 });
});
test('UI Add is disabled across rose colors and respects per-box overrides', () => {
  const roseState = { boxId: 'box-2', instances: Array.from({ length: 25 }, (_, i) => ({ componentId: i < 12 ? 'rose-red' : 'rose-yellow' })) };
  assert.equal(canAdd(roseState, 'rose-black'), false);
  assert.equal(canAdd({ ...roseState, instances: roseState.instances.slice(1) }, 'rose-black'), true);
  const plushState = { boxId: 'box-2', instances: [{ componentId: 'plush-1' }, { componentId: 'plush-2' }] };
  assert.equal(canAdd(plushState, 'plush-3'), false);
  const approved = { 'box-2': { flower: 30, plush: 1, chocolate: 4 } };
  assert.equal(canAdd(roseState, 'rose-black', undefined, approved), true);
  assert.equal(canAdd(plushState, 'plush-3', undefined, approved), false);
});
