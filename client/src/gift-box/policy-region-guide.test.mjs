import test from 'node:test';
import assert from 'node:assert/strict';
import { builderPreviewRegionGuide, addBuilderPreviewRegionNames } from './policy-region-guide.mjs';
import { getDraftGeometry } from '../../../shared/gift-box/geometry-drafts.mjs';

const blank = () => ({ regions: [], compartments: [], componentRules: [],
  limits: { maxUnits: '', maxByCategory: { flower: '', plush: '', chocolate: '' }, mixedContentLimits: [] } });

test('all twelve boxes use the exact current preview IDs without any quantity or approval', () => {
  for (let i = 1; i <= 12; i++) {
    const id = `box-${i}`;
    const guide = builderPreviewRegionGuide(id), source = getDraftGeometry(id);
    assert.deepEqual(guide.regions.map(x => x.regionId), [...source.regions.map(x => x.id), ...source.besideRegions.map(x => x.id)]);
    assert.equal(guide.productionApproved, false);
    const original = blank(), updated = addBuilderPreviewRegionNames(id, original);
    assert.equal(updated.limits.maxUnits, '');
    assert.equal(updated.limits.maxByCategory.flower, '');
    assert.deepEqual(updated.componentRules, []);
    assert.deepEqual(original.regions, []);
    assert.equal(updated.regions.at(-1).zone, 'beside');
    assert.equal(updated.regions.at(-1).compartmentId, null);
  }
});

test('Box 11 has two separately identified draft compartments with unknown capacity', () => {
  const value = addBuilderPreviewRegionNames('box-11', blank());
  assert.deepEqual(value.compartments, [{ id: 'lower-well', maxUnits: '' }, { id: 'raised-well', maxUnits: '' }]);
  assert.deepEqual(value.regions.map(item => item.compartmentId), ['lower-well', 'raised-well', null]);
  assert.equal(value.regions[0].regionId, 'lower-circular-floor');
  assert.equal(value.regions[1].regionId, 'raised-circular-floor');
});

test('an established draft is never overwritten, and unknown boxes have no template', () => {
  const existing = blank(); existing.regions = [{ regionId: 'real-review-region', zone: 'inside', compartmentId: null }];
  assert.equal(addBuilderPreviewRegionNames('box-2', existing), null);
  assert.deepEqual(existing.regions, [{ regionId: 'real-review-region', zone: 'inside', compartmentId: null }]);
  const withCompartment = blank(); withCompartment.compartments = [{ id: 'reviewed', maxUnits: 1 }];
  assert.equal(addBuilderPreviewRegionNames('box-11', withCompartment), null);
  assert.equal(builderPreviewRegionGuide('not-a-box'), null);
  assert.equal(addBuilderPreviewRegionNames('not-a-box', blank()), null);
});

test('suggestions never grant permissions or alter existing incompatible business settings', () => {
  const original = blank(); original.componentRules = [{ componentId: 'chocolate-1', maxQuantity: '', allowedRegionIds: [], oversizedPlush: false, allowOversizedInside: false }];
  const suggested = addBuilderPreviewRegionNames('box-2', original);
  assert.deepEqual(suggested.componentRules, original.componentRules);
  assert.equal(suggested.componentRules[0].allowedRegionIds.length, 0);
  assert.equal(suggested.limits.maxUnits, '');
});
