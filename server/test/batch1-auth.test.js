import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { Session } from '../src/models/Session.js';
import { Cart } from '../src/models/Cart.js';
import { AccountActionToken } from '../src/models/AccountActionToken.js';
import { NotificationEvent } from '../src/models/NotificationEvent.js';
import { makeCsrfToken, newSessionToken, hashSession, validCsrfToken } from '../src/utils/tokens.js';
import { validNewPassword } from '../src/utils/password.js';
import { resetAuthRateLimitsForTests } from '../src/routes/auth.routes.js';
import { requestAccountAction, resetAccountPassword, verifyAccountEmail } from '../src/email/account-actions.js';
import { accountActionUrl, sealActionToken } from '../src/email/action-secrets.js';
import { startTestDatabase } from './helpers/database.js';

let database, server, base;
before(async () => {
  database = await startTestDatabase({ models: Object.values(mongoose.models), transactions: true });
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); await database?.stop(); });
beforeEach(async () => { for (const model of Object.values(mongoose.models)) await model.deleteMany({}); resetAuthRateLimitsForTests(); });

async function request(path, { method = 'GET', cookies = {}, token, origin = env.clientOrigin, body, rawBody } = {}) {
  const csrf = token ?? cookies.tw_csrf;
  const response = await fetch(`${base}${path}`, { method, headers: { Origin: origin,
    Cookie: Object.entries(cookies).map(([key, value]) => `${key}=${value}`).join('; '),
    ...(csrf ? { 'x-csrf-token': csrf } : {}), ...(body !== undefined || rawBody !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    ...(body !== undefined || rawBody !== undefined ? { body: rawBody ?? JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json(), headers: response.headers };
}
function cookie(result, name) { const entry = result.headers.getSetCookie().findLast(value => value.startsWith(`${name}=`)); return entry?.split(';')[0].slice(name.length + 1); }
async function account({ active = true, authVersion = 0, sessionVersion = authVersion, expired = false } = {}) {
  const user = await User.create({ name: 'Private fixture', email: 'private@example.test', passwordHash: await bcrypt.hash('fixture-password-123', 4), role: 'customer', active, authVersion });
  const token = newSessionToken();
  await Session.create({ userId: user._id, tokenHash: hashSession(token), authVersion: sessionVersion, expiresAt: new Date(Date.now() + (expired ? -1000 : 3600000)) });
  return { user, token };
}

test('CSRF acquisition preserves a valid shared cookie for simultaneous tabs and refresh', async () => {
  const token = makeCsrfToken(env.sessionSecret);
  const results = await Promise.all(Array.from({ length: 6 }, () => request('/auth/csrf', { cookies: { tw_csrf: token } })));
  for (const result of results) { assert.equal(result.status, 200); assert.equal(result.body.data.csrfToken, token); assert.equal(cookie(result, 'tw_csrf'), token); }
  const refreshed = await request('/auth/csrf', { cookies: { tw_csrf: 'expired-or-forged-cookie' } });
  assert.equal(validCsrfToken(refreshed.body.data.csrfToken, env.sessionSecret), true);
  assert.notEqual(refreshed.body.data.csrfToken, 'expired-or-forged-cookie');
});

test('first-tab token races reject before mutation and can recover with the actual cookie', async () => {
  const [first, second] = await Promise.all([request('/auth/csrf'), request('/auth/csrf')]);
  const actualCookie = second.body.data.csrfToken;
  assert.notEqual(first.body.data.csrfToken, actualCookie);
  const rejected = await request('/auth/logout', { method: 'POST', cookies: { tw_csrf: actualCookie }, token: first.body.data.csrfToken, body: {} });
  assert.equal(rejected.status, 403); assert.equal(rejected.body.error.code, 'INVALID_CSRF');
  const refreshed = await request('/auth/csrf', { cookies: { tw_csrf: actualCookie } });
  const recovered = await request('/auth/logout', { method: 'POST', cookies: { tw_csrf: actualCookie }, token: refreshed.body.data.csrfToken, body: {} });
  assert.equal(recovered.status, 200);
  assert.equal((await request('/auth/logout', { method: 'POST', cookies: { tw_csrf: actualCookie }, token: actualCookie, origin: 'https://attacker.invalid', body: {} })).body.error.code, 'INVALID_ORIGIN');
});

for (const [name, options] of [['expired', { expired: true }], ['revoked', { authVersion: 2, sessionVersion: 1 }], ['inactive', { active: false }]]) {
  test(`${name} account cookies clear safely without exposing account or old guest carts`, async () => {
    const { user, token } = await account(options);
    const oldGuest = 'b'.repeat(64);
    const oldGuestOwner = `guest:${hashSession(oldGuest)}`;
    const privateItem = { id: 'sensitive-line', identity: 'sensitive-identity', productId: new mongoose.Types.ObjectId(), name: 'PRIVATE_FIXTURE_MARKER', quantity: 1, personalization: { name: 'PRIVATE_NOTE_MARKER' } };
    await Cart.create([{ owner: `user:${user._id}`, items: [privateItem], expiresAt: new Date(Date.now() + 3600000) }, { owner: oldGuestOwner, items: [privateItem], expiresAt: new Date(Date.now() + 3600000) }]);
    const result = await request('/commerce/cart', { cookies: { tw_session: token, tw_cart: oldGuest } });
    assert.equal(result.status, 200); assert.deepEqual(result.body.data.cart.items, []);
    assert.equal(result.headers.get('x-session-expired'), '1');
    assert.deepEqual(new Set(result.headers.get('access-control-expose-headers').split(',').map(value => value.trim().toLowerCase())), new Set(['x-session-expired', 'x-request-id']));
    assert.match(result.headers.get('x-request-id'), /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i);
    assert.equal(JSON.stringify(result.body).includes('PRIVATE_'), false);
    assert.equal(cookie(result, 'tw_session'), ''); assert.notEqual(cookie(result, 'tw_cart'), oldGuest);
    assert.equal((await Cart.findOne({ owner: `user:${user._id}` })).items.length, 1);
    assert.equal((await request('/commerce/orders', { cookies: { tw_session: token } })).status, 401);
    assert.equal((await request('/admin/products', { cookies: { tw_session: token } })).status, 401);
  });
}

test('logout remains idempotent with deleted or malformed sessions and strictly checks CSRF/Origin', async () => {
  const csrf = makeCsrfToken(env.sessionSecret);
  for (const token of [newSessionToken(), 'invalid']) {
    const result = await request('/auth/logout', { method: 'POST', cookies: { tw_session: token, tw_csrf: csrf }, body: {} });
    assert.equal(result.status, 200); assert.equal(cookie(result, 'tw_session'), ''); assert.match(cookie(result, 'tw_cart'), /^[a-f0-9]{64}$/);
  }
  assert.equal((await request('/auth/logout', { method: 'POST', body: {} })).status, 403);
});

test('session-probe-first recovery clears the pre-login guest cookie before anonymous commerce', async () => {
  const { user, token } = await account({ authVersion: 2, sessionVersion: 1 });
  const previousGuest = 'd'.repeat(64);
  const item = { id: 'private-guest-line', identity: 'private-identity', productId: new mongoose.Types.ObjectId(), name: 'OLD_GUEST_MARKER', quantity: 1 };
  await Cart.create({ owner: `guest:${hashSession(previousGuest)}`, items: [item], expiresAt: new Date(Date.now() + 3600000) });
  const cookies = { tw_session: token, tw_cart: previousGuest };
  const probe = await request('/auth/me', { cookies });
  assert.equal(probe.status, 401); assert.equal(cookie(probe, 'tw_session'), ''); assert.equal(cookie(probe, 'tw_cart'), '');
  for (const header of probe.headers.getSetCookie()) {
    const [key, value] = header.split(';')[0].split('=');
    if (!value) delete cookies[key]; else cookies[key] = value;
  }
  const guest = await request('/commerce/cart', { cookies });
  assert.equal(guest.status, 200); assert.deepEqual(guest.body.data.cart.items, []);
  assert.notEqual(cookie(guest, 'tw_cart'), previousGuest);
  assert.equal((await Cart.findOne({ owner: `guest:${hashSession(previousGuest)}` })).items.length, 1);
  assert.equal(await Session.countDocuments({ userId: user._id }), 1);
});

test('valid customer authorization remains isolated and logout deletes only its session', async () => {
  const { user, token } = await account(); const csrf = makeCsrfToken(env.sessionSecret);
  const second = newSessionToken();
  await Session.create({ userId: user._id, tokenHash: hashSession(second), expiresAt: new Date(Date.now() + 3600000) });
  assert.equal((await request('/auth/me', { cookies: { tw_session: token } })).body.data.user.id, String(user._id));
  assert.equal((await request('/commerce/cart', { cookies: { tw_session: token } })).headers.get('x-session-expired'), null);
  assert.equal((await request('/commerce/cart')).headers.get('x-session-expired'), null);
  assert.equal((await request('/admin/ping', { cookies: { tw_session: token } })).status, 403);
  assert.equal((await request('/auth/logout', { method: 'POST', cookies: { tw_session: token, tw_csrf: csrf }, body: {} })).status, 200);
  assert.equal(await Session.countDocuments({ tokenHash: hashSession(token) }), 0);
  assert.equal(await Session.countDocuments({ tokenHash: hashSession(second) }), 1);
});

test('new passwords validate UTF-8 bytes for ASCII, Arabic, Unicode and emoji', () => {
  for (const value of ['a'.repeat(72), 'ع'.repeat(36), '😀'.repeat(18), `Unicode-€-${'a'.repeat(58)}`]) assert.equal(validNewPassword(value), true, 'valid byte boundary');
  for (const value of ['a'.repeat(73), 'ع'.repeat(37), '😀'.repeat(19), 'too-short']) assert.equal(validNewPassword(value), false, 'invalid byte boundary');
});

test('signup rejects byte overflow without creating users and permits exactly 72-byte passwords', async () => {
  const csrf = makeCsrfToken(env.sessionSecret), cookies = { tw_csrf: csrf };
  for (const password of ['a'.repeat(73), 'ع'.repeat(37), '😀'.repeat(19)]) {
    const result = await request('/auth/signup', { method: 'POST', cookies, body: { name: 'Isolated signup', email: 'bytes@example.test', password } });
    assert.equal(result.status, 400); assert.equal(await User.countDocuments(), 0);
  }
  const password = 'a'.repeat(72);
  const result = await request('/auth/signup', { method: 'POST', cookies, body: { name: 'Isolated signup', email: 'bytes@example.test', password } });
  assert.equal(result.status, 201); const saved = await User.findOne().select('+passwordHash');
  assert.equal(await bcrypt.compare(password, saved.passwordHash), true); assert.equal(saved.role, 'customer');
});

test('reset rejects overflowing passwords before token consumption and preserves legacy login hashes', async () => {
  const { user } = await account();
  await requestAccountAction(user.email, 'password_reset');
  const event = await NotificationEvent.findOne({ event: 'password_reset' }).select('+sealedActionToken').lean();
  const token = new URLSearchParams(new URL(accountActionUrl(event)).hash.slice(1)).get('token');
  for (const password of ['a'.repeat(73), 'ع'.repeat(37), '😀'.repeat(19)]) await assert.rejects(resetAccountPassword(token, password), { code: 'INVALID_PASSWORD' });
  assert.equal((await AccountActionToken.findById(event.actionTokenId)).consumedAt, null);
  await resetAccountPassword(token, 'ع'.repeat(36));
  assert.equal(await bcrypt.compare('ع'.repeat(36), (await User.findById(user._id).select('+passwordHash')).passwordHash), true);
  // Legacy hashes are not rewritten, and login remains compatible.
  await User.updateOne({ _id: user._id }, { $set: { passwordHash: await bcrypt.hash('z'.repeat(80), 4) } });
  const csrf = makeCsrfToken(env.sessionSecret);
  assert.equal((await request('/auth/login', { method: 'POST', cookies: { tw_csrf: csrf }, body: { email: user.email, password: 'z'.repeat(80) } })).status, 200);
});

test('malformed JSON is sanitized before generic client errors without logging body fragments', async () => {
  const logs = [], original = console.error; console.error = (...args) => logs.push(args);
  try {
    for (const rawBody of ['{"password":"PRIVATE_PASSWORD_MARKER",', '{"token":"PRIVATE_TOKEN_MARKER" "invalid":true}']) {
      const result = await request('/auth/login', { method: 'POST', rawBody });
      assert.equal(result.status, 400); assert.deepEqual(result.body, { ok: false, error: { code: 'INVALID_JSON', message: 'Malformed JSON' } });
      assert.equal(JSON.stringify(result.body).includes('PRIVATE_'), false);
    }
    assert.deepEqual(logs, []);
  } finally { console.error = original; }
});

test('replaced account links erase queued secrets immediately without provider delivery', async () => {
  const { user } = await account(); await requestAccountAction(user.email, 'password_reset');
  const first = await NotificationEvent.findOne({ event: 'password_reset' }).select('+sealedActionToken');
  assert.ok(first.sealedActionToken); await requestAccountAction(user.email, 'password_reset');
  const replaced = await NotificationEvent.findById(first._id).select('+sealedActionToken');
  assert.equal(replaced.state, 'dead'); assert.equal(replaced.lastErrorCode, 'ACCOUNT_ACTION_EXPIRED'); assert.equal(replaced.sealedActionToken, undefined);
  const current = await NotificationEvent.findOne({ event: 'password_reset', state: 'queued' }).select('+sealedActionToken');
  assert.ok(current.sealedActionToken); assert.notEqual(String(current._id), String(first._id));
});

test('consumed account links erase failed notification secrets in the same reset transaction', async () => {
  const { user } = await account(); await requestAccountAction(user.email, 'password_reset');
  const event = await NotificationEvent.findOne({ event: 'password_reset' }).select('+sealedActionToken').lean();
  const token = new URLSearchParams(new URL(accountActionUrl(event)).hash.slice(1)).get('token');
  await NotificationEvent.updateOne({ _id: event._id }, { $set: { state: 'failed' } });
  await resetAccountPassword(token, 'new-fixture-password-123');
  const consumed = await NotificationEvent.findById(event._id).select('+sealedActionToken');
  assert.equal(consumed.state, 'dead'); assert.equal(consumed.sealedActionToken, undefined);
  assert.ok((await AccountActionToken.findById(event.actionTokenId)).consumedAt);
});

test('action replacement preserves a currently processing SMTP lease', async () => {
  const { user } = await account(); await requestAccountAction(user.email, 'password_reset');
  const first = await NotificationEvent.findOne({ event: 'password_reset' }).select('+sealedActionToken');
  await NotificationEvent.updateOne({ _id: first._id }, { $set: { state: 'processing', leaseToken: 'isolated-active-lease', leaseUntil: new Date(Date.now() + 300000), dispatchStartedAt: new Date() } });
  await requestAccountAction(user.email, 'password_reset');
  const active = await NotificationEvent.findById(first._id).select('+sealedActionToken +leaseToken');
  assert.equal(active.state, 'processing'); assert.equal(active.leaseToken, 'isolated-active-lease'); assert.equal(active.sealedActionToken, first.sealedActionToken);
});

test('failed link replacement rolls back token consumption and secret erasure together', async () => {
  const { user } = await account(); await requestAccountAction(user.email, 'password_reset');
  const first = await NotificationEvent.findOne({ event: 'password_reset' }).select('+sealedActionToken');
  const original = NotificationEvent.create;
  NotificationEvent.create = async () => { throw new Error('Synthetic notification insert failure'); };
  try { await assert.rejects(requestAccountAction(user.email, 'password_reset'), /Synthetic notification insert failure/); }
  finally { NotificationEvent.create = original; }
  const unchanged = await NotificationEvent.findById(first._id).select('+sealedActionToken');
  assert.equal(unchanged.state, 'queued'); assert.equal(unchanged.sealedActionToken, first.sealedActionToken);
  assert.equal((await AccountActionToken.findById(first.actionTokenId)).consumedAt, null);
});

for (const purpose of ['password_reset', 'email_verification']) {
  test(`${purpose} completion consumes additional legacy links and erases their queued secrets atomically`, async () => {
    const { user } = await account(); await requestAccountAction(user.email, purpose);
    const first = await NotificationEvent.findOne({ event: purpose }).select('+sealedActionToken').lean();
    const primaryToken = new URLSearchParams(new URL(accountActionUrl(first)).hash.slice(1)).get('token');
    const secondaryToken = newSessionToken(), expiresAt = new Date(Date.now() + 300000);
    const extra = await AccountActionToken.create({ userId: user._id, purpose, email: user.email, tokenHash: hashSession(secondaryToken), expiresAt });
    const eventKey = `synthetic-legacy:${extra._id}`;
    await NotificationEvent.create({ eventKey, userId: user._id, actionTokenId: extra._id, event: purpose, recipient: user.email,
      snapshot: {}, expiresAt, sealedActionToken: sealActionToken(secondaryToken, eventKey), state: 'queued' });
    if (purpose === 'password_reset') await resetAccountPassword(primaryToken, 'new-isolated-password-123');
    else await verifyAccountEmail(primaryToken);
    const messages = await NotificationEvent.find({ event: purpose }).select('+sealedActionToken').lean();
    assert.equal(messages.length, 2); assert.ok(messages.every(event => event.state === 'dead' && event.sealedActionToken === undefined));
    assert.equal(await AccountActionToken.countDocuments({ userId: user._id, purpose, consumedAt: null }), 0);
  });
}
