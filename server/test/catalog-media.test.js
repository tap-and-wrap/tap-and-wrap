import assert from 'node:assert/strict';
import { test, before, after, beforeEach } from 'node:test';
import { once } from 'node:events';
import { Readable } from 'node:stream';
import mongoose from 'mongoose';
import { app } from '../src/app.js';
import { startTestDatabase } from './helpers/database.js';
import { User } from '../src/models/User.js';
import { Session } from '../src/models/Session.js';
import { CatalogMedia } from '../src/models/CatalogMedia.js';
import { Category } from '../src/models/Category.js';
import { Product } from '../src/models/Product.js';
import { ComponentOption } from '../src/models/ComponentOption.js';
import { Order } from '../src/models/Order.js';
import { AdminAudit } from '../src/models/AdminAudit.js';
import { env } from '../src/config/env.js';
import { newSessionToken, hashSession, makeCsrfToken } from '../src/utils/tokens.js';
import { createCatalogStorage, setCatalogStorageForTests, validateCatalogImage } from '../src/catalog/media-storage.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWO4NbsXAARVAgOYIL6CAAAAAElFTkSuQmCC', 'base64');
let database, server, base, headers, customer, objects, category, failPut, corrupt, puts;
async function session(role) {
  const user = await User.create({ name: 'Isolated media admin', email: `${role}@example.test`, role, active: true, passwordHash: 'fixture-only' });
  const token = newSessionToken(), csrf = makeCsrfToken(env.sessionSecret);
  await Session.create({ userId: user._id, tokenHash: hashSession(token), expiresAt: new Date(Date.now() + 3600000) });
  return { Cookie: `tw_session=${token}; tw_csrf=${csrf}`, Origin: env.clientOrigin, 'x-csrf-token': csrf };
}
async function request(path, { method = 'GET', body, auth = headers, type = 'application/json' } = {}) {
  const response = await fetch(`${base}/api/v1${path}`, { method, headers: { ...auth, 'Content-Type': type }, ...(body === undefined ? {} : { body: type === 'application/json' ? JSON.stringify(body) : body }) });
  return { status: response.status, json: await response.json() };
}
const upload = (options = {}) => request('/admin/media', { method: 'POST', body: png, type: 'image/png', ...options });
before(async () => {
  database = await startTestDatabase({ models: [User, Session, CatalogMedia, AdminAudit], transactions: true });
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { setCatalogStorageForTests(); delete process.env.CATALOG_MEDIA_BASE_URL; await new Promise(resolve => server.close(resolve)); await database.stop(); });
beforeEach(async () => {
  for (const model of Object.values(mongoose.models)) await model.deleteMany({});
  process.env.CATALOG_MEDIA_BASE_URL = 'https://catalog.example.test/';
  headers = await session('admin'); customer = await session('customer');
  category = await Category.create({ name: 'Isolated category', slug: 'isolated-category' });
  objects = new Map(); failPut = false; corrupt = false; puts = 0;
  setCatalogStorageForTests({
    async put(key, bytes, mimeType) { puts++; if (failPut) throw Error('provider detail must not escape'); if (!objects.has(key)) objects.set(key, { bytes: Buffer.from(bytes), mimeType }); },
    async read(key) { return corrupt ? { bytes: Buffer.from('wrong'), mimeType: 'image/png' } : objects.get(key); },
  });
});
test('public media requires an active administrator, signed CSRF and exact Origin before storage', async () => {
  assert.equal((await upload({ auth: {} })).status, 401);
  assert.equal((await upload({ auth: customer })).status, 403);
  assert.equal((await upload({ auth: { ...headers, Origin: 'https://untrusted.example' } })).status, 403);
  assert.equal((await upload({ auth: { ...headers, 'x-csrf-token': 'invalid' } })).status, 403);
  assert.equal(puts, 0); assert.equal(await CatalogMedia.countDocuments(), 0);
});
test('invalid type, signature, incomplete image, oversized bytes and dimensions are rejected', async () => {
  for (const options of [{ type: 'image/svg+xml', body: Buffer.from('<svg/>') }, { body: Buffer.from('not png') }, { body: png.subarray(0, 33) }, { body: Buffer.alloc(10 * 1024 * 1024 + 1) }]) {
    const result = await upload(options); assert.ok([400, 413].includes(result.status));
  }
  const giant = Buffer.from(png); giant.writeUInt32BE(12001, 16);
  await assert.rejects(validateCatalogImage(giant, 'image/png'));
  assert.equal(puts, 0); assert.equal(await CatalogMedia.countDocuments(), 0);
});
test('verified public upload is content-idempotent including concurrent duplicate submissions', async () => {
  const responses = await Promise.all([upload(), upload()]);
  assert.deepEqual(responses.map(result => result.status), [201, 201]);
  const image = responses[0].json.data.image;
  assert.equal(image.key, responses[1].json.data.image.key); assert.equal(objects.size, 1);
  assert.equal(await CatalogMedia.countDocuments(), 1); assert.match(image.url, /^https:\/\/catalog.example.test\/catalog-media\/v1\//);
  assert.equal(image.width, 1); assert.ok(await AdminAudit.exists({ action: 'catalog.media.verified' }));
});
test('failed R2 write/readback creates no receipt or catalog reference and retry recovers', async () => {
  failPut = true; assert.equal((await upload()).status, 503);
  failPut = false; corrupt = true; assert.equal((await upload()).status, 503);
  assert.equal(await CatalogMedia.countDocuments(), 0); assert.equal(await Product.countDocuments(), 0);
  corrupt = false; assert.equal((await upload()).status, 201); assert.equal(await CatalogMedia.countDocuments(), 1);
});
test('product galleries preserve imports, order and revision protection; unknown managed keys cannot attach', async () => {
  const image = (await upload()).json.data.image;
  const original = 'Original/unchanged.webp';
  const product = await Product.create({ name: 'Isolated product', slug: 'isolated-product', categoryId: category._id, mainImageKey: original, galleryKeys: [original] });
  const path = `/admin/products/${product._id}`;
  const patch = { mainImageKey: image.key, galleryKeys: [image.key, original], expectedRevision: 0 };
  assert.equal((await request(path, { method: 'PATCH', body: patch })).status, 200);
  assert.equal((await request(path, { method: 'PATCH', body: { ...patch, galleryKeys: [original, image.key], mainImageKey: original } })).status, 409);
  assert.deepEqual((await Product.findById(product._id)).galleryKeys.toObject(), patch.galleryKeys);
  const fake = `catalog-media/v1/${'0'.repeat(64)}.png`;
  assert.equal((await request(path, { method: 'PATCH', body: { expectedRevision: 1, mainImageKey: fake, galleryKeys: [fake] } })).status, 400);
  assert.equal(objects.size, 1);
});
test('main/subcategory and component image saves retain identities and shared objects when references are removed', async () => {
  const key = (await upload()).json.data.image.key;
  const child = await Category.create({ name: 'Isolated child', slug: 'isolated-child', parentId: category._id });
  for (const record of [category, child]) assert.equal((await request(`/admin/categories/${record._id}`, { method: 'PATCH', body: { imageKey: key, expectedRevision: 0 } })).status, 200);
  const component = await ComponentOption.create({ name: 'Preserved packaging', slug: 'preserved-packaging', categoryId: category._id, catalogRole: 'Gift Packaging', status: 'hold', galleryKeys: ['Original/packaging.webp'], mainImageKey: 'Original/packaging.webp' });
  assert.equal((await request(`/admin/commerce/components/${component._id}`, { method: 'PATCH', body: { mainImageKey: key, galleryKeys: [key], expectedRevision: 0 } })).status, 200);
  assert.equal((await ComponentOption.findById(component._id)).catalogRole, 'Gift Packaging');
  assert.equal((await request(`/admin/categories/${category._id}`, { method: 'PATCH', body: { imageKey: null, expectedRevision: 1 } })).status, 200);
  const listing = await request('/admin/media'); assert.equal(listing.json.data.images[0].catalogReferenced, true); assert.equal(listing.json.data.images[0].deletionAllowed, false);
  assert.equal((await request(`/admin/media/${key}`, { method: 'DELETE' })).status, 404); assert.equal(objects.size, 1);
  const order = await Order.create({ orderNumber: '681243', owner: 'isolated', checkoutKey: 'isolated', requestHash: 'isolated', customer: { name: 'Isolated' }, lines: [{ mainImageUrl: `https://catalog.example.test/${key}` }], totals: { totalPiastres: 100 }, paymentMethod: 'cod', paymentState: 'unpaid' });
  await request(`/admin/categories/${child._id}`, { method: 'PATCH', body: { imageKey: null, expectedRevision: 1 } });
  await request(`/admin/commerce/components/${component._id}`, { method: 'PATCH', body: { mainImageKey: null, galleryKeys: [], expectedRevision: 1 } });
  const unused = await request('/admin/media');
  assert.equal(unused.json.data.images[0].catalogReferenced, false); assert.equal(unused.json.data.images[0].deletionAllowed, false);
  assert.equal((await Order.findById(order._id)).lines[0].mainImageUrl, `https://catalog.example.test/${key}`); assert.equal(objects.size, 1);
});
test('catalog storage fails closed without explicit separate public configuration', () => {
  assert.throws(() => createCatalogStorage({}));
  const settings = { CATALOG_MEDIA_UPLOADS_ENABLED: 'true', CATALOG_R2_ACCOUNT_ID: 'a'.repeat(32), CATALOG_R2_ACCESS_KEY_ID: 'fixture', CATALOG_R2_SECRET_ACCESS_KEY: 'fixture', CATALOG_R2_BUCKET: 'private-fixture', R2_BUCKET: 'private-fixture', CATALOG_MEDIA_BASE_URL: 'https://catalog.example.test/' };
  assert.throws(() => createCatalogStorage(settings));
});
test('R2 adapter uses immutable conditional writes, bounded readback and existing media origin path prefixes', async () => {
  const calls = [];
  const storage = createCatalogStorage({ CATALOG_MEDIA_UPLOADS_ENABLED: 'true', CATALOG_R2_ACCOUNT_ID: 'a'.repeat(32), CATALOG_R2_ACCESS_KEY_ID: 'isolated-fixture', CATALOG_R2_SECRET_ACCESS_KEY: 'isolated-fixture', CATALOG_R2_BUCKET: 'public-fixture', R2_BUCKET: 'private-fixture', CATALOG_MEDIA_BASE_URL: 'https://catalog.example.test/photos/' }, { transport: async command => {
    calls.push(command.input);
    if (command.input.Body) throw Object.assign(Error('existing object'), { $metadata: { httpStatusCode: 412 } });
    return { Body: Readable.from(png), ContentType: 'image/png' };
  } });
  await storage.put('catalog-media/v1/fixture.png', png, 'image/png');
  const read = await storage.read('catalog-media/v1/fixture.png');
  assert.deepEqual(read.bytes, png);
  assert.equal(calls[0].IfNoneMatch, '*'); assert.equal(calls[0].CacheControl, 'public, max-age=31536000, immutable');
  assert.equal(calls[0].Key, 'photos/catalog-media/v1/fixture.png'); assert.equal(calls[1].Key, calls[0].Key);
});
