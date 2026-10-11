import test from 'node:test';
import assert from 'node:assert/strict';
import { publicProductFilter, getPublicationIssues, getStockDeduction } from '../src/catalog/product-policy.js';

test('purchasable product filter requires strictly positive, confirmed price', () => {
  const filter = publicProductFilter();
  assert.deepEqual(filter.pricePiastres, { $gt: 0 });
  assert.equal(filter.status, 'ready');
  assert.equal(filter.published, true);
  assert.equal(filter.priceApproved, true);
});

test('a zero price is rejected for ready publication even if incorrectly approved', () => {
  const product = { pricePiastres: 0, priceApproved: true, inventory: { approved: true }, categoryId: 'fixture', mainImageKey: 'fixture.webp', variants: [] };
  assert.ok(getPublicationIssues(product).some(item => item.field === 'priceApproved'));
});

test('made-on-demand products never deduct stock and unavailable products cannot be ordered', () => {
  assert.equal(getStockDeduction({ mode: 'made_to_order', quantity: null, available: true }, 3), 0);
  assert.throws(() => getStockDeduction({ mode: 'made_to_order', quantity: null, available: false }, 1));
});
