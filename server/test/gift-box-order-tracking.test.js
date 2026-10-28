import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';
import { Category } from '../src/models/Category.js';
import { Product } from '../src/models/Product.js';
import { Order } from '../src/models/Order.js';
import { makeCsrfToken } from '../src/utils/tokens.js';
import { resetCommerceLimitsForTests } from '../src/commerce/routes.js';
import { orderMonetaryParameters, monetaryParameters, sanitizeParameters, recordOrderTracking, ownedPurchaseReceipt, tokenHash } from '../src/tracking/service.js';
import { TrackingConsent } from '../src/models/TrackingConsent.js';
import { MetaEvent } from '../src/models/MetaEvent.js';
import { startTestDatabase } from './helpers/database.js';

const SETTINGS = { META_ENABLED: 'true', META_POLICY_APPROVED: 'true', META_PIXEL_ID: '123456789', META_CONSENT_POLICY_VERSION: 'isolated-gift-order-v1', SITE_ORIGIN: 'https://merchant.example.test', META_CAPI_ENABLED: 'false', META_ACCESS_TOKEN: '' };
const original = Object.fromEntries(Object.keys(SETTINGS).map(key => [key, process.env[key]]));
let database, consent, token, server, base;
const originalCheckout = env.checkoutEnabled;
const product = { kind: 'product', productId: 'a'.repeat(24), quantity: 2, unitPricePiastres: 12000 };
const gift = { kind: 'gift_box_v2', quantity: 3, unitPricePiastres: 99000, configurationId: 'private-configuration-hash',
  giftBox: { configuration: { placements: [{ x: .3, y: .4 }], selection: { giftCard: { message: 'Private message <script>' } } } } };
before(async () => {
  database = await startTestDatabase({ models: Object.values(mongoose.models), transactions: true });
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}/api/v1`;
});
beforeEach(async () => {
  for (const Model of Object.values(mongoose.models)) await Model.deleteMany({});
  resetCommerceLimitsForTests(); Object.assign(process.env, SETTINGS); env.checkoutEnabled = true;
  token = 'f'.repeat(64);
  consent = await TrackingConsent.create({ tokenHash: tokenHash(token), granted: true, policyVersion: SETTINGS.META_CONSENT_POLICY_VERSION, expiresAt: new Date(Date.now() + 3600000) });
});
after(async () => {
  for (const [key, value] of Object.entries(original)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  env.checkoutEnabled = originalCheckout;
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await database?.stop();
});

test('mixed order tracking preserves the complete amount and only real Product identities', () => {
  const value = orderMonetaryParameters([product, gift], 321000);
  assert.deepEqual(value, { currency: 'EGP', value: 3210, content_type: 'product', content_ids: [product.productId], contents: [{ id: product.productId, quantity: 2, item_price: 120 }], num_items: 2 });
  assert.deepEqual(sanitizeParameters(value), value);
  assert.equal(JSON.stringify(value).includes('Private'), false); assert.equal(JSON.stringify(value).includes('configuration'), false);
});
test('gift-only tracking contains monetary data without fake Product content IDs or private configuration', () => {
  assert.deepEqual(orderMonetaryParameters([gift], 297000), { currency: 'EGP', value: 2970 });
  assert.deepEqual(orderMonetaryParameters([{ ...product, kind: undefined }], 24000), monetaryParameters([product], 24000));
  assert.throws(() => monetaryParameters([gift], 297000), { code: 'INVALID_TRACKING_EVENT' });
  for (const invalid of [{ ...gift, kind: 'unknown' }, { ...product, productId: 'chocolate-1' }, { ...gift, quantity: 100 }, { ...gift, quantity: 0 }, { ...gift, unitPricePiastres: Number.MAX_SAFE_INTEGER + 1 }]) {
    assert.throws(() => orderMonetaryParameters([invalid], 0));
  }
});
test('gift-only and mixed Purchase events retain durable order deduplication and owned acknowledgement privacy', async () => {
  for (const lines of [[gift], [product, gift]]) {
    const order = { _id: new mongoose.Types.ObjectId(), trackingConsentId: consent._id, lines, totals: { totalPiastres: lines.length === 1 ? 297000 : 321000 }, paymentMethod: 'instapay', paymentState: 'awaiting_transfer' };
    await recordOrderTracking(order);
    assert.equal(await MetaEvent.countDocuments({ name: 'OrderSubmitted' }), lines.length === 1 ? 1 : 2);
    order.paymentState = 'paid';
    const first = await recordOrderTracking(order); const repeated = await recordOrderTracking(order);
    assert.equal(first.id, repeated.id);
    assert.equal(await MetaEvent.countDocuments({ dedupKey: `Purchase:${order._id}` }), 1);
    const receipt = await ownedPurchaseReceipt(order, { cookies: { tw_meta_consent: token } });
    assert.equal(receipt.id, first.id); assert.equal(receipt.name, 'Purchase');
    assert.equal(await ownedPurchaseReceipt(order, { cookies: { tw_meta_consent: 'e'.repeat(64) } }), null);
    assert.equal(await ownedPurchaseReceipt(order, { cookies: { tw_meta_consent: token }, headers: { 'sec-gpc': '1' } }), null);
    await MetaEvent.updateOne({ eventId: first.id }, { $set: { browserAcknowledgedAt: new Date() } });
    assert.equal(await ownedPurchaseReceipt(order, { cookies: { tw_meta_consent: token } }), null);
    const persisted = await MetaEvent.findOne({ eventId: first.id }).lean();
    assert.equal(JSON.stringify(persisted.parameters).includes('Private'), false);
    assert.equal(JSON.stringify(persisted.parameters).includes('configuration'), false);
  }
});
test('revoked consent suppresses new gift events and does not send to a live provider', async () => {
  await TrackingConsent.updateOne({ _id: consent._id }, { $set: { granted: false } });
  const order = { _id: new mongoose.Types.ObjectId(), checkoutKey: randomUUID(), trackingConsentId: consent._id, lines: [gift], totals: { totalPiastres: 297000 }, paymentMethod: 'instapay', paymentState: 'paid' };
  assert.equal(await recordOrderTracking(order), null); assert.equal(await MetaEvent.countDocuments(), 0);
});

test('optional Purchase receipt failure after a committed order returns success and recovers one persisted order on retry', async () => {
  const category = await Category.create({ name: 'Tracking recovery fixture', slug: 'tracking-recovery-fixture' });
  const ordinary = await Product.create({ name: 'Synthetic recovery product', slug: 'synthetic-recovery-product', categoryId: category._id,
    visibility: 'public', status: 'ready', mainImageKey: 'fixtures/recovery.webp', galleryKeys: ['fixtures/recovery.webp'],
    pricePiastres: 12000, priceApproved: true, inventory: { mode: 'tracked', quantity: 3, approved: true, available: true } });
  const csrf = makeCsrfToken(env.sessionSecret), cookies = new Map([['tw_csrf', csrf], ['tw_meta_consent', token]]);
  async function request(path, body) {
    const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { Origin: env.clientOrigin,
      'x-csrf-token': csrf, Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    for (const value of response.headers.getSetCookie()) { const [pair] = value.split(';'), separator = pair.indexOf('='); cookies.set(pair.slice(0, separator), pair.slice(separator + 1)); }
    return { status: response.status, body: await response.json() };
  }
  assert.equal((await request('/commerce/cart/items', { productId: String(ordinary._id), quantity: 1 })).status, 201);
  const checkoutKey = randomUUID();
  assert.equal((await request('/commerce/checkout/quote', { checkoutKey, paymentMethod: 'cod', governorate: 'cairo' })).status, 200);
  const body = { checkoutKey, paymentMethod: 'cod', customer: { name: 'Synthetic recovery customer', email: 'tracking@example.test', phone: '01012345678', governorate: 'cairo', address: '10 Synthetic Recovery Street' } };
  const originalFindOne = MetaEvent.findOne;
  let first;
  try {
    MetaEvent.findOne = function (filter, ...args) {
      if (filter?.browserAcknowledgedAt === null) throw new Error('Synthetic optional receipt lookup failure');
      return originalFindOne.call(this, filter, ...args);
    };
    first = await request('/commerce/orders', body);
    assert.equal(first.status, 201, JSON.stringify(first.body)); assert.equal(first.body.ok, true);
    assert.equal(first.body.data.tracking, null); assert.equal(await Order.countDocuments(), 1);
  } finally { MetaEvent.findOne = originalFindOne; }
  const recovered = await request('/commerce/orders', body);
  assert.equal(recovered.status, 201, JSON.stringify(recovered.body));
  assert.equal(recovered.body.data.order.id, first.body.data.order.id); assert.equal(recovered.body.data.tracking.name, 'Purchase');
  const status = await request(`/commerce/checkout/submissions/${checkoutKey}`);
  assert.equal(status.body.data.order.id, first.body.data.order.id); assert.equal(status.body.data.tracking.id, recovered.body.data.tracking.id);
  assert.equal(await Order.countDocuments(), 1); assert.equal((await Product.findById(ordinary._id)).inventory.quantity, 2);
  assert.equal(await MetaEvent.countDocuments({ name: 'Purchase' }), 1);
});

test('optional consent lookup outage cannot block recovery of a committed order or grant unverified consent to a new order', async () => {
  const category = await Category.create({ name: 'Consent outage fixture', slug: 'consent-outage-fixture' });
  const ordinary = await Product.create({ name: 'Synthetic consent outage product', slug: 'synthetic-consent-outage-product', categoryId: category._id,
    visibility: 'public', status: 'ready', mainImageKey: 'fixtures/consent.webp', galleryKeys: ['fixtures/consent.webp'],
    pricePiastres: 12000, priceApproved: true, inventory: { mode: 'tracked', quantity: 3, approved: true, available: true } });
  const csrf = makeCsrfToken(env.sessionSecret), cookies = new Map([['tw_csrf', csrf], ['tw_meta_consent', token]]);
  async function request(path, body) {
    const response = await fetch(base + path, { method: 'POST', headers: { Origin: env.clientOrigin, 'x-csrf-token': csrf,
      Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    for (const value of response.headers.getSetCookie()) { const [pair] = value.split(';'), separator = pair.indexOf('='); cookies.set(pair.slice(0, separator), pair.slice(separator + 1)); }
    return { status: response.status, body: await response.json() };
  }
  async function review() {
    assert.equal((await request('/commerce/cart/items', { productId: String(ordinary._id), quantity: 1 })).status, 201);
    const checkoutKey = randomUUID();
    assert.equal((await request('/commerce/checkout/quote', { checkoutKey, paymentMethod: 'cod', governorate: 'cairo' })).status, 200);
    return { checkoutKey, paymentMethod: 'cod', customer: { name: 'Synthetic outage customer', email: 'outage@example.test', phone: '01012345678', governorate: 'cairo', address: '10 Synthetic Consent Outage Street' } };
  }
  const body = await review(), committed = await request('/commerce/orders', body);
  assert.equal(committed.status, 201, JSON.stringify(committed.body)); assert.equal(await MetaEvent.countDocuments({ name: 'Purchase' }), 1);
  const originalFindOne = TrackingConsent.findOne;
  try {
    TrackingConsent.findOne = function () { throw new Error('Synthetic optional consent lookup failure'); };
    const recovered = await request('/commerce/orders', body);
    assert.equal(recovered.status, 201, JSON.stringify(recovered.body)); assert.equal(recovered.body.data.order.id, committed.body.data.order.id);
    assert.equal(recovered.body.data.tracking, null); assert.equal(recovered.body.data.paymentTracking, null);
    assert.equal(await Order.countDocuments(), 1); assert.equal((await Product.findById(ordinary._id)).inventory.quantity, 2);
    const nextBody = await review(), created = await request('/commerce/orders', nextBody);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const saved = await Order.findById(created.body.data.order.id).lean(); assert.equal(saved.trackingConsentId, null);
    assert.equal(created.body.data.tracking, null); assert.equal(await MetaEvent.countDocuments({ name: 'Purchase' }), 1);
    assert.equal(await Order.countDocuments(), 2); assert.equal((await Product.findById(ordinary._id)).inventory.quantity, 1);
  } finally { TrackingConsent.findOne = originalFindOne; }
});
