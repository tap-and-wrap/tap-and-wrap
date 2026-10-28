import test from 'node:test';
import assert from 'node:assert/strict';
import { arrangementReducer, canAdd, changeArrangement, codePointCount, estimateSelection, initialArrangement, validMessage } from '../../client/src/gift-box/state.mjs';
import { allowedMediaEntry } from '../../client/scripts/gift-box-local-media.mjs';
import { getFixedComponent, FIXED_COMPONENTS } from '../../shared/gift-box/definitions.mjs';
import { calculateEstimate } from '../src/gift-box/pricing.js';
import { pointInRegion } from '../../shared/gift-box/geometry.mjs';
import { getDraftGeometry } from '../../shared/gift-box/geometry-drafts.mjs';
import { studyAnchor } from '../../client/src/gift-box/placement-study.mjs';

test('chocolates preserve all 20 numbered units with text selectors and no selection images', () => {
  const chocolates = FIXED_COMPONENTS.filter(item => item.category === 'chocolate');
  assert.equal(chocolates.length, 20);
  chocolates.forEach((item, index) => {
    assert.equal(item.id, `chocolate-${index + 1}`); assert.equal(item.initialDisplayOrder, index + 1);
    assert.equal(item.placementAsset, `chocolate/chocolate-${index + 1}-builder.webp`); assert.equal(item.selectionAsset, null);
    assert.equal(item.unit, 'complete-pictured-retail-unit'); assert.ok(Object.isFrozen(item));
  });
});
test('each rose or chocolate tap adds exactly one distinct instance and bounded quantities', () => {
  let state = changeArrangement(initialArrangement(), { type: 'box', id: 'box-2' });
  for (let i = 0; i < 100; i++) state = changeArrangement(state, { type: 'add', id: 'chocolate-1', instanceId: `unit-${i}`, study: true });
  assert.equal(state.instances.length, 100); assert.equal(canAdd(state, 'chocolate-1'), false); assert.equal(canAdd(state, 'rose-red'), true);
  assert.equal(changeArrangement(state, { type: 'add', id: 'chocolate-1', instanceId: 'unit-extra', study: true }), state);
  assert.equal(new Set(state.instances.map(item => item.id)).size, 100);
});
test('changing boxes retains items but invalidates every placement; undo restores the original arrangement', () => {
  let history = { present: initialArrangement(), past: [] };
  for (const action of [{ type: 'box', id: 'box-2' }, { type: 'add', id: 'plush-1', instanceId: 'toy-1', study: true }, { type: 'box', id: 'box-11' }]) history = arrangementReducer(history, action);
  assert.equal(history.present.instances.length, 1); assert.equal(history.present.instances[0].x, null); assert.equal(history.present.instances[0].zone, 'unplaced');
  history = arrangementReducer(history, { type: 'undo' }); assert.equal(history.present.boxId, 'box-2'); assert.equal(history.present.instances[0].zone, 'layout-study');
});
test('draft movement keeps an anchor in a proposed floor without changing pricing; production cannot use study moves', () => {
  let state = changeArrangement({ ...initialArrangement(), boxId: 'box-2' }, { type: 'add', id: 'rose-red', instanceId: 'r', study: true });
  const before = estimateSelection(state);
  state = changeArrangement(state, { type: 'move', id: 'r', study: true, position: { x: 10, y: -2 } });
  assert.ok(getDraftGeometry('box-2').regions.some(region=>pointInRegion(studyAnchor(state.instances[0]),region))); assert.deepEqual(estimateSelection(state), before);
  const staged = changeArrangement({ ...initialArrangement(), boxId: 'box-2' }, { type: 'add', id: 'rose-red', instanceId: 'r', study: false });
  assert.equal(staged.instances[0].x, null);
  assert.deepEqual(changeArrangement(staged, { type: 'move', id: 'r', study: false, position: { x: 0, y: 0 } }), staged);
});
test('clear and remove are undoable; history stays bounded and invalid IDs are ignored', () => {
  let history = { present: { ...initialArrangement(), boxId: 'box-2' }, past: [] };
  for (let i = 0; i < 40; i++) history = arrangementReducer(history, { type: 'add', id: 'rose-red', instanceId: String(i), study: true });
  assert.equal(history.past.length, 30);
  history = arrangementReducer(history, { type: 'clear' }); assert.equal(history.present.instances.length, 0);
  history = arrangementReducer(history, { type: 'undo' }); assert.equal(history.present.instances.length, 40);
  assert.equal(changeArrangement(history.present, { type: 'add', id: 'invented-chocolate', instanceId: 'x' }), history.present);
});
test('Unicode message drafts count code points and do not invent a gift-card component or free estimate', () => {
  assert.equal(codePointCount('💐'.repeat(500)), 500); assert.equal(validMessage('💐'.repeat(500)), true);
  for (const text of ['💐'.repeat(501), '\ud800', '\u0000']) assert.equal(validMessage(text), false);
  for (const text of ['', '   ']) assert.equal(validMessage(text), true);
  const state = { ...initialArrangement(), boxId: 'box-2', cardEnabled: true, message: '<script>literal text</script>' };
  assert.equal(estimateSelection(state), null); assert.equal(validMessage(state.message), true);
});
test('local media allowlist excludes references, broken box artwork, unknown paths and text selector images', () => {
  const entry = { componentId: 'chocolate-1', role: 'placement', source: getFixedComponent('chocolate-1').placementAsset, path: '1200/chocolate/chocolate-1-builder.webp', sha256: 'a'.repeat(64) };
  assert.equal(allowedMediaEntry(entry), true);
  for (const patch of [{ role: 'selection' }, { path: '../secret.env' }, { source: 'ribbons/ribbons.jpeg' }, { componentId: 'invented' }, { sha256: 'invalid' }]) assert.equal(allowedMediaEntry({ ...entry, ...patch }), false);
  assert.equal(allowedMediaEntry({ componentId: 'box-1', role: 'placement', source: 'boxes/box-1-open-top.webp', path: '1200/boxes/box-1-open-top.webp', sha256: 'a'.repeat(64) }), false);
});
test('approved chocolate prices and confirmed inventory can be estimated without approving physical fit', () => {
  const saved = ['box-2', 'chocolate-20'].map(componentId => ({ componentId, enabled: true, available: true, inventoryMode: 'tracked', inventoryQuantity: 10, pricePiastres: 100, priceApproval: 'paid', priceApprovedBy: '507f1f77bcf86cd799439011', priceApprovedAt: new Date(), __v: 1 }));
  const result = calculateEstimate({ boxId: 'box-2', items: [{ componentId: 'chocolate-20', quantity: 2 }] }, saved);
  assert.equal(result.componentSubtotalPiastres, 300); assert.equal(result.arrangementApproved, false); assert.equal(result.submissionAllowed, false);
});
