import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { startTestDatabase } from './helpers/database.js';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';
import { Product } from '../src/models/Product.js';
import { Category } from '../src/models/Category.js';
import { User } from '../src/models/User.js';
import { Session } from '../src/models/Session.js';
import { Order } from '../src/models/Order.js';
import { Upload } from '../src/models/Upload.js';
import { UploadQuota } from '../src/models/UploadQuota.js';
import { AdminAudit } from '../src/models/AdminAudit.js';
import { NotificationEvent } from '../src/models/NotificationEvent.js';
import CustomizationTemplate from '../src/models/CustomizationTemplate.js';
import { newSessionToken, hashSession, makeCsrfToken } from '../src/utils/tokens.js';
import { createMemoryStorage, setStorageForTests } from '../src/commerce/storage.js';
import { generateOrderNumber, normalizePhone } from '../src/commerce/orders.js';
import { resetCommerceLimitsForTests } from '../src/commerce/routes.js';

const ROOT = '/api/v1/commerce';
const ADMIN_ROOT = '/api/v1/admin/commerce';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X8kQAAAAASUVORK5CYII=', 'base64');
const CUSTOMER = { name: 'Isolated Customer', email: 'customer@example.test', phone: '01012345678',
  governorate: 'cairo', address: '10 Test Street, Test District, Cairo' };
let fixture;
let server;
let origin;
let main;
let child;
let product;
let storage;
const originalCheckout = env.checkoutEnabled;

before(async () => {
  fixture = await startTestDatabase({ models: Object.values(mongoose.models), transactions: true });
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  env.checkoutEnabled = originalCheckout;
  setStorageForTests();
  if (server) await new Promise((resolve) => server.close(resolve));
  await fixture?.stop();
});
beforeEach(async () => {
  await resetCommerceLimitsForTests();
  for (const model of Object.values(mongoose.models)) await model.deleteMany({});
  env.checkoutEnabled = false;
  storage = createMemoryStorage();
  setStorageForTests(storage);
  main = await Category.create({ name: 'Commerce Test Category', slug: 'commerce-test-category', order: 1 });
  child = await Category.create({ name: 'Commerce Test Subcategory', slug: 'commerce-test-subcategory', parentId: main._id, order: 2 });
  product = await makeProduct();
});

async function makeProduct(overrides = {}) {
  const slug = `isolated-product-${randomUUID()}`;
  return Product.create({ name: 'Isolated approved product', slug, description: 'Product fixture', categoryId: main._id,
    subcategoryId: child._id, mainImageKey: `products/${slug}.webp`, galleryKeys: [`products/${slug}.webp`],
    pricePiastres: 12000, priceApproved: true, inventory: { mode: 'tracked', quantity: 10, approved: true, available: true },
    status: 'ready', ...overrides });
}

function browserClient() {
  const cookies = new Map();
  const csrf = makeCsrfToken(env.sessionSecret);
  cookies.set('tw_csrf', csrf);
  return {
    cookies,
    headers() {
      return { Origin: env.clientOrigin, 'x-csrf-token': cookies.get('tw_csrf') || csrf, Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; ') };
    },
    async request(path, { method = 'GET', body } = {}) {
      const response = await fetch(`${origin}${path}`, { method,
        headers: { ...this.headers(), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      for (const header of response.headers.getSetCookie()) {
        const value = header.split(';')[0];
        const separator = value.indexOf('=');
        cookies.set(value.slice(0, separator), value.slice(separator + 1));
      }
      const isJson = response.headers.get('content-type')?.includes('application/json');
      return { status: response.status, body: isJson ? await response.json() : await response.arrayBuffer(), headers: response.headers };
    },
  };
}

async function authenticated(role = 'customer', email = `${role}-${randomUUID()}@example.test`) {
  const user = await User.create({ name: `${role} fixture`, email, passwordHash: 'isolated-test-password-hash', role, active: true });
  const token = newSessionToken();
  await Session.create({ userId: user._id, tokenHash: hashSession(token), expiresAt: new Date(Date.now() + 3600000) });
  const client = browserClient();
  client.cookies.set('tw_session', token);
  return { client, user, token };
}

function data(result) {
  assert.equal(result.body.ok, true, JSON.stringify(result.body));
  return result.body.data;
}
function cartOf(result) { return data(result).cart; }
function orderOf(result) { const value = data(result); return value.order || value; }
function itemId(item) { return item.id || item.lineId || item._id; }

async function add(client, item = {}) {
  const result = await client.request(`${ROOT}/cart/items`, { method: 'POST', body: { productId: String(product._id), quantity: 1, ...item } });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return cartOf(result);
}

async function review(client, { checkoutKey = randomUUID(), paymentMethod = 'cod', governorate = 'cairo', discountCode } = {}) {
  const result = await client.request(`${ROOT}/checkout/quote`, { method: 'POST', body: { checkoutKey, paymentMethod, governorate, ...(discountCode ? { discountCode } : {}) } });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  return { checkoutKey, paymentMethod, governorate, discountCode, quote: data(result) };
}

async function submit(client, intent, { customer = CUSTOMER, paymentProofId } = {}) {
  return client.request(`${ROOT}/orders`, { method: 'POST', body: {
    checkoutKey: intent.checkoutKey, paymentMethod: intent.paymentMethod,
    customer: { ...customer, governorate: intent.governorate },
    ...(intent.discountCode ? { discountCode: intent.discountCode } : {}), ...(paymentProofId ? { paymentProofId } : {}),
  } });
}

async function proofFor(client, intent) {
  const signed = await client.request(`${ROOT}/uploads/sign`, { method: 'POST', body: {
    purpose: 'payment_proof', mimeType: 'image/png', sizeBytes: PNG.length, checkoutKey: intent.checkoutKey,
  } });
  assert.equal(signed.status, 201, JSON.stringify(signed.body));
  const id = data(signed).upload.id;
  const upload = await Upload.findById(id).select('+temporaryKey');
  storage.put(upload.temporaryKey, PNG);
  const completed = await client.request(`${ROOT}/uploads/${id}/complete`, { method: 'POST', body: {} });
  assert.equal(completed.status, 200, JSON.stringify(completed.body));
  return id;
}

async function personalizationPhoto(client, fieldKey = 'photo') {
  const signed = await client.request(`${ROOT}/uploads/sign`, { method: 'POST', body: {
    purpose: 'personalization', mimeType: 'image/png', sizeBytes: PNG.length,
    productId: String(product._id), fieldKey,
  } });
  assert.equal(signed.status, 201, JSON.stringify(signed.body));
  const id = data(signed).upload.id;
  const upload = await Upload.findById(id).select('+temporaryKey');
  storage.put(upload.temporaryKey, PNG);
  const completed = await client.request(`${ROOT}/uploads/${id}/complete`, { method: 'POST', body: {} });
  assert.equal(completed.status, 200, JSON.stringify(completed.body));
  return id;
}

test('guest carts persist through refresh while different guest and account sessions remain isolated', async () => {
  const guest = browserClient();
  const other = browserClient();
  const account = await authenticated();
  const added = await add(guest, { quantity: 2 });
  assert.equal(added.items.length, 1);
  assert.equal(added.quantity, 2);
  assert.equal(added.subtotalPiastres, 24000);
  assert.equal(cartOf(await guest.request(`${ROOT}/cart`)).quantity, 2);
  assert.equal(cartOf(await other.request(`${ROOT}/cart`)).items.length, 0);
  assert.equal(cartOf(await account.client.request(`${ROOT}/cart`)).items.length, 0);
  assert.equal((await Product.findById(product._id)).inventory.quantity, 10);
});

test('cart quantities, removal, clear and malicious client totals use server prices', async () => {
  const guest = browserClient();
  const first = await add(guest);
  const repeated = await add(guest, { quantity: 2 });
  assert.equal(repeated.items.length, 1);
  assert.equal(repeated.quantity, 3);
  const patched = await guest.request(`${ROOT}/cart/items/${itemId(first.items[0])}`, { method: 'PATCH', body: { quantity: 4 } });
  assert.equal(cartOf(patched).subtotalPiastres, 48000);
  const tampered = await guest.request(`${ROOT}/cart/items`, { method: 'POST', body: { productId: String(product._id), quantity: 1, pricePiastres: 1, totalPiastres: 1 } });
  assert.equal(tampered.status, 400);
  const removed = await guest.request(`${ROOT}/cart/items/${itemId(first.items[0])}`, { method: 'DELETE' });
  assert.equal(cartOf(removed).items.length, 0);
  await add(guest);
  assert.equal(cartOf(await guest.request(`${ROOT}/cart`, { method: 'DELETE' })).items.length, 0);
});

test('required personalization is enforced and different configurations remain separate cart lines', async () => {
  await Product.updateOne({ _id: product._id }, { $set: { personalization: { fields: [
    { key: 'message', label: 'Message', type: 'short_text', required: true, maxLength: 12 },
  ] } } });
  const guest = browserClient();
  const missing = await guest.request(`${ROOT}/cart/items`, { method: 'POST', body: { productId: String(product._id), quantity: 1 } });
  assert.equal(missing.status, 400);
  const invalid = await guest.request(`${ROOT}/cart/items`, { method: 'POST', body: { productId: String(product._id), quantity: 1, personalization: { message: 'This exceeds twelve characters' } } });
  assert.equal(invalid.status, 400);
  await add(guest, { personalization: { message: 'First' } });
  const distinct = await add(guest, { personalization: { message: 'Second' } });
  assert.equal(distinct.items.length, 2);
});

test('required photo counts, upload ownership and cart attachments are enforced end to end', async () => {
  env.checkoutEnabled = true;
  await Product.updateOne({ _id: product._id }, { $set: { personalization: { fields: [{ key: 'photo', label: 'Photo',
    type: 'image', required: true, minFiles: 1, maxFiles: 1, maxBytes: 8 * 1024 * 1024,
    acceptedMimeTypes: ['image/png'],
  }] } } });
  const guest = browserClient();
  const missing = await guest.request(`${ROOT}/cart/items`, { method: 'POST', body: { productId: String(product._id), quantity: 1 } });
  assert.equal(missing.status, 400);
  const firstId = await personalizationPhoto(guest);
  const secondId = await personalizationPhoto(guest);
  const excessive = await guest.request(`${ROOT}/cart/items`, { method: 'POST', body: {
    productId: String(product._id), quantity: 1, personalization: { photo: [firstId, secondId] },
  } });
  assert.equal(excessive.status, 400);
  const unauthorized = await browserClient().request(`${ROOT}/cart/items`, { method: 'POST', body: {
    productId: String(product._id), quantity: 1, personalization: { photo: [firstId] },
  } });
  assert.equal(unauthorized.status, 400);
  await add(guest, { personalization: { photo: [firstId] } });
  assert.equal((await add(guest, { personalization: { photo: [secondId] } })).items.length, 2);
  assert.equal((await guest.request(`${ROOT}/uploads/${firstId}`, { method: 'DELETE' })).status, 409);
  const order = orderOf(await submit(guest, await review(guest)));
  assert.equal(order.lines.length, 2);
  assert.equal((await Upload.findById(firstId)).state, 'retained');
  assert.equal((await Upload.findById(secondId)).state, 'retained');
  assert.equal((await UploadQuota.findOne()).activeCount, 0);
});

test('draft, provisional-price, provisional-stock and inactive-category products never enter a public cart', async () => {
  for (const update of [{ status: 'draft' }, { priceApproved: false }, { 'inventory.approved': false }]) {
    const candidate = await makeProduct();
    await Product.updateOne({ _id: candidate._id }, { $set: update });
    const result = await browserClient().request(`${ROOT}/cart/items`, { method: 'POST', body: { productId: String(candidate._id), quantity: 1 } });
    assert.ok([400, 404, 409].includes(result.status), JSON.stringify(result.body));
  }
  await Category.updateOne({ _id: main._id }, { $set: { active: false } });
  const result = await browserClient().request(`${ROOT}/cart/items`, { method: 'POST', body: { productId: String(product._id), quantity: 1 } });
  assert.ok([400, 404, 409].includes(result.status), JSON.stringify(result.body));
});

test('approved guest contents merge after authentication without exposing another guest cart', async () => {
  const guest = browserClient();
  await add(guest, { quantity: 2 });
  const otherGuest = browserClient();
  await add(otherGuest, { quantity: 3 });
  const account = await authenticated();
  guest.cookies.set('tw_session', account.token);
  const merged = await guest.request(`${ROOT}/cart/merge`, { method: 'POST', body: {} });
  assert.equal(merged.status, 200, JSON.stringify(merged.body));
  assert.equal(cartOf(merged).quantity, 2);
  assert.equal(cartOf(await account.client.request(`${ROOT}/cart`)).quantity, 2);
  assert.equal(cartOf(await otherGuest.request(`${ROOT}/cart`)).quantity, 3);
  assert.equal((await Product.findById(product._id)).inventory.quantity, 10);
});

test('checkout is disabled by default and rejects unapproved products after cart insertion', async () => {
  const guest = browserClient();
  await add(guest);
  const key = randomUUID();
  const disabled = await guest.request(`${ROOT}/checkout/quote`, { method: 'POST', body: { checkoutKey: key, paymentMethod: 'cod', governorate: 'cairo' } });
  assert.equal(disabled.status, 403);
  env.checkoutEnabled = true;
  const intent = await review(guest);
  await Product.updateOne({ _id: product._id }, { $set: { priceApproved: false } });
  const blocked = await submit(guest, intent);
  assert.ok([400, 404, 409].includes(blocked.status), JSON.stringify(blocked.body));
  assert.equal(await Order.countDocuments(), 0);
  assert.equal((await Product.findById(product._id)).inventory.quantity, 10);
});

test('shipping is server calculated and international or unknown governorates are rejected', async () => {
  env.checkoutEnabled = true;
  const guest = browserClient();
  await add(guest);
  const cairo = await review(guest, { governorate: 'cairo' });
  const other = await review(guest, { governorate: 'alexandria' });
  assert.equal(cairo.quote.totals?.shippingPiastres ?? cairo.quote.shippingPiastres, 9000);
  assert.equal(other.quote.totals?.shippingPiastres ?? other.quote.shippingPiastres, 12000);
  const invalid = await guest.request(`${ROOT}/checkout/quote`, { method: 'POST', body: { checkoutKey: randomUUID(), paymentMethod: 'cod', governorate: 'international' } });
  assert.equal(invalid.status, 400);
});

test('duplicate checkout submissions create one unpaid COD order and decrement stock once', async () => {
  env.checkoutEnabled = true;
  const guest = browserClient();
  await add(guest, { quantity: 2 });
  const intent = await review(guest);
  const responses = await Promise.all([submit(guest, intent), submit(guest, intent)]);
  for (const response of responses) assert.ok([200, 201].includes(response.status), JSON.stringify(response.body));
  const first = orderOf(responses[0]);
  const second = orderOf(responses[1]);
  assert.equal(first.id || first._id, second.id || second._id);
  assert.equal(first.orderNumber, second.orderNumber);
  assert.equal(first.paymentState, 'unpaid');
  assert.match(String(first.orderNumber), /^\d{6}$/);
  assert.equal(await Order.countDocuments(), 1);
  assert.equal((await Product.findById(product._id)).inventory.quantity, 8);
  assert.equal(cartOf(await guest.request(`${ROOT}/cart`)).items.length, 0);
  assert.equal(await NotificationEvent.countDocuments({ event: 'order_received' }), 1);
});

test('atomic inventory prevents two independent checkouts overselling the last unit', async () => {
  env.checkoutEnabled = true;
  await Product.updateOne({ _id: product._id }, { $set: { 'inventory.quantity': 1 } });
  const left = browserClient();
  const right = browserClient();
  await add(left); await add(right);
  const leftIntent = await review(left); const rightIntent = await review(right);
  const responses = await Promise.all([submit(left, leftIntent), submit(right, rightIntent)]);
  assert.equal(responses.filter((response) => [200, 201].includes(response.status)).length, 1);
  assert.equal(responses.filter((response) => [400, 404, 409].includes(response.status)).length, 1);
  assert.equal(await Order.countDocuments(), 1);
  assert.equal((await Product.findById(product._id)).inventory.quantity, 0);
});

test('two concurrent independent orders succeed when stock is sufficient and cold shipping setup is safe', async () => {
  env.checkoutEnabled = true;
  await Product.updateOne({ _id: product._id }, { $set: { 'inventory.quantity': 2 } });
  const left = browserClient();
  const right = browserClient();
  await add(left); await add(right);
  const [leftIntent, rightIntent] = await Promise.all([review(left), review(right)]);
  const responses = await Promise.all([submit(left, leftIntent), submit(right, rightIntent)]);
  for (const response of responses) assert.equal(response.status, 201, JSON.stringify(response.body));
  const numbers = responses.map((response) => orderOf(response).orderNumber);
  assert.equal(new Set(numbers).size, 2);
  assert.equal(await Order.countDocuments(), 2);
  assert.equal((await Product.findById(product._id)).inventory.quantity, 0);
  assert.equal(await NotificationEvent.countDocuments({ event: 'order_received' }), 2);
});

test('Made by Request orders never decrement a stock counter', async () => {
  env.checkoutEnabled = true;
  await Product.updateOne({ _id: product._id }, { $set: { 'inventory.mode': 'made_to_order', 'inventory.quantity': null } });
  const guest = browserClient();
  await add(guest, { quantity: 3 });
  const result = await submit(guest, await review(guest));
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal((await Product.findById(product._id)).inventory.quantity, null);
});

test('configured variants require selection, use their approved price and track variant stock', async () => {
  env.checkoutEnabled = true;
  await Product.updateOne({ _id: product._id }, { $set: { 'inventory.quantity': 0, variants: [{ key: 'small', sku: 'ISOLATED-SMALL',
    attributes: [{ name: 'Size', value: 'Small' }], pricePiastres: 15000, priceApproved: true,
    inventory: { mode: 'tracked', quantity: 1, approved: true, available: true },
  }] } });
  const guest = browserClient();
  const availableBefore = data(await guest.request('/api/v1/public/products?availability=available&limit=20')).products;
  const listed = availableBefore.find((candidate) => candidate._id === String(product._id));
  assert.ok(listed);
  assert.equal(listed.orderingAvailable, true);
  const missing = await guest.request(`${ROOT}/cart/items`, { method: 'POST', body: { productId: String(product._id), quantity: 1 } });
  assert.equal(missing.status, 400);
  assert.equal((await add(guest, { variantKey: 'small' })).subtotalPiastres, 15000);
  const order = orderOf(await submit(guest, await review(guest)));
  assert.equal(order.lines[0].variantKey, 'small');
  assert.equal(order.lines[0].unitPricePiastres, 15000);
  const saved = await Product.findById(product._id);
  assert.equal(saved.variants[0].inventory.quantity, 0);
  assert.equal(saved.inventory.quantity, 0);
  const availableAfter = data(await guest.request('/api/v1/public/products?availability=available&limit=20')).products;
  assert.equal(availableAfter.some((candidate) => candidate._id === String(product._id)), false);
  const admin = await authenticated('admin');
  const cancelled = await admin.client.request(`${ADMIN_ROOT}/orders/${order.id}/state`, { method: 'PATCH', body: { revision: 0, fulfillmentState: 'cancelled' } });
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
  const restocked = await Product.findById(product._id);
  assert.equal(restocked.variants[0].inventory.quantity, 1);
  assert.equal(restocked.inventory.quantity, 0);
  const availableRestocked = data(await guest.request('/api/v1/public/products?availability=available&limit=20')).products;
  assert.equal(availableRestocked.find((candidate) => candidate._id === String(product._id))?.orderingAvailable, true);
  await Product.updateOne({ _id: product._id }, { $set: { 'inventory.available': false } });
  const blocked = await browserClient().request(`${ROOT}/cart/items`, { method: 'POST', body: {
    productId: String(product._id), variantKey: 'small', quantity: 1,
  } });
  assert.ok([400, 404, 409].includes(blocked.status), JSON.stringify(blocked.body));
  assert.equal((await Product.findById(product._id)).variants[0].inventory.quantity, 1);
});

test('actual account login accepts secure credentials before guest-cart merge', async () => {
  const guest = browserClient();
  await add(guest);
  const password = 'Isolated-test-password-2026';
  await User.create({ name: 'Login fixture', email: 'login@example.test', passwordHash: await bcrypt.hash(password, 12), role: 'customer', active: true });
  const login = await guest.request('/api/v1/auth/login', { method: 'POST', body: { email: 'login@example.test', password } });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  assert.ok(guest.cookies.get('tw_session'));
  const merged = await guest.request(`${ROOT}/cart/merge`, { method: 'POST', body: {} });
  assert.equal(merged.status, 200, JSON.stringify(merged.body));
  assert.equal(cartOf(merged).quantity, 1);
});

test('cart writes reject missing CSRF tokens and foreign origins', async () => {
  const guest = browserClient();
  await guest.request(`${ROOT}/cart`);
  const body = JSON.stringify({ productId: String(product._id), quantity: 1 });
  const headers = guest.headers();
  delete headers['x-csrf-token'];
  const missing = await fetch(`${origin}${ROOT}/cart/items`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body });
  assert.equal(missing.status, 403);
  const foreign = await fetch(`${origin}${ROOT}/cart/items`, { method: 'POST', headers: { ...guest.headers(), Origin: 'https://foreign.invalid', 'Content-Type': 'application/json' }, body });
  assert.equal(foreign.status, 403);
  assert.equal(cartOf(await guest.request(`${ROOT}/cart`)).items.length, 0);
});

test('failed order persistence rolls back inventory and preserves the cart for retry', async () => {
  env.checkoutEnabled = true;
  const guest = browserClient();
  await add(guest, { quantity: 2 });
  const intent = await review(guest);
  const save = Order.prototype.save;
  try {
    Order.prototype.save = async () => { throw new Error('Isolated persistence failure.'); };
    const failure = await submit(guest, intent);
    assert.equal(failure.status, 500);
    assert.equal(await Order.countDocuments(), 0);
    assert.equal((await Product.findById(product._id)).inventory.quantity, 10);
    assert.equal(cartOf(await guest.request(`${ROOT}/cart`)).quantity, 2);
    assert.equal(await NotificationEvent.countDocuments(), 0);
  } finally { Order.prototype.save = save; }
  assert.equal((await submit(guest, intent)).status, 201);
});

test('orders preserve product and price snapshots after merchant edits', async () => {
  env.checkoutEnabled = true;
  const account = await authenticated();
  await add(account.client);
  const order = orderOf(await submit(account.client, await review(account.client)));
  const id = order.id || order._id;
  const before = await Order.findById(id).lean();
  await Product.updateOne({ _id: product._id }, { $set: { name: 'Merchant changed name', pricePiastres: 99999 } });
  const after = await Order.findById(id).lean();
  assert.deepEqual(after, before);
  assert.equal(JSON.stringify(after).includes('Isolated approved product'), true);
  assert.equal(JSON.stringify(after).includes('Merchant changed name'), false);
});

test('customer order ownership is enforced and guest orders are not attached by an unverified phone', async () => {
  env.checkoutEnabled = true;
  const guest = browserClient();
  await add(guest);
  const guestOrder = orderOf(await submit(guest, await review(guest)));
  const account = await authenticated();
  const guestDetail = await account.client.request(`${ROOT}/orders/${guestOrder.id || guestOrder._id}`);
  assert.equal(guestDetail.status, 404);
  await add(account.client);
  const customerOrder = orderOf(await submit(account.client, await review(account.client)));
  const other = await authenticated();
  assert.equal((await other.client.request(`${ROOT}/orders/${customerOrder.id || customerOrder._id}`)).status, 404);
  assert.equal((await account.client.request(`${ROOT}/orders/${customerOrder.id || customerOrder._id}`)).status, 200);
  const oversized = await account.client.request(`${ROOT}/orders?limit=500`);
  assert.ok([200, 400].includes(oversized.status));
  const list = data(oversized.status === 400 ? await account.client.request(`${ROOT}/orders?limit=20`) : oversized);
  assert.equal((list.orders || list.items).length, 1);
  assert.ok(list.pagination.limit <= 20);
});

test('order lists paginate at 20, enforce account ownership and omit detail/private-file payloads', async () => {
  env.checkoutEnabled = true;
  const account = await authenticated();
  await add(account.client);
  const created = orderOf(await submit(account.client, await review(account.client)));
  const seed = await Order.findById(created.id).lean();
  const other = await authenticated();
  const copies = [];
  let nextNumber = 410000;
  for (let index = 0; index < 21; index += 1) {
    while (String(nextNumber) === String(seed.orderNumber)) nextNumber += 1;
    const copy = { ...seed, orderNumber: String(nextNumber++), checkoutKey: randomUUID(),
      owner: index === 20 ? `user:${other.user._id}` : `user:${account.user._id}`,
      userId: index === 20 ? other.user._id : account.user._id };
    for (const key of ['_id', 'createdAt', 'updatedAt', '__v']) delete copy[key];
    copies.push(copy);
  }
  await Order.insertMany(copies);
  const first = data(await account.client.request(`${ROOT}/orders?limit=20&page=1`));
  const second = data(await account.client.request(`${ROOT}/orders?limit=20&page=2`));
  assert.equal(first.orders.length, 20);
  assert.equal(second.orders.length, 1);
  assert.equal(first.pagination.limit, 20);
  assert.equal(new Set([...first.orders, ...second.orders].map((order) => order.id)).size, 21);
  for (const order of [...first.orders, ...second.orders]) {
    for (const key of ['lines', 'files', 'uploadIds', 'proofAvailable', 'owner', 'customer']) assert.equal(order[key], undefined);
  }
  assert.equal(data(await other.client.request(`${ROOT}/orders?limit=20`)).orders.length, 1);
  const admin = await authenticated('admin');
  const adminFirst = data(await admin.client.request(`${ADMIN_ROOT}/orders?limit=20&page=1`));
  const adminSecond = data(await admin.client.request(`${ADMIN_ROOT}/orders?limit=20&page=2`));
  assert.equal(adminFirst.orders.length, 20);
  assert.equal(adminSecond.orders.length, 2);
  for (const order of [...adminFirst.orders, ...adminSecond.orders]) {
    for (const key of ['lines', 'files', 'uploadIds', 'proofAvailable', 'owner']) assert.equal(order[key], undefined);
    assert.equal(order.customer?.email, undefined);
    assert.equal(order.customer?.phoneE164, undefined);
    assert.equal(order.customer?.address, undefined);
  }
});

test('guest tracking verifies normalized checkout phone and returns generic failures', async () => {
  env.checkoutEnabled = true;
  const guest = browserClient();
  await add(guest);
  const order = orderOf(await submit(guest, await review(guest)));
  const tracked = await guest.request(`${ROOT}/orders/track`, { method: 'POST', body: { orderNumber: String(order.orderNumber), phone: '+201012345678' } });
  assert.equal(tracked.status, 200, JSON.stringify(tracked.body));
  const wrong = await guest.request(`${ROOT}/orders/track`, { method: 'POST', body: { orderNumber: String(order.orderNumber), phone: '01087654321' } });
  const absent = await guest.request(`${ROOT}/orders/track`, { method: 'POST', body: { orderNumber: '999999', phone: '01087654321' } });
  assert.equal(wrong.status, 404);
  assert.equal(absent.status, 404);
  assert.deepEqual(wrong.body, absent.body);
  const malformed = await guest.request(`${ROOT}/orders/track`, { method: 'POST', body: { orderNumber: String(order.orderNumber), phone: 'not-a-phone' } });
  assert.equal(malformed.status, 400);
  assert.equal(normalizePhone('+20 10 1234 5678'), normalizePhone('01012345678'));
});

test('guest order tracking rate limits enumeration within a single session', async () => {
  const guest = browserClient();
  for (let index = 0; index < 5; index += 1) {
    const response = await guest.request(`${ROOT}/orders/track`, { method: 'POST', body: { orderNumber: '999999', phone: '01012345678' } });
    assert.equal(response.status, 404);
  }
  const limited = await guest.request(`${ROOT}/orders/track`, { method: 'POST', body: { orderNumber: '999999', phone: '01012345678' } });
  assert.equal(limited.status, 429);
  assert.equal(limited.body.data, undefined);
  assert.equal(JSON.stringify(limited.body).includes(CUSTOMER.email), false);
});

test('admin order listing is protected and cancellation restocks exactly once', async () => {
  env.checkoutEnabled = true;
  const guest = browserClient();
  await add(guest, { quantity: 2 });
  const order = orderOf(await submit(guest, await review(guest)));
  const id = order.id || order._id;
  assert.equal((await browserClient().request(`${ADMIN_ROOT}/orders`)).status, 401);
  const customer = await authenticated();
  assert.equal((await customer.client.request(`${ADMIN_ROOT}/orders`)).status, 403);
  const admin = await authenticated('admin');
  const oversized = await admin.client.request(`${ADMIN_ROOT}/orders?limit=500`);
  assert.ok([200, 400].includes(oversized.status));
  const listing = data(oversized.status === 400 ? await admin.client.request(`${ADMIN_ROOT}/orders?limit=20`) : oversized);
  assert.ok(listing.pagination.limit <= 20);
  const cancelled = await admin.client.request(`${ADMIN_ROOT}/orders/${id}/state`, { method: 'PATCH', body: { revision: 0, fulfillmentState: 'cancelled', reason: 'Isolated cancellation' } });
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
  assert.equal((await Product.findById(product._id)).inventory.quantity, 10);
  const repeated = await admin.client.request(`${ADMIN_ROOT}/orders/${id}/state`, { method: 'PATCH', body: { revision: 0, fulfillmentState: 'cancelled' } });
  assert.equal(repeated.status, 409);
  assert.equal((await Product.findById(product._id)).inventory.quantity, 10);
  assert.ok(await AdminAudit.countDocuments({ resourceType: 'order', resourceId: String(id) }));
});

test('InstaPay proof stays private and unpaid until explicit audited admin verification', async () => {
  env.checkoutEnabled = true;
  await Product.updateOne({ _id: product._id }, { $set: { personalization: { fields: [{ key: 'photo', label: 'Photo',
    type: 'image', required: true, minFiles: 1, maxFiles: 1, maxBytes: 8 * 1024 * 1024,
    acceptedMimeTypes: ['image/png'],
  }] } } });
  const guest = browserClient();
  const photoId = await personalizationPhoto(guest);
  await add(guest, { personalization: { photo: [photoId] } });
  const intent = await review(guest, { paymentMethod: 'instapay' });
  const noProof = await submit(guest, intent);
  assert.equal(noProof.status, 400);
  const proofId = await proofFor(guest, intent);
  const created = await submit(guest, intent, { paymentProofId: proofId });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const order = orderOf(created);
  const id = order.id || order._id;
  assert.equal(order.paymentState, 'awaiting_verification');
  assert.equal((await Upload.findById(proofId)).state, 'retained');
  const stranger = await authenticated();
  assert.equal((await stranger.client.request(`${ADMIN_ROOT}/orders/${id}/proof`)).status, 403);
  assert.equal((await stranger.client.request(`${ROOT}/uploads/${proofId}/content`)).status, 404);
  const admin = await authenticated('admin');
  const originalOpen = storage.open;
  let storageBodyReads = 0;
  storage.open = async function (...args) {
    storageBodyReads += 1;
    return originalOpen.apply(this, args);
  };
  const listing = await admin.client.request(`${ADMIN_ROOT}/orders`);
  assert.equal(listing.status, 200);
  assert.equal(storageBodyReads, 0);
  const details = await admin.client.request(`${ADMIN_ROOT}/orders/${id}`);
  assert.equal(details.status, 200);
  const detailData = data(details);
  assert.equal(detailData.order.proofAvailable, true);
  const files = detailData.order.files;
  assert.ok(Array.isArray(files));
  assert.ok(files.some((file) => file._id === String(photoId)));
  assert.ok(files.some((file) => file._id === String(proofId)));
  for (const file of files) {
    for (const key of ['objectKey', 'temporaryKey', 'uploadUrl', 'url', 'body']) assert.equal(file[key], undefined);
  }
  assert.equal(storageBodyReads, 0);
  assert.equal(await AdminAudit.countDocuments({ resourceType: 'upload', action: 'private_file_viewed' }), 0);
  assert.equal(JSON.stringify(details.body).includes('verified/commerce/'), false);
  assert.equal(JSON.stringify(details.body).includes('temporary/commerce/'), false);
  const unverified = await admin.client.request(`${ADMIN_ROOT}/orders/${id}/state`, { method: 'PATCH', body: { revision: 0, fulfillmentState: 'confirmed' } });
  assert.equal(unverified.status, 409);
  const viewed = await admin.client.request(`${ADMIN_ROOT}/orders/${id}/proof`);
  assert.equal(viewed.status, 200);
  assert.equal(viewed.headers.get('content-type'), 'image/png');
  assert.match(viewed.headers.get('cache-control'), /no-store/);
  assert.equal(storageBodyReads, 1);
  assert.ok(await AdminAudit.countDocuments({ resourceType: 'upload', action: 'private_file_viewed' }));
  const verified = await admin.client.request(`${ADMIN_ROOT}/orders/${id}/state`, { method: 'PATCH', body: { revision: 0, paymentState: 'paid', reason: 'Isolated manual verification' } });
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  assert.equal(orderOf(verified).paymentState, 'paid');
  const cancelledPaid = await admin.client.request(`${ADMIN_ROOT}/orders/${id}/state`, { method: 'PATCH', body: { revision: 1, fulfillmentState: 'cancelled' } });
  assert.equal(cancelledPaid.status, 409);
  assert.equal((await Product.findById(product._id)).inventory.quantity, 9);
});

test('COD payment and fulfillment states remain separate and audit every sensitive transition', async () => {
  env.checkoutEnabled = true;
  const account = await authenticated();
  await add(account.client);
  const order = orderOf(await submit(account.client, await review(account.client)));
  const admin = await authenticated('admin');
  const premature = await admin.client.request(`${ADMIN_ROOT}/orders/${order.id}/state`, { method: 'PATCH', body: { revision: 0, paymentState: 'paid' } });
  assert.equal(premature.status, 409);
  const invalid = await admin.client.request(`${ADMIN_ROOT}/orders/${order.id}/state`, { method: 'PATCH', body: { revision: 0, fulfillmentState: 'delivered' } });
  assert.equal(invalid.status, 409);
  const states = ['confirmed', 'preparing', 'out_for_delivery', 'delivered'];
  for (let revision = 0; revision < states.length; revision += 1) {
    const result = await admin.client.request(`${ADMIN_ROOT}/orders/${order.id}/state`, { method: 'PATCH', body: { revision, fulfillmentState: states[revision] } });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(orderOf(result).paymentState, 'unpaid');
  }
  const collected = await admin.client.request(`${ADMIN_ROOT}/orders/${order.id}/state`, { method: 'PATCH', body: { revision: 4, paymentState: 'paid', reason: 'Isolated COD collection confirmation' } });
  assert.equal(collected.status, 200, JSON.stringify(collected.body));
  assert.equal(orderOf(collected).paymentState, 'paid');
  assert.equal(orderOf(collected).fulfillmentState, 'delivered');
  assert.ok(await AdminAudit.countDocuments({ resourceType: 'order', resourceId: order.id }) >= 5);
  assert.equal((await Product.findById(product._id)).inventory.quantity, 9);
});

test('public order numbers use cryptographic six-digit generation and a database uniqueness index', async () => {
  const values = Array.from({ length: 200 }, () => generateOrderNumber());
  for (const value of values) assert.match(String(value), /^\d{6}$/);
  assert.ok(new Set(values).size > 190);
  const indexes = await Order.collection.indexes();
  assert.ok(indexes.some((index) => index.unique && index.key.orderNumber === 1));
});

test('customer order APIs hide legacy/private notes while authorized admins retain operational history', async () => {
  env.checkoutEnabled = true;
  const customer = await authenticated();
  await add(customer.client);
  const order = orderOf(await submit(customer.client, await review(customer.client)));
  const privateNote = 'PRIVATE_RISK_REVIEW_FIXTURE';
  await Order.updateOne({ _id: order.id }, { $push: { history: { event: 'legacy_review', actor: 'admin:fixture', reason: privateNote } } });
  const admin = await authenticated('admin');
  const changed = await admin.client.request(`${ADMIN_ROOT}/orders/${order.id}/state`, { method: 'PATCH', body: {
    revision: 0, fulfillmentState: 'confirmed', internalNote: privateNote, publicReason: 'Your order has been confirmed.',
  } });
  assert.equal(changed.status, 200, JSON.stringify(changed.body));
  assert.equal(orderOf(changed).history.at(-1).internalNote, privateNote);
  const detail = await customer.client.request(`${ROOT}/orders/${order.id}`);
  assert.equal(detail.status, 200);
  assert.equal(JSON.stringify(detail.body).includes(privateNote), false);
  assert.equal(orderOf(detail).history.at(-1).reason, 'Your order has been confirmed.');
  const list = await customer.client.request(`${ROOT}/orders`);
  assert.equal(JSON.stringify(list.body).includes(privateNote), false);
  const tracking = await customer.client.request(`${ROOT}/orders/track`, { method: 'POST', body: { orderNumber: order.orderNumber, phone: CUSTOMER.phone } });
  assert.equal(tracking.status, 200);
  assert.equal(JSON.stringify(tracking.body).includes(privateNote), false);
  const authorized = await admin.client.request(`${ADMIN_ROOT}/orders/${order.id}`);
  assert.equal(orderOf(authorized).history.find(entry => entry.event === 'legacy_review').internalNote, privateNote);
  const stranger = await authenticated();
  assert.equal((await stranger.client.request(`${ROOT}/orders/${order.id}`)).status, 404);
  assert.equal((await stranger.client.request(`${ADMIN_ROOT}/orders/${order.id}`)).status, 403);
});

test('actual normalized engraving DTO yields one private upload and immutable cart-to-order snapshots', async () => {
  env.checkoutEnabled = true;
  const template = await CustomizationTemplate.create({ key: 'engraving-contract-fixture', name: 'Approved engraving fixture', kind: 'laser_engraving', status: 'approved', active: true,
    fields: [{ key: 'gift-message', label: 'Gift message', type: 'text', maxChars: 120 }],
    engraving: { textRequired: true, maxChars: 80, baseAdjustmentPiastres: 500, artworkAllowed: true, artworkRequired: true, artworkMaxFiles: 1,
      materials: [{ key: 'wood', label: 'Approved wood', adjustmentPiastres: 200 }], fonts: [{ key: 'plain', label: 'Approved plain font', adjustmentPiastres: 100 }] } });
  await Product.updateOne({ _id: product._id }, { $set: { customization: { enabled: true, templateId: template._id, serviceKind: 'laser_engraving', serviceEntryEligible: true } } });
  const guest = browserClient();
  const serialized = data(await guest.request(`${ROOT}/customization/products/${product.slug}`)).template;
  assert.equal(new Set(serialized.fields.map(field => field.key)).size, serialized.fields.length);
  assert.equal(serialized.fields.filter(field => field.key === 'engraving_artwork').length, 1);
  const signed = await guest.request(`${ROOT}/uploads/sign`, { method: 'POST', body: { purpose: 'artwork', mimeType: 'image/png', sizeBytes: PNG.length,
    productId: String(product._id), fieldKey: 'engraving_artwork', templateId: String(template._id), templateVersion: template.version } });
  assert.equal(signed.status, 201, JSON.stringify(signed.body));
  const uploadId = data(signed).upload.id;
  storage.put((await Upload.findById(uploadId).select('+temporaryKey')).temporaryKey, PNG);
  assert.equal((await guest.request(`${ROOT}/uploads/${uploadId}/complete`, { method: 'POST', body: {} })).status, 200);
  const customization = { templateId: serialized._id, version: serialized.version, selections: [], fields: {
    'gift-message': 'Preserved hyphenated field', engraving_text: 'Immutable engraving text', engraving_material: 'wood', engraving_font: 'plain', engraving_artwork: [uploadId] } };
  const quote = await guest.request(`${ROOT}/customization/quote`, { method: 'POST', body: { productId: String(product._id), customization } });
  assert.equal(quote.status, 200, JSON.stringify(quote.body));
  assert.equal(data(quote).unitPricePiastres, 12800);
  const cart = await add(guest, { customization });
  assert.equal(cart.items[0].customization.fields.engraving_artwork.length, 1);
  const placed = await submit(guest, await review(guest));
  assert.equal(placed.status, 201, JSON.stringify(placed.body));
  const order = orderOf(placed);
  assert.equal(order.lines[0].unitPricePiastres, 12800);
  assert.equal(order.lines[0].customization.fields['gift-message'], 'Preserved hyphenated field');
  assert.equal(order.lines[0].customization.engraving.text, 'Immutable engraving text');
  assert.equal((await Upload.findById(uploadId)).state, 'retained');
  assert.equal(await Upload.countDocuments({ purpose: 'artwork' }), 1);
  await Product.updateOne({ _id: product._id }, { $set: { pricePiastres: 50000 } });
  await CustomizationTemplate.updateOne({ _id: template._id }, { $set: { active: false } });
  const unchanged = orderOf(await guest.request(`${ROOT}/orders/${order.id}`));
  assert.deepEqual(unchanged.lines[0].customization, order.lines[0].customization);
  assert.equal(unchanged.lines[0].unitPricePiastres, 12800);
});
