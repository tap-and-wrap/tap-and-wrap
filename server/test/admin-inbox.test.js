import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { once } from 'node:events';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { Session } from '../src/models/Session.js';
import { Order } from '../src/models/Order.js';
import { ServiceRequest } from '../src/models/ServiceRequest.js';
import { buildInboxPipeline, presentInboxRecord } from '../src/commerce/admin-notifications.js';
import { newSessionToken, hashSession, makeCsrfToken } from '../src/utils/tokens.js';
import { startTestDatabase } from './helpers/database.js';

let db, server, url, adminHeaders;
before(async () => {
  db = await startTestDatabase({ models: Object.values(mongoose.models), transactions: true });
  const admin = await User.create({ name: 'Synthetic administrator', email: 'notifications-admin@example.test', passwordHash: 'not-real', role: 'admin', active: true });
  const token = newSessionToken(), csrf = makeCsrfToken(env.sessionSecret);
  await Session.create({ userId: admin._id, tokenHash: hashSession(token), expiresAt: new Date(Date.now() + 3600000) });
  adminHeaders = { Cookie: `tw_session=${token}; tw_csrf=${csrf}`, Origin: env.clientOrigin, 'x-csrf-token': csrf, 'Content-Type': 'application/json' };
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  url = `http://127.0.0.1:${server.address().port}/api/v1/admin/commerce/notifications`;
});
after(async () => { server?.closeAllConnections(); if (server) await new Promise(resolve => server.close(resolve)); await db?.stop(); });
async function call(path = '', method = 'GET', headers = adminHeaders) {
  const response = await fetch(url + path, { method, headers, ...(method === 'POST' ? { body: '{}' } : {}) });
  const json = await response.json(); return { status: response.status, ...json };
}

test('inbox plan uses existing collections, bounded pagination and virtual follow-up timestamps', () => {
  const stages = buildInboxPipeline({ page: 2, limit: 5, view: 'followups', now: new Date('2026-10-18T10:00:00Z') });
  assert.ok(stages.some(stage => stage.$unionWith?.coll === ServiceRequest.collection.name));
  const facet = stages.at(-1).$facet;
  assert.deepEqual(facet.records.find(stage => '$skip' in stage), { $skip: 5 });
  assert.deepEqual(facet.records.find(stage => '$limit' in stage), { $limit: 5 });
  assert.ok(facet.records.some(stage => stage.$match?.followup));
  assert.throws(() => buildInboxPipeline({ page: 9999 }));
  assert.throws(() => buildInboxPipeline({ limit: 100 }));
  const note = presentInboxRecord({ kind: 'request', _id: '507f1f77bcf86cd799439011', reference: 'TW-ABCDEF123456', service: 'gift_box', followup: 'soon', unread: true, state: 'submitted' });
  assert.equal(note.title, 'Follow-up due soon · Request TW-ABCDEF123456');
  assert.equal(note.href, '/admin/requests/507f1f77bcf86cd799439011');
  assert.equal(note.unread, true);
});

test('admin-only inbox lists saved submissions; mark all read persists without touching order state', async () => {
  const order = await Order.create({ orderNumber: '852361', owner: 'fixture-owner', checkoutKey: 'fixture-checkout', requestHash: 'fixture-hash',
    customer: { name: 'Synthetic customer', phone: '01012345678', email: 'fictional@example.test' }, lines: [], totals: { totalPiastres: 35000 },
    paymentMethod: 'cod', paymentState: 'unpaid', fulfillmentState: 'received' });
  const request = await ServiceRequest.create({ reference: 'TW-ABCDEF123456', owner: 'fixture-owner', requestKey: 'fixture-request', requestHash: 'fixture-hash',
    service: 'gift_box', customer: { name: 'Synthetic guest', phone: '01012345678' }, details: { contents: 'test only' }, estimate: {},
    followUpDueAt: new Date(Date.now() + 12 * 3600000) });
  let result = await call();
  assert.equal(result.status, 200, JSON.stringify(result.error));
  assert.equal(result.data.pagination.total, 2);
  assert.equal(result.data.unreadCount, 2);
  assert.ok(result.data.notifications.some(item => item.href === `/admin/commerce/orders/${order.id}`));
  assert.ok(result.data.notifications.some(item => item.href === `/admin/requests/${request.id}`));
  assert.equal(result.data.notifications.some(item => 'phone' in item || 'customer' in item), false);
  result = await call('/read-all', 'POST');
  assert.equal(result.status, 200, JSON.stringify(result.error));
  result = await call('?view=unread');
  assert.equal(result.status, 200); assert.equal(result.data.unreadCount, 0); assert.equal(result.data.notifications.length, 0);
  assert.equal((await Order.findById(order.id)).fulfillmentState, 'received');
  const unauthorized = await call('', 'GET', { 'Content-Type': 'application/json' });
  assert.notEqual(unauthorized.status, 200);
});
