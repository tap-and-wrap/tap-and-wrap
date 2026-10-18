import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import mongoose from 'mongoose';
import { app } from '../src/app.js';
import { startTestDatabase } from './helpers/database.js';
import { Order } from '../src/models/Order.js';
import { ServiceRequest } from '../src/models/ServiceRequest.js';
import { NotificationEvent, ORDER_NOTIFICATION_EVENTS, REQUEST_NOTIFICATION_EVENTS, OWNER_NOTIFICATION_EVENTS } from '../src/models/NotificationEvent.js';
import { User } from '../src/models/User.js';
import { Session } from '../src/models/Session.js';
import { env } from '../src/config/env.js';
import { makeCsrfToken, newSessionToken, hashSession } from '../src/utils/tokens.js';
import { contactTiming, HOUR, enqueueOwnerEvents } from '../src/commerce/owner-notifications.js';
import { attentionQueue, recordContact, operationMessages } from '../src/commerce/operations.js';
import { enqueueOrderEvent, enqueueRequestEvent, runNotificationBatch, setNotificationProviderForTests } from '../src/commerce/notifications.js';
import { renderEmailTemplate } from '../src/email/templates.js';
import { checkEmailConfiguration } from '../scripts/check-email.js';
import { createResendProvider } from '../src/commerce/notifications.js';
import { Category } from '../src/models/Category.js';
import { Product } from '../src/models/Product.js';
import { addCartItem } from '../src/commerce/cart.js';
import { prepareCheckout, placeOrder } from '../src/commerce/orders.js';
import { createServiceRequest, actOnServiceRequest } from '../src/commerce/service-requests.js';
import { serviceRequestInput, requestActionInput } from '../src/commerce/request-validation.js';

let database, server, base, admin, headers;
const now = new Date(Date.now() + 1000);
const customer = { name: 'Synthetic Customer', phone: '+201012345678', email: null };
const plus = hours => new Date(now.getTime() + hours * HOUR);
before(async () => { database = await startTestDatabase({ transactions: true }); server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}/api/v1/admin/commerce`; });
after(async () => { env.customRequestsEnabled = false; setNotificationProviderForTests(); for (const name of ['OWNER_NOTIFICATIONS_ENABLED', 'OWNER_NOTIFICATION_RECIPIENT', 'OWNER_NOTIFICATION_RECIPIENT_CONFIRMED', 'NOTIFICATION_DELIVERY_NOT_BEFORE']) delete process.env[name]; await new Promise(resolve => server.close(resolve)); await database.stop(); });
beforeEach(async () => {
  env.customRequestsEnabled = true;
  for (const Model of Object.values(mongoose.models)) await Model.deleteMany({}); setNotificationProviderForTests();
  process.env.OWNER_NOTIFICATIONS_ENABLED = 'true'; process.env.OWNER_NOTIFICATION_RECIPIENT = 'owner@example.test'; process.env.OWNER_NOTIFICATION_RECIPIENT_CONFIRMED = 'true'; delete process.env.NOTIFICATION_DELIVERY_NOT_BEFORE;
  admin = await User.create({ name: 'Synthetic Owner', email: 'admin@example.test', role: 'admin', active: true, passwordHash: 'fixture' });
  const token = newSessionToken(), csrf = makeCsrfToken(env.sessionSecret); await Session.create({ userId: admin._id, tokenHash: hashSession(token), expiresAt: plus(24) });
  headers = { Cookie: `tw_session=${token}; tw_csrf=${csrf}`, Origin: env.clientOrigin, 'x-csrf-token': csrf, 'Content-Type': 'application/json' };
});
function order(patch = {}) { return Order.create({ owner: `guest:${'a'.repeat(64)}`, orderNumber: '123456', checkoutKey: randomUUID(), requestHash: 'fixture', customer, lines: [], totals: { totalPiastres: 45000 }, accountingVersion: 1, paymentMethod: 'instapay', paymentState: 'awaiting_transfer', createdAt: now, charges: [{ id: 'shipping', kind: 'shipping', amountPiastres: null, state: 'pending' }], ...patch }); }
function request(patch = {}) { return ServiceRequest.create({ owner: `guest:${'a'.repeat(64)}`, reference: 'TW-ABCDEF123456', requestKey: randomUUID(), requestHash: 'fixture', service: 'gift_box', customer, details: { contents: 'Private instructions never mailed', quantity: 1 }, estimate: { shippingPiastres: null }, createdAt: now, followUpDueAt: plus(12), ...patch }); }
async function contacted(kind, record, at = now, patch = {}) { return recordContact(kind, String(record._id), { revision: record.revision, operationKey: randomUUID(), action: 'contact', note: 'Actual WhatsApp contact evidence', ...patch }, admin, at); }
function provider(options = {}) { const sent = []; setNotificationProviderForTests({ supportsIdempotency: false, async send(event) { sent.push(event); return { id: `synthetic:${event.eventKey}` }; }, ...options }); return sent; }

test('attention queue bounds larger workloads to twenty and paginates without exposing private order content', async () => {
  await Promise.all(Array.from({ length: 41 }, (_, index) => order({ orderNumber: String(200000 + index), history: [{ note: 'Private operator note' }] })));
  const pages = await Promise.all([1, 2, 3].map(page => attentionQueue({ page, view: 'initial' }, plus(1))));
  assert.deepEqual(pages.map(page => page.records.length), [20, 20, 1]);
  assert.ok(pages.every(page => page.pagination.total === 41 && page.pagination.pages === 3));
  assert.equal(new Set(pages.flatMap(page => page.records.map(row => row.id))).size, 41);
  assert.doesNotMatch(JSON.stringify(pages), /Private operator note|requestHash|checkoutKey|objectKey/);
});

for (const kind of ['order', 'request']) test(`${kind}: exact 0/9/12-hour boundaries send only one initial-contact email`, async () => {
  const record = await (kind === 'order' ? order() : request());
  const enqueue = () => kind === 'order' ? enqueueOrderEvent(record, 'order_received') : enqueueRequestEvent(record, 'request_received');
  await enqueue(); await enqueue(); assert.equal(await NotificationEvent.countDocuments(), 1);
  const sent = provider(); await runNotificationBatch({ now }); assert.equal(sent.length, 1); assert.equal(sent[0].event, 'owner_new');
  await runNotificationBatch({ now: new Date(plus(9).getTime() - 1) }); assert.equal(sent.length, 1);
  await Promise.all([runNotificationBatch({ now: plus(9) }), runNotificationBatch({ now: plus(9) })]); assert.equal(sent.length, 1);
  assert.equal(contactTiming(record, new Date(plus(12).getTime() - 1)).overdue, false);
  assert.equal(contactTiming(record, plus(12)).overdue, true);
  await runNotificationBatch({ now: plus(12) }); await runNotificationBatch({ now: plus(40) }); assert.equal(sent.length, 1);
  await contacted(kind, record, plus(13)); const saved = await (kind === 'order' ? Order : ServiceRequest).findById(record._id).lean();
  assert.equal(contactTiming(saved, plus(14)).overdue, false); assert.equal(saved.contactHistory.length, 1); assert.equal(saved.paymentState, kind === 'order' ? 'awaiting_transfer' : undefined);
});
test('recorded contact has no email reminder; immutable retries and stale revisions preserve audit history', async () => {
  const record = await order(); await enqueueOrderEvent(record, 'order_received'); const sent = provider(); await runNotificationBatch({ now });
  const key = randomUUID(); await contacted('order', record, plus(8), { operationKey: key }); await contacted('order', record, plus(8), { operationKey: key });
  assert.equal((await Order.findById(record._id)).contactHistory.length, 1);
  await assert.rejects(contacted('order', record, plus(8)), { code: 'EDIT_CONFLICT' });
  await runNotificationBatch({ now: plus(9) }); assert.equal(sent.length, 1); assert.equal(await NotificationEvent.countDocuments({ event: 'owner_contact_reminder' }), 0);
});

test('legacy queued reminder emails are suppressed and newly created owner alerts do not replay', async () => {
  const record = await order(); await enqueueOrderEvent(record, 'order_received');
  const immediate = provider(); await runNotificationBatch({ now }); assert.equal(immediate.length, 1);
  await NotificationEvent.create({ eventKey: 'legacy-owner-reminder', orderId: record._id,
    event: 'owner_contact_reminder', audience: 'owner', recipient: 'owner@example.test',
    snapshot: {}, state: 'queued', attempts: 0, nextAttemptAt: plus(9) });
  const later = provider(); await runNotificationBatch({ now: plus(9) });
  assert.equal(later.length, 0);
  assert.equal((await NotificationEvent.findOne({ event: 'owner_contact_reminder' })).state, 'suppressed');
  const second = await order({ orderNumber: '123457' }); await enqueueOrderEvent(second, 'order_received');
  const fresh = provider(); await runNotificationBatch({ now }); assert.equal(fresh.length, 1);
  await runNotificationBatch({ now: plus(24) }); assert.equal(fresh.length, 1);
});

test('interrupted Resend dispatch is uncertain and cannot replay after the provider idempotency window', async () => {
  const record = await order(); await enqueueOrderEvent(record, 'order_received');
  await NotificationEvent.updateOne({ event: 'owner_new' }, { $set: { state: 'processing', leaseUntil: new Date(now - 1), dispatchStartedAt: new Date(now - 2000), dispatchProvider: 'resend' } });
  const sent = provider(); await runNotificationBatch({ now });
  assert.equal((await NotificationEvent.findOne({ event: 'owner_new' })).lastErrorCode, 'DELIVERY_UNCERTAIN');
  await runNotificationBatch({ now: plus(48) }); assert.equal(sent.length, 0);
});
test('closed records and reminders first processed at 12 hours never generate a late reminder', async () => {
  const record = await request(); await enqueueRequestEvent(record, 'request_received'); const sent = provider(); await runNotificationBatch({ now });
  await runNotificationBatch({ now: plus(12) }); assert.equal(sent.length, 1); assert.equal(await NotificationEvent.countDocuments({ event: 'owner_contact_reminder' }), 0);
  await ServiceRequest.updateOne({ _id: record._id }, { $set: { state: 'cancelled' } }); assert.equal(contactTiming(await ServiceRequest.findById(record._id), plus(15)).overdue, false);
});
test('missing owner configuration and optional customer email never block requests, and converted orders do not duplicate the request sequence', async () => {
  process.env.OWNER_NOTIFICATION_RECIPIENT_CONFIRMED = 'false'; const record = await request(); await enqueueRequestEvent(record, 'request_received'); assert.equal(await NotificationEvent.countDocuments(), 0);
  process.env.OWNER_NOTIFICATION_RECIPIENT_CONFIRMED = 'true'; await enqueueRequestEvent(record, 'request_received');
  const converted = await order({ serviceRequestId: record._id }); await enqueueOrderEvent(converted, 'order_received'); assert.equal(await NotificationEvent.countDocuments(), 1);
  await enqueueOrderEvent(converted, 'payment_rejected', { eventVersion: 3 }); assert.equal(await NotificationEvent.countDocuments({ event: 'owner_action' }), 1);
});
test('unrelated owner alerts have independent deduplication and cannot alter financial or acceptance states', async () => {
  const record = await order(); const events = ['proof_submitted', 'charge_accepted', 'payment_rejected', 'cancellation_requested', 'delivery_failed', 'returned'];
  for (const event of events) { await enqueueOrderEvent(record, event, { eventVersion: 3 }); await enqueueOrderEvent(record, event, { eventVersion: 3 }); }
  const bespoke = await request(); await enqueueRequestEvent(bespoke, 'request_accepted', { eventVersion: 2 });
  await enqueueOrderEvent(record, 'payment_confirmed', { eventVersion: 4 });
  assert.equal(await NotificationEvent.countDocuments({ event: 'owner_action' }), 8);
  const sent = provider(); await runNotificationBatch({ now: plus(1) }); assert.equal(sent.length, 8); assert.equal((await Order.findById(record._id)).paymentState, 'awaiting_transfer'); assert.equal((await ServiceRequest.findById(bespoke._id)).state, 'submitted');
});

test('real checkout and zero-template request transactions enqueue owner alerts before any provider work', async () => {
  const category = await Category.create({ name: 'Synthetic gifts', slug: 'synthetic-gifts' });
  const product = await Product.create({ name: 'Approved synthetic fixture', slug: 'approved-synthetic-fixture', categoryId: category._id, status: 'ready', published: true, visibility: 'public', reviewRequired: false, priceApproved: true, pricePiastres: 45000, inventory: { mode: 'tracked', quantity: 2, approved: true, available: true }, mainImageKey: 'fixture/a.webp', galleryKeys: ['fixture/a.webp'] });
  const owner = `guest:${'c'.repeat(64)}`, checkoutKey = randomUUID(); env.checkoutEnabled = true;
  try {
    await addCartItem(owner, { productId: String(product._id), quantity: 1 }); await prepareCheckout(owner, { checkoutKey, governorate: 'cairo', paymentMethod: 'cod' });
    await placeOrder(owner, { checkoutKey, paymentMethod: 'cod', customer: { ...customer, email: 'customer@example.test', governorate: 'cairo', address: '10 Synthetic Fixture Street' } });
  } finally { env.checkoutEnabled = false; }
  assert.equal(await NotificationEvent.countDocuments({ audience: 'owner' }), 1); assert.equal(await Order.countDocuments(), 1);
  const custom = await createServiceRequest(owner, serviceRequestInput.parse({ requestKey: randomUUID(), service: 'gift_box', customer: { name: customer.name, phone: '01012345678' }, details: { occasion: 'Birthday', contents: 'Synthetic request' } }));
  const action = async (name, patch = {}) => { const current = await ServiceRequest.findById(custom._id); return actOnServiceRequest(String(custom._id), requestActionInput.parse({ revision: current.revision, action: name, reason: 'Actual synthetic WhatsApp evidence', ...patch }), admin); };
  await action('prepare', { quote: { baseUnitPiastres: 10000, discountPiastres: 0, shippingPiastres: 5000, shippingFree: false, allowedPaymentMethods: ['instapay'], codAuthorized: false, charges: [] } }); await action('share'); await action('accept', { method: 'instapay', customerConfirmed: true });
  assert.equal(await NotificationEvent.countDocuments({ audience: 'owner' }), 3);
  provider({ async send() { throw Object.assign(new Error('Synthetic rejected operation'), { code: 'SMTP_TRANSIENT_FAILURE' }); } }); await runNotificationBatch({ now: plus(1) });
  assert.equal(await Order.countDocuments(), 1); assert.equal((await Product.findById(product._id)).inventory.quantity, 1); assert.equal((await ServiceRequest.findById(custom._id)).state, 'accepted');
});

test('Resend adapter distinguishes explicit rate limits from ambiguous acceptance without provider calls', async () => {
  const settings = { EMAIL_PROVIDER: 'resend', NOTIFICATIONS_ENABLED: 'true', RESEND_API_KEY: 'synthetic-private-value', NOTIFICATION_FROM: 'sender@example.test', NOTIFICATION_SAFE_RECIPIENTS: 'safe@example.test' };
  const event = { eventKey: 'synthetic:key', event: 'order_received', recipient: 'safe@example.test', snapshot: { orderNumber: '123456' } };
  const success = createResendProvider(settings, { request: async (url, options) => { assert.equal(options.headers['Idempotency-Key'], event.eventKey); assert.ok(options.signal); return { ok: true, json: async () => ({ id: 'synthetic-provider-id' }) }; } });
  assert.equal((await success.send(event)).id, 'synthetic-provider-id');
  for (const [status, code] of [[429, 'PROVIDER_RATE_LIMIT'], [503, 'DELIVERY_UNCERTAIN'], [403, 'SMTP_MESSAGE_REJECTED']]) await assert.rejects(createResendProvider(settings, { request: async () => ({ status, ok: false }) }).send(event), { code });
  await assert.rejects(createResendProvider(settings, { request: async () => { throw new Error('PRIVATE response'); } }).send(event), error => error.code === 'DELIVERY_UNCERTAIN' && !error.message.includes('PRIVATE'));
});
test('activation cutoff holds historical queued messages and cannot expose credentials or recipients in readiness', async () => {
  const record = await order({ customer: { ...customer, email: 'customer@example.test' } }); delete process.env.OWNER_NOTIFICATIONS_ENABLED;
  await enqueueOrderEvent(record, 'order_received'); const event = await NotificationEvent.findOne();
  process.env.NOTIFICATION_DELIVERY_NOT_BEFORE = new Date(event.createdAt.getTime() + 1).toISOString(); const sent = provider(); await runNotificationBatch({ now: plus(1) }); assert.equal(sent.length, 0);
  const result = checkEmailConfiguration({ EMAIL_PROVIDER: 'gmail', EMAIL_USER: 'secret@example.test', EMAIL_APP_PASSWORD: 'abcdefghijklmnop', EMAIL_ENABLED: 'true' });
  assert.equal(result.deliveryReady, false); assert.equal(result.connected, false); assert.doesNotMatch(JSON.stringify(result), /secret@example|abcdefghijklmnop/);
});
test('provider failure leaves authoritative orders accepted, and ambiguous delivery never replays after restart', async () => {
  const record = await order(); await enqueueOrderEvent(record, 'order_received');
  provider({ async send() { throw Object.assign(new Error('PRIVATE provider body'), { code: 'SMTP_DELIVERY_UNCERTAIN', terminal: true }); } });
  await runNotificationBatch({ now }); const event = await NotificationEvent.findOne({ event: 'owner_new' }); assert.equal(event.state, 'uncertain'); assert.doesNotMatch(JSON.stringify(event), /PRIVATE/);
  const sent = provider(); await runNotificationBatch({ now: plus(1) }); assert.equal(sent.length, 0); assert.equal((await Order.findById(record._id)).fulfillmentState, 'received');
});
test('attention queue uses original timestamps, linked order state, and excludes closed work without exposing file keys', async () => {
  const regular = await order(); const bespoke = await request();
  const queue = await attentionQueue({ page: 1, view: 'overdue' }, plus(12)); assert.equal(queue.records.length, 2); assert.equal(queue.records.every(row => row.timing.overdue), true);
  await contacted('order', regular, plus(13)); assert.equal((await attentionQueue({ page: 1, view: 'overdue' }, plus(14))).records.length, 1);
  await ServiceRequest.updateOne({ _id: bespoke._id }, { $set: { state: 'declined' } }); assert.equal((await attentionQueue({ page: 1, view: 'quote_preparation' }, now)).records.length, 0);
  assert.doesNotMatch(JSON.stringify(queue), /objectKey|temporaryKey|Private instructions/);
});

test('saved delivery quotations remain unaccepted when sharing/contact is recorded and legacy overdue filters clear after contact', async () => {
  const past = new Date(Date.now() - 13 * HOUR);
  const regular = await order({ createdAt: past, charges: [{ id: 'shipping', kind: 'shipping', state: 'offered', amountPiastres: 9000, quotedAt: past }] });
  const bespoke = await request({ createdAt: past });
  assert.equal((await attentionQueue({ page: 1, view: 'quote_sharing' })).records.length, 1);
  await contacted('order', regular, now, { action: 'quote_shared' });
  assert.equal((await Order.findById(regular._id)).charges[0].state, 'offered'); assert.equal((await Order.findById(regular._id)).initialContactAt, undefined);
  assert.equal((await attentionQueue({ page: 1, view: 'quote_sharing' })).records.length, 0); assert.equal((await attentionQueue({ page: 1, view: 'acceptance' })).records.length, 1);
  const latest = await Order.findById(regular._id); await contacted('order', latest); await contacted('request', bespoke);
  const orders = await fetch(`${base}/orders?action=follow_up_overdue`, { headers }); assert.equal((await orders.json()).data.orders.length, 0);
  const requests = await fetch(`${base}/service-requests?state=overdue`, { headers }); assert.equal((await requests.json()).data.requests.length, 0);
});
test('admin attention/contact/diagnostics require verified admin, CSRF and trusted Origin; review never resends', async () => {
  const record = await order(); assert.equal((await fetch(`${base}/attention`)).status, 401);
  const body = JSON.stringify({ revision: 0, operationKey: randomUUID(), action: 'contact', note: 'Actual contact evidence' });
  const path = `${base}/attention/order/${record._id}/contact`;
  assert.equal((await fetch(path, { method: 'POST', headers: { ...headers, Origin: 'https://foreign.example' }, body })).status, 403);
  assert.equal((await fetch(path, { method: 'POST', headers: { Cookie: headers.Cookie, Origin: headers.Origin, 'Content-Type': 'application/json' }, body })).status, 403);
  const result = await fetch(`${base}/attention`, { headers }); assert.equal(result.status, 200); assert.match(result.headers.get('cache-control'), /no-store/);
  const email = await NotificationEvent.create({ eventKey: randomUUID(), orderId: record._id, event: 'owner_new', audience: 'owner', recipient: 'owner@example.test', snapshot: {}, state: 'uncertain' });
  const reviewed = await fetch(`${base}/operations/notifications/${email._id}/review`, { method: 'POST', headers, body: JSON.stringify({ disposition: 'closed_no_resend', confirmed: true, note: 'Actual provider reconciliation complete' }) });
  assert.equal(reviewed.status, 200); assert.equal((await reviewed.json()).data.resent, false); assert.equal((await NotificationEvent.findById(email._id)).state, 'suppressed');
  const diagnostics = await fetch(`${base}/operations`, { headers }); assert.equal(diagnostics.status, 200); assert.doesNotMatch(JSON.stringify(await diagnostics.json()), /owner@example|provider reconciliation complete/);
  const customerUser = await User.create({ name: 'Customer fixture', role: 'customer', email: 'customer@example.test', passwordHash: 'fixture' });
  const token = newSessionToken(); await Session.create({ userId: customerUser._id, tokenHash: hashSession(token), expiresAt: plus(24) });
  assert.equal((await fetch(`${base}/attention`, { headers: { Cookie: `tw_session=${token}` } })).status, 403);
});
test('every customer/account/owner template is branded, escaped, mobile sized and free of private snapshots or tracking pixels', async () => {
  for (const event of [...ORDER_NOTIFICATION_EVENTS, ...REQUEST_NOTIFICATION_EVENTS, ...OWNER_NOTIFICATION_EVENTS]) {
    const rendered = renderEmailTemplate({ event, audience: event.startsWith('owner_') ? 'owner' : 'customer', snapshot: { requestReference: 'TW-ABCDEF123456', reference: '123456', phone: '+201012345678', charges: [{ label: '<script>unsafe & text</script>', amountPiastres: null, unitPricePiastres: 100, quantity: 1 }], quotationTotalPiastres: 100, baseUnitPiastres: 100, quantity: 1, discountPiastres: 0, shippingPiastres: 0, accountingVersion: 1, privateNote: 'PRIVATE_SECRET' } }, { clientOrigin: 'https://shop.example.test' });
    assert.match(rendered.html, /Unlock the Magic of Giving/); assert.match(rendered.text, /Thoughtful gifts, made personal/); assert.match(rendered.html, /max-width:600px/); assert.doesNotMatch(rendered.html, /<script>|PRIVATE_SECRET|<img|tracking|objectKey/);
    if (event.startsWith('owner_')) assert.match(rendered.html, /href="https:\/\/wa.me\/201012345678/);
  }
  const record = await order(); const messages = await operationMessages('order', record); assert.equal(messages.length, 6); assert.match(messages.find(row => row.key === 'payment').text, /01060673073/); assert.match(messages.find(row => row.key === 'shipping').text, /Pending confirmation/);
});
