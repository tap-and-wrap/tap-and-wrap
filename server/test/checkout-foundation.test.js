import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import mongoose from 'mongoose';
import { startTestDatabase } from './helpers/database.js';
import { app } from '../src/app.js';
import { Order } from '../src/models/Order.js';
import { OrderSettlement } from '../src/models/OrderSettlement.js';
import { Product } from '../src/models/Product.js';
import { Category } from '../src/models/Category.js';
import { User } from '../src/models/User.js';
import { Session } from '../src/models/Session.js';
import { newSessionToken, hashSession, makeCsrfToken } from '../src/utils/tokens.js';
import { presentOrder } from '../src/commerce/order-presentation.js';
import { Upload } from '../src/models/Upload.js';
import { CheckoutIntent } from '../src/models/CheckoutIntent.js';
import ShippingConfig from '../src/models/ShippingConfig.js';
import DiscountCode from '../src/models/DiscountCode.js';
import { env } from '../src/config/env.js';
import { addCartItem } from '../src/commerce/cart.js';
import { prepareCheckout, placeOrder, changeOrderState } from '../src/commerce/orders.js';
import { mutateOrderAccounting, orderAccounting } from '../src/commerce/order-accounting.js';
import { signUpload, completeUpload } from '../src/commerce/uploads.js';
import { createMemoryStorage, setStorageForTests } from '../src/commerce/storage.js';
import { whatsappQuotation } from '../src/commerce/whatsapp-quotation.js';
import { renderEmailTemplate } from '../src/email/templates.js';
import { NotificationEvent } from '../src/models/NotificationEvent.js';

const owner = `guest:${'a'.repeat(64)}`, stranger = `guest:${'b'.repeat(64)}`;
const customer = { name: 'Isolated Customer', email: 'fixture@example.test', phone: '01012345678', governorate: 'cairo', address: '10 Isolated Test Street' };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWO4NbsXAARVAgOYIL6CAAAAAElFTkSuQmCC', 'base64');
let database, product, admin, storage, server, base;
before(async () => { database = await startTestDatabase({ transactions: true }); server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}/api/v1`; });
after(async () => { env.checkoutEnabled = false; setStorageForTests(); await new Promise(resolve => server.close(resolve)); await database.stop(); });
beforeEach(async () => {
  for (const model of Object.values(mongoose.models)) await model.deleteMany({});
  env.checkoutEnabled = true; storage = createMemoryStorage(); setStorageForTests(storage);
  admin = await User.create({ name: 'Isolated admin', email: 'admin@example.test', role: 'admin', active: true, passwordHash: 'fixture' });
  const category = await Category.create({ name: 'Isolated', slug: 'isolated' });
  product = await Product.create({ name: 'Approved fixture', slug: 'approved-fixture', categoryId: category._id, mainImageKey: 'fixture/main.webp', galleryKeys: ['fixture/main.webp'], visibility: 'public', status: 'ready', reviewRequired: false, priceApproved: true, pricePiastres: 12000, inventory: { mode: 'tracked', quantity: 10, approved: true, available: true } });
});
async function create(method = 'instapay', { who = owner, variantKey, discountCode, userId } = {}) {
  await addCartItem(who, { productId: String(product._id), quantity: 1, ...(variantKey ? { variantKey } : {}) });
  const checkoutKey = randomUUID();
  const input = { checkoutKey, paymentMethod: method, governorate: 'cairo', ...(discountCode ? { discountCode } : {}) };
  const quote = await prepareCheckout(who, input, userId);
  const body = { checkoutKey, paymentMethod: method, customer, ...(discountCode ? { discountCode } : {}) };
  const order = await placeOrder(who, body, userId);
  return { order, quote, body, who };
}
async function operation(orderId, input, { who = null, actor = admin } = {}) {
  const current = await Order.findById(orderId);
  return mutateOrderAccounting(orderId, who, { revision: current.revision, ...input }, actor);
}
const collection = (amount = 12000, reference = randomUUID()) => ({ action: 'collection', operationKey: randomUUID(), scope: 'merchandise', amountPiastres: amount, method: 'instapay', reference, reconciled: true, reason: 'Verified actual receiving account' });
async function acceptDelivery(id, amount = 9000, method = 'instapay') {
  await operation(id, { action: 'quote_charge', chargeId: 'shipping', pricing: 'quoted', amountPiastres: amount, collectionMethod: method });
  await operation(id, { action: 'accept_charge', chargeId: 'shipping', accepted: true, customerConfirmed: true, reason: 'Customer confirmed exact delivery fee in WhatsApp' });
}
async function state(id, next) { const order = await Order.findById(id); return changeOrderState(id, null, { revision: order.revision, fulfillmentState: next, publicReason: ['returned', 'delivery_failed'].includes(next) ? 'Documented isolated delivery/return circumstances' : undefined }, admin); }
async function readyProof(id) { const uploadId = await proof(id); await operation(id, { action: 'submit_proof', uploadId }, { who: owner, actor: null }); }
async function proof(id) {
  const signed = await signUpload(owner, { purpose: 'payment_proof', orderId: id, mimeType: 'image/png', sizeBytes: PNG.length });
  const upload = await Upload.findById(signed.upload.id).select('+temporaryKey'); storage.put(upload.temporaryKey, PNG);
  await completeUpload(signed.upload.id, owner); return signed.upload.id;
}
test('COD creates merchandise-only immutable snapshot with null pending shipping and no default shipping configuration', async () => {
  const { order, quote, body } = await create('cod');
  assert.equal(quote.totals.shippingPiastres, null); assert.equal(order.totals.totalPiastres, 12000);
  const saved = await Order.findById(order.id); assert.equal(saved.charges[0].amountPiastres, null); assert.equal(saved.charges[0].state, 'pending');
  assert.equal(saved.paymentState, 'unpaid'); assert.ok(saved.followUpDueAt > saved.createdAt);
  assert.equal(await ShippingConfig.countDocuments(), 0);
  assert.equal((await placeOrder(owner, body)).id, order.id); assert.equal((await Product.findById(product._id)).inventory.quantity, 9);
});
test('InstaPay order-first proof ownership, rejection, replacement and retry preserve retained files without marking Paid', async () => {
  await assert.rejects(signUpload(owner, { purpose: 'payment_proof', checkoutKey: randomUUID(), mimeType: 'image/png', sizeBytes: PNG.length }));
  const { order } = await create(); assert.equal(order.paymentState, 'awaiting_transfer');
  await assert.rejects(signUpload(stranger, { purpose: 'payment_proof', orderId: order.id, mimeType: 'image/png', sizeBytes: PNG.length }));
  env.checkoutEnabled = false; const uploadId = await proof(order.id);
  const input = { revision: 0, action: 'submit_proof', uploadId };
  await mutateOrderAccounting(order.id, owner, input); await mutateOrderAccounting(order.id, owner, input);
  assert.equal((await Order.findById(order.id)).paymentState, 'awaiting_verification');
  await operation(order.id, { action: 'reject_proof', reason: 'Transfer not found; replace evidence without paying again' });
  const replacement = await proof(order.id); await operation(order.id, { action: 'submit_proof', uploadId: replacement }, { who: owner, actor: null });
  const saved = await Order.findById(order.id); assert.equal(saved.uploadIds.length, 2); assert.equal(saved.paymentState, 'awaiting_verification');
  assert.equal((await Upload.findById(uploadId)).state, 'retained'); assert.equal(await OrderSettlement.countDocuments(), 0);
});
test('WhatsApp delivery quotation needs actual customer acceptance and never changes original merchandise settlement', async () => {
  const { order } = await create(); await readyProof(order.id); await operation(order.id, collection());
  await operation(order.id, { action: 'quote_charge', chargeId: 'shipping', pricing: 'quoted', amountPiastres: 9000, collectionMethod: 'cod' });
  await assert.rejects(operation(order.id, { action: 'accept_charge', chargeId: 'shipping', accepted: true, customerConfirmed: false }));
  const accepted = await operation(order.id, { action: 'accept_charge', chargeId: 'shipping', accepted: true, customerConfirmed: true, reason: 'Accepted EGP 90 COD via WhatsApp' });
  const summary = await orderAccounting(accepted, { admin: true });
  assert.equal(summary.merchandiseCollectedPiastres, 12000); assert.equal(summary.outstandingPiastres, 9000);
  assert.equal(accepted.totals.totalPiastres, 12000); assert.equal(accepted.totals.shippingPiastres, null);
  assert.equal(summary.charges[0].acceptanceChannel, 'whatsapp');
  const message = whatsappQuotation(accepted, summary); assert.match(message.text, /EGP 90.00/); assert.match(message.url, /^https:\/\/wa.me\/201/); assert.equal(message.deliveryConfirmed, false);
  await assert.rejects(operation(order.id, { action: 'quote_charge', chargeId: 'shipping', pricing: 'quoted', amountPiastres: 10000, collectionMethod: 'cod' }));
});
test('zero/missing add-on quotes remain pending and explicit Free is separate and requires acceptance', async () => {
  const { order } = await create();
  let saved = await operation(order.id, { action: 'quote_charge', kind: 'addon', label: 'Owner-reviewed add-on', pricing: 'quoted', amountPiastres: 0, collectionMethod: 'instapay' });
  assert.equal(saved.charges[1].amountPiastres, null); assert.equal(saved.charges[1].state, 'pending');
  const addonId = saved.charges[1].id;
  saved = await operation(order.id, { action: 'quote_charge', chargeId: addonId, pricing: 'free', amountPiastres: 0, collectionMethod: 'instapay' });
  assert.equal(saved.charges[1].state, 'offered'); assert.equal(saved.charges[1].amountPiastres, 0);
  await assert.rejects(operation(order.id, { ...collection(100), scope: addonId }));
  saved = await operation(order.id, { action: 'accept_charge', chargeId: addonId, accepted: true }, { who: owner, actor: null });
  assert.equal(saved.charges[1].state, 'accepted'); assert.equal((await orderAccounting(saved)).unresolvedCharges, 1);
});
test('actual partial/late/overpaid transfers, reference deduplication and bounded refunds retain financial history', async () => {
  const { order } = await create(); await readyProof(order.id); const first = collection(5000, 'ACTUAL-TRANSFER-ONE');
  const saved = await operation(order.id, first); assert.equal(saved.paymentState, 'partially_paid');
  await mutateOrderAccounting(order.id, null, { revision: saved.revision - 1, ...first }, admin);
  assert.equal(await OrderSettlement.countDocuments(), 1);
  await assert.rejects(operation(order.id, collection(5000, 'actual-transfer-one')));
  const paid = await operation(order.id, collection(8000)); assert.equal(paid.paymentState, 'paid');
  assert.equal((await orderAccounting(paid)).overpaymentPiastres, 1000);
  const source = await OrderSettlement.findOne({ reference: 'ACTUAL-TRANSFER-ONE' });
  await assert.rejects(operation(order.id, { ...collection(6000), action: 'refund', refundOf: String(source._id) }));
  const refunded = await operation(order.id, { ...collection(1000), action: 'refund', refundOf: String(source._id) });
  assert.equal((await orderAccounting(refunded)).refundedPiastres, 1000); assert.equal(source.amountPiastres, 5000);
});
test('paid cancellation requires bank reconciliation and restocks once; money remains flagged until refund review', async () => {
  const { order } = await create(); await readyProof(order.id); await operation(order.id, collection());
  await assert.rejects(operation(order.id, { action: 'cancel', reason: 'Customer cancellation', reconciled: false }));
  const saved = await operation(order.id, { action: 'cancel', reason: 'Customer cancellation after actual bank review', reconciled: true });
  assert.equal(saved.fulfillmentState, 'cancelled'); assert.equal((await Product.findById(product._id)).inventory.quantity, 10);
  assert.equal((await orderAccounting(saved)).refundReviewRequired, true);
  await assert.rejects(operation(order.id, { action: 'cancel', reason: 'Duplicate cancellation', reconciled: true }));
  const late = await operation(order.id, collection(1000)); assert.equal((await orderAccounting(late)).refundReviewRequired, true);
});
test('COD refused delivery does not automatically restock; inspected resellable quantities are reconciled once', async () => {
  const { order } = await create('cod'); await acceptDelivery(order.id, 9000, 'cod');
  await state(order.id, 'confirmed'); await state(order.id, 'preparing'); await state(order.id, 'out_for_delivery'); await state(order.id, 'delivery_failed');
  assert.equal((await Product.findById(product._id)).inventory.quantity, 9);
  await operation(order.id, { action: 'inventory_return', quantities: [1], inspected: true, reason: 'Physical return received and inspected resellable' });
  assert.equal((await Product.findById(product._id)).inventory.quantity, 10);
  await assert.rejects(operation(order.id, { action: 'inventory_return', quantities: [1], inspected: true, reason: 'Duplicate return' }));
});
test('discount redemption is reversed only by explicit reviewed cancellation operation', async () => {
  const discount = await DiscountCode.create({ code: 'FIXTURE', name: 'Isolated discount', active: true, kind: 'fixed', value: 1000 });
  const { order } = await create('cod', { discountCode: 'FIXTURE' }); assert.equal(order.totals.totalPiastres, 11000);
  await assert.rejects(operation(order.id, { action: 'release_discount', reason: 'Too early' }));
  await operation(order.id, { action: 'cancel', reason: 'Customer cancellation', reconciled: true });
  assert.equal((await DiscountCode.findById(discount._id)).usedCount, 1);
  await operation(order.id, { action: 'release_discount', reason: 'Coupon policy permits restoring cancelled usage' });
  assert.equal((await DiscountCode.findById(discount._id)).usedCount, 0);
  await assert.rejects(operation(order.id, { action: 'release_discount', reason: 'Duplicate reversal' }));
});
test('last-unit contention, stale quotes and current approval restrictions remain authoritative', async () => {
  await Product.updateOne({ _id: product._id }, { $set: { 'inventory.quantity': 1 } });
  const one = await create('cod');
  await assert.rejects(create('cod', { who: stranger })); assert.equal(await Order.countDocuments(), 1);
  assert.equal((await Product.findById(product._id)).inventory.quantity, 0);
  assert.equal((await placeOrder(owner, one.body)).id, one.order.id);
  await Product.updateOne({ _id: product._id }, { $set: { 'inventory.quantity': 1 } });
  await addCartItem(stranger, { productId: String(product._id), quantity: 1 }); const checkoutKey = randomUUID();
  await prepareCheckout(stranger, { checkoutKey, governorate: 'cairo', paymentMethod: 'cod' });
  await CheckoutIntent.updateOne({ checkoutKey }, { $set: { expiresAt: new Date(0) } });
  await assert.rejects(placeOrder(stranger, { checkoutKey, customer, paymentMethod: 'cod' }));
  assert.equal((await Product.findById(product._id)).inventory.quantity, 1);
});
test('foreign owners/customers cannot mutate payments and legacy snapshots fail closed without conversion', async () => {
  const { order } = await create();
  await assert.rejects(operation(order.id, collection(), { who: owner, actor: null }));
  await assert.rejects(operation(order.id, { action: 'accept_charge', chargeId: 'shipping', accepted: true }, { who: stranger, actor: null }));
  await Order.collection.updateOne({ _id: new mongoose.Types.ObjectId(order.id) }, { $unset: { accountingVersion: '' } });
  await assert.rejects(operation(order.id, collection()));
});
test('order-first email is merchandise-only with pending delivery; no email provider is invoked', async () => {
  const { order } = await create(); const event = await NotificationEvent.findOne({ event: 'order_received' }).lean();
  const rendered = renderEmailTemplate(event, { clientOrigin: 'https://shop.example.test' });
  assert.match(rendered.text, /merchandise amount/i); assert.match(rendered.text, /01060673073/); assert.match(rendered.text, /12 hours/);
  assert.doesNotMatch(rendered.text, /including shipping/);
  await readyProof(order.id); await operation(order.id, collection(6000));
  const partial = renderEmailTemplate(await NotificationEvent.findOne({ event: 'payment_confirmed' }).lean(), { clientOrigin: 'https://shop.example.test' });
  assert.match(partial.text, /Merchandise payment status: partially paid/);
  assert.match(partial.text, /Recorded collections: EGP 60.00/);
  assert.match(partial.text, /Agreed outstanding balance: EGP 60.00/);
});
test('combined COD collection allocates merchandise and shipping once under one receipt reference', async () => {
  const { order } = await create('cod'); await acceptDelivery(order.id, 9000, 'cod');
  await state(order.id, 'confirmed'); await state(order.id, 'preparing'); await state(order.id, 'out_for_delivery');
  const paid = await operation(order.id, { ...collection(21000, 'COMBINED-COD-RECEIPT'), scope: 'all_agreed', method: 'cod' });
  const summary = await orderAccounting(paid, { admin: true });
  assert.equal(summary.merchandiseCollectedPiastres, 12000); assert.equal(summary.charges[0].outstandingPiastres, 0); assert.equal(summary.outstandingPiastres, 0);
  assert.equal(summary.settlements.length, 1); assert.equal(summary.settlements[0].allocations.length, 2);
});
test('a completed partial remedy refund reduces agreed payable without rewriting merchandise history', async () => {
  const { order } = await create(); await readyProof(order.id); await operation(order.id, collection());
  const source = await OrderSettlement.findOne({ orderId: order.id, direction: 'collection' });
  const refunded = await operation(order.id, { ...collection(2000), action: 'refund', refundOf: String(source._id), reducePayable: true, reason: 'Reviewed remedy for an incorrect supplied item; actual refund confirmed' });
  const summary = await orderAccounting(refunded);
  assert.equal(summary.merchandisePiastres, 12000); assert.equal(summary.merchandisePayablePiastres, 10000); assert.equal(summary.merchandiseCollectedPiastres, 10000);
  assert.equal(summary.refundedPiastres, 2000); assert.equal(refunded.totals.totalPiastres, 12000);
});
test('WhatsApp-first accepted custom orders default InstaPay, need prior COD authorization and do not require website proof or email', async () => {
  const base = { owner, orderNumber: '681243', checkoutKey: randomUUID(), requestHash: 'isolated', customer: { name: 'WhatsApp customer', phone: '+201012345678' }, lines: [{ name: 'Owner-quoted custom work' }], totals: { totalPiastres: 15000 }, accountingVersion: 1, orderChannel: 'owner_quotation', quotationAcceptedAt: new Date(), paymentMethod: 'instapay', paymentState: 'awaiting_transfer', charges: [] };
  const custom = await Order.create(base); assert.deepEqual([...custom.allowedPaymentMethods], ['instapay']);
  await assert.rejects(Order.create({ ...base, orderNumber: '681244', checkoutKey: randomUUID(), paymentMethod: 'cod', allowedPaymentMethods: ['cod'] }));
  await assert.rejects(signUpload(owner, { purpose: 'payment_proof', orderId: String(custom._id), mimeType: 'image/png', sizeBytes: PNG.length }));
  const paid = await operation(String(custom._id), collection(15000)); assert.equal(paid.paymentState, 'paid');
  assert.equal(await NotificationEvent.countDocuments({ orderId: custom._id }), 0);
  assert.equal(await Upload.countDocuments(), 0);
});
test('regular website InstaPay cannot bypass order-bound evidence and personalized COD needs prior quotation authorization', async () => {
  const { order } = await create(); await assert.rejects(operation(order.id, collection()));
  await readyProof(order.id); const saved = await operation(order.id, collection()); assert.equal(saved.paymentState, 'paid');
  const personalized = await Order.create({ owner, orderNumber: '681245', checkoutKey: randomUUID(), requestHash: 'isolated', customer, lines: [], totals: { totalPiastres: 1000 }, accountingVersion: 1, personalized: true, paymentMethod: 'instapay', paymentState: 'awaiting_transfer', charges: [{ id: 'shipping', kind: 'shipping', label: 'Delivery', amountPiastres: null, state: 'pending' }] });
  await assert.rejects(operation(String(personalized._id), { action: 'quote_charge', chargeId: 'shipping', pricing: 'quoted', amountPiastres: 9000, collectionMethod: 'cod' }));
  const offered = await operation(String(personalized._id), { action: 'quote_charge', chargeId: 'shipping', pricing: 'quoted', amountPiastres: 9000, collectionMethod: 'cod', codAuthorized: true });
  assert.equal(offered.charges[0].state, 'offered');
});
test('preparation cancellation needs explicit inspected quantities instead of inventing resellable stock', async () => {
  const { order } = await create('cod'); await state(order.id, 'confirmed'); await state(order.id, 'preparing');
  await assert.rejects(operation(order.id, { action: 'cancel', reason: 'Work already started' }));
  await operation(order.id, { action: 'cancel', inspected: true, quantities: [0], reason: 'Personalized work is not resellable after inspection' });
  assert.equal((await Product.findById(product._id)).inventory.quantity, 9);
});
test('new financial endpoints enforce administrator, CSRF and Origin checks; duplicate references can be located securely', async () => {
  const { order } = await create(); await readyProof(order.id); await operation(order.id, collection(12000, 'SECURE-REFERENCE'));
  const lookup = `${base}/admin/commerce/settlements/lookup?method=instapay&reference=secure-reference`;
  assert.equal((await fetch(lookup)).status, 401);
  const token = newSessionToken(), csrf = makeCsrfToken(env.sessionSecret);
  await Session.create({ userId: admin._id, tokenHash: hashSession(token), expiresAt: new Date(Date.now() + 3600000) });
  const headers = { Cookie: `tw_session=${token}; tw_csrf=${csrf}`, Origin: env.clientOrigin, 'x-csrf-token': csrf, 'Content-Type': 'application/json' };
  const found = await fetch(lookup, { headers }); assert.equal(found.status, 200); assert.equal((await found.json()).data.settlement.orderId, order.id);
  const detail = await fetch(`${base}/admin/commerce/orders/${order.id}`, { headers });
  const claims = (await detail.json()).data.order.inventoryClaims;
  assert.equal(claims[0].sourceId, String(product._id)); assert.equal(claims[0].label, product.name);
  const path = `${base}/admin/commerce/orders/${order.id}/accounting`, body = JSON.stringify({ revision: 2, action: 'cancel', reconciled: true, reason: 'PRIVATE_BANK_NOTE', publicReason: 'Customer requested cancellation' });
  assert.equal((await fetch(path, { method: 'POST', headers: { ...headers, 'x-csrf-token': 'invalid' }, body })).status, 403);
  assert.equal((await fetch(path, { method: 'POST', headers: { ...headers, Origin: 'https://untrusted.example' }, body })).status, 403);
  const result = await fetch(path, { method: 'POST', headers, body }); assert.equal(result.status, 200);
  const saved = await Order.findById(order.id).lean(); assert.equal(JSON.stringify(presentOrder(saved)).includes('PRIVATE_BANK_NOTE'), false);
  assert.equal(JSON.stringify(presentOrder(saved, { admin: true })).includes('PRIVATE_BANK_NOTE'), true);
});
