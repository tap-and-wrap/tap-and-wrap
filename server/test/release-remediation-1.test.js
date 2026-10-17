import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { app } from '../src/app.js';
import { env, requestIntakeSettings } from '../src/config/env.js';
import { startTestDatabase } from './helpers/database.js';
import { Product } from '../src/models/Product.js';
import { Category } from '../src/models/Category.js';
import { ComponentOption } from '../src/models/ComponentOption.js';
import { User } from '../src/models/User.js';
import { Session } from '../src/models/Session.js';
import { Order } from '../src/models/Order.js';
import { OrderSettlement } from '../src/models/OrderSettlement.js';
import { ServiceRequest } from '../src/models/ServiceRequest.js';
import { NotificationEvent } from '../src/models/NotificationEvent.js';
import { newSessionToken, hashSession, makeCsrfToken } from '../src/utils/tokens.js';
import { mutateOrderAccounting, orderAccounting } from '../src/commerce/order-accounting.js';
import { createServiceRequest } from '../src/commerce/service-requests.js';
import { serviceRequestInput } from '../src/commerce/request-validation.js';
import { execFileSync } from 'node:child_process';

let db, server, base, admin, auth, customerAuth, category;
const owner = `guest:${'e'.repeat(64)}`;
before(async () => { db = await startTestDatabase({ transactions: true }); server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}/api/v1`; });
after(async () => { env.customRequestsEnabled = false; env.checkoutEnabled = false; server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await db.stop(); });
async function session(role) {
  const user = await User.create({ name: 'Synthetic owner', email: `${role}@example.test`, passwordHash: 'fixture', role, active: true });
  const token = newSessionToken(), csrf = makeCsrfToken(env.sessionSecret);
  await Session.create({ userId: user._id, tokenHash: hashSession(token), expiresAt: new Date(Date.now() + 3600000) });
  return { user, headers: { Cookie: `tw_session=${token}; tw_csrf=${csrf}`, Origin: env.clientOrigin, 'x-csrf-token': csrf } };
}
beforeEach(async () => {
  for (const model of Object.values(mongoose.models)) await model.deleteMany({});
  env.customRequestsEnabled = false; env.checkoutEnabled = false;
  const a = await session('admin'); admin = a.user; auth = a.headers; customerAuth = (await session('customer')).headers;
  category = await Category.create({ name: 'Synthetic category', slug: 'synthetic-category' });
});
async function request(path, body, { headers = auth, method = body ? 'POST' : 'GET' } = {}) {
  const response = await fetch(`${base}${path}`, { method, headers: { ...headers, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json(), cookies: response.headers.getSetCookie() };
}
const inventory = { mode: 'made_to_order', approved: true, quantity: null, available: true };
async function product(extra = {}) { return Product.create({ name: 'Synthetic gift', slug: `synthetic-${randomUUID()}`, categoryId: category._id, visibility: 'public', inventory, ...extra }); }
for (const kind of ['product', 'variant', 'component']) {
  test(`F01 direct ${kind} updates reject inferred approval and accept explicit zero/ten`, async () => {
    const record = kind === 'component' ? await ComponentOption.create({ name: 'Synthetic component', slug: 'synthetic-component', catalogRole: 'Gift Packaging', categoryId: category._id, inventory })
      : await product(kind === 'variant' ? { variants: [{ key: 'red', attributes: [{ name: 'Color', value: 'Red' }], inventory }] } : {});
    const path = kind === 'component' ? `/admin/commerce/components/${record._id}` : `/admin/products/${record._id}`;
    const patch = inv => ({ expectedRevision: 0, ...(kind === 'variant' ? { variants: [{ key: 'red', attributes: [{ name: 'Color', value: 'Red' }], inventory: inv }] } : { inventory: inv }) });
    for (const inv of [{ mode: 'tracked', approved: true }, { mode: 'tracked', approved: true, quantity: null }, { mode: 'tracked', approved: true, quantity: -1 }, { mode: 'tracked', approved: true, quantity: '10' }]) {
      const result = await request(path, patch(inv), { method: 'PATCH' }); assert.equal(result.status, 400, JSON.stringify(result.body));
    }
    const Model = kind === 'component' ? ComponentOption : Product;
    assert.equal((await Model.findById(record._id)).__v, 0, 'Invalid changes leave revision and record unchanged');
    assert.equal((await request(path, patch({ mode: 'tracked', quantity: 0, approved: true }), { method: 'PATCH' })).status, 200);
    assert.equal((await request(path, { expectedRevision: 1, name: 'Unrelated merchant edit' }, { method: 'PATCH' })).status, 200);
    const saved = await Model.findById(record._id); const stock = kind === 'variant' ? saved.variants[0].inventory : saved.inventory;
    assert.equal(stock.quantity, 0); assert.equal(stock.approved, true);
    assert.equal((await request(path, { ...patch({ mode: 'tracked', quantity: 10, approved: true }), expectedRevision: 2 }, { method: 'PATCH' })).status, 200);
    assert.equal((await request(path, { expectedRevision: 1, name: 'Stale edit' }, { method: 'PATCH' })).status, 409);
  });
}
test('F01 product create, inventory endpoint, new variant and component create cannot approve model defaults or legacy placeholders', async () => {
  const values = { name: 'Synthetic new', slug: 'synthetic-new', categoryId: String(category._id), inventory: { approved: true } };
  assert.equal((await request('/admin/products', values)).status, 400);
  assert.equal((await request('/admin/commerce/components', { ...values, catalogRole: 'Gift Packaging' })).status, 400);
  const legacy = await product({ inventory: { mode: 'tracked', quantity: 10, approved: false } });
  assert.equal((await request(`/admin/products/${legacy._id}/inventory`, { expectedRevision: 0, approved: true }, { method: 'PATCH' })).status, 400);
  assert.equal((await request(`/admin/products/${legacy._id}`, { expectedRevision: 0, variants: [{ key: 'new', attributes: [], inventory: { approved: true } }] }, { method: 'PATCH' })).status, 400);
  await assert.rejects(new Product({ ...values, inventory: { approved: true } }).validate());
  const approved = await request('/admin/products', { ...values, inventory: { mode: 'tracked', quantity: 10, approved: true } }); assert.equal(approved.status, 201);
  assert.equal(approved.body.data.product.inventory.quantity, 10);
  const zero = { ...values, slug: 'explicit-zero', inventory: { mode: 'tracked', quantity: 0, approved: true } };
  const zeroProduct = await request('/admin/products', zero); assert.equal(zeroProduct.status, 201); assert.equal(zeroProduct.body.data.product.inventory.quantity, 0);
  const zeroComponent = await request('/admin/commerce/components', { ...zero, catalogRole: 'Gift Packaging' }); assert.equal(zeroComponent.status, 201); assert.equal(zeroComponent.body.data.component.inventory.quantity, 0);
});
test('F01 Made by Request and existing verified stock are preserved without new quantity or approval', async () => {
  const made = await product();
  assert.equal((await request(`/admin/products/${made._id}`, { expectedRevision: 0, inventory: { available: true } }, { method: 'PATCH' })).status, 200);
  assert.equal((await Product.findById(made._id)).inventory.quantity, null);
  const tracked = await product({ inventory: { mode: 'tracked', quantity: 7, approved: true } });
  const preserved = await request(`/admin/products/${tracked._id}`, { expectedRevision: 0, inventory: { approved: true } }, { method: 'PATCH' });
  assert.equal(preserved.status, 200, JSON.stringify(preserved.body));
  assert.equal((await Product.findById(tracked._id)).inventory.quantity, 7);
});
async function funded(state = 'delivered') {
  const order = await Order.create({ owner, orderNumber: '765432', checkoutKey: randomUUID(), requestHash: 'fixture', customer: { name: 'Synthetic' }, lines: [], totals: { totalPiastres: 45000 }, accountingVersion: 1, paymentMethod: 'cod', paymentState: 'paid', fulfillmentState: state, charges: [{ id: 'shipping', kind: 'shipping', label: 'Delivery', state: 'accepted', amountPiastres: 9000, collectionMethod: 'cod' }] });
  const collection = await OrderSettlement.create({ orderId: order._id, operationKey: randomUUID(), requestHash: 'fixture', direction: 'collection', scope: 'all_agreed', allocations: [{ scope: 'merchandise', amountPiastres: 45000 }, { scope: 'shipping', amountPiastres: 9000 }], amountPiastres: 54000, method: 'cod', reference: 'ACTUAL-COLLECTION', referenceKey: 'fixture-collection', recordedBy: admin._id, reason: 'Actual synthetic collection' });
  const body = { revision: 0, action: 'refund', operationKey: randomUUID(), amountPiastres: 54000, allocations: [{ scope: 'merchandise', amountPiastres: 45000 }, { scope: 'shipping', amountPiastres: 9000 }], method: 'instapay', reference: 'ONE-REAL-REFUND', refundOf: String(collection._id), reconciled: true, reducePayable: true, reason: 'Reviewed actual completed refund' };
  return { order, collection, body, path: `/admin/commerce/orders/${order._id}/accounting` };
}
for (const state of ['delivered', 'cancelled', 'returned']) test(`F02 one transfer refunds merchandise and delivery for ${state} order, retry stays one settlement`, async () => {
  const { order, collection, body, path } = await funded(state);
  const original = collection.toObject();
  const repeated = await Promise.all([request(path, body), request(path, body)]);
  assert.deepEqual(repeated.map(result => result.status), [200, 200]);
  const entries = await OrderSettlement.find({ direction: 'refund' }).lean(); assert.equal(entries.length, 1); assert.equal(entries[0].reference, 'ONE-REAL-REFUND');
  assert.deepEqual(entries[0].allocations, body.allocations); assert.equal(entries[0].amountPiastres, 54000);
  assert.deepEqual((await OrderSettlement.findById(collection._id)).toObject(), original);
  const current = await Order.findById(order._id), summary = await orderAccounting(current);
  assert.equal(current.paymentState, 'refunded'); assert.equal(summary.refundedPiastres, 54000); assert.equal(summary.outstandingPiastres, 0);
  assert.equal((await request(path, { ...body, revision: 1, operationKey: randomUUID() })).status, 409);
});
test('F02 partial multi-scope refunds enforce exact sums, positive unique scopes and remaining actual funds', async () => {
  const { order, body, path } = await funded();
  for (const allocations of [[], [{ scope: 'merchandise', amountPiastres: 54000 }], [{ scope: 'unknown', amountPiastres: 54000 }], [{ scope: 'merchandise', amountPiastres: 45000 }], [{ scope: 'shipping', amountPiastres: 27000 }, { scope: 'shipping', amountPiastres: 27000 }], [{ scope: 'merchandise', amountPiastres: -1 }, { scope: 'shipping', amountPiastres: 54001 }]]) {
    assert.ok([400, 409].includes((await request(path, { ...body, allocations })).status));
  }
  const partial = { ...body, amountPiastres: 10000, allocations: [{ scope: 'merchandise', amountPiastres: 5000 }, { scope: 'shipping', amountPiastres: 5000 }], reducePayable: false };
  assert.equal((await request(path, partial)).status, 200);
  const duplicate = await request(path, { ...partial, revision: 1, operationKey: randomUUID(), amountPiastres: 1000, allocations: [{ scope: 'merchandise', amountPiastres: 1000 }] });
  assert.equal(duplicate.status, 409); assert.equal(duplicate.body.error.code, 'PAYMENT_REFERENCE_USED');
  const summary = await orderAccounting(await Order.findById(order._id)); assert.equal(summary.outstandingPiastres, 10000); assert.equal(summary.refundedPiastres, 10000);
  assert.equal((await request(path, { ...partial, revision: 1, operationKey: randomUUID(), reference: 'ANOTHER-REFUND', amountPiastres: 5000, allocations: [{ scope: 'shipping', amountPiastres: 5000 }] })).status, 409);
  assert.equal(await OrderSettlement.countDocuments({ direction: 'refund' }), 1);
});
test('F02 simultaneous refunds serialize against order revision; changed retries/references cannot double-refund', async () => {
  const { order, body } = await funded();
  const results = await Promise.allSettled([mutateOrderAccounting(order._id, null, body, admin), mutateOrderAccounting(order._id, null, { ...body, operationKey: randomUUID(), reference: 'SECOND-REAL-REFUND' }, admin)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1); assert.equal(await OrderSettlement.countDocuments({ direction: 'refund' }), 1);
  await assert.rejects(mutateOrderAccounting(order._id, null, { ...body, amountPiastres: 100 }, admin));
});
const requestInput = () => serviceRequestInput.parse({ requestKey: randomUUID(), service: 'gift_box', customer: { name: 'Synthetic customer', phone: '01012345678' }, details: { occasion: 'Birthday', contents: 'Synthetic request', quantity: 1 } });
test('F09 independent authorization defaults closed, survives restart settings, and checkout cannot enable intake', async () => {
  for (const settings of [{}, { CHECKOUT_ENABLED: 'true', COMMERCE_LAUNCH_AUTHORIZED: 'true' }, { CUSTOM_REQUESTS_ENABLED: 'true' }, { CUSTOM_REQUESTS_LAUNCH_AUTHORIZED: 'true' }, { CUSTOM_REQUESTS_ENABLED: 'true', CUSTOM_REQUESTS_LAUNCH_AUTHORIZED: 'false' }]) assert.equal(requestIntakeSettings(settings), false);
  assert.equal(requestIntakeSettings({ CUSTOM_REQUESTS_ENABLED: 'true', CUSTOM_REQUESTS_LAUNCH_AUTHORIZED: 'true' }), true);
  env.checkoutEnabled = true;
  await assert.rejects(createServiceRequest(owner, requestInput()), error => error.code === 'REQUEST_INTAKE_CLOSED');
  assert.equal(await ServiceRequest.countDocuments(), 0);
  const code = `const { env } = await import(${JSON.stringify(new URL('../src/config/env.js', import.meta.url).href)}); console.log(env.customRequestsEnabled);`;
  const safe = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
  for (const flags of [{}, { CUSTOM_REQUESTS_ENABLED: 'true' }, { CUSTOM_REQUESTS_ENABLED: 'true', CUSTOM_REQUESTS_LAUNCH_AUTHORIZED: 'true' }]) {
    const result = execFileSync(process.execPath, ['--input-type=module', '-e', code], { env: { ...safe, TAP_WRAP_SKIP_DOTENV: 'true', NODE_ENV: 'test', ...flags }, encoding: 'utf8' }).trim();
    assert.equal(result, String(Boolean(flags.CUSTOM_REQUESTS_LAUNCH_AUTHORIZED)));
  }
});
test('F09 guest API cannot bypass closure; accepted requests, admin, deadlines, idempotency and ownership survive closure/reopen', async () => {
  const csrf = makeCsrfToken(env.sessionSecret), headers = { Cookie: `tw_csrf=${csrf}`, Origin: env.clientOrigin, 'x-csrf-token': csrf };
  const body = requestInput();
  const closed = await request('/commerce/service-requests', body, { headers }); assert.equal(closed.status, 503);
  assert.equal((await request('/commerce/service-requests/options/gift_box', undefined, { headers })).body.data.intakeEnabled, false);
  env.customRequestsEnabled = true;
  const created = await request('/commerce/service-requests', body, { headers }); assert.equal(created.status, 201);
  const guestHeaders = { ...headers, Cookie: [headers.Cookie, ...created.cookies.map(cookie => cookie.split(';')[0])].join('; ') };
  assert.ok(created.body.data.request.reference);
  const directBody = requestInput(), record = await createServiceRequest(owner, directBody), deadline = record.followUpDueAt;
  const events = await NotificationEvent.countDocuments(); env.customRequestsEnabled = false;
  const replay = await request('/commerce/service-requests', body, { headers: guestHeaders }); assert.equal(replay.status, 201); assert.equal(replay.body.data.request.id, created.body.data.request.id);
  const owned = await request(`/commerce/service-requests/submissions/${body.requestKey}`, undefined, { headers: guestHeaders }); assert.equal(owned.body.data.request.id, created.body.data.request.id);
  const isolated = await request(`/commerce/service-requests/submissions/${body.requestKey}`, undefined, { headers }); assert.equal(isolated.body.data.request, null);
  assert.equal((await request('/commerce/uploads/sign', { purpose: 'service_reference', requestKey: randomUUID(), mimeType: 'image/png', sizeBytes: 100 }, { headers: guestHeaders })).status, 503);
  const unsupported = await request('/commerce/uploads/sign', { purpose: 'service_reference', requestKey: randomUUID(), mimeType: 'image/heic', sizeBytes: 100 }, { headers: guestHeaders });
  assert.equal(unsupported.status, 400); assert.match(JSON.stringify(unsupported.body), /Export HEIC/);
  assert.equal(await mongoose.models.Upload.countDocuments(), 0);
  assert.equal(String((await createServiceRequest(owner, directBody))._id), String(record._id));
  await assert.rejects(createServiceRequest(`guest:${'f'.repeat(64)}`, directBody), error => error.code === 'REQUEST_INTAKE_CLOSED');
  assert.equal((await request(`/admin/commerce/service-requests/${record._id}`)).status, 200);
  assert.equal((await request(`/admin/commerce/service-requests/${record._id}`, undefined, { headers: customerAuth })).status, 403);
  const retained = await ServiceRequest.findById(record._id); assert.equal(retained.state, 'submitted'); assert.equal(+retained.followUpDueAt, +new Date(deadline)); assert.equal(await NotificationEvent.countDocuments(), events);
  env.customRequestsEnabled = true; assert.equal(String((await createServiceRequest(owner, directBody))._id), String(record._id)); assert.equal(await ServiceRequest.countDocuments(), 2);
});
