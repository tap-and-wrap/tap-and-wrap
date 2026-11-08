import test from 'node:test';
import assert from 'node:assert/strict';
import { publicProductFilter, getPublicationIssues, getStockDeduction } from '../src/catalog/product-policy.js';

test('purchase candidate filter separates positive prices from legacy readiness', () => {
  const filter = publicProductFilter();
  assert.deepEqual(filter.pricePiastres, { $gt: 0 });
  assert.equal(filter.status, undefined);
  assert.equal(filter.priceApproved, undefined);
  assert.equal(filter['purchaseSetup.options'].$ne, 'unresolved');
  assert.deepEqual(filter.$or, [{ 'inventory.approved': true }, { 'variants.0': { $exists: true } }]);
});

test('a zero price is rejected for ready publication even if incorrectly approved', () => {
  const product = { pricePiastres: 0, priceApproved: true, inventory: { approved: true }, categoryId: 'fixture', mainImageKey: 'fixture.webp', variants: [] };
  assert.ok(getPublicationIssues(product).some(item => item.field === 'priceApproved'));
});

test('made-on-demand products never deduct stock and unavailable products cannot be ordered', () => {
  assert.equal(getStockDeduction({ mode: 'made_to_order', quantity: null, available: true }, 3), 0);
  assert.throws(() => getStockDeduction({ mode: 'made_to_order', quantity: null, available: false }, 1));
});
