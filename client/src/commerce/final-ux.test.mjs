import test from 'node:test';
import assert from 'node:assert/strict';
import { actionableProofInstructions } from './payment-proof-visibility.mjs';
import { accountDestination, authenticationError } from '../auth/feedback.mjs';
import { resolveGiftBoxEstimate } from '../gift-box/estimate-state.mjs';

test('matching amount survives bounded revalidation but never authorizes a purchase', () => {
  const query = { data: { componentSubtotalPiastres: 12000 }, dataUpdatedAt: 1000, isSuccess: true, isFetching: true };
  const options = { hasSelection: true, unavailable: false, now: 2000 };
  assert.equal(resolveGiftBoxEstimate(query, options).display, query.data);
  assert.equal(resolveGiftBoxEstimate(query, options).authoritative, null);
  for (const override of [{ isPlaceholderData: true }, { isError: true }, { data: undefined }, { dataUpdatedAt: -40000 }]) assert.equal(resolveGiftBoxEstimate({ ...query, ...override }, options).display, null);
  assert.equal(resolveGiftBoxEstimate(query, { ...options, hasSelection: false }).display, null);
  assert.equal(resolveGiftBoxEstimate(query, { ...options, unavailable: true }).display, null);
  assert.equal(resolveGiftBoxEstimate({ ...query, isFetching: false }, options).authoritative, query.data);
});
test('accepted screenshots stay quiet; rejected and independent authorized obligations remain actionable', () => {
  const order = { accountingVersion: 2, checkoutPayment: {}, proofStatus: 'submitted', paymentObligations: [{ id: 'products' }], paymentInstructionsByGroup: [{ scope: 'checkout', proofStatus: 'submitted' }, { scope: 'delivery', proofStatus: null }] };
  assert.deepEqual(actionableProofInstructions(order).map(item => item.scope), ['delivery']);
  assert.deepEqual(actionableProofInstructions({ ...order, proofStatus: 'rejected', paymentAttention: { receiptReplacementEnabled: true }, paymentInstructionsByGroup: [{ scope: 'checkout', proofStatus: 'rejected' }] }).map(item => item.scope), ['checkout']);
  assert.deepEqual(actionableProofInstructions({ ...order, paymentInstructionsByGroup: [{ scope: 'delivery', proofStatus: 'submitted' }] }), []);
  const legacy = { accountingVersion: 1, paymentMethod: 'instapay', collectionAuthorized: true, paymentInstructions: {}, proofStatus: 'submitted' };
  assert.deepEqual(actionableProofInstructions(legacy), []);
  assert.equal(actionableProofInstructions({ ...legacy, proofStatus: 'rejected' }).length, 1);
  assert.deepEqual(actionableProofInstructions({ ...legacy, proofStatus: 'rejected', collectionAuthorized: false }), []);
});
test('auth feedback preserves enumeration protection and safe account destinations', () => {
  assert.match(authenticationError({ response: { status: 401 } }), /email or password/);
  assert.match(authenticationError({ response: { status: 429 } }), /wait/);
  assert.match(authenticationError({}), /connection/);
  assert.equal(authenticationError({ response: { status: 409, data: { error: { message: 'Use account recovery.' } } } }), 'Use account recovery.');
  for (const path of ['//evil.example', '/\\evil.example', 'https://evil.example', '/admin']) assert.equal(accountDestination(false, path), '/my-orders');
  assert.equal(accountDestination(false, '/checkout'), '/checkout');
  assert.equal(accountDestination(true, '/admin/orders?view=verification'), '/admin/orders?view=verification');
});
