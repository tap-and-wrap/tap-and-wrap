import test from 'node:test';
import assert from 'node:assert/strict';
import { presentOrder, presentOrderSummary } from '../src/commerce/order-presentation.js';

const secret = 'PRIVATE_OPERATIONAL_MARKER';
const snapshot = { _id: '012345678901234567890123', orderNumber: '234567', owner: secret, requestHash: secret,
  customer: { name: 'Fixture Customer', address: 'Fixture Address', phone: '+201012345678', email: 'customer@example.test', governorate: 'cairo', internalNote: secret },
  lines: [{ name: 'Synthetic Product', quantity: 1, unitPricePiastres: 10000, lineTotalPiastres: 10000, privateKey: secret,
    personalization: { 'customer-name': 'Fixture', privateObject: { objectKey: secret } }, customization: { templateName: 'Synthetic Template', internalNote: secret,
      fields: { engraving_text: 'Fixture engraving' }, selections: [{ label: 'Fixture option', quantity: 1, internalNote: secret }],
      engraving: { text: 'Fixture engraving', privateKey: secret, engraving_font: { key: 'font', label: 'Approved font', privateKey: secret } } } }],
  totals: { subtotalPiastres: 10000, totalPiastres: 19000, shippingPiastres: 9000, discountPiastres: 0, privateKey: secret, applied: [{ kind: 'bundle', name: 'Fixture bundle', discountPiastres: 0, internalNote: secret }] },
  history: [{ event: 'state_changed', actor: 'admin:012345678901234567890123', reason: secret, privateKey: secret,
    from: { fulfillmentState: 'received', privateKey: secret }, to: { fulfillmentState: 'confirmed', privateKey: secret } },
  { event: 'state_changed', actor: 'admin:012345678901234567890123', internalNote: secret, publicReason: 'Approved customer explanation' }],
  paymentMethod: 'cod', paymentState: 'unpaid', fulfillmentState: 'confirmed', uploadIds: [], revision: 1 };

test('customer order DTO allowlists every Mixed snapshot and hides legacy/internal notes', () => {
  const value = presentOrder(snapshot);
  assert.equal(JSON.stringify(value).includes(secret), false);
  assert.equal(value.history[0].reason, undefined);
  assert.equal(value.history[1].reason, 'Approved customer explanation');
  assert.equal(value.history[0].actor, 'admin');
  assert.equal(value.lines[0].personalization['customer-name'], 'Fixture');
  assert.equal(value.lines[0].customization.engraving.engraving_font.label, 'Approved font');
  assert.equal(value.owner, undefined);
});

test('authorized admin DTO retains private legacy notes without spreading unknown record fields', () => {
  const value = presentOrder(snapshot, { admin: true });
  assert.equal(value.history[0].internalNote, secret);
  assert.equal(value.history[1].internalNote, secret);
  assert.equal(value.history[0].actor, 'admin:012345678901234567890123');
  assert.equal(value.lines[0].privateKey, undefined);
  assert.equal(value.customer.internalNote, undefined);
});

test('lightweight customer/admin order summaries omit private snapshots and unknown fields', () => {
  const customer = presentOrderSummary(snapshot);
  assert.equal(JSON.stringify(customer).includes(secret), false);
  assert.equal(customer.customer, undefined);
  const admin = presentOrderSummary(snapshot, { admin: true });
  assert.deepEqual(admin.customer, { name: 'Fixture Customer', governorate: 'cairo' });
  assert.equal(admin.history, undefined);
});
