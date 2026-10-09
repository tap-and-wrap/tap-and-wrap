import assert from 'node:assert/strict';
import test from 'node:test';
import { adminOrderActions } from '../../client/src/admin/order-actions.js';
import { validateOrderTransition } from '../src/commerce/orders.js';

const fulfillmentStates = ['received', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'];
const paymentStates = ['unpaid', 'awaiting_verification', 'paid', 'rejected'];
function allowed(order, fulfillmentState, paymentState) {
  try {
    validateOrderTransition(order, { revision: order.revision, fulfillmentState: fulfillmentState || undefined, paymentState: paymentState || undefined, publicReason: 'Synthetic transition explanation' }, { admin: true });
    return true;
  } catch { return false; }
}

test('admin status choices match the real server for reachable order states and simultaneous updates', () => {
  let checked = 0;
  for (const paymentMethod of ['cod', 'instapay']) for (const fulfillmentState of fulfillmentStates) for (const paymentState of paymentStates) {
    const order = { paymentMethod, fulfillmentState, paymentState, revision: 4 };
    if (paymentMethod === 'cod' && !['unpaid', 'paid'].includes(paymentState)) continue;
    if (paymentMethod === 'instapay' && paymentState === 'unpaid') continue;
    if (!allowed(order, '', '')) continue;
    const choices = adminOrderActions(order);
    for (const next of fulfillmentStates.filter(state => state !== fulfillmentState)) {
      assert.equal(choices.fulfillment.includes(next), allowed(order, next, ''), `${paymentMethod}/${fulfillmentState}/${paymentState} → ${next}`);
      checked++;
    }
    for (const next of paymentStates.filter(state => state !== paymentState)) {
      assert.equal(choices.payment.includes(next), allowed(order, '', next), `${paymentMethod}/${fulfillmentState}/${paymentState} payment → ${next}`);
      checked++;
    }
    for (const nextPayment of choices.payment) {
      const combined = adminOrderActions(order, { paymentState: nextPayment });
      for (const nextFulfillment of combined.fulfillment) {
        assert.equal(allowed(order, nextFulfillment, nextPayment), true, `Unsafe combined choice ${JSON.stringify({ order, nextFulfillment, nextPayment })}`);
        checked++;
      }
    }
  }
  assert.ok(checked > 100, 'Contract coverage must include the complete state families');
});

test('COD collection is absent before delivery and InstaPay advancement requires verification', () => {
  for (const state of ['received', 'confirmed', 'preparing']) {
    assert.deepEqual(adminOrderActions({ fulfillmentState: state, paymentState: 'unpaid', paymentMethod: 'cod' }).payment, []);
  }
  const pending = { fulfillmentState: 'received', paymentState: 'awaiting_verification', paymentMethod: 'instapay', revision: 2 };
  assert.deepEqual(adminOrderActions(pending).fulfillment, ['cancelled']);
  assert.deepEqual(adminOrderActions(pending).payment, ['paid', 'rejected']);
  assert.deepEqual(adminOrderActions(pending, { paymentState: 'paid' }).fulfillment, ['confirmed']);
  assert.equal(allowed(pending, 'confirmed', ''), false);
  assert.equal(allowed(pending, 'confirmed', 'paid'), true);
});

test('paid cancellation and terminal-state payment choices remain rejected by the real server', () => {
  const paid = { paymentMethod: 'instapay', paymentState: 'paid', fulfillmentState: 'confirmed', revision: 3 };
  assert.equal(adminOrderActions(paid).fulfillment.includes('cancelled'), false);
  assert.equal(allowed(paid, 'cancelled', ''), false);
  const cancelled = { paymentMethod: 'cod', paymentState: 'unpaid', fulfillmentState: 'cancelled', revision: 3 };
  assert.deepEqual(adminOrderActions(cancelled), { fulfillment: [], payment: [] });
  assert.equal(allowed(cancelled, '', 'paid'), false);
  assert.throws(() => validateOrderTransition(paid, { revision: 2, fulfillmentState: 'preparing' }, { admin: true }), { code: 'ORDER_CHANGED' });
});
