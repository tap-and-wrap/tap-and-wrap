import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';
import { Product } from '../src/models/Product.js';
import { Category } from '../src/models/Category.js';
import { User } from '../src/models/User.js';
import { Session } from '../src/models/Session.js';
import { Upload } from '../src/models/Upload.js';
import { Order } from '../src/models/Order.js';
import { TrackingConsent } from '../src/models/TrackingConsent.js';
import { MetaEvent } from '../src/models/MetaEvent.js';
import CustomizationTemplate from '../src/models/CustomizationTemplate.js';
import { trackingSettings, publicTrackingPath, monetaryParameters, sanitizeParameters, recordQualifiedEvent, currentConsent, createMetaProvider, runMetaBatch, setMetaProviderForTests } from '../src/tracking/service.js';
import { resetTrackingLimitsForTests } from '../src/tracking/routes.js';
import { resetCommerceLimitsForTests } from '../src/commerce/routes.js';
import { createMemoryStorage, setStorageForTests } from '../src/commerce/storage.js';
import { newSessionToken, hashSession, makeCsrfToken } from '../src/utils/tokens.js';
import { startTestDatabase } from './helpers/database.js';
import { createWorkBudget } from '../src/commerce/work-budget.js';

const SETTINGS = { META_ENABLED: 'true', META_POLICY_APPROVED: 'true', META_PIXEL_ID: '123456789', META_CONSENT_POLICY_VERSION: 'isolated-v1', SITE_ORIGIN: 'https://merchant.example.test', META_CAPI_ENABLED: 'false', META_ACCESS_TOKEN: '', META_API_VERSION: 'v24.0' };
const original = Object.fromEntries(Object.keys(SETTINGS).map(key => [key, process.env[key]]));
const originalCheckout = env.checkoutEnabled;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X8kQAAAAASUVORK5CYII=', 'base64');
let fixture, server, origin, product, storage;
before(async () => { fixture = await startTestDatabase({ models: Object.values(mongoose.models), transactions: true }); server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); origin = `http://127.0.0.1:${server.address().port}/api/v1`; });
after(async () => { for (const [key, value] of Object.entries(original)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } env.checkoutEnabled = originalCheckout; setMetaProviderForTests(); setStorageForTests(); if (server) await new Promise(resolve => server.close(resolve)); await fixture?.stop(); });
beforeEach(async () => {
  resetTrackingLimitsForTests(); resetCommerceLimitsForTests();
  for (const model of Object.values(mongoose.models)) await model.deleteMany({});
  Object.assign(process.env, SETTINGS); env.checkoutEnabled = false; setMetaProviderForTests(); storage = createMemoryStorage(); setStorageForTests(storage);
  const category = await Category.create({ name: 'Isolated tracking category', slug: 'isolated-tracking-category' });
  product = await Product.create({ name: 'Isolated approved tracking product', slug: 'isolated-approved-tracking-product', description: 'Test fixture only', categoryId: category._id, mainImageKey: 'fixtures/approved.webp', galleryKeys: ['fixtures/approved.webp'], pricePiastres: 12000, priceApproved: true, inventory: { mode: 'tracked', quantity: 10, approved: true, available: true }, status: 'ready' });
});
function client() {
  const cookies = new Map([['tw_csrf', makeCsrfToken(env.sessionSecret)]]);
  return { cookies, async request(path, { method = 'GET', body, headers = {} } = {}) {
    const response = await fetch(origin + path, { method, headers: { Origin: env.clientOrigin, 'x-csrf-token': cookies.get('tw_csrf'), Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '), ...headers, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    for (const value of response.headers.getSetCookie()) { const pair = value.split(';')[0]; const index = pair.indexOf('='); cookies.set(pair.slice(0, index), pair.slice(index + 1)); }
    return { status: response.status, headers: response.headers, body: await response.json() };
  } };
}
const data = response => { assert.equal(response.body.ok, true, JSON.stringify(response.body)); return response.body.data; };
async function consent(browser) { assert.equal((await browser.request('/tracking/consent', { method: 'POST', body: { granted: true } })).status, 200); return TrackingConsent.findOne().lean(); }
async function add(browser, body = {}) { return browser.request('/commerce/cart/items', { method: 'POST', body: { productId: String(product._id), quantity: 1, ...body } }); }
async function quote(browser, paymentMethod = 'cod', checkoutKey = randomUUID()) { const response = await browser.request('/commerce/checkout/quote', { method: 'POST', body: { checkoutKey, paymentMethod, governorate: 'cairo' } }); assert.equal(response.status, 200, JSON.stringify(response.body)); return { checkoutKey, paymentMethod, quote: data(response) }; }
async function submit(browser, intent, paymentProofId) { return browser.request('/commerce/orders', { method: 'POST', body: { checkoutKey: intent.checkoutKey, paymentMethod: intent.paymentMethod, customer: { name: 'Isolated customer', email: 'safe@example.test', phone: '01012345678', governorate: 'cairo', address: 'Isolated fixture address in Cairo' }, ...(paymentProofId ? { paymentProofId } : {}) } }); }
async function proof(browser, intent) {
  const signed = data(await browser.request('/commerce/uploads/sign', { method: 'POST', body: { purpose: 'payment_proof', mimeType: 'image/png', sizeBytes: PNG.length, checkoutKey: intent.checkoutKey } }));
  const record = await Upload.findById(signed.upload.id).select('+temporaryKey'); storage.put(record.temporaryKey, PNG);
  data(await browser.request(`/commerce/uploads/${record._id}/complete`, { method: 'POST', body: {} })); return String(record._id);
}
async function admin() { const browser = client(); const user = await User.create({ name: 'Isolated admin', email: 'admin@example.test', passwordHash: 'fixture-hash', role: 'admin' }); const token = newSessionToken(); await Session.create({ userId: user._id, tokenHash: hashSession(token), expiresAt: new Date(Date.now() + 3600000) }); browser.cookies.set('tw_session', token); return browser; }

test('tracking requires all approved gates and never constructs a live test provider', async () => {
  assert.equal(trackingSettings({}).enabled, false);
  for (const key of ['META_ENABLED', 'META_POLICY_APPROVED', 'META_PIXEL_ID', 'META_CONSENT_POLICY_VERSION', 'SITE_ORIGIN']) assert.equal(trackingSettings({ ...SETTINGS, [key]: '' }).enabled, false);
  process.env.META_ENABLED = 'false';
  assert.equal(data(await client().request('/tracking/config')).pixelId, null);
  setMetaProviderForTests({ send: async () => { throw new Error('Must not send when globally disabled.'); } });
  assert.equal((await runMetaBatch()).enabled, false);
  assert.throws(() => createMetaProvider({ ...SETTINGS, META_CAPI_ENABLED: 'true', META_ACCESS_TOKEN: 'isolated-not-real' }), { code: 'TEST_PROVIDER_NOT_CONFIGURED' });
});
test('consent is HttpOnly, server-validated, revocable and isolated between browsers', async () => {
  const browser = client();
  const response = await browser.request('/tracking/consent', { method: 'POST', body: { granted: true } });
  assert.equal(response.status, 200); assert.ok(response.headers.get('set-cookie').includes('HttpOnly'));
  assert.equal(data(await browser.request('/tracking/config')).consent, true);
  assert.equal(data(await client().request('/tracking/config')).consent, false);
  assert.equal((await browser.request('/tracking/consent', { method: 'POST', body: { granted: false } })).status, 200);
  assert.equal(data(await browser.request('/tracking/config')).consent, false);
});
test('GPC and local denial suppress server actions even when an old consent cookie exists', async () => {
  const browser = client(); await consent(browser);
  for (const headers of [{ 'sec-gpc': '1' }, { 'x-tracking-consent': 'denied' }]) assert.equal(data(await browser.request('/tracking/config', { headers })).consent, false);
  assert.equal((await browser.request('/tracking/consent', { method: 'POST', headers: { 'sec-gpc': '1' }, body: { granted: true } })).status, 403);
  assert.equal(await currentConsent({ cookies: Object.fromEntries(browser.cookies), headers: { 'sec-gpc': '1' } }), null);
});
test('public event routes reject private pages, query strings, forged purchases and leaked fields', async () => {
  const browser = client(); await consent(browser);
  for (const path of ['/checkout', '/admin/products', '/my-orders', '/track-order', '/shop?q=private', '/reset-password#token=private']) {
    assert.equal(publicTrackingPath(path), false);
    assert.equal((await browser.request('/tracking/events', { method: 'POST', body: { name: 'PageView', eventId: randomUUID(), path } })).status, 400);
  }
  assert.equal((await browser.request('/tracking/events', { method: 'POST', body: { name: 'Purchase', eventId: randomUUID(), path: '/' } })).status, 400);
  assert.equal((await browser.request('/tracking/events', { method: 'POST', body: { name: 'Contact', eventId: randomUUID(), path: '/contact', password: 'private' } })).status, 400);
  assert.equal(await MetaEvent.countDocuments(), 0);
});
test('PageView and Contact are consent-bound, deduplicated and retain only minimal metadata', async () => {
  const browser = client(); await consent(browser); const eventId = randomUUID();
  const request = { method: 'POST', body: { name: 'PageView', eventId, path: '/shop' } };
  const first = data(await browser.request('/tracking/events', request)).tracking;
  const repeated = data(await browser.request('/tracking/events', request)).tracking;
  assert.equal(first.id, repeated.id); assert.deepEqual(first.parameters, {});
  assert.equal(await MetaEvent.countDocuments(), 1);
  assert.equal(data(await client().request('/tracking/events', request)).tracking, null);
  assert.equal((await browser.request('/tracking/events', { method: 'POST', body: { name: 'Contact', eventId: randomUUID(), path: '/shop' } })).status, 400);
  assert.equal(data(await browser.request('/tracking/events', { method: 'POST', body: { name: 'Contact', eventId: randomUUID(), path: '/contact' } })).tracking.name, 'Contact');
});
test('money and payload validation enforce EGP integer-piastre values and exclude customer/private data', () => {
  const valid = monetaryParameters([{ productId: product._id, quantity: 2, unitPricePiastres: 12000 }], 24000);
  assert.equal(valid.value, 240); assert.equal(valid.currency, 'EGP'); assert.equal(valid.contents[0].item_price, 120);
  for (const parameters of [{ currency: 'USD', value: 5 }, { value: 1.001 }, { value: Infinity }, { value: -1 }, { value: Number.MAX_SAFE_INTEGER }, { email: 'private@example.test' }, { artwork: 'private-key' }, { contents: [null] }, { contents: [{ id: String(product._id), quantity: 1, item_price: 1.001 }] }]) assert.throws(() => sanitizeParameters(parameters), { code: 'INVALID_TRACKING_EVENT' });
  assert.throws(() => monetaryParameters([{ productId: product._id, quantity: 1, unitPricePiastres: 100.5 }], 100), { code: 'INVALID_AMOUNT' });
});
test('AddToCart fires only after successful server-priced add and never on rejected/provisional actions', async () => {
  const browser = client(); await consent(browser);
  const accepted = data(await add(browser, { quantity: 2 })).tracking;
  assert.equal(accepted[0].name, 'AddToCart'); assert.equal(accepted[0].parameters.value, 240);
  const before = await MetaEvent.countDocuments();
  assert.equal((await add(browser, { pricePiastres: 1 })).status, 400);
  await Product.updateOne({ _id: product._id }, { $set: { status: 'draft', priceApproved: false } });
  assert.equal((await add(browser)).status, 409);
  assert.equal(await MetaEvent.countDocuments(), before);
});
test('approved catalog views/searches produce receipts while draft records remain excluded', async () => {
  const browser = client(); await consent(browser);
  const detail = data(await browser.request(`/public/products/${product.slug}`));
  assert.equal(detail.tracking.name, 'ViewContent'); assert.equal(detail.tracking.parameters.value, 120);
  const search = data(await browser.request('/public/products?q=Isolated'));
  assert.equal(search.tracking, null);
  const actionId = randomUUID();
  const qualified = data(await browser.request('/public/products?q=Isolated', { headers: { 'x-search-event-id': actionId } }));
  assert.equal(qualified.tracking.name, 'Search'); assert.equal(Object.hasOwn(qualified.tracking.parameters, 'search_string'), false);
  assert.equal(data(await browser.request('/public/products?q=Isolated', { headers: { 'x-search-event-id': actionId } })).tracking.id, qualified.tracking.id);
  await browser.request('/public/products?q=Isolated&sort=price_asc');
  await browser.request('/public/products?q=Isolated&page=2');
  assert.equal((await browser.request('/public/products', { headers: { 'x-search-event-id': randomUUID() } })).status, 400);
  assert.equal((await browser.request('/public/products?q=Isolated', { headers: { 'x-search-event-id': 'invalid' } })).status, 400);
  assert.equal(await MetaEvent.countDocuments({ name: 'Search' }), 1);
  await Product.updateOne({ _id: product._id }, { $set: { status: 'draft', priceApproved: false } });
  assert.equal((await browser.request(`/public/products/${product.slug}`)).status, 404);
  assert.equal(await MetaEvent.countDocuments({ name: 'ViewContent' }), 1);
});
test('COD purchase is a single order-placement event across retries, refreshes and admin status changes', async () => {
  const browser = client(); await consent(browser); await add(browser); env.checkoutEnabled = true;
  const intent = await quote(browser);
  assert.deepEqual(intent.quote.tracking.map(event => event.name).sort(), ['InitiateCheckout']);
  assert.equal(await MetaEvent.countDocuments({ name: 'AddPaymentInfo' }), 0);
  const first = data(await submit(browser, intent)); const duplicate = data(await submit(browser, intent));
  assert.equal(first.order.id, duplicate.order.id); assert.equal(first.tracking.id, duplicate.tracking.id);
  assert.equal(first.paymentTracking.name, 'AddPaymentInfo'); assert.equal(first.paymentTracking.id, duplicate.paymentTracking.id);
  assert.equal(first.paymentTracking.parameters.payment_method, 'cod');
  assert.equal(await MetaEvent.countDocuments({ name: 'AddPaymentInfo' }), 1);
  assert.equal(first.tracking.parameters.value, 210); assert.equal(first.tracking.parameters.payment_method, 'cod');
  assert.equal(data(await browser.request(`/commerce/orders/${first.order.id}`)).tracking.id, first.tracking.id);
  const operator = await admin();
  assert.equal((await operator.request(`/admin/commerce/orders/${first.order.id}/state`, { method: 'PATCH', body: { revision: first.order.revision, fulfillmentState: 'confirmed' } })).status, 200);
  assert.equal(await MetaEvent.countDocuments({ name: 'Purchase' }), 1);
  assert.equal(await Order.countDocuments(), 1);
});
test('InstaPay proof submission creates no Purchase until authorized manual verification', async () => {
  const browser = client(); await consent(browser); await add(browser); env.checkoutEnabled = true;
  const intent = await quote(browser, 'instapay'); const proofId = await proof(browser, intent);
  const initial = data(await submit(browser, intent, proofId));
  assert.equal(initial.tracking, null); assert.equal(initial.order.paymentState, 'awaiting_verification');
  assert.equal(initial.paymentTracking.name, 'AddPaymentInfo');
  assert.equal(initial.paymentTracking.parameters.payment_method, 'instapay');
  assert.equal(await MetaEvent.countDocuments({ name: 'OrderSubmitted' }), 1); assert.equal(await MetaEvent.countDocuments({ name: 'Purchase' }), 0);
  const operator = await admin();
  const verified = data(await operator.request(`/admin/commerce/orders/${initial.order.id}/state`, { method: 'PATCH', body: { revision: initial.order.revision, paymentState: 'paid' } })).order;
  assert.equal(verified.paymentState, 'paid'); assert.equal(await MetaEvent.countDocuments({ name: 'Purchase' }), 1);
  const receipt = data(await browser.request(`/commerce/orders/${initial.order.id}`)).tracking;
  assert.equal(receipt.name, 'Purchase'); assert.equal(receipt.parameters.payment_method, 'instapay');
  assert.equal((await operator.request(`/admin/commerce/orders/${initial.order.id}/state`, { method: 'PATCH', body: { revision: verified.revision, paymentState: 'paid' } })).status, 200);
  assert.equal(await MetaEvent.countDocuments({ name: 'Purchase' }), 1);
  const stored = JSON.stringify(await MetaEvent.find({}).lean());
  assert.equal(stored.includes(proofId), false); assert.equal(stored.includes('safe@example.test'), false); assert.equal(stored.includes('01012345678'), false);
});
test('worker retries retain one event ID and concurrent workers claim each delivery once', async () => {
  const browser = client(); const accepted = await consent(browser);
  await recordQualifiedEvent(accepted._id, 'PageView', {}, { sourcePath: '/shop', dedupKey: 'retry-fixture' });
  const ids = []; let fail = true;
  setMetaProviderForTests({ async send(event) { ids.push(event.eventId); if (fail) { fail = false; throw new Error('Isolated transient outage.'); } return { accepted: true }; } });
  const now = new Date(); assert.equal((await runMetaBatch({ now })).failed, 1);
  const results = await Promise.all([runMetaBatch({ now: new Date(now.getTime() + 61000) }), runMetaBatch({ now: new Date(now.getTime() + 61000) })]);
  assert.equal(results.reduce((total, result) => total + result.sent, 0), 1); assert.equal(new Set(ids).size, 1);
});
test('revocation suppresses queued events and prevents retries or future collection', async () => {
  const browser = client(); const accepted = await consent(browser);
  await recordQualifiedEvent(accepted._id, 'PageView', {}, { sourcePath: '/' });
  await browser.request('/tracking/consent', { method: 'POST', body: { granted: false } });
  let sends = 0; setMetaProviderForTests({ async send() { sends += 1; return { accepted: true }; } });
  assert.equal((await runMetaBatch()).sent, 0); assert.equal(sends, 0);
  assert.equal((await MetaEvent.findOne()).state, 'suppressed');
  assert.equal(await recordQualifiedEvent(accepted._id, 'PageView', {}, { sourcePath: '/' }), null);
});
test('tracking mutations retain Origin/CSRF checks and bounded worker validation', async () => {
  const browser = client();
  assert.equal((await browser.request('/tracking/consent', { method: 'POST', body: { granted: true }, headers: { Origin: 'https://evil.example.test' } })).status, 403);
  assert.equal((await browser.request('/tracking/consent', { method: 'POST', body: { granted: true }, headers: { 'x-csrf-token': 'wrong' } })).status, 403);
  await assert.rejects(runMetaBatch({ batchSize: 101 }), /1–100/);
  assert.equal(await TrackingConsent.countDocuments(), 0);
});

test('personalized customization events use approved final prices and omit entered messages', async () => {
  const template = await CustomizationTemplate.create({ key: 'isolated-tracking-box', name: 'Isolated template', kind: 'gift_box', version: 1,
    status: 'approved', active: true, baseAdjustmentPiastres: 700,
    fields: [{ key: 'gift_message', label: 'Gift message', type: 'text', required: true, maxChars: 100 }],
  });
  await Product.updateOne({ _id: product._id }, { $set: { customization: { enabled: true, templateId: template._id, serviceKind: 'gift_box' },
    personalization: { fields: [{ key: 'name', label: 'Name', type: 'short_text', required: true, maxLength: 50 }] },
  } });
  const browser = client(); await consent(browser);
  const result = data(await add(browser, { personalization: { name: 'PRIVATE_RECIPIENT_NAME' },
    customization: { templateId: String(template._id), version: 1, selections: [], fields: { gift_message: 'PRIVATE_GIFT_MESSAGE' } },
  }));
  assert.deepEqual(result.tracking.map(event => event.name).sort(), ['AddToCart', 'CustomizedAddToCart']);
  assert.equal(result.tracking[0].parameters.value, 127);
  const stored = JSON.stringify(await MetaEvent.find({}).lean());
  assert.equal(stored.includes('PRIVATE_RECIPIENT_NAME'), false); assert.equal(stored.includes('PRIVATE_GIFT_MESSAGE'), false);
});

test('CompleteRegistration is recorded after actual successful signup without sending email or passwords', async () => {
  const browser = client(); await consent(browser);
  const result = await browser.request('/auth/signup', { method: 'POST', body: { name: 'Isolated new customer', email: 'registration@example.test', password: 'PRIVATE_TEST_PASSWORD_12345' } });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal(data(result).tracking.name, 'CompleteRegistration');
  assert.deepEqual(data(result).tracking.parameters, {});
  const stored = JSON.stringify(await MetaEvent.findOne({ name: 'CompleteRegistration' }).lean());
  assert.equal(stored.includes('registration@example.test'), false); assert.equal(stored.includes('PRIVATE_TEST_PASSWORD'), false);
});

test('tracking retries are bounded and stale events are suppressed without external delivery', async () => {
  const browser = client(); const accepted = await consent(browser);
  await recordQualifiedEvent(accepted._id, 'PageView', {}, { sourcePath: '/', dedupKey: 'terminal-fixture' });
  let sends = 0; setMetaProviderForTests({ async send() { sends += 1; throw new Error('Isolated delivery outage.'); } });
  let now = new Date();
  for (let attempt = 0; attempt < 5; attempt += 1) { await runMetaBatch({ now }); now = new Date(now.getTime() + 60000 * 2 ** attempt + 1); }
  assert.equal((await MetaEvent.findOne()).state, 'dead'); assert.equal(sends, 5);
  await runMetaBatch({ now }); assert.equal(sends, 5);
  await recordQualifiedEvent(accepted._id, 'PageView', {}, { sourcePath: '/', dedupKey: 'stale-fixture' });
  const future = new Date(Date.now() + 8 * 86400000);
  assert.equal((await runMetaBatch({ now: future })).suppressed, 1); assert.equal(sends, 5);
});

test('CustomizationStart requires an approved available configuration and transmits only its service kind', async () => {
  const template = await CustomizationTemplate.create({ key: 'isolated-start-box', name: 'Isolated configured service', kind: 'gift_box', status: 'approved', active: true, version: 1,
    fields: [{ key: 'photo', label: 'Private photo', type: 'image', maxFiles: 1, acceptedMimeTypes: ['image/png'] }],
  });
  await Product.updateOne({ _id: product._id }, { $set: { customization: { enabled: true, templateId: template._id, serviceKind: 'gift_box' } } });
  const browser = client(); await consent(browser);
  const path = `/commerce/customization/products/${product.slug}`;
  const first = data(await browser.request(path)).tracking;
  assert.equal(first.name, 'CustomizationStart'); assert.deepEqual(first.parameters, { service_kind: 'gift_box' });
  assert.equal(data(await browser.request(path)).tracking.id, first.id);
  await CustomizationTemplate.updateOne({ _id: template._id }, { $set: { active: false } });
  assert.equal((await browser.request(path)).status, 409);
  await CustomizationTemplate.updateOne({ _id: template._id }, { $set: { active: true, status: 'draft' } });
  assert.equal((await browser.request(path)).status, 409);
  assert.equal(await MetaEvent.countDocuments({ name: 'CustomizationStart' }), 1);
});

test('Purchase acknowledgement is current-consent bound, idempotent and prevents owned-order refresh replay', async () => {
  const browser = client(); await consent(browser); await add(browser); env.checkoutEnabled = true;
  const intent = await quote(browser); const created = data(await submit(browser, intent));
  const id = created.tracking.id;
  const other = client(); await consent(other);
  assert.equal((await other.request('/tracking/ack', { method: 'POST', body: { eventId: id } })).status, 404);
  assert.equal((await browser.request('/tracking/ack', { method: 'POST', headers: { 'sec-gpc': '1' }, body: { eventId: id } })).status, 404);
  const first = await browser.request('/tracking/ack', { method: 'POST', body: { eventId: id } });
  assert.equal(first.status, 200);
  const marker = (await MetaEvent.findOne({ eventId: id })).browserAcknowledgedAt;
  assert.ok(marker);
  assert.equal((await browser.request('/tracking/ack', { method: 'POST', body: { eventId: id } })).status, 200);
  assert.equal((await MetaEvent.findOne({ eventId: id })).browserAcknowledgedAt.getTime(), marker.getTime());
  assert.equal(data(await browser.request(`/commerce/orders/${created.order.id}`)).tracking, null);
  assert.equal(data(await submit(browser, intent)).tracking, null);
  assert.equal(await MetaEvent.countDocuments({ name: 'Purchase' }), 1);
  const pageView = data(await browser.request('/tracking/events', { method: 'POST', body: { name: 'PageView', eventId: randomUUID(), path: '/' } })).tracking;
  assert.equal((await browser.request('/tracking/ack', { method: 'POST', body: { eventId: pageView.id } })).status, 404);
  await browser.request('/tracking/consent', { method: 'POST', body: { granted: false } });
  assert.equal((await browser.request('/tracking/ack', { method: 'POST', body: { eventId: id } })).status, 404);
});

test('a provider without an explicit acceptance response is never recorded as delivered', async () => {
  const browser = client(); const accepted = await consent(browser);
  await recordQualifiedEvent(accepted._id, 'PageView', {}, { sourcePath: '/' });
  setMetaProviderForTests({ async send() { return undefined; } });
  const result = await runMetaBatch();
  assert.equal(result.sent, 0); assert.equal(result.failed, 1);
  assert.equal((await MetaEvent.findOne()).state, 'failed');
});

test('expired job budgets claim nothing and timed-out Meta sends retry the same deduplicated event', async () => {
  const browser = client(); const accepted = await consent(browser);
  await recordQualifiedEvent(accepted._id, 'PageView', {}, { sourcePath: '/', dedupKey: 'bounded-fixture' });
  const expired = createWorkBudget({ maxDurationMs: 100, clock: () => 0 });
  expired.clock = () => 101;
  const stopped = await runMetaBatch({ budget: expired });
  assert.equal(stopped.sent, 0); assert.equal((await MetaEvent.findOne()).attempts, 0);
  let aborted = false; const ids = [];
  setMetaProviderForTests({ send(event, { signal }) {
    ids.push(event.eventId);
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => { aborted = true; reject(new Error('Synthetic adapter aborted.')); }, { once: true }));
  } });
  const now = new Date();
  assert.equal((await runMetaBatch({ now, budget: createWorkBudget({ maxDurationMs: 100 }) })).failed, 1);
  assert.equal(aborted, true);
  assert.equal((await MetaEvent.findOne()).state, 'failed');
  setMetaProviderForTests({ async send(event) { ids.push(event.eventId); return { accepted: true }; } });
  assert.equal((await runMetaBatch({ now: new Date(now.getTime() + 61_000) })).sent, 1);
  assert.equal(new Set(ids).size, 1);
});
