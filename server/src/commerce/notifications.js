import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { assertDatabaseWriteAllowed } from '../config/database-safety.js';
import { NotificationEvent, ORDER_NOTIFICATION_EVENTS } from '../models/NotificationEvent.js';
import { AccountActionToken } from '../models/AccountActionToken.js';
import { emailSettings, assertSafeEmailRecipient } from '../email/settings.js';
import { renderEmailTemplate } from '../email/templates.js';
import { createGmailProvider } from '../email/gmail.js';
import { accountActionUrl } from '../email/action-secrets.js';

const MAX_ATTEMPTS = 6;
const LEASE_MS = 120000;
let testProvider;

function notificationError(code, status = 503) {
  const error = new Error('Order notification delivery is not available.');
  error.code = code;
  error.status = status;
  return error;
}

function writeGuard() { assertDatabaseWriteAllowed(NotificationEvent.db, env); }
function validEmail(value) { return typeof value === 'string' && value.length <= 254 && /^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(value); }

export function notificationSettings(settings = process.env) {
  return emailSettings(settings);
}

export function assertSafeNotificationRecipient(recipient, settings = notificationSettings()) {
  return assertSafeEmailRecipient(recipient, settings);
}

export function createResendProvider(settings = process.env) {
  if (process.env.NODE_ENV === 'test') throw notificationError('TEST_PROVIDER_NOT_CONFIGURED');
  const config = notificationSettings({ ...settings, EMAIL_PROVIDER: 'resend' });
  if (!config.enabled || !config.configured || (!config.production && !config.safeRecipients.length)) {
    throw notificationError('NOTIFICATIONS_DISABLED');
  }
  return {
    supportsIdempotency: true,
    async send(event, options = {}) {
      assertSafeNotificationRecipient(event.recipient, config);
      const message = renderEmailTemplate(event, { clientOrigin: settings.CLIENT_ORIGIN || env.clientOrigin, ...options });
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST', signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${settings.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': event.eventKey },
        body: JSON.stringify({ from: config.from, to: [event.recipient], ...message }),
      });
      if (!response.ok) throw notificationError(response.status === 429 ? 'PROVIDER_RATE_LIMIT' : 'PROVIDER_DELIVERY_FAILED');
      const result = await response.json();
      if (typeof result.id !== 'string' || result.id.length > 180) throw notificationError('INVALID_PROVIDER_RESPONSE');
      return { id: result.id };
    },
  };
}

export function createNotificationProvider(settings = process.env) {
  const provider = notificationSettings(settings).provider;
  if (!['gmail', 'resend'].includes(provider)) throw notificationError('INVALID_EMAIL_PROVIDER');
  return provider === 'gmail' ? createGmailProvider(settings) : createResendProvider(settings);
}

export function setNotificationProviderForTests(provider) {
  if (process.env.NODE_ENV !== 'test') throw notificationError('TEST_PROVIDER_FORBIDDEN');
  testProvider = provider || undefined;
}

export async function enqueueOrderEvent(order, event, { session, eventVersion } = {}) {
  if (!ORDER_NOTIFICATION_EVENTS.includes(event)) throw notificationError('INVALID_ORDER_EVENT', 400);
  const orderId = order?._id;
  const recipient = order?.customer?.email;
  const orderNumber = String(order?.orderNumber || order?.publicOrderNumber || '');
  if (!orderId || !validEmail(recipient) || !/^\d{6}$/.test(orderNumber)) throw notificationError('INVALID_NOTIFICATION_SNAPSHOT', 400);
  const version = eventVersion ?? order.statusHistory?.length ?? 1;
  if (!Number.isSafeInteger(version) || version < 1 || version > 1000000) throw notificationError('INVALID_EVENT_VERSION', 400);
  const eventKey = `${orderId}:${event}:${version}`;
  writeGuard();
  await NotificationEvent.updateOne({ eventKey }, { $setOnInsert: {
    eventKey, orderId, event, recipient: recipient.toLowerCase(),
    snapshot: { orderNumber,
      ...(Number.isSafeInteger(order?.totals?.totalPiastres) && order.totals.totalPiastres >= 0 ? { totalPiastres: order.totals.totalPiastres } : {}),
      ...(['cod', 'instapay'].includes(order?.paymentMethod) ? { paymentMethod: order.paymentMethod } : {}),
    }, state: 'queued', attempts: 0, nextAttemptAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
  } }, { upsert: true, session, timestamps: false });
  return eventKey;
}

export function retryDelayMs(attempt) {
  return Math.min(6 * 60 * 60 * 1000, 60000 * (2 ** Math.max(0, attempt - 1)));
}

export async function runNotificationBatch({ batchSize = 20, now = new Date() } = {}) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) throw notificationError('INVALID_NOTIFICATION_BATCH', 400);
  const usingMock = process.env.NODE_ENV === 'test' && Boolean(testProvider);
  const config = notificationSettings();
  if (process.env.NODE_ENV === 'test' && !usingMock) return { enabled: false, claimed: 0, sent: 0, failed: 0, dead: 0 };
  if (!usingMock && (!config.enabled || !config.configured || (!config.production && !config.safeRecipients.length))) {
    return { enabled: false, claimed: 0, sent: 0, failed: 0, dead: 0 };
  }
  const provider = usingMock ? testProvider : createNotificationProvider();
  const counts = { enabled: true, claimed: 0, sent: 0, failed: 0, dead: 0, uncertain: 0 };
  try {
  // SMTP cannot deduplicate an interrupted send. Never automatically resend a
  // dispatch that might already have been accepted; preserve it for review.
  writeGuard();
  const interruptedSmtp = await NotificationEvent.find({ state: 'processing', leaseUntil: { $lte: now }, dispatchStartedAt: { $exists: true } })
    .select('_id').sort({ leaseUntil: 1 }).limit(batchSize).lean();
  if (interruptedSmtp.length) {
    const uncertain = await NotificationEvent.updateMany({ _id: { $in: interruptedSmtp.map(event => event._id) }, state: 'processing', leaseUntil: { $lte: now }, dispatchStartedAt: { $exists: true } }, {
      $set: { state: 'uncertain', lastErrorCode: 'SMTP_DELIVERY_UNCERTAIN' }, $unset: { leaseUntil: 1, leaseToken: 1 },
    });
    counts.uncertain += uncertain.modifiedCount;
  }
  // An interrupted final attempt is terminal once its lease expires; it never remains stuck forever.
  const exhaustedIds = await NotificationEvent.find({
    state: 'processing', leaseUntil: { $lte: now }, attempts: { $gte: MAX_ATTEMPTS },
  }).select('_id').sort({ leaseUntil: 1 }).limit(batchSize).lean();
  if (exhaustedIds.length) {
    writeGuard();
    const exhausted = await NotificationEvent.updateMany({ _id: { $in: exhaustedIds.map((event) => event._id) },
      state: 'processing', leaseUntil: { $lte: now }, attempts: { $gte: MAX_ATTEMPTS },
    }, { $set: { state: 'dead', lastErrorCode: 'RETRY_LIMIT_REACHED' }, $unset: { leaseUntil: 1, leaseToken: 1 } });
    counts.dead += exhausted.modifiedCount;
  }
  for (let index = 0; index < batchSize; index += 1) {
    const leaseToken = randomUUID();
    writeGuard();
    const event = await NotificationEvent.findOneAndUpdate({
      attempts: { $lt: MAX_ATTEMPTS },
      $or: [
        { state: { $in: ['queued', 'failed'] }, nextAttemptAt: { $lte: now } },
        { state: 'processing', leaseUntil: { $lte: now } },
      ],
    }, { $set: { state: 'processing', leaseUntil: new Date(now.getTime() + LEASE_MS), leaseToken }, $inc: { attempts: 1 } }, {
      new: true, sort: { nextAttemptAt: 1, _id: 1 },
    }).select('+recipient +leaseToken +sealedActionToken').lean();
    if (!event) break;
    counts.claimed += 1;
    let deliveryAccepted = false;
    try {
      // Even an injected test provider only sees explicit safe test addresses.
      if (usingMock) {
        const safeTestRecipient = /^[^\s@]+@[^\s@]+\.test$/i.test(event.recipient) ? [event.recipient.toLowerCase()] : [];
        assertSafeNotificationRecipient(event.recipient, { production: false, safeRecipients: safeTestRecipient });
      }
      if (event.expiresAt && event.expiresAt <= now) throw Object.assign(notificationError('ACCOUNT_ACTION_EXPIRED'), { terminal: true });
      if (event.actionTokenId) {
        const currentToken = await AccountActionToken.exists({ _id: event.actionTokenId, consumedAt: null, expiresAt: { $gt: now } });
        if (!currentToken) throw Object.assign(notificationError('ACCOUNT_ACTION_EXPIRED'), { terminal: true });
      }
      const actionUrl = accountActionUrl(event);
      if (provider.supportsIdempotency === false) {
        writeGuard();
        const dispatch = await NotificationEvent.updateOne({ _id: event._id, state: 'processing', leaseToken }, { $set: { dispatchStartedAt: new Date() } });
        if (dispatch.modifiedCount !== 1) throw notificationError('NOTIFICATION_LEASE_LOST');
      }
      const result = await provider.send(event, { actionUrl });
      if (!result || typeof result.id !== 'string') throw notificationError('INVALID_PROVIDER_RESPONSE');
      deliveryAccepted = true;
      writeGuard();
      const saved = await NotificationEvent.updateOne({ _id: event._id, state: 'processing', leaseToken }, {
        $set: { state: 'sent', sentAt: new Date(), providerMessageId: result.id },
        $unset: { leaseUntil: 1, leaseToken: 1, lastErrorCode: 1, dispatchStartedAt: 1, sealedActionToken: 1 },
      });
      counts.sent += saved.modifiedCount;
    } catch (error) {
      const uncertain = error.code === 'SMTP_DELIVERY_UNCERTAIN' || (deliveryAccepted && provider.supportsIdempotency === false);
      const terminal = uncertain || error.terminal === true || event.attempts >= MAX_ATTEMPTS;
      const safeCode = uncertain ? 'SMTP_DELIVERY_UNCERTAIN' : ['UNSAFE_DEVELOPMENT_RECIPIENT', 'PROVIDER_RATE_LIMIT', 'INVALID_PROVIDER_RESPONSE',
        'SMTP_DELIVERY_UNCERTAIN', 'SMTP_AUTHENTICATION_FAILED', 'SMTP_MESSAGE_REJECTED', 'SMTP_TRANSIENT_FAILURE',
        'ACCOUNT_ACTION_EXPIRED', 'INVALID_ACCOUNT_ACTION_SECRET'].includes(error.code)
        ? error.code : 'NOTIFICATION_DELIVERY_FAILED';
      writeGuard();
      await NotificationEvent.updateOne({ _id: event._id, state: 'processing', leaseToken }, {
        $set: { state: uncertain ? 'uncertain' : terminal ? 'dead' : 'failed', lastErrorCode: safeCode,
          nextAttemptAt: new Date(now.getTime() + retryDelayMs(event.attempts)) },
        $unset: { leaseUntil: 1, leaseToken: 1, dispatchStartedAt: 1, ...(terminal ? { sealedActionToken: 1 } : {}) },
      });
      counts[uncertain ? 'uncertain' : terminal ? 'dead' : 'failed'] += 1;
    }
  }
  return counts;
  } finally { if (!usingMock) provider.close?.(); }
}
