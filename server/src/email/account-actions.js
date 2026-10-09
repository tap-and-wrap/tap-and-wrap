import { createHash, createHmac, randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { env, assertAuthConfig } from '../config/env.js';
import { assertDatabaseWriteAllowed } from '../config/database-safety.js';
import { User } from '../models/User.js';
import { Session } from '../models/Session.js';
import { AccountActionToken } from '../models/AccountActionToken.js';
import { EmailRateWindow } from '../models/EmailRateWindow.js';
import { NotificationEvent } from '../models/NotificationEvent.js';
import { sealActionToken } from './action-secrets.js';
import { validNewPassword, PASSWORD_REQUIREMENTS } from '../utils/password.js';

function writeGuard() { assertDatabaseWriteAllowed(mongoose.connection, env); }
function actionError(code, message, status = 400) { return Object.assign(new Error(message), { code, status }); }
function hashToken(value) { return createHash('sha256').update(value).digest('hex'); }
const ONE_HOUR = 60 * 60 * 1000;
const INVALID_ACTION = () => actionError('INVALID_ACCOUNT_TOKEN', 'This link is invalid, expired or has already been used.');

async function eraseQueuedActionSecrets(actionIds, session) {
  if (!actionIds.length) return;
  // Do not interrupt a worker's active SMTP lease. Queued/failed links cannot
  // be delivered after the transaction commits their consumption/replacement.
  await NotificationEvent.updateMany({ actionTokenId: { $in: actionIds }, state: { $in: ['queued', 'failed'] } },
    { $set: { state: 'dead', lastErrorCode: 'ACCOUNT_ACTION_EXPIRED' }, $unset: { sealedActionToken: 1, leaseToken: 1, leaseUntil: 1 } }, { session });
}
async function consumeOutstandingActions(userId, purpose, session, now = new Date()) {
  const filter = { userId, purpose, consumedAt: null };
  const actions = await AccountActionToken.find(filter).select('_id').session(session).lean();
  await AccountActionToken.updateMany(filter, { $set: { consumedAt: now } }, { session });
  await eraseQueuedActionSecrets(actions.map(action => action._id), session);
}

async function transaction(work) {
  writeGuard();
  try { return await mongoose.connection.transaction(work); }
  catch (error) {
    if (error?.code === 20) throw actionError('TRANSACTIONS_REQUIRED', 'Account recovery requires a transaction-capable database.', 503);
    throw error;
  }
}

/** Queue only; transport is never opened from authentication request handlers. */
export async function requestAccountAction(emailValue, purpose, { userId, now = new Date() } = {}) {
  if (!['password_reset', 'email_verification'].includes(purpose)) throw actionError('INVALID_ACCOUNT_ACTION', 'Invalid account action.');
  assertAuthConfig();
  const email = emailValue.toLowerCase().trim();
  const hour = Math.floor(now.getTime() / ONE_HOUR);
  const rateKey = createHmac('sha256', env.sessionSecret).update(`account-email:${purpose}:${email}:${hour}`).digest('hex');
  try {
    await transaction(async session => {
      // The same hashed, bounded limiter is written for unknown email addresses.
      // Neither the response nor a rate-limit result reveals whether an account exists.
      const rate = await EmailRateWindow.findOneAndUpdate({ key: rateKey, count: { $lt: 3 } }, {
        $inc: { count: 1 }, $setOnInsert: { key: rateKey, expiresAt: new Date((hour + 2) * ONE_HOUR) },
      }, { upsert: true, new: true, session });
      if (!rate) return;
      const user = await User.findOne({ email, active: true, ...(userId ? { _id: userId } : {}) }).session(session).lean();
      if (!user || (purpose === 'email_verification' && user.emailVerifiedAt)) return;
      await consumeOutstandingActions(user._id, purpose, session, now);
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(now.getTime() + (purpose === 'password_reset' ? 30 * 60 * 1000 : 24 * ONE_HOUR));
      const [action] = await AccountActionToken.create([{ userId: user._id, purpose, email, tokenHash: hashToken(token), expiresAt }], { session });
      const eventKey = `account:${user._id}:${purpose}:${action._id}`;
      await NotificationEvent.create([{ eventKey, userId: user._id, actionTokenId: action._id, event: purpose,
        recipient: user.email, snapshot: {}, sealedActionToken: sealActionToken(token, eventKey), expiresAt,
        state: 'queued', attempts: 0, nextAttemptAt: now,
      }], { session });
    });
  } catch (error) {
    // A full limiter window (or a simultaneous first insert) produces the same
    // generic result. All other failures remain honest infrastructure errors.
    if (error?.code !== 11000 || !error?.keyPattern?.key) throw error;
  }
}

async function consumeAction(token, purpose, session, now = new Date()) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw INVALID_ACTION();
  const action = await AccountActionToken.findOneAndUpdate({ tokenHash: hashToken(token), purpose, consumedAt: null, expiresAt: { $gt: now } },
    { $set: { consumedAt: now } }, { new: true, session }).select('+email').lean();
  if (!action) throw INVALID_ACTION();
  const user = await User.findOne({ _id: action.userId, email: action.email, active: true }).session(session).lean();
  if (!user) throw INVALID_ACTION();
  await eraseQueuedActionSecrets([action._id], session);
  return { action, user };
}

export async function resetAccountPassword(token, newPassword) {
  if (!validNewPassword(newPassword)) throw actionError('INVALID_PASSWORD', PASSWORD_REQUIREMENTS);
  // Hash outside the short transaction, with the same bcrypt cost as signup.
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await transaction(async session => {
    const { action, user } = await consumeAction(token, 'password_reset', session);
    const updated = await User.updateOne({ _id: user._id, email: user.email, active: true }, { $set: { passwordHash }, $inc: { authVersion: 1 } }, { session });
    if (updated.matchedCount !== 1) throw INVALID_ACTION();
    await Session.deleteMany({ userId: user._id }, { session });
    await consumeOutstandingActions(user._id, 'password_reset', session);
    await NotificationEvent.create([{ eventKey: `account:${user._id}:password_changed:${action._id}`,
      userId: user._id, event: 'password_changed', recipient: user.email, snapshot: {},
      state: 'queued', attempts: 0, nextAttemptAt: new Date(),
    }], { session });
  });
}

export async function verifyAccountEmail(token) {
  await transaction(async session => {
    const { user } = await consumeAction(token, 'email_verification', session);
    const updated = await User.updateOne({ _id: user._id, email: user.email, active: true }, { $set: { emailVerifiedAt: new Date() } }, { session });
    if (updated.matchedCount !== 1) throw INVALID_ACTION();
    await consumeOutstandingActions(user._id, 'email_verification', session);
  });
}
