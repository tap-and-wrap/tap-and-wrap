import test from 'node:test';
import assert from 'node:assert/strict';
import { OWNER_STARTING_PRICES, compareOwnerStartingPrices } from './owner-starting-prices.mjs';

const fresh = () => OWNER_STARTING_PRICES.map((item, index) => ({
  componentId: item.componentId, category: item.category, revision: index === 0 ? 1 : 0,
  pricing: 'pending', pricePiastres: null, displayName: index === 0 ? 'Box 1' : null,
  enabled: false, available: false, inventoryMode: null, inventoryQuantity: null,
}));
test('74 exact starting prices in piastres', () => {
  assert.equal(OWNER_STARTING_PRICES.length, 74);
  const values = Object.fromEntries(OWNER_STARTING_PRICES.map(item => [item.componentId, item.pricePiastres]));
  assert.equal(values['box-1'], 20000);
  assert.equal(values['rose-red'], 3000);
  assert.equal(values['plush-17'], 50000);
  assert.equal(values['chocolate-20'], 10000);
  assert.equal(values['ribbon-baby-blue'], 5000);
  assert.equal(values['gift-card-1'], 5000);
});
test('first import preserves existing names and only submits prices/names/revisions', () => {
  const comparison = compareOwnerStartingPrices(fresh());
  assert.equal(comparison.updates.length, 74);
  assert.equal(comparison.unchanged.length, 0);
  assert.equal(comparison.conflicts.length, 0);
  for (const { patch } of comparison.updates) {
    assert.deepEqual(Object.keys(patch).sort().filter(key => !['expectedRevision', 'pricePiastres', 'displayName'].includes(key)), []);
  }
  assert.equal(comparison.updates[0].patch.displayName, undefined);
});
test('never overwrites an existing approved different price and supports reruns', () => {
  const items = fresh();
  items[0] = { ...items[0], pricePiastres: 25000, pricing: 'paid' };
  const outcome = compareOwnerStartingPrices(items);
  assert.equal(outcome.conflicts.length, 1);
  assert.equal(outcome.updates.length, 73);
  for (let i = 0; i < items.length; i++) items[i] = { ...items[i], pricePiastres: OWNER_STARTING_PRICES[i].pricePiastres, pricing: 'paid', displayName: OWNER_STARTING_PRICES[i].displayName };
  const completed = compareOwnerStartingPrices(items);
  assert.equal(completed.updates.length, 0);
  assert.equal(completed.unchanged.length, 74);
});
test('rejects partial or duplicate catalogs before any write', () => {
  assert.throws(() => compareOwnerStartingPrices(fresh().slice(1)), /complete 74/);
  const duplicate = fresh(); duplicate[1] = duplicate[0];
  assert.throws(() => compareOwnerStartingPrices(duplicate), /Duplicate/);
});
