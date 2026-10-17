import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import mongoose from 'mongoose';
import { app } from '../src/app.js';
import { startTestDatabase } from './helpers/database.js';
import { Product } from '../src/models/Product.js';
import { Category } from '../src/models/Category.js';
import { ComponentOption } from '../src/models/ComponentOption.js';
import CustomizationTemplate from '../src/models/CustomizationTemplate.js';
import { ServiceRequest } from '../src/models/ServiceRequest.js';
import { Order } from '../src/models/Order.js';
import { Upload } from '../src/models/Upload.js';
import { User } from '../src/models/User.js';
import { Session } from '../src/models/Session.js';
import { newSessionToken, hashSession, makeCsrfToken } from '../src/utils/tokens.js';
import { env } from '../src/config/env.js';
import { serviceRequestInput, requestActionInput } from '../src/commerce/request-validation.js';
import { createServiceRequest, actOnServiceRequest, requestWhatsapp } from '../src/commerce/service-requests.js';
import { mutateOrderAccounting, orderAccounting } from '../src/commerce/order-accounting.js';
import { changeOrderState, orderFiles } from '../src/commerce/orders.js';
import { signUpload, completeUpload, openPrivateUpload, deleteUpload } from '../src/commerce/uploads.js';
import { createMemoryStorage, setStorageForTests } from '../src/commerce/storage.js';
import { componentEstimate } from '../src/commerce/request-policy.js';
import { NotificationEvent } from '../src/models/NotificationEvent.js';
import { renderEmailTemplate } from '../src/email/templates.js';

const owner = `guest:${'a'.repeat(64)}`, stranger = `guest:${'b'.repeat(64)}`;
const customer = { name: 'Isolated Request Customer', phone: '01012345678' };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWO4NbsXAARVAgOYIL6CAAAAAElFTkSuQmCC', 'base64');
let database, server, base, product, pack, admin, storage, headers;
before(async () => { database = await startTestDatabase({ transactions: true }); server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}/api/v1`; });
after(async () => { env.customRequestsEnabled = false; setStorageForTests(); env.checkoutEnabled = false; await new Promise(resolve => server.close(resolve)); await database.stop(); });
beforeEach(async () => {
  env.customRequestsEnabled = true;
  for (const model of Object.values(mongoose.models)) await model.deleteMany({});
  env.checkoutEnabled = true; storage = createMemoryStorage(); setStorageForTests(storage);
  admin = await User.create({ name: 'Isolated admin', email: 'admin@example.test', role: 'admin', active: true, passwordHash: 'fixture' });
  const token = newSessionToken(), csrf = makeCsrfToken(env.sessionSecret); await Session.create({ userId: admin._id, tokenHash: hashSession(token), expiresAt: new Date(Date.now() + 3600000) });
  headers = { Cookie: `tw_session=${token}; tw_csrf=${csrf}`, Origin: env.clientOrigin, 'x-csrf-token': csrf, 'Content-Type': 'application/json' };
  const category = await Category.create({ name: 'Isolated Requests', slug: 'isolated-requests' });
  product = await Product.create({ name: 'Unpriced engraving fixture', slug: 'engraving-fixture', categoryId: category._id, visibility: 'public', reviewRequired: false,
    mainImageKey: 'fixture/a.webp', galleryKeys: ['fixture/a.webp'], pricePiastres: null, priceApproved: false,
    engravingRequest: { enabled: true, fonts: ['Owner approved font'], placements: ['Front'], materials: [], maxTextLength: 80 }, inventory: { mode: 'tracked', quantity: 10, approved: false, available: true } });
  pack = await ComponentOption.create({ name: 'Gift packaging fixture', slug: 'gift-packaging-fixture', catalogRole: 'Gift Packaging', categoryId: category._id, reviewRequired: false,
    pricePiastres: 999999, priceApproved: false, inventory: { mode: 'tracked', quantity: 10, approved: false, available: true },
    requestPolicy: { enabled: true, services: ['gift_box'], availability: 'available', pricing: 'fixed', unitPricePiastres: 2500 } });
});
function input(patch = {}) { return serviceRequestInput.parse({ requestKey: randomUUID(), service: 'gift_box', customer, details: { occasion: 'Birthday', contents: 'Owner-reviewed bespoke contents', quantity: 1 }, ...patch }); }
const create = (body = input(), who = owner) => createServiceRequest(who, body);
async function action(record, action, patch = {}) { const current = await ServiceRequest.findById(record._id).lean(); return actOnServiceRequest(String(record._id), requestActionInput.parse({ revision: current.revision, action, reason: 'Isolated actual owner review evidence', ...(action === 'convert' ? { delivery: { governorate: 'cairo', address: '10 Isolated Delivery Street' } } : {}), ...patch }), admin); }
function quote(components = [], extra = {}) { return { baseUnitPiastres: 10000, discountPiastres: 0, shippingPiastres: 5000, shippingFree: false,
  charges: components.map(item => ({ componentId: String(item._id), label: item.name, quantity: 1, pricing: 'fixed', unitPricePiastres: 2500 })), allowedPaymentMethods: ['instapay'], codAuthorized: false, ...extra }; }
async function accepted(record, offered = quote(), method = 'instapay') { await action(record, 'prepare', { quote: offered }); await action(record, 'share'); return action(record, 'accept', { customerConfirmed: true, method }); }
async function reference(key, who = owner) { const signed = await signUpload(who, { purpose: 'service_reference', requestKey: key, mimeType: 'image/png', sizeBytes: PNG.length }); const upload = await Upload.findById(signed.upload.id).select('+temporaryKey'); storage.put(upload.temporaryKey, PNG); await completeUpload(upload._id, who); return signed.upload.id; }
async function settle(orderId, amount, patch = {}) { const order = await Order.findById(orderId); return mutateOrderAccounting(String(orderId), null, { revision: order.revision, action: 'collection', operationKey: randomUUID(), scope: 'all_agreed', method: 'instapay', amountPiastres: amount, reference: randomUUID(), reconciled: true, reason: 'Independent account reconciliation, not screenshot', ...patch }, admin); }

test('template-free accountless gift and manual engraving requests create no order and allocate no stock', async () => {
  env.checkoutEnabled = false;
  const gift = await create(); assert.match(gift.reference, /^TW-[A-F0-9]{12}$/); assert.equal(gift.customer.email, null);
  const engraving = await create(input({ service: 'laser_engraving', details: { productReference: 'My item for review', engravingType: 'text', engravingText: 'Name', quantity: 1 } }));
  assert.equal(engraving.estimate.baseUnitPiastres, null); assert.equal(await CustomizationTemplate.countDocuments(), 0); assert.equal(await Order.countDocuments(), 0);
  assert.equal((await ComponentOption.findById(pack._id)).inventory.quantity, 10);
});
test('components require explicit service eligibility; unapproved imported amounts stay hidden and zero/missing remain pending', async () => {
  const record = await create(input({ components: [{ componentId: String(pack._id), quantity: 2 }] })); assert.equal(record.estimate.knownSubtotalPiastres, 5000); assert.equal(JSON.stringify(record).includes('999999'), false);
  assert.equal(componentEstimate({ ...pack.toObject(), requestPolicy: { pricing: 'fixed', unitPricePiastres: 0 } }).unitPricePiastres, null);
  assert.equal(componentEstimate({ ...pack.toObject(), requestPolicy: { pricing: 'free', unitPricePiastres: null } }).unitPricePiastres, 0);
  for (const patch of [{ 'requestPolicy.services': ['laser_engraving'] }, { 'requestPolicy.enabled': false }, { 'requestPolicy.availability': 'unavailable' }]) {
    await ComponentOption.updateOne({ _id: pack._id }, { $set: patch }); await assert.rejects(create(input({ components: [{ componentId: String(pack._id), quantity: 1 }] })));
  }
});
test('unpriced engraving products use only approved choices and reject fabricated fonts or missing selected variants', async () => {
  const details = { productId: String(product._id), engravingType: 'text', engravingText: 'Name', font: 'Owner approved font', placement: 'Front', quantity: 1 };
  const record = await create(input({ service: 'laser_engraving', details })); assert.equal(record.estimate.baseUnitPiastres, null);
  await assert.rejects(create(input({ service: 'laser_engraving', details: { ...details, font: 'Invented font' } })));
  await Product.updateOne({ _id: product._id }, { $set: { visibility: 'withdrawn' } }); await assert.rejects(create(input({ service: 'laser_engraving', details })));
});
test('private request images are request-key/guest-bound, retained once and inaccessible to another guest', async () => {
  const body = input(), uploadId = await reference(body.requestKey); body.uploadIds = [uploadId];
  await assert.rejects(create(body, stranger)); await assert.rejects(create({ ...body, requestKey: randomUUID() }));
  const record = await create(body); const upload = await Upload.findById(uploadId); assert.equal(upload.state, 'retained'); assert.equal(String(upload.requestId), String(record._id)); assert.equal(upload.orderId, undefined); assert.equal(upload.quotaReleased, false);
  await assert.rejects(openPrivateUpload(uploadId, stranger)); await assert.rejects(deleteUpload(uploadId, owner));
  assert.equal((await create(body)).reference, record.reference);
});
test('concurrent immutable retries create one request; changed payloads cannot reuse its key', async () => {
  const body = input(); const results = await Promise.all([create(body), create(body)]); assert.equal(results[0].reference, results[1].reference); assert.equal(await ServiceRequest.countDocuments(), 1);
  await assert.rejects(create({ ...body, details: { ...body.details, contents: 'Changed after uncertainty' } }));
  assert.equal(serviceRequestInput.safeParse({ ...body, quote: { amount: 1 } }).success, false);
});
test('quotation sharing and actual WhatsApp acceptance are explicit, versioned and method-restricted', async () => {
  const record = await create(); await assert.rejects(action(record, 'accept', { customerConfirmed: true, method: 'instapay' }));
  await assert.rejects(action(record, 'prepare', { quote: quote([], { allowedPaymentMethods: ['cod'] }) }));
  const prepared = await action(record, 'prepare', { quote: quote() }); const text = requestWhatsapp(prepared); assert.equal(text.deliveryConfirmed, false); assert.match(text.text, /01060673073/);
  assert.equal((await ServiceRequest.findById(record._id)).state, 'quote_prepared');
  await action(record, 'share'); await assert.rejects(action(record, 'accept', { customerConfirmed: false, method: 'instapay' }));
  await assert.rejects(action(record, 'accept', { customerConfirmed: true, method: 'cod' }));
  const saved = await action(record, 'accept', { customerConfirmed: true, method: 'instapay' }); assert.equal(saved.quotations[0].acceptance.channel, 'whatsapp');
  const revised = await action(record, 'prepare', { quote: quote([], { baseUnitPiastres: 12000 }) }); assert.equal(revised.quotations.length, 2); assert.ok(revised.quotations[0].acceptance); assert.equal(revised.quotations[1].acceptance, undefined);
  await assert.rejects(action(record, 'convert'));
});
test('conversion requires authorized launch, real approved inventory and atomically binds files/order without duplicate allocation', async () => {
  const body = input({ components: [{ componentId: String(pack._id), quantity: 1 }] }); body.uploadIds = [await reference(body.requestKey)]; const record = await create(body); await accepted(record, quote([pack]));
  env.checkoutEnabled = false; await assert.rejects(action(record, 'convert')); env.checkoutEnabled = true;
  await assert.rejects(action(record, 'convert')); assert.equal(await Order.countDocuments(), 0); assert.equal((await ComponentOption.findById(pack._id)).inventory.quantity, 10);
  await ComponentOption.updateOne({ _id: pack._id }, { $set: { 'inventory.quantity': 2, 'inventory.approved': true } });
  const saved = await action(record, 'convert'); await action(record, 'convert'); const order = await Order.findById(saved.orderId); assert.equal(await Order.countDocuments(), 1); assert.equal((await ComponentOption.findById(pack._id)).inventory.quantity, 1);
  assert.equal(order.orderChannel, 'owner_quotation'); assert.equal(order.allowedPaymentMethods[0], 'instapay'); assert.equal(order.acceptedQuotation.totalPiastres, 17500); assert.equal((await orderFiles(order)).length, 1);
  assert.equal((await Upload.findById(body.uploadIds[0])).quotaReleased, true);
});
test('custom orders remain partially paid until the full accepted quote is reconciled through the existing ledger', async () => {
  const record = await create(); await accepted(record); const converted = await action(record, 'convert');
  const partial = await settle(converted.orderId, 10000); assert.equal(partial.paymentState, 'partially_paid');
  const paid = await settle(converted.orderId, 5000); assert.equal(paid.paymentState, 'paid'); assert.equal((await orderAccounting(paid)).outstandingPiastres, 0);
  await assert.rejects(action(record, 'prepare', { quote: quote([], { baseUnitPiastres: 20000 }) }));
  await assert.rejects(mutateOrderAccounting(String(paid._id), null, { action: 'quote_charge', revision: paid.revision, kind: 'addon' }, admin));
});
test('accepted custom COD requires prior authorization and actual collection after dispatch', async () => {
  const record = await create(); await accepted(record, quote([], { allowedPaymentMethods: ['cod'], codAuthorized: true }), 'cod'); const converted = await action(record, 'convert');
  await assert.rejects(settle(converted.orderId, 15000, { method: 'cod' }));
  for (const fulfillmentState of ['confirmed', 'preparing', 'out_for_delivery']) { const order = await Order.findById(converted.orderId); await changeOrderState(order._id, null, { revision: order.revision, fulfillmentState }, admin); }
  assert.equal((await settle(converted.orderId, 15000, { method: 'cod' })).paymentState, 'paid');
});
test('request HTTP endpoints protect private data, mutations, images and quote acceptance while options work with zero templates', async () => {
  const options = await fetch(`${base}/commerce/service-requests/options/laser_engraving`); assert.equal(options.status, 200); const data = (await options.json()).data; assert.equal(data.products.length, 1); assert.equal(data.products[0].basePricePiastres, null);
  const record = await create(); assert.equal((await fetch(`${base}/admin/commerce/service-requests/${record._id}`)).status, 401);
  const path = `${base}/admin/commerce/service-requests/${record._id}/action`, body = JSON.stringify({ revision: 0, action: 'review', reason: 'Actual review' });
  assert.equal((await fetch(path, { method: 'POST', headers: { ...headers, 'x-csrf-token': 'invalid' }, body })).status, 403);
  assert.equal((await fetch(path, { method: 'POST', headers: { ...headers, Origin: 'https://foreign.example' }, body })).status, 403);
  assert.equal((await fetch(path, { method: 'POST', headers, body })).status, 200);
  assert.equal((await fetch(path, { method: 'POST', headers, body })).status, 409);
  const foreign = await fetch(`${base}/commerce/service-requests/submissions/${record.requestKey}`); assert.equal((await foreign.json()).data.request, null);
  const detail = await fetch(`${base}/admin/commerce/service-requests/${record._id}`, { headers }); assert.equal(detail.status, 200); const json = await detail.json(); assert.equal(JSON.stringify(json).includes('objectKey'), false); assert.match(detail.headers.get('cache-control'), /no-store/);
});

test('two accepted requests cannot oversell the last component; failed conversion rolls back the whole order', async () => {
  await ComponentOption.updateOne({ _id: pack._id }, { $set: { 'inventory.approved': true, 'inventory.quantity': 1 } });
  const one = await create(input({ components: [{ componentId: String(pack._id), quantity: 1 }] }));
  const two = await create(input({ components: [{ componentId: String(pack._id), quantity: 1 }] }), stranger);
  await accepted(one, quote([pack])); await accepted(two, quote([pack]));
  const results = await Promise.allSettled([action(one, 'convert'), action(two, 'convert')]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1); assert.equal(await Order.countDocuments(), 1); assert.equal((await ComponentOption.findById(pack._id)).inventory.quantity, 0);
});
test('cancellation/refund reconciliation permits a replacement version without losing old quotes, ledger or retained files', async () => {
  const body = input(); body.uploadIds = [await reference(body.requestKey)]; const record = await create(body); await accepted(record); const old = await action(record, 'convert');
  await settle(old.orderId, 15000); const original = await Order.findById(old.orderId);
  await mutateOrderAccounting(String(old.orderId), null, { revision: original.revision, action: 'cancel', reconciled: true, reason: 'Actual cancellation and account review' }, admin);
  await assert.rejects(action(record, 'prepare', { quote: quote() }));
  const financial = await orderAccounting(await Order.findById(old.orderId), { admin: true }); const collection = financial.settlements[0];
  // Refund each original receipt allocation through the existing ledger.
  for (const allocation of collection.allocations) { const current = await Order.findById(old.orderId); await mutateOrderAccounting(String(old.orderId), null, { revision: current.revision, action: 'refund', operationKey: randomUUID(), scope: allocation.scope, method: 'instapay', amountPiastres: allocation.amountPiastres, reference: randomUUID(), refundOf: collection.id, reconciled: true, reason: 'Actual completed reviewed refund' }, admin); }
  await action(record, 'prepare', { quote: quote([], { baseUnitPiastres: 12000 }) }); await action(record, 'share'); await action(record, 'accept', { customerConfirmed: true, method: 'instapay' }); const replacement = await action(record, 'convert');
  assert.notEqual(String(replacement.orderId), String(old.orderId)); assert.equal(replacement.quotations[0].orderId, String(old.orderId)); assert.equal(await Order.countDocuments(), 2);
  assert.equal((await orderFiles(await Order.findById(old.orderId))).length, 1); assert.equal((await orderFiles(await Order.findById(replacement.orderId))).length, 1);
});
test('usable optional email queues supporting copies without sending or attaching private instructions or files', async () => {
  const record = await create(input({ customer: { ...customer, email: 'fixture@example.test' } })); await accepted(record);
  const events = await NotificationEvent.find({ requestId: record._id }).lean(); assert.equal(events.length, 3);
  const quotation = events.find(event => event.event === 'request_quotation'); const rendered = renderEmailTemplate(quotation, { clientOrigin: 'https://shop.example.test' });
  assert.match(rendered.text, /Quotation v1: EGP 150.00/); assert.doesNotMatch(rendered.text, /\/login/); assert.equal(events.every(event => event.state === 'queued'), true);
  const converted = await action(record, 'convert');
  const received = await NotificationEvent.findOne({ orderId: converted.orderId, event: 'order_received' }).lean();
  const orderCopy = renderEmailTemplate(received, { clientOrigin: 'https://shop.example.test' });
  assert.match(orderCopy.text, /Accepted quotation total: EGP 150.00/); assert.match(orderCopy.text, /No website return visit is required/); assert.doesNotMatch(orderCopy.text, /Review the secure order page/);
});

test('conversion requires a real delivery address and rechecks withdrawn engraving options and new variants', async () => {
  await Product.updateOne({ _id: product._id }, { $set: { 'inventory.approved': true, 'inventory.quantity': 2 } });
  const record = await create(input({ service: 'laser_engraving', details: { productId: String(product._id), engravingType: 'text', engravingText: 'Alice', font: 'Owner approved font', placement: 'Front' } }));
  await accepted(record);
  await assert.rejects(action(record, 'convert', { delivery: undefined }), /delivery address/);
  await Product.updateOne({ _id: product._id }, { $set: { 'engravingRequest.fonts': ['Replacement font'] } });
  await assert.rejects(action(record, 'convert'), /options changed/);
  await Product.updateOne({ _id: product._id }, { $set: { 'engravingRequest.fonts': ['Owner approved font'], variants: [{ key: 'new-option', attributes: [{ name: 'Size', value: 'Small' }], inventory: { mode: 'tracked', quantity: 2, approved: true, available: true } }] } });
  await assert.rejects(action(record, 'convert'), /variants changed/);
  assert.equal(await Order.countDocuments(), 0);
  await Product.updateOne({ _id: product._id }, { $set: { variants: [] } });
  const converted = await action(record, 'convert');
  assert.equal((await Order.findById(converted.orderId)).customer.address, '10 Isolated Delivery Street');
  assert.equal((await Product.findById(product._id)).inventory.quantity, 1);
});

test('admin request pricing approval is independent, normalizes zero to pending and never approves placeholder stock', async () => {
  const path = `${base}/admin/commerce/components/${pack._id}`;
  let revision = 0;
  for (const [pricing, unitPricePiastres, expected] of [['fixed', 0, 'pending'], ['fixed', null, 'pending'], ['free', 0, 'free'], ['fixed', 2500, 'fixed']]) {
    const response = await fetch(path, { method: 'PATCH', headers, body: JSON.stringify({ expectedRevision: revision, requestPolicy: { enabled: true, services: ['gift_box'], availability: 'available', pricing, unitPricePiastres } }) });
    assert.equal(response.status, 200); const record = (await response.json()).data.component; revision = record.revision;
    assert.equal(record.requestPolicy.pricing, expected); assert.equal(record.inventory.approved, false); assert.equal(record.inventory.quantity, 10); assert.equal(record.priceApproved, false);
  }
  assert.equal((await fetch(path, { method: 'PATCH', headers, body: JSON.stringify({ expectedRevision: 0, requestPolicy: { enabled: false } }) })).status, 400);
});
