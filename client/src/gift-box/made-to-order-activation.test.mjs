import test from 'node:test';
import assert from 'node:assert/strict';
import { FIXED_COMPONENTS } from '../../../shared/gift-box/definitions.mjs';
import { planMadeToOrderActivation } from './made-to-order-activation.mjs';
const fixtures = () => FIXED_COMPONENTS.map((item, i) => ({ componentId: item.id, category: item.category,
  revision: i, pricing: 'paid', pricePiastres: 5000, enabled: false, available: false,
  inventoryMode: item.category === 'ribbon' ? 'status_only' : null }));
test('all 74 are planned with 53 made-to-order modes and no prices or stock counts written', () => {
  const plan = planMadeToOrderActivation(fixtures());
  assert.equal(plan.updates.length, 74);
  assert.equal(plan.conflicts.length, 0);
  assert.equal(plan.updates.filter(row => row.patch.inventoryMode === 'made_to_order').length, 53);
  assert.ok(plan.updates.every(row => Object.keys(row.patch).every(key => ['expectedRevision','enabled','available','inventoryMode'].includes(key))));
});
test('idempotent once activated', () => {
  const c = fixtures().map(row => ({ ...row, enabled: true, available: true,
    inventoryMode: row.category === 'ribbon' ? 'status_only' : 'made_to_order' }));
  assert.equal(planMadeToOrderActivation(c).updates.length, 0);
});
test('refuses partial, duplicate and stale catalog identities', () => {
  assert.throws(() => planMadeToOrderActivation(fixtures().slice(1)));
  const d = fixtures(); d[1] = d[0]; assert.throws(() => planMadeToOrderActivation(d));
  const bad = fixtures(); bad[0].revision = '0'; assert.throws(() => planMadeToOrderActivation(bad));
});
test('unapproved price or existing tracked stock is a hard conflict', () => {
  const c = fixtures(); c[0].pricePiastres = null; c[1].inventoryMode = 'tracked';
  const plan = planMadeToOrderActivation(c);
  assert.equal(plan.conflicts.length, 2);
  assert.equal(plan.updates.length, 72);
});
