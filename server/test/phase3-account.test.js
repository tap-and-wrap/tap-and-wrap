import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import bcrypt from 'bcryptjs';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { Session } from '../src/models/Session.js';
import { AccountActionToken } from '../src/models/AccountActionToken.js';
import { EmailRateWindow } from '../src/models/EmailRateWindow.js';
import { NotificationEvent } from '../src/models/NotificationEvent.js';
import { newSessionToken, hashSession, makeCsrfToken } from '../src/utils/tokens.js';
import { accountActionUrl } from '../src/email/action-secrets.js';
import { requestAccountAction, resetAccountPassword, verifyAccountEmail } from '../src/email/account-actions.js';
import { resetAccountRateLimitsForTests } from '../src/routes/account.routes.js';
import { runNotificationBatch, setNotificationProviderForTests } from '../src/commerce/notifications.js';
import { createGmailProvider } from '../src/email/gmail.js';
import { startTestDatabase } from './helpers/database.js';

let database;
let server;
let baseUrl;
let user;
let headers;
const models = [User, Session, AccountActionToken, EmailRateWindow, NotificationEvent];

before(async () => {
  database = await startTestDatabase({ models, transactions: true });
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/auth`;
});
after(async () => {
  setNotificationProviderForTests();
  if (server) await new Promise(resolve => server.close(resolve));
  await database?.stop();
});
beforeEach(async () => {
  for (const model of models) await model.deleteMany({});
  resetAccountRateLimitsForTests(); setNotificationProviderForTests();
  user = await User.create({ name: 'Isolated account', email: 'safe@example.test', passwordHash: await bcrypt.hash('original-fixture-password', 4), role: 'customer', active: true });
  const token = newSessionToken();
  await Session.create({ userId: user._id, tokenHash: hashSession(token), expiresAt: new Date(Date.now() + 3600000) });
  const csrf = makeCsrfToken(env.sessionSecret);
  headers = { Cookie: `tw_session=${token}; tw_csrf=${csrf}`, Origin: env.clientOrigin, 'x-csrf-token': csrf };
});

async function request(path, { body, method = 'POST', extraHeaders = {}, auth = true } = {}) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: { ...(auth ? headers : {}), ...extraHeaders, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, headers: response.headers, body: await response.json() };
}
async function latestAction(purpose = 'password_reset') {
  const event = await NotificationEvent.findOne({ event: purpose }).sort({ createdAt: -1, _id: -1 }).select('+sealedActionToken +recipient').lean();
  const token = new URLSearchParams(new URL(accountActionUrl(event)).hash.slice(1)).get('token');
  return { event, token };
}

test('password recovery returns the same honest queued response for known and unknown accounts', async () => {
  const known = await request('/forgot-password', { body: { email: user.email } });
  const unknown = await request('/forgot-password', { body: { email: 'unknown@example.test' } });
  assert.equal(known.status, 202); assert.deepEqual(known.body, unknown.body);
  assert.ok(known.body.data.message.includes('Delivery may be unavailable'));
  assert.equal(known.headers.get('cache-control'), 'private, no-store');
  assert.ok(known.headers.get('x-robots-tag').includes('noindex'));
  const { event, token } = await latestAction();
  const saved = await AccountActionToken.findById(event.actionTokenId).select('+tokenHash').lean();
  assert.equal(saved.tokenHash.length, 64); assert.notEqual(saved.tokenHash, token);
  assert.equal(JSON.stringify(saved).includes(token), false);
  assert.equal(JSON.stringify(await NotificationEvent.findOne().lean()).includes(token), false);
  assert.equal(saved.expiresAt.getTime() - saved.createdAt.getTime() <= 30 * 60 * 1000, true);
  assert.equal((await runNotificationBatch()).enabled, false);
});

test('password reset consumes one token, revokes all sessions and queues one security notice', async () => {
  await requestAccountAction(user.email, 'password_reset');
  const { token } = await latestAction();
  const extra = newSessionToken();
  await Session.create({ userId: user._id, tokenHash: hashSession(extra), expiresAt: new Date(Date.now() + 3600000) });
  const result = await request('/reset-password', { body: { token, newPassword: 'replacement-fixture-password' } });
  assert.equal(result.status, 200); assert.equal(result.body.data.signInRequired, true);
  assert.equal(await Session.countDocuments({ userId: user._id }), 0);
  assert.equal(await bcrypt.compare('replacement-fixture-password', (await User.findById(user._id).select('+passwordHash')).passwordHash), true);
  assert.equal((await request('/reset-password', { body: { token, newPassword: 'second-fixture-password' } })).status, 400);
  assert.equal(await NotificationEvent.countDocuments({ event: 'password_changed' }), 1);
  assert.equal((await request('/me', { method: 'GET' })).status, 401);
  // A login that read the old password just before reset may insert late. Its
  // captured authentication version must still invalidate that new session.
  const stale = newSessionToken();
  await Session.create({ userId: user._id, tokenHash: hashSession(stale), authVersion: 0, expiresAt: new Date(Date.now() + 3600000) });
  assert.equal((await request('/me', { method: 'GET', extraHeaders: { Cookie: `tw_session=${stale}` } })).status, 401);
});

test('concurrent reset attempts cannot consume a token twice', async () => {
  await requestAccountAction(user.email, 'password_reset');
  const { token } = await latestAction();
  const results = await Promise.allSettled([resetAccountPassword(token, 'first-racing-password'), resetAccountPassword(token, 'second-racing-password')]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(await NotificationEvent.countDocuments({ event: 'password_changed' }), 1);
});

test('expired links and links for changed or inactive accounts cannot reset passwords', async () => {
  await requestAccountAction(user.email, 'password_reset', { now: new Date(Date.now() - 31 * 60 * 1000) });
  let { token } = await latestAction();
  await assert.rejects(resetAccountPassword(token, 'replacement-fixture-password'), { code: 'INVALID_ACCOUNT_TOKEN' });
  await requestAccountAction(user.email, 'password_reset');
  ({ token } = await latestAction());
  await User.updateOne({ _id: user._id }, { $set: { active: false } });
  await assert.rejects(resetAccountPassword(token, 'replacement-fixture-password'), { code: 'INVALID_ACCOUNT_TOKEN' });
  assert.equal(await Session.countDocuments({ userId: user._id }), 1);
});

test('recovery requests have durable per-account quotas without revealing account existence', async () => {
  for (let index = 0; index < 5; index += 1) await requestAccountAction(user.email, 'password_reset');
  assert.equal(await NotificationEvent.countDocuments({ event: 'password_reset' }), 3);
  assert.equal((await EmailRateWindow.findOne()).count, 3);
  assert.equal(await AccountActionToken.countDocuments({ consumedAt: null }), 1);
  assert.equal(JSON.stringify(await EmailRateWindow.findOne().lean()).includes(user.email), false);
});

test('verification is authorized on request and one-use on completion without granting admin roles', async () => {
  assert.equal((await request('/request-verification', { body: {}, extraHeaders: { Cookie: headers.Cookie.split('; ')[1] } })).status, 401);
  assert.equal((await request('/request-verification', { body: {} })).status, 202);
  const { token } = await latestAction('email_verification');
  assert.equal((await request('/verify-email', { body: { token } })).status, 200);
  assert.ok((await User.findById(user._id)).emailVerifiedAt);
  assert.equal((await User.findById(user._id)).role, 'customer');
  await assert.rejects(verifyAccountEmail(token), { code: 'INVALID_ACCOUNT_TOKEN' });
  assert.equal((await request('/account-status', { method: 'GET' })).body.data.emailVerified, true);
});

test('recovery and verification preserve Origin, CSRF validation and runtime IP limits', async () => {
  const invalidOrigin = await request('/forgot-password', { body: { email: user.email }, extraHeaders: { Origin: 'https://attacker.invalid' } });
  assert.equal(invalidOrigin.status, 403);
  const invalidCsrf = await request('/forgot-password', { body: { email: user.email }, extraHeaders: { 'x-csrf-token': 'invalid' } });
  assert.equal(invalidCsrf.status, 403);
  resetAccountRateLimitsForTests();
  for (let index = 0; index < 5; index += 1) assert.equal((await request('/forgot-password', { body: { email: user.email } })).status, 202);
  assert.equal((await request('/forgot-password', { body: { email: user.email } })).status, 429);
});

test('account links are delivered only through the isolated provider and consumed links are never sent', async () => {
  await requestAccountAction(user.email, 'password_reset');
  const { token } = await latestAction();
  await resetAccountPassword(token, 'replacement-fixture-password');
  const delivered = [];
  setNotificationProviderForTests({ async send(event, options) { delivered.push({ event: event.event, actionUrl: options.actionUrl }); return { id: 'isolated-account-email' }; } });
  const outcome = await runNotificationBatch();
  assert.equal(outcome.dead, 0); assert.equal(outcome.sent, 1);
  const consumed = await NotificationEvent.findOne({ event: 'password_reset' }).select('+sealedActionToken');
  assert.equal(consumed.state, 'dead'); assert.equal(consumed.sealedActionToken, undefined);
  assert.deepEqual(delivered, [{ event: 'password_changed', actionUrl: undefined }]);
});

test('SMTP dispatch interruptions become uncertain instead of being retried automatically', async () => {
  await NotificationEvent.create({ eventKey: `isolated:${user._id}`, userId: user._id, event: 'password_changed', recipient: user.email,
    snapshot: {}, state: 'processing', attempts: 1, leaseUntil: new Date(Date.now() - 1000), dispatchStartedAt: new Date(Date.now() - 2000) });
  let calls = 0;
  setNotificationProviderForTests({ supportsIdempotency: false, async send() { calls += 1; return { id: 'never-resend' }; } });
  const result = await runNotificationBatch();
  assert.equal(result.uncertain, 1); assert.equal(calls, 0);
  assert.equal((await NotificationEvent.findOne()).state, 'uncertain');
});

test('an uncertain SMTP DATA response is preserved for review with no secret diagnostics', async () => {
  await NotificationEvent.create({ eventKey: `isolated:${user._id}`, userId: user._id, event: 'password_changed', recipient: user.email, snapshot: {} });
  let calls = 0;
  setNotificationProviderForTests({ supportsIdempotency: false, async send() { calls += 1; throw Object.assign(new Error('Private SMTP diagnostic'), { code: 'SMTP_DELIVERY_UNCERTAIN', terminal: true }); } });
  assert.equal((await runNotificationBatch()).uncertain, 1);
  assert.equal((await runNotificationBatch({ now: new Date(Date.now() + 86400000) })).claimed, 0);
  assert.equal(calls, 1);
  assert.equal((await NotificationEvent.findOne()).lastErrorCode, 'SMTP_DELIVERY_UNCERTAIN');
});

test('durable recovery messages render through mocked Gmail and erase queued encrypted secrets after delivery', async () => {
  await requestAccountAction(user.email, 'password_reset');
  const { token } = await latestAction();
  const messages = [];
  const provider = createGmailProvider({ EMAIL_PROVIDER: 'gmail', EMAIL_ENABLED: 'true', EMAIL_USER: 'sender@example.test',
    EMAIL_APP_PASSWORD: 'abcdefghijklmnop', NOTIFICATION_SAFE_RECIPIENTS: user.email, CLIENT_ORIGIN: env.clientOrigin,
  }, { createTransport: () => ({ async sendMail(message) { messages.push(message); return { accepted: [message.to], rejected: [] }; }, close() {} }) });
  setNotificationProviderForTests(provider);
  assert.equal((await runNotificationBatch()).sent, 1);
  assert.equal(messages.length, 1);
  assert.ok(messages[0].text.includes(`#token=${token}`));
  assert.equal(Object.hasOwn(messages[0], 'attachments'), false);
  assert.equal((await NotificationEvent.findOne().select('+sealedActionToken')).sealedActionToken, undefined);
  assert.equal((await runNotificationBatch()).claimed, 0);
  provider.close();
});

test('SMTP acceptance followed by a database acknowledgement failure never resends automatically', async () => {
  await NotificationEvent.create({ eventKey: `isolated:${user._id}`, userId: user._id, event: 'password_changed', recipient: user.email, snapshot: {} });
  let sends = 0;
  setNotificationProviderForTests({ supportsIdempotency: false, async send() { sends += 1; return { id: 'isolated-accepted-email' }; } });
  const originalUpdate = NotificationEvent.updateOne;
  NotificationEvent.updateOne = function (filter, update, ...args) {
    if (update?.$set?.state === 'sent') throw new Error('Isolated acknowledgement failure.');
    return originalUpdate.call(this, filter, update, ...args);
  };
  try { assert.equal((await runNotificationBatch()).uncertain, 1); }
  finally { NotificationEvent.updateOne = originalUpdate; }
  assert.equal((await runNotificationBatch({ now: new Date(Date.now() + 86400000) })).claimed, 0);
  assert.equal(sends, 1);
  assert.equal((await NotificationEvent.findOne()).state, 'uncertain');
});
