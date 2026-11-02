import test from 'node:test';
import assert from 'node:assert/strict';
import { getDraftGeometry } from '../../shared/gift-box/geometry-drafts.mjs';
import { footprintInRegion } from '../../shared/gift-box/geometry.mjs';
import { studyFootprint } from '../../client/src/gift-box/placement-study.mjs';
import { findNextRosePosition } from '../../client/src/gift-box/rose-packing.mjs';
import { changeArrangement, initialArrangement } from '../../client/src/gift-box/state.mjs';

test('the current rose scale is an explicit image-derived draft, not measured approval', () => {
  const sizes = Array.from({ length: 12 }, (_, index) => studyFootprint(`box-${index + 1}`, 'rose-red'));
  assert.ok(sizes.every(size => size && size.width > 0 && size.height > 0 && size.scaleReview === 'draft-only'));
  assert.ok(sizes.every(size => size.width < 0.25));
});

test('a new rose uses another nearby available spot without moving previous roses', () => {
  let state = changeArrangement(initialArrangement(), { type: 'box', id: 'box-2' });
  const before = [];
  for (let i = 0; i < 5; i++) {
    state = changeArrangement(state, { type: 'add', id: i % 2 ? 'rose-yellow' : 'rose-red', instanceId: `new-${i}`, study: true });
    assert.equal(state.instances.length, i + 1);
    assert.deepEqual(state.instances.slice(0, i), before);
    const rose = state.instances[i];
    assert.equal(rose.placementZone, 'inside');
    const region = getDraftGeometry('box-2').regions.find(r => r.id === rose.regionId);
    assert.ok(footprintInRegion({ x: rose.x, y: rose.y, width: rose.width, height: rose.height }, region));
    before.push(rose);
  }
  assert.equal(new Set(state.instances.map(x => `${x.x.toFixed(4)},${x.y.toFixed(4)}`)).size, 5);
});

test('a two-level box can only use separately recognized well regions', () => {
  const boxId = 'box-11', rose = { ...studyFootprint(boxId, 'rose-red'), componentId: 'rose-red' };
  const pos = findNextRosePosition(boxId, rose, []);
  assert.ok(pos);
  const names = getDraftGeometry(boxId).regions.map(r => r.id);
  assert.ok(names.includes(pos.regionId));
  assert.equal(pos.placementZone, 'inside');
});

test('no fitting footprint produces no invented placement', () => {
  assert.equal(findNextRosePosition('box-2', { width: 2, height: 2 }, []), null);
  assert.equal(findNextRosePosition('missing', { width: 0.05, height: 0.05 }, []), null);
  assert.equal(findNextRosePosition('box-1', { width: 0.05, height: 0.05 }, []), null); // source defect stays blocked
});

test('chocolates and plush can be moved beside the box in the isolated visual study', () => {
  for (const id of ['chocolate-1', 'plush-1']) {
    let state = changeArrangement(initialArrangement(), { type: 'box', id: 'box-2' });
    state = changeArrangement(state, { type: 'add', id, instanceId: 'one', study: true });
    state = changeArrangement(state, { type: 'study-zone', id: 'one', zone: 'beside', study: true });
    assert.equal(state.instances[0].placementZone, 'beside');
    assert.equal(state.instances[0].regionId, 'beside-plush-proposal');
    state = changeArrangement(state, { type: 'study-zone', id: 'one', zone: 'inside', study: true });
    assert.equal(state.instances[0].placementZone, 'inside');
  }
});
