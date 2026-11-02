import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import mongoose from 'mongoose';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';
import { databaseModels } from '../src/config/schema.js';
import { GiftBoxComponentSetting } from '../src/models/GiftBoxComponentSetting.js';
import { AdminAudit } from '../src/models/AdminAudit.js';
import { User } from '../src/models/User.js';
import { Session } from '../src/models/Session.js';
import { ComponentOption } from '../src/models/ComponentOption.js';
import { ServiceRequest } from '../src/models/ServiceRequest.js';
import { Order } from '../src/models/Order.js';
import { newSessionToken, hashSession, makeCsrfToken } from '../src/utils/tokens.js';
import { startTestDatabase } from './helpers/database.js';
import { updateBuilderSetting } from '../src/gift-box/catalog.js';
import { FIXED_COMPONENTS } from '../../shared/gift-box/definitions.mjs';

let database, server, base, admin, otherAdmin, customer;
const prefix = '/api/v1/admin/gift-box/components';
const originalEnabled = env.giftBoxBuilderBackendEnabled;
async function account(role, suffix) {
  const user = await User.create({ name: 'Synthetic account', email: `${suffix}@example.test`, passwordHash: 'isolated-fixture', role });
  const token = newSessionToken(), csrf = makeCsrfToken(env.sessionSecret);
  await Session.create({ userId: user._id, tokenHash: hashSession(token), expiresAt: new Date(Date.now() + 3600000) });
  return { user, headers: { Cookie: `tw_session=${token}; tw_csrf=${csrf}`, Origin: env.clientOrigin, 'x-csrf-token': csrf } };
}
async function request(route, { method = 'GET', body, headers = admin?.headers ?? {} } = {}) {
  const response = await fetch(`${base}${route}`, { method, headers: { ...headers, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const payload = await response.json();
  return { status: response.status, ...payload, headers: response.headers };
}
const patch = (id, body, options = {}) => request(`${prefix}/${id}`, { method: 'PATCH', body, ...options });
const estimate = body => request('/api/v1/gift-box/estimate', { method: 'POST', body });
const order = category => FIXED_COMPONENTS.filter(item => item.category === category).map(item => ({ componentId: item.id, expectedRevision: 0 }));
before(async () => {
  assert.equal(originalEnabled, false); // Test runner must not inherit activation settings.
  assert.equal(databaseModels.includes(GiftBoxComponentSetting), false);
  database = await startTestDatabase({ transactions: true });
  // Explicit DDL is confined to this new disposable loopback fixture.
  await GiftBoxComponentSetting.createCollection(); await GiftBoxComponentSetting.createIndexes();
  admin = await account('admin', 'builder-admin'); otherAdmin = await account('admin', 'builder-other'); customer = await account('customer', 'builder-customer');
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(async () => {
  env.giftBoxBuilderBackendEnabled = true;
  await GiftBoxComponentSetting.deleteMany({}); await AdminAudit.deleteMany({});
});
after(async () => {
  env.giftBoxBuilderBackendEnabled = originalEnabled;
  if (server) await new Promise(resolve => server.close(resolve));
  await database?.stop();
});

test('default-off feature leaves legacy readiness intact and creates no settings', async () => {
  env.giftBoxBuilderBackendEnabled = false;
  assert.equal((await request('/health/ready')).status, 200);
  assert.equal((await request('/api/v1/gift-box/catalog')).status, 404);
  assert.equal((await patch('box-2', { expectedRevision: 0, enabled: true })).status, 404);
  assert.equal((await request('/api/v1/commerce/service-requests/options/laser_engraving')).status, 200);
  assert.equal(await GiftBoxComponentSetting.countDocuments(), 0);
});
test('missing settings use original numeric ordering, unavailable/unpriced defaults and bounded pagination', async () => {
  const result = await request(`${prefix}?category=plush`);
  assert.equal(result.status, 200);
  assert.deepEqual(result.data.components.map(item => item.componentId), Array.from({ length: 17 }, (_, i) => `plush-${i + 1}`));
  assert.ok(result.data.components.every(item => item.revision === 0 && item.configured === false && item.pricePiastres === null && !item.enabled && !item.availableForEstimate));
  assert.equal((await request(`${prefix}?limit=101`)).status, 400);
  const complete = await request('/api/v1/gift-box/catalog?limit=100');
  assert.equal(complete.data.components.length, 74); assert.equal(complete.data.pagination.pages, 1);
  assert.equal(complete.data.components.filter(item => item.category === 'chocolate').length, 20);
  const all = await request('/api/v1/gift-box/catalog');
  assert.equal(all.data.components.length, 20); assert.equal(all.data.pagination.total, 74);
  assert.equal('revision' in all.data.components[0], false);
  assert.equal(JSON.stringify(all.data).includes('selectionAsset'), false);
  assert.match(all.headers.get('cache-control'), /no-store/);
  assert.match(all.headers.get('x-robots-tag'), /noindex/);
  assert.equal(await GiftBoxComponentSetting.countDocuments(), 0);
});
test('only known identities get settings and model metadata stays separate from immutable definitions', async () => {
  assert.equal((await patch('box-99', { expectedRevision: 0, displayName: 'Unknown' })).status, 400);
  assert.equal((await request(`${prefix}/box-99`)).status, 400);
  const saved = await patch('box-2', { expectedRevision: 0, displayName: 'Owner box name', enabled: true, available: true, inventoryMode: 'made_to_order', pricePiastres: 12345 });
  assert.equal(saved.status, 200, JSON.stringify(saved.error));
  assert.equal(saved.data.component.revision, 1);
  assert.equal(saved.data.component.displayOrder, 2);
  const record = await GiftBoxComponentSetting.findOne({ componentId: 'box-2' }).lean();
  assert.equal(record.priceApproval, 'paid'); assert.equal(String(record.priceApprovedBy), String(admin.user._id)); assert.ok(record.priceApprovedAt);
  assert.equal(record.category, undefined); assert.equal(record.imagePath, undefined);
  assert.equal(await AdminAudit.countDocuments({ action: 'gift_box.component.updated' }), 1);
  assert.equal(await ComponentOption.countDocuments(), 0);
  assert.throws(() => new GiftBoxComponentSetting({ componentId: 'box-2', category: 'other' }), mongoose.Error.StrictModeError);
  await assert.rejects(new GiftBoxComponentSetting({ componentId: 'unknown', displayOrder: 1, createdBy: admin.user._id, updatedBy: admin.user._id }).validate());
});
test('price updates require explicit complimentary approval and clearing price preserves an unpriced state', async () => {
  assert.equal((await patch('rose-red', { expectedRevision: 0, pricePiastres: 0 })).status, 400);
  const saved = await patch('rose-red', { expectedRevision: 0, pricePiastres: 0, confirmComplimentary: true, enabled: true });
  assert.equal(saved.status, 200); assert.equal(saved.data.component.pricing, 'complimentary'); assert.equal(saved.data.component.pricePiastres, 0);
  const renamed = await patch('rose-red', { expectedRevision: 1, displayName: 'Complimentary rose' });
  assert.equal(renamed.data.component.pricing, 'complimentary');
  const cleared = await patch('rose-red', { expectedRevision: 2, pricePiastres: null });
  assert.equal(cleared.data.component.pricing, 'pending'); assert.equal(cleared.data.component.availableForEstimate, false);
  const record = await GiftBoxComponentSetting.findOne({ componentId: 'rose-red' });
  assert.equal(record.priceApprovedBy, null); assert.equal(record.priceApprovedAt, null);
});
test('invalid prices and immutable/unknown properties never write settings or audits', async () => {
  for (const pricePiastres of [-1, 1.5, '100', Number.MAX_SAFE_INTEGER + 1]) assert.equal((await patch('box-2', { expectedRevision: 0, pricePiastres })).status, 400);
  for (const key of ['componentId', 'category', 'selectionAsset', 'placementAsset', 'assetHash', 'geometryId', 'approvedColorHex', 'internalDefinitions', 'priceApprovedBy', 'priceApproval', '__v']) {
    assert.equal((await patch('box-2', { expectedRevision: 0, displayName: 'Not saved', [key]: 'forged' })).status, 400);
  }
  assert.equal(await GiftBoxComponentSetting.countDocuments(), 0); assert.equal(await AdminAudit.countDocuments(), 0);
});
test('anonymous/customer, missing CSRF, wrong Origin and revoked administrators cannot write', async () => {
  const body = { expectedRevision: 0, displayName: 'Unauthorized' };
  assert.equal((await patch('box-2', body, { headers: {} })).status, 401);
  assert.equal((await patch('box-2', body, { headers: customer.headers })).status, 403);
  assert.equal((await patch('box-2', body, { headers: { ...admin.headers, 'x-csrf-token': '' } })).status, 403);
  assert.equal((await patch('box-2', body, { headers: { ...admin.headers, Origin: 'https://untrusted.example' } })).status, 403);
  await User.updateOne({ _id: otherAdmin.user._id }, { $set: { active: false } });
  try { assert.equal((await patch('box-2', body, { headers: otherAdmin.headers })).status, 401); }
  finally { await User.updateOne({ _id: otherAdmin.user._id }, { $set: { active: true } }); }
  await assert.rejects(updateBuilderSetting('box-2', body, customer.user), { code: 'ADMIN_REQUIRED' });
  assert.equal(await GiftBoxComponentSetting.countDocuments(), 0); assert.equal(await AdminAudit.countDocuments(), 0);
});
test('revision-less and stale forms fail; same-value saves also consume a revision', async () => {
  assert.equal((await patch('box-2', { displayName: 'No revision' })).status, 400);
  assert.equal((await patch('box-2', { expectedRevision: 1, displayName: 'Not loaded' })).status, 409);
  assert.equal((await patch('box-2', { expectedRevision: 0, displayName: 'First' })).data.component.revision, 1);
  const stale = await patch('box-2', { expectedRevision: 0, displayName: 'Stale draft' });
  assert.equal(stale.status, 409); assert.equal(stale.error.code, 'EDIT_CONFLICT');
  assert.equal((await patch('box-2', { expectedRevision: 1, displayName: 'First' })).data.component.revision, 2);
  assert.equal((await request(`${prefix}/box-2`)).data.component.displayName, 'First');
});
test('concurrent first saves and subsequent edits permit exactly one winner and one audit', async () => {
  for (const expectedRevision of [0, 1]) {
    const results = await Promise.all(['First administrator', 'Second administrator'].map((displayName, index) => patch('box-2', { expectedRevision, displayName }, { headers: index ? otherAdmin.headers : admin.headers })));
    assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  }
  assert.equal(await GiftBoxComponentSetting.countDocuments(), 1); assert.equal(await AdminAudit.countDocuments(), 2);
});
test('category reorder is numeric, complete, category-scoped and atomically revision-protected', async () => {
  const items = order('flower').reverse();
  const reordered = await request(`${prefix}/reorder`, { method: 'PATCH', body: { category: 'flower', items } });
  assert.equal(reordered.status, 200, JSON.stringify(reordered.error));
  assert.deepEqual((await request(`${prefix}?category=flower`)).data.components.map(item => item.componentId), items.map(item => item.componentId));
  assert.equal(await GiftBoxComponentSetting.countDocuments(), 3);
  const current = reordered.data.components;
  await patch(current[2].componentId, { expectedRevision: 1, displayName: 'Concurrent rename' });
  const conflict = await request(`${prefix}/reorder`, { method: 'PATCH', body: { category: 'flower', items: current.map(item => ({ componentId: item.componentId, expectedRevision: 1 })) } });
  assert.equal(conflict.status, 409);
  assert.equal((await request(`${prefix}/${current[0].componentId}`)).data.component.revision, 1);
  assert.equal(await AdminAudit.countDocuments(), 2);
  for (const body of [{ category: 'box', items }, { category: 'flower', items: items.slice(1) }, { category: 'chocolate', items: [] }]) assert.equal((await request(`${prefix}/reorder`, { method: 'PATCH', body })).status, 400);
});
test('audit failure rolls back the settings write', async () => {
  const original = AdminAudit.create;
  AdminAudit.create = async () => { throw new Error('Synthetic audit failure'); };
  try { await assert.rejects(updateBuilderSetting('box-2', { expectedRevision: 0, displayName: 'Must roll back' }, admin.user), /Synthetic/); }
  finally { AdminAudit.create = original; }
  assert.equal(await GiftBoxComponentSetting.countDocuments(), 0);
});
test('public estimates read saved prices, never persist selections, and cannot authorize unreviewed arrangements', async () => {
  for (const [id, amount] of [['box-2', 12345], ['rose-red', 678], ['plush-1', 0]]) await patch(id, { expectedRevision: 0, enabled: true, available: true, inventoryMode: 'made_to_order', pricePiastres: amount, ...(amount === 0 ? { confirmComplimentary: true } : {}) });
  const result = await estimate({ boxId: 'box-2', items: [{ componentId: 'rose-red', quantity: 3 }, { componentId: 'plush-1', quantity: 1 }] });
  assert.equal(result.status, 200, JSON.stringify(result.error)); assert.equal(result.data.estimate.componentSubtotalPiastres, 14379);
  assert.equal(result.data.estimate.arrangementApproved, false); assert.equal(result.data.estimate.submissionAllowed, false);
  assert.equal(result.data.estimate.orderConversionAllowed, false);
  assert.deepEqual(result.data.estimate.items.map(item => item.settingsRevision), [1, 1, 1]);
  assert.equal(await ServiceRequest.countDocuments(), 0); assert.equal(await Order.countDocuments(), 0);
  assert.equal(await AdminAudit.countDocuments(), 3);
  assert.equal((await estimate({ boxId: 'box-2', totalPiastres: 1 })).status, 400);
  assert.equal((await estimate({ boxId: 'box-2', items: [{ componentId: 'rose-red', quantity: 1, unitPricePiastres: 0 }] })).status, 400);
  assert.equal((await estimate({ boxId: 'box-2', items: [{ componentId: 'rose-red', quantity: 101 }] })).status, 400);
});
test('guest estimates require valid CSRF and exact Origin but no account or cart owner', async () => {
  await patch('box-2', { expectedRevision: 0, enabled: true, available: true, inventoryMode: 'made_to_order', pricePiastres: 100 });
  const csrf = makeCsrfToken(env.sessionSecret), headers = { Cookie: `tw_csrf=${csrf}`, Origin: env.clientOrigin, 'x-csrf-token': csrf };
  assert.equal((await request('/api/v1/gift-box/estimate', { method: 'POST', body: { boxId: 'box-2' }, headers })).status, 200);
  assert.equal((await request('/api/v1/gift-box/estimate', { method: 'POST', body: { boxId: 'box-2' }, headers: {} })).status, 403);
});
test('estimates use current saved revisions without changing settings or creating customer records', async () => {
  await patch('box-2', { expectedRevision: 0, enabled: true, available: true, inventoryMode: 'made_to_order', pricePiastres: 100 });
  await patch('rose-red', { expectedRevision: 0, enabled: true, available: true, inventoryMode: 'made_to_order', pricePiastres: 20 });
  const input = { boxId: 'box-2', items: [{ componentId: 'rose-red', quantity: 3 }] };
  assert.equal((await estimate(input)).data.estimate.componentSubtotalPiastres, 160);
  await patch('rose-red', { expectedRevision: 1, pricePiastres: 21 });
  const result = (await estimate(input)).data.estimate;
  assert.equal(result.componentSubtotalPiastres, 163);
  assert.equal(result.items[1].settingsRevision, 2);
  assert.equal((await request(`${prefix}/rose-red`)).data.component.revision, 2);
  assert.equal(await AdminAudit.countDocuments(), 3);
  assert.equal(await ServiceRequest.countDocuments(), 0);
});
test('HTTP pricing rejects integer overflow without persisting a request or changing the saved amount', async () => {
  const saved = await patch('box-2', { expectedRevision: 0, enabled: true, available: true, inventoryMode: 'made_to_order', pricePiastres: Number.MAX_SAFE_INTEGER });
  assert.equal(saved.status, 200);
  await patch('rose-red', { expectedRevision: 0, enabled: true, available: true, inventoryMode: 'made_to_order', pricePiastres: 1 });
  const result = await estimate({ boxId: 'box-2', items: [{ componentId: 'rose-red', quantity: 1 }] });
  assert.equal(result.status, 400); assert.equal(result.error.code, 'GIFT_BOX_AMOUNT_OVERFLOW');
  assert.equal((await request(`${prefix}/box-2`)).data.component.pricePiastres, Number.MAX_SAFE_INTEGER);
  assert.equal(await ServiceRequest.countDocuments(), 0);
});
test('disabled and missing prices are rejected; pending catalogs cannot be fabricated through admin or public inputs', async () => {
  assert.equal((await estimate({ boxId: 'box-2' })).status, 409);
  await patch('box-2', { expectedRevision: 0, enabled: true });
  const unpriced = await estimate({ boxId: 'box-2' }); assert.equal(unpriced.status, 409); assert.equal(unpriced.error.code, 'GIFT_BOX_PRICE_PENDING');
  await patch('box-2', { expectedRevision: 1, pricePiastres: 100, enabled: false });
  assert.equal((await estimate({ boxId: 'box-2' })).error.code, 'GIFT_BOX_COMPONENT_UNAVAILABLE');
  for (const category of ['ribbon', 'gift_card']) {
    const result = await request(`/api/v1/gift-box/catalog?category=${category}`);
    assert.equal(result.data.pagination.total, category === 'ribbon' ? 21 : 1);
    assert.ok(result.data.components.every(item => item.pricePiastres === null && !item.availableForEstimate));
    assert.equal(result.data.pendingCategories.includes(category), false);
  }
  assert.equal((await patch('chocolate-not-approved', { expectedRevision: 0, enabled: true, available: true, inventoryMode: 'made_to_order', pricePiastres: 100 })).status, 400);
  assert.equal((await estimate({ boxId: 'box-2', ribbonId: 'ribbon-not-approved' })).status, 400);
  assert.equal((await estimate({ boxId: 'box-2', giftCard: { componentId: 'card-not-approved', message: '💐'.repeat(501) } })).status, 400);
  assert.equal((await estimate({ boxId: 'box-2', giftCard: { componentId: 'card-not-approved', message: 'For you' } })).error.code, 'GIFT_BOX_COMPONENT_UNKNOWN');
});
test('HTTP inventory edits and estimates enforce confirmed stock and ribbon status-only rules', async () => {
  const invalid = await patch('box-2', { expectedRevision: 0, inventoryMode: 'tracked', inventoryQuantity: 10 });
  assert.equal(invalid.status, 400); assert.equal(invalid.error.code, 'GIFT_BOX_STOCK_CONFIRMATION_REQUIRED');
  const saved = await patch('box-2', { expectedRevision: 0, displayName: 'HTTP inventory fixture', inventoryMode: 'tracked', inventoryQuantity: 1,
    confirmInventoryQuantity: true, pricePiastres: 100, available: true, enabled: true });
  assert.equal(saved.status, 200); assert.equal(saved.data.component.availableForEstimate, true);
  await patch('rose-red', { expectedRevision: 0, inventoryMode: 'tracked', inventoryQuantity: 2, confirmInventoryQuantity: true, available: true, enabled: true, pricePiastres: 20 });
  const overstock = await estimate({ boxId: 'box-2', items: [{ componentId: 'rose-red', quantity: 3 }] });
  assert.equal(overstock.status, 409); assert.equal(overstock.error.code, 'GIFT_BOX_STOCK_EXCEEDED');
  assert.equal((await estimate({ boxId: 'box-2', items: [{ componentId: 'rose-red', quantity: 2 }] })).data.estimate.componentSubtotalPiastres, 140);
  assert.equal((await request(`${prefix}/rose-red`)).data.component.inventoryQuantity, 2);
  await patch('rose-red', { expectedRevision: 1, inventoryMode: 'made_to_order' });
  assert.equal((await request(`${prefix}/rose-red`)).data.component.inventoryQuantity, 2);
  const atLimit = await estimate({ boxId: 'box-2', items: [{ componentId: 'rose-red', quantity: 25 }] });
  assert.equal(atLimit.status, 200);
  const noOldBusinessLimit = await estimate({ boxId: 'box-2', items: [{ componentId: 'rose-red', quantity: 26 }] });
  assert.equal(noOldBusinessLimit.status, 200); assert.equal(noOldBusinessLimit.data.estimate.componentSubtotalPiastres, 620);
  assert.equal((await estimate({ boxId: 'box-2', items: [{ componentId: 'rose-red', quantity: 101 }] })).status, 400); // Computational request guard.
  await patch('rose-red', { expectedRevision: 2, available: false });
  assert.equal((await estimate({ boxId: 'box-2', items: [{ componentId: 'rose-red', quantity: 1 }] })).error.code, 'GIFT_BOX_COMPONENT_UNAVAILABLE');
  for (const body of [{ inventoryQuantity: 2 }, { inventoryMode: 'made_to_order' }, { inventoryMode: 'status_only' }]) {
    assert.equal((await patch('ribbon-navy', { expectedRevision: 0, ...body })).status, 400);
  }
  await patch('ribbon-navy', { expectedRevision: 0, displayName: 'HTTP ribbon fixture', available: true, enabled: true });
  const ribbon = (await request(`${prefix}/ribbon-navy`)).data.component;
  assert.equal(ribbon.inventoryMode, 'status_only'); assert.equal(ribbon.inventoryQuantity, null); assert.equal(ribbon.availableForEstimate, false);
});
test('there are no add/delete/submission/conversion endpoints or legacy component backdoors', async () => {
  for (const [route, method] of [[prefix, 'POST'], [`${prefix}/box-2`, 'DELETE'], ['/api/v1/gift-box/submit', 'POST'], ['/api/v1/gift-box/convert', 'POST']]) assert.equal((await request(route, { method, body: {} })).status, 404);
  assert.equal((await request('/api/v1/admin/commerce/components/box-2', { method: 'PATCH', body: { expectedRevision: 0, name: 'Attempt' } })).status, 400);
  assert.equal((await request('/api/v1/commerce/service-requests', { method: 'POST', body: { builder: { boxId: 'box-2' } } })).status, 400);
  assert.equal(await ServiceRequest.countDocuments(), 0); assert.equal(await GiftBoxComponentSetting.countDocuments(), 0);
});
test('missing unique index blocks builder writes without runtime DDL or affecting engraving readiness', async () => {
  await GiftBoxComponentSetting.collection.dropIndex('componentId_1');
  // Observe schema state directly; the runtime must not repair it.
  try {
    const response = await patch('box-2', { expectedRevision: 0, enabled: true });
    assert.equal(response.status, 503); assert.equal(response.error.code, 'DATABASE_SCHEMA_NOT_READY');
    assert.equal(await GiftBoxComponentSetting.countDocuments(), 0);
    assert.equal((await GiftBoxComponentSetting.collection.listIndexes().toArray()).some(index => index.name === 'componentId_1'), false);
    assert.equal((await request('/api/v1/commerce/service-requests/options/laser_engraving')).status, 200);
  } finally { await GiftBoxComponentSetting.createIndexes(); }
});
test('an absent builder collection is never implicitly created by a runtime read or settings save', async () => {
  await GiftBoxComponentSetting.collection.drop(); // This newly created disposable test collection only.
  try {
    env.giftBoxBuilderBackendEnabled = false;
    assert.equal((await request('/health/ready')).status, 200);
    assert.equal((await request('/api/v1/gift-box/catalog')).status, 404);
    env.giftBoxBuilderBackendEnabled = true;
    assert.equal((await request('/api/v1/gift-box/catalog')).error.code, 'DATABASE_SCHEMA_NOT_READY');
    const response = await patch('box-2', { expectedRevision: 0, enabled: true });
    assert.equal(response.status, 503);
    assert.equal((await mongoose.connection.db.listCollections({ name: GiftBoxComponentSetting.collection.name }).toArray()).length, 0);
    assert.equal((await request('/api/v1/commerce/service-requests/options/laser_engraving')).status, 200);
  } finally { await GiftBoxComponentSetting.createCollection(); await GiftBoxComponentSetting.createIndexes(); }
});
