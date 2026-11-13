import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { CheckoutIntent } from '../models/CheckoutIntent.js';
import { Upload } from '../models/Upload.js';
import { env } from '../config/env.js';
import { assertDatabaseWriteAllowed } from '../config/database-safety.js';
import { commerceError } from './errors.js';
import { approvedInstaPayDestination } from './order-presentation.js';

const review = () => commerceError(409, 'CHECKOUT_PAYMENT_REVIEW_REQUIRED', 'This payment reference needs review. Do not transfer again. Keep the reference and contact the store for reconciliation.');
const retainedUntilReview = new Date('9999-01-01T00:00:00Z');
export function presentCheckoutPayment(intent, { actionable = false, admin = false } = {}) {
  const p = intent.payment;
  if (!p) return null;
  const valid = p.state === 'prepared' && new Date(p.expiresAt) > new Date() && intent.state === 'open';
  return { reference: p.reference, state: intent.state === 'consumed' ? 'consumed' : valid ? p.proofId ? 'proof_received' : 'prepared' : 'reconciliation',
    amountPiastres: p.amountPiastres, expiresAt: p.expiresAt, proofReceived: Boolean(p.proofId), orderId: intent.orderId ? String(intent.orderId) : null,
    ...(actionable && valid ? { destination: p.destination } : {}), ...(admin ? { senderName: p.senderName, proofId: p.proofId ? String(p.proofId) : null, destination: p.destination, allocations: p.allocations } : {}) };
}
export async function ownedCheckoutPayment(owner, checkoutKey) {
  const intent = await CheckoutIntent.findOne({ owner, checkoutKey }).lean();
  if (!intent?.payment) throw commerceError(404, 'CHECKOUT_PAYMENT_NOT_FOUND', 'No payment reference was found for this shopping session.');
  return intent;
}
export async function prepareCheckoutPayment(owner, checkoutKey, fingerprint, allocations) {
  if (!env.checkoutEnabled) throw commerceError(403, 'CHECKOUT_DISABLED', 'Ordering is unavailable.');
  let result;
  assertDatabaseWriteAllowed(CheckoutIntent.db, env);
  await mongoose.connection.transaction(async session => {
    const intent = await CheckoutIntent.findOne({ owner, checkoutKey, state: 'open' }).session(session);
    if (!intent || intent.paymentMethod !== 'instapay' || intent.fingerprint !== fingerprint) throw review();
    if (!Array.isArray(allocations) || allocations.reduce((sum, group) => sum + group.amountPiastres, 0) !== intent.quote.totalPiastres || new Set(allocations.map(group => group.id)).size !== allocations.length || allocations.some(group => !['merchandise','engraving'].includes(group.id) || !Number.isSafeInteger(group.amountPiastres) || group.amountPiastres < 0 || group.method !== 'instapay')) throw review();
    if (intent.payment) {
      if (intent.payment.state !== 'prepared' || new Date(intent.payment.expiresAt) <= new Date()) throw review();
    } else {
      if (intent.expiresAt <= new Date() || !Number.isSafeInteger(intent.quote.totalPiastres) || intent.quote.totalPiastres <= 0) throw review();
      if (await CheckoutIntent.countDocuments({ owner, state: 'open', payment: { $exists: true } }).session(session) >= 10) throw review();
      intent.payment = { version: 'checkout-payment-v1', reference: randomUUID(), state: 'prepared', destination: approvedInstaPayDestination,
        amountPiastres: intent.quote.totalPiastres, allocations: allocations.map(group => ({ scope: group.id, amountPiastres: group.amountPiastres })),
        expiresAt: intent.expiresAt, createdAt: new Date() };
      // Instructions expire in ten minutes, but evidence of a possible transfer
      // must not be silently erased by the ordinary quote TTL. No stock reserved.
      intent.expiresAt = retainedUntilReview;
      await intent.save({ session });
    }
    result = presentCheckoutPayment(intent, { actionable: true });
  });
  return result;
}
export async function submitCheckoutPaymentProof(owner, checkoutKey, { uploadId, senderName }) {
  if (typeof senderName !== 'string' || senderName.trim().length < 2 || senderName.length > 100 || /[\u0000-\u001f\u007f]/u.test(senderName)) throw commerceError(400, 'INVALID_SENDER_NAME', 'Enter the transfer sender name.');
  let result;
  assertDatabaseWriteAllowed(CheckoutIntent.db, env);
  await mongoose.connection.transaction(async session => {
    const intent = await CheckoutIntent.findOne({ owner, checkoutKey }).session(session);
    if (!intent?.payment || intent.state !== 'open' || intent.payment.state !== 'prepared') throw review();
    if (intent.payment.proofId) {
      if (String(intent.payment.proofId) !== uploadId || intent.payment.senderName !== senderName.trim()) throw review();
    } else {
      const upload = await Upload.findOne({ _id: uploadId, owner, checkoutKey, purpose: 'payment_proof', state: 'complete', expiresAt: { $gt: new Date() }, orderId: { $exists: false } }).session(session);
      if (!upload) throw commerceError(409, 'INVALID_PAYMENT_PROOF', 'The proof is unavailable or belongs to another payment reference. Do not transfer again.');
      // Preserve proof even after instructions expire: it may show real funds.
      upload.state = 'retained'; await upload.save({ session });
      intent.payment = { ...intent.payment, proofId: upload._id, senderName: senderName.trim(), submittedAt: new Date() };
      intent.markModified('payment'); await intent.save({ session });
    }
    result = presentCheckoutPayment(intent);
  });
  return result;
}
export async function cancelCheckoutPayment(owner, checkoutKey) {
  assertDatabaseWriteAllowed(CheckoutIntent.db, env);
  const result = await CheckoutIntent.updateOne({ owner, checkoutKey, state: 'open', 'payment.state': 'prepared', 'payment.proofId': { $exists: false } }, { $set: { 'payment.state': 'cancelled_no_transfer', 'payment.cancelledAt': new Date() } });
  if (!result.modifiedCount && !await CheckoutIntent.exists({ owner, checkoutKey, state: 'open', 'payment.state': 'cancelled_no_transfer', 'payment.proofId': { $exists: false } })) throw review();
  return { cancelled: true };
}
