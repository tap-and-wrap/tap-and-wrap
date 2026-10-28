import test from 'node:test';
import assert from 'node:assert/strict';
import { ASSET_ISSUES, BUILDER_STEPS, FIXED_COMPONENTS, getFixedComponent, GIFT_CARD_POLICY,
  OWNER_EDITABLE_FIELDS, PENDING_CATEGORIES, RIBBON_POLICY, UNCONFIGURED_COMPONENT_STATE } from '../../shared/gift-box/definitions.mjs';
import { BOX_PLACEMENT_DEFINITIONS, footprintInRegion, pointInRegion, reviewPlacement, validRegion } from '../../shared/gift-box/geometry.mjs';

test('the fixed registry preserves final source identities, numeric order and both image roles', () => {
  assert.equal(FIXED_COMPONENTS.length, 74);
  assert.equal(new Set(FIXED_COMPONENTS.map(item => item.id)).size, 74);
  for (const [category, prefix, directory, count, suffix] of [['box', 'box', 'boxes', 12, 'open-top'], ['plush', 'plush', 'toys', 17, 'builder']]) {
    const items = FIXED_COMPONENTS.filter(item => item.category === category);
    assert.deepEqual(items.map(item => item.sourceNumber), Array.from({ length: count }, (_, i) => i + 1));
    items.forEach((item, index) => {
      assert.equal(item.id, `${prefix}-${index + 1}`);
      assert.equal(item.initialDisplayOrder, index + 1);
      assert.equal(item.selectionAsset, `${directory}/${item.id}.webp`);
      assert.equal(item.placementAsset, `${directory}/${item.id}-${suffix}.webp`);
    });
  }
});

test('bouquets select flowers; each tap places exactly one single-rose image', () => {
  for (const color of ['red', 'yellow', 'black']) {
    const rose = getFixedComponent(`rose-${color}`);
    assert.equal(rose.selectionAsset, `flowers/${color}-og.webp`);
    assert.equal(rose.placementAsset, `flowers/rose-${color}-builder.webp`);
    assert.equal(rose.bouquetReferenceAsset, `flowers/flowers-${color}.webp`);
    assert.equal(rose.interaction, 'add-one-per-tap');
  }
  assert.equal(new Set(FIXED_COMPONENTS.flatMap(item => [item.selectionAsset, item.placementAsset]).filter(Boolean)).size, 84);
});

test('registry identities, assets and pending catalogs cannot be changed through exported objects', () => {
  assert.throws(() => { FIXED_COMPONENTS[0].id = 'replacement'; }, TypeError);
  assert.throws(() => { FIXED_COMPONENTS.push({ id: 'extra' }); }, TypeError);
  assert.throws(() => { getFixedComponent('ribbon-navy').approvedColorHex = '#ffffff'; }, TypeError);
  assert.equal(getFixedComponent('__proto__'), null);
  assert.equal(getFixedComponent('box-13'), null);
});

test('the final five steps preserve optional skipping without making the box optional', () => {
  assert.deepEqual(BUILDER_STEPS.map(step => step.title), ['Choose Your Box', 'Fill With Flowers', 'Add Plush Toys', 'Add Chocolates', 'Finishing Touches']);
  assert.deepEqual(BUILDER_STEPS.map(step => step.required), [true, false, false, false, false]);
});

test('finishing definitions have fixed identities and colors without prices, images or placement elements', () => {
  assert.deepEqual(PENDING_CATEGORIES, {});
  assert.equal(FIXED_COMPONENTS.filter(item => item.category === 'ribbon').length, 21);
  assert.equal(getFixedComponent('gift-card-1').placementAsset, null);
  assert.equal(getFixedComponent('ribbon-navy').presentation, 'solid-color-button');
  assert.deepEqual(RIBBON_POLICY.immutableDefinitionFields, ['id', 'approvedColorHex']);
  assert.equal(RIBBON_POLICY.placement, false);
  assert.equal(RIBBON_POLICY.image, null);
  assert.equal(GIFT_CARD_POLICY.maxMessageCodePoints, 500);
  assert.equal(GIFT_CARD_POLICY.image, null);
  assert.equal(GIFT_CARD_POLICY.placement, false);
  assert.equal(GIFT_CARD_POLICY.requiresApprovedComponent, true);
  assert.equal(UNCONFIGURED_COMPONENT_STATE.pricePiastres, null);
  assert.equal(UNCONFIGURED_COMPONENT_STATE.enabled, false);
  assert.equal(UNCONFIGURED_COMPONENT_STATE.inventoryMode, null);
  assert.deepEqual(OWNER_EDITABLE_FIELDS, ['displayName', 'displayOrder', 'pricePiastres', 'enabled', 'inventoryMode', 'inventoryQuantity', 'available']);
});

test('box 1 artwork remains an explicit open issue, excluded from development copies and release', () => {
  assert.equal(ASSET_ISSUES.length, 1);
  assert.equal(ASSET_ISSUES[0].source, getFixedComponent('box-1').placementAsset);
  assert.equal(ASSET_ISSUES[0].status, 'open');
  assert.equal(ASSET_ISSUES[0].blocksDevelopmentCopy, true);
  assert.equal(ASSET_ISSUES[0].blocksProduction, true);
});

test('all actual box definitions fail closed until physical scale, masks and geometry are reviewed', () => {
  assert.equal(BOX_PLACEMENT_DEFINITIONS.length, 12);
  for (const box of BOX_PLACEMENT_DEFINITIONS) {
    assert.equal(box.reviewStatus, 'unreviewed');
    assert.deepEqual(box.regions, []);
    assert.deepEqual(box.besideRegions, []);
    assert.equal(box.physicalDimensions, null);
    assert.equal(box.capacity, null);
    assert.equal(box.itemScales, null);
    assert.equal(reviewPlacement(box.boxId, { x: 0.3, y: 0.3, width: 0.1, height: 0.1 }).code, 'GEOMETRY_REVIEW_REQUIRED');
  }
  assert.equal(reviewPlacement('unknown', {}).code, 'UNKNOWN_BOX');
  assert.throws(() => { BOX_PLACEMENT_DEFINITIONS[0].reviewStatus = 'approved'; }, TypeError);
});

// Synthetic geometry verifies primitives only; these are not merchant box measurements.
const square = { type: 'rectangle', x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
const circle = { type: 'ellipse', x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
const heart = { type: 'polygon', points: [[0.1, 0.3], [0.3, 0.1], [0.5, 0.3], [0.7, 0.1], [0.9, 0.3], [0.9, 0.5], [0.5, 0.9], [0.1, 0.5]] };
test('rectangle, circle and heart polygon primitives distinguish interior from exterior', () => {
  for (const region of [square, circle, heart]) {
    assert.equal(validRegion(region), true);
    assert.equal(pointInRegion([0.5, 0.5], region), true);
    assert.equal(pointInRegion([0.01, 0.01], region), false);
  }
  assert.equal(pointInRegion([0.5, 0.15], heart), false);
});

test('footprints must fit completely; a center inside a round box is insufficient', () => {
  assert.equal(footprintInRegion({ x: 0.4, y: 0.4, width: 0.1, height: 0.1 }, circle), true);
  assert.equal(footprintInRegion({ x: 0.1, y: 0.1, width: 0.3, height: 0.3 }, circle), false);
  assert.equal(footprintInRegion({ x: 0.85, y: 0.4, width: 0.1, height: 0.1 }, square), false);
});

test('concave boundaries cannot cut through footprints whose corners are inside', () => {
  const notch = { type: 'polygon', points: [[0, 0], [0.4, 0], [0.4, 0.6], [0.6, 0.6], [0.6, 0], [1, 0], [1, 1], [0, 1]] };
  const bridging = { x: 0.2, y: 0.2, width: 0.6, height: 0.6 };
  assert.equal(validRegion(notch), true);
  assert.equal(footprintInRegion(bridging, notch), false);
});

test('an item must fit a single compartment rather than bridge independent regions', () => {
  const compartments = [{ type: 'rectangle', x: 0, y: 0, width: 0.4, height: 1 }, { type: 'rectangle', x: 0.6, y: 0, width: 0.4, height: 1 }];
  assert.equal(compartments.some(region => footprintInRegion({ x: 0.2, y: 0.3, width: 0.6, height: 0.1 }, region)), false);
  assert.equal(compartments.some(region => footprintInRegion({ x: 0.1, y: 0.3, width: 0.1, height: 0.1 }, region)), true);
});

test('invalid, degenerate, nonfinite and self-intersecting geometry is rejected', () => {
  for (const region of [null, {}, { ...square, width: -1 }, { ...circle, x: NaN }, { ...square, height: Infinity },
    { type: 'polygon', points: [[0, 0], [0.5, 0.5], [1, 1]] },
    { type: 'polygon', points: [[0, 0], [1, 1], [0, 1], [1, 0]] },
    { type: 'polygon', points: [[0, 0], [1, 0], [0, 0]] }]) assert.equal(validRegion(region), false);
  assert.equal(pointInRegion([NaN, 0.5], square), false);
  assert.equal(footprintInRegion({ x: 0, y: 0, width: 0, height: 0 }, square), false);
});
