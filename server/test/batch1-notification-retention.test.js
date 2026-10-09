import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { startTestDatabase } from './helpers/database.js';
import { NotificationEvent } from '../src/models/NotificationEvent.js';
import { AccountActionToken } from '../src/models/AccountActionToken.js';
import { runNotificationBatch, setNotificationProviderForTests } from '../src/commerce/notifications.js';
import { sealActionToken } from '../src/email/action-secrets.js';

let fixture;
const now = new Date();
before(async () => { fixture = await startTestDatabase({ models: [NotificationEvent, AccountActionToken] }); });
after(async () => { setNotificationProviderForTests(); await fixture?.stop(); });
beforeEach(async () => { setNotificationProviderForTests(); await NotificationEvent.deleteMany({}); await AccountActionToken.deleteMany({}); });

async function actionEvent(overrides = {}, tokenOverrides = {}) {
  const userId = new mongoose.Types.ObjectId();
  const action = await AccountActionToken.create({ userId, purpose: 'password_reset', email: 'safe@example.test', tokenHash: randomUUID().replaceAll('-', '').repeat(2), expiresAt: new Date(now.getTime() + 3600000), ...tokenOverrides });
  const eventKey = `account:${userId}:password_reset:${action._id}`;
  return NotificationEvent.create({ eventKey, userId, actionTokenId: action._id, event: 'password_reset', recipient: 'safe@example.test', snapshot: {},
    sealedActionToken: sealActionToken('a'.repeat(43), eventKey), expiresAt: action.expiresAt, nextAttemptAt: now, ...overrides });
}
async function current(event) { return NotificationEvent.findById(event._id).select('+sealedActionToken').lean(); }

test('disabled email delivery still removes terminal and expired queued secrets without dispatch', async () => {
  const terminal = await Promise.all(['sent', 'dead', 'uncertain'].map(state => actionEvent({ state })));
  const expired = await actionEvent({}, { expiresAt: new Date(now.getTime() - 1) });
  const active = await actionEvent();
  const result = await runNotificationBatch({ now });
  assert.equal(result.enabled, false); assert.equal(result.claimed, 0);
  for (const event of [...terminal, expired]) {
    assert.equal((await current(event)).sealedActionToken, undefined);
    // Secret erasure must leave a valid historical diagnostic record.
    await (await NotificationEvent.findById(event._id).select('+sealedActionToken')).validate();
  }
  assert.equal((await current(expired)).lastErrorCode, 'ACCOUNT_ACTION_EXPIRED');
  assert.equal((await current(active)).state, 'queued');
  assert.ok((await current(active)).sealedActionToken);
});

test('expired SMTP dispatch becomes uncertain even with provider disabled and never retries', async () => {
  const event = await actionEvent({ state: 'processing', attempts: 1, leaseUntil: new Date(now.getTime() - 1), dispatchStartedAt: new Date(now.getTime() - 2000) });
  const result = await runNotificationBatch({ now });
  assert.equal(result.uncertain, 1);
  assert.equal((await current(event)).state, 'uncertain');
  assert.equal((await current(event)).sealedActionToken, undefined);
  assert.equal((await current(event)).lastErrorCode, 'SMTP_DELIVERY_UNCERTAIN');
  let sends = 0;
  setNotificationProviderForTests({ supportsIdempotency: false, async send() { sends += 1; return { id: 'fixture-message' }; } });
  assert.equal((await runNotificationBatch({ now: new Date(now.getTime() + 86400000) })).claimed, 0);
  assert.equal(sends, 0);
});

test('SMTP dispatches beyond the maintenance limit are never reclaimed or resent', async () => {
  const events = [];
  for (let index = 0; index < 3; index += 1) events.push(await actionEvent({ state: 'processing', attempts: 1,
    leaseUntil: new Date(now.getTime() - 1), dispatchStartedAt: new Date(now.getTime() - 2000) }));
  let sends = 0;
  setNotificationProviderForTests({ supportsIdempotency: false, async send() { sends += 1; return { id: 'fixture-message' }; } });
  for (let index = 0; index < events.length; index += 1) {
    const result = await runNotificationBatch({ batchSize: 1, now });
    assert.equal(result.uncertain, 1);
    assert.equal(result.claimed, 0);
    assert.equal(sends, 0);
    assert.equal(await NotificationEvent.countDocuments({ state: 'uncertain' }), index + 1);
  }
  for (const event of events) assert.equal((await current(event)).sealedActionToken, undefined);
});

test('interrupted final attempts and consumed/replaced action links erase secrets without sending', async () => {
  const exhausted = await actionEvent({ state: 'processing', attempts: 6, leaseUntil: new Date(now.getTime() - 1) });
  const consumed = await actionEvent({}, { consumedAt: now });
  let sends = 0;
  setNotificationProviderForTests({ async send() { sends += 1; return { id: 'fixture-message' }; } });
  await runNotificationBatch({ now });
  for (const event of [exhausted, consumed]) {
    assert.equal((await current(event)).state, 'dead');
    assert.equal((await current(event)).sealedActionToken, undefined);
  }
  assert.equal((await current(exhausted)).lastErrorCode, 'RETRY_LIMIT_REACHED');
  assert.equal(sends, 0);
});

test('active processing lease and valid retry secret are preserved; maintenance is bounded', async () => {
  const processing = await actionEvent({ state: 'processing', leaseUntil: new Date(now.getTime() + 10000), dispatchStartedAt: now });
  const queued = await actionEvent({ state: 'failed', nextAttemptAt: new Date(now.getTime() + 10000) });
  await Promise.all(Array.from({ length: 3 }, () => actionEvent({ state: 'dead' })));
  const result = await runNotificationBatch({ batchSize: 1, now });
  assert.equal(result.cleanedSecrets, 1);
  assert.equal(await NotificationEvent.countDocuments({ state: 'dead', sealedActionToken: { $exists: true } }), 2);
  assert.ok((await current(processing)).sealedActionToken);
  assert.ok((await current(queued)).sealedActionToken);
});

test('terminal provider failure clears the secret and records only sanitized diagnostics', async () => {
  const event = await actionEvent();
  setNotificationProviderForTests({ supportsIdempotency: false, async send() { throw Object.assign(new Error('PRIVATE_SMTP_PASSWORD'), { code: 'SMTP_MESSAGE_REJECTED', terminal: true }); } });
  const result = await runNotificationBatch({ now });
  assert.equal(result.dead, 1);
  const saved = await current(event);
  assert.equal(saved.sealedActionToken, undefined);
  assert.equal(saved.lastErrorCode, 'SMTP_MESSAGE_REJECTED');
  assert.equal(JSON.stringify(saved).includes('PRIVATE_SMTP_PASSWORD'), false);
});
