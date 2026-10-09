import { randomInt } from 'node:crypto';
import mongoose from 'mongoose';
import { Order } from '../models/Order.js';
import { Cart } from '../models/Cart.js';
import { CheckoutIntent } from '../models/CheckoutIntent.js';
import { DiscountRedemption } from '../models/DiscountRedemption.js';
import { Upload } from '../models/Upload.js';
import { env } from '../config/env.js';
import { assertDatabaseWriteAllowed } from '../config/database-safety.js';
import { quoteCart } from './cart.js';
import { fingerprint } from './pricing.js';
import { calculatePromotions, getShippingQuote, lockShippingQuote, claimDiscountRedemption } from './promotions.js';
import { consumeInventory, restockInventory } from './inventory.js';
import { retainUploads, validateUploadReferences } from './uploads.js';
import { enqueueOrderEvent } from './notifications.js';
import { recordAdminAudit } from './audit.js';
import { commerceError, checkedMoney } from './errors.js';
import { recordOrderTracking } from '../tracking/service.js';
import { presentOrder } from './order-presentation.js';
export { presentOrder } from './order-presentation.js';

export function normalizePhone(value) {
  if (typeof value !== 'string' || value.length > 25 || !/^[+0-9\s()-]+$/.test(value)) throw commerceError(400, 'INVALID_PHONE', 'Enter a valid Egyptian mobile number.');
  let phone = value.replace(/[\s()-]/g, '');
  if (phone.startsWith('0020')) phone = `+20${phone.slice(4)}`;
  if (/^01[0125][0-9]{8}$/.test(phone)) phone = `+20${phone.slice(1)}`;
  if (!/^\+201[0125][0-9]{8}$/.test(phone)) throw commerceError(400, 'INVALID_PHONE', 'Enter a valid Egyptian mobile number.');
  return phone;
}
export function generateOrderNumber() { return String(randomInt(100000, 1000000)); }
function requireCheckout() { if (!env.checkoutEnabled) throw commerceError(403, 'CHECKOUT_DISABLED', 'Checkout is not enabled. No order has been placed.'); }
export async function checkoutQuote(owner, input, { session, userId } = {}) {
  const cart = await quoteCart(owner, { session, strict: true });
  if (!cart.items.length) throw commerceError(400, 'CART_EMPTY', 'Add an eligible product before checking out.');
  const promotions = await calculatePromotions(cart.items, { code: input.discountCode, session, userId });
  const shipping = await getShippingQuote(input.governorate, { session });
  const totals = { subtotalPiastres: promotions.subtotalPiastres, discountPiastres: promotions.discountPiastres,
    shippingPiastres: shipping.shippingPiastres, totalPiastres: checkedMoney(promotions.totalPiastres + shipping.shippingPiastres), applied: promotions.applied };
  const digest = fingerprint({ lines: cart.items.map(line => ({ identity: line.identity, quantity: line.quantity, unitPrice: line.unitPricePiastres, customization: line.customizationSnapshot })), totals,
    governorate: input.governorate, paymentMethod: input.paymentMethod, discountCode: input.discountCode?.trim().toUpperCase() || null });
  return { cart, totals, fingerprint: digest, shipping };
}
export async function prepareCheckout(owner, input, userId) {
  requireCheckout();
  const quote = await checkoutQuote(owner, input, { userId });
  const existing = await CheckoutIntent.findOne({ owner, checkoutKey: input.checkoutKey }).lean();
  if (existing?.state === 'consumed') throw commerceError(409, 'CHECKOUT_USED', 'This checkout has already been submitted.');
  const expiresAt = new Date(Date.now() + 10 * 60000);
  assertDatabaseWriteAllowed(CheckoutIntent.db, env);
  await CheckoutIntent.updateOne({ owner, checkoutKey: input.checkoutKey, state: 'open' }, { $set: { fingerprint: quote.fingerprint, quote: quote.totals, paymentMethod: input.paymentMethod, expiresAt },
    $setOnInsert: { owner, checkoutKey: input.checkoutKey, state: 'open' } }, { upsert: true });
  return { ...quote.totals, totals: quote.totals, fingerprint: quote.fingerprint, expiresAt };
}
export async function placeOrder(owner, input, userId, { trackingConsentId = null } = {}) {
  const normalized = { ...input, customer: { ...input.customer, phone: normalizePhone(input.customer.phone) }, discountCode: input.discountCode?.trim().toUpperCase() || null };
  const requestHash = fingerprint(normalized);
  const repeated = async () => {
    const order = await Order.findOne({ owner, checkoutKey: input.checkoutKey }).lean();
    if (!order) return null;
    if (order.requestHash !== requestHash) throw commerceError(409, 'IDEMPOTENCY_CONFLICT', 'This checkout key was already used for a different request.');
    return presentOrder(order);
  };
  const previous = await repeated(); if (previous) return previous;
  requireCheckout();
  for (let collision = 0; collision < 8; collision += 1) {
    try {
      let result;
      assertDatabaseWriteAllowed(Order.db, env);
      await mongoose.connection.transaction(async session => {
        const duplicate = await Order.findOne({ owner, checkoutKey: input.checkoutKey }).session(session).lean();
        if (duplicate) {
          if (duplicate.requestHash !== requestHash) throw commerceError(409, 'IDEMPOTENCY_CONFLICT', 'This checkout key was already used for a different request.');
          result = presentOrder(duplicate); return;
        }
        const intent = await CheckoutIntent.findOne({ owner, checkoutKey: input.checkoutKey, state: 'open', expiresAt: { $gt: new Date() } }).session(session).lean();
        if (!intent) throw commerceError(409, 'CHECKOUT_QUOTE_REQUIRED', 'Review current checkout totals before placing your order.');
        const quote = await checkoutQuote(owner, normalized.customer.governorate ? { ...normalized, governorate: normalized.customer.governorate } : normalized, { session, userId });
        if (intent.fingerprint !== quote.fingerprint || intent.paymentMethod !== input.paymentMethod) throw commerceError(409, 'CHECKOUT_CHANGED', 'Prices or cart contents changed. Review the updated total before submitting again.');
        let proofId = null;
        if (input.paymentMethod === 'instapay') {
          if (!input.paymentProofId) throw commerceError(400, 'PAYMENT_PROOF_REQUIRED', 'Payment proof is required for InstaPay.');
          await validateUploadReferences([input.paymentProofId], owner, { purpose: 'payment_proof', checkoutKey: input.checkoutKey, session }); proofId = input.paymentProofId;
        } else if (input.paymentProofId) throw commerceError(400, 'UNEXPECTED_PROOF', 'Cash on Delivery does not require a payment receipt.');
        const uploadIds = [...new Set([...quote.cart.items.flatMap(line => line.uploadIds), ...(proofId ? [proofId] : [])])];
        await lockShippingQuote(quote.shipping, { session });
        const inventoryClaims = await consumeInventory(quote.cart.items, quote.totals.applied, session);
        const order = new Order({ owner, userId: userId || null, trackingConsentId, checkoutKey: input.checkoutKey, requestHash, orderNumber: generateOrderNumber(), customer: normalized.customer,
          lines: quote.cart.items.map(line => ({ productId: line.productId, name: line.name, slug: line.slug, variantKey: line.variantKey, variantLabel: line.variantLabel,
            sku: line.sku, description: line.description, categoryId: line.categoryId, subcategoryId: line.subcategoryId, mainImageUrl: line.mainImageUrl,
            quantity: line.quantity, unitPricePiastres: line.unitPricePiastres, lineTotalPiastres: line.lineTotalPiastres, personalization: line.personalization,
            customization: line.customizationSnapshot, uploadIds: line.uploadIds })), totals: quote.totals, inventoryClaims, uploadIds, paymentProofId: proofId,
          paymentMethod: input.paymentMethod, paymentState: input.paymentMethod === 'instapay' ? 'awaiting_verification' : 'unpaid',
          history: [{ at: new Date(), event: 'order_received', actor: userId ? 'customer' : 'guest' }] });
        for (const discount of quote.totals.applied.filter(value => value.kind === 'discount')) {
          const count = userId ? await DiscountRedemption.countDocuments({ userId, discountId: discount.id }).session(session) : 0;
          await claimDiscountRedemption(discount.id, { session, userId, redemptionCount: count });
          assertDatabaseWriteAllowed(DiscountRedemption.db, env);
          await DiscountRedemption.create([{ orderId: order._id, discountId: discount.id, userId: userId || null, amountPiastres: discount.discountPiastres }], { session });
        }
        assertDatabaseWriteAllowed(Order.db, env); await order.save({ session });
        await retainUploads(uploadIds, owner, order._id, { session });
        assertDatabaseWriteAllowed(CheckoutIntent.db, env);
        if (!(await CheckoutIntent.updateOne({ _id: intent._id, state: 'open' }, { $set: { state: 'consumed', orderId: order._id } }, { session })).matchedCount) throw commerceError(409, 'CHECKOUT_USED', 'This checkout has already been submitted.');
        assertDatabaseWriteAllowed(Cart.db, env); await Cart.deleteOne({ _id: quote.cart.document._id }, { session });
        await enqueueOrderEvent(order, 'order_received', { session, eventVersion: 1 });
        await recordOrderTracking(order, { session });
        result = presentOrder(order.toObject());
      }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
      return result;
    } catch (error) {
      if (error.code === 11000) {
        const existing = await repeated(); if (existing) return existing;
        if (error.keyPattern?.orderNumber && collision < 7) continue;
        if (error.keyValue?.key === 'egypt-v1' && collision < 7) continue;
      }
      if (error.code === 20 || error.codeName === 'IllegalOperation') throw commerceError(503, 'TRANSACTIONS_REQUIRED', 'Checkout requires a transaction-capable dedicated database. No order was placed.');
      throw error;
    }
  }
  throw commerceError(503, 'ORDER_NUMBER_UNAVAILABLE', 'Unable to allocate an order reference. No order was placed.');
}
const fulfillmentNext = { received: ['confirmed', 'cancelled'], confirmed: ['preparing', 'cancelled'], preparing: ['out_for_delivery'], out_for_delivery: ['delivered'], delivered: [], cancelled: [] };
export function validateOrderTransition(order, input, { admin = false } = {}) {
  if (input.revision !== order.revision) throw commerceError(409, 'ORDER_CHANGED', 'Reload the order before changing its state.');
  const nextFulfillment = input.fulfillmentState || order.fulfillmentState, nextPayment = input.paymentState || order.paymentState;
  if (!admin && (nextFulfillment !== 'cancelled' || input.paymentState)) throw commerceError(403, 'ORDER_ACTION_FORBIDDEN', 'This order action requires administrator permission.');
  if (nextFulfillment !== order.fulfillmentState && !fulfillmentNext[order.fulfillmentState]?.includes(nextFulfillment)) throw commerceError(409, 'INVALID_ORDER_TRANSITION', 'This fulfillment transition is not permitted.');
  if (order.fulfillmentState === 'cancelled' && nextPayment !== order.paymentState) throw commerceError(409, 'INVALID_PAYMENT_TRANSITION', 'Cancelled orders cannot be marked paid.');
  if (nextPayment !== order.paymentState) {
    const allowed = order.paymentMethod === 'instapay' ? order.paymentState === 'awaiting_verification' && ['paid', 'rejected'].includes(nextPayment) : order.paymentState === 'unpaid' && nextPayment === 'paid' && ['out_for_delivery', 'delivered'].includes(order.fulfillmentState);
    if (!admin || !allowed) throw commerceError(409, 'INVALID_PAYMENT_TRANSITION', 'This payment transition is not permitted.');
    if (nextPayment === 'rejected' && !(input.publicReason || input.internalNote || input.reason)?.trim()) throw commerceError(400, 'REASON_REQUIRED', 'Provide a reason for rejecting payment.');
  }
  if (nextFulfillment === 'cancelled' && nextPayment === 'paid') throw commerceError(409, 'REFUND_REVIEW_REQUIRED', 'Paid orders require a separate refund review before cancellation.');
  if (nextFulfillment !== 'received' && nextFulfillment !== 'cancelled' && order.paymentMethod === 'instapay' && nextPayment !== 'paid') throw commerceError(409, 'PAYMENT_VERIFICATION_REQUIRED', 'Verify the full InstaPay payment before fulfillment.');
  return { fulfillmentState: nextFulfillment, paymentState: nextPayment, changed: nextFulfillment !== order.fulfillmentState || nextPayment !== order.paymentState };
}
export async function changeOrderState(id, owner, input, actor) {
  let result;
  assertDatabaseWriteAllowed(Order.db, env);
  await mongoose.connection.transaction(async session => {
    const order = await Order.findOne({ _id: id, ...(actor?.role === 'admin' ? {} : { owner }) }).session(session);
    if (!order) throw commerceError(404, 'ORDER_NOT_FOUND', 'Order not found.');
    const next = validateOrderTransition(order, input, { admin: actor?.role === 'admin' });
    if (!next.changed) { result = presentOrder(order.toObject(), { admin: actor?.role === 'admin' }); return; }
    const from = { fulfillmentState: order.fulfillmentState, paymentState: order.paymentState };
    if (next.fulfillmentState === 'cancelled') await restockInventory(order, session);
    order.fulfillmentState = next.fulfillmentState; order.paymentState = next.paymentState; order.revision += 1;
    const isAdmin = actor?.role === 'admin';
    if (!isAdmin && (input.internalNote || input.publicReason)) throw commerceError(403, 'ORDER_ACTION_FORBIDDEN', 'Administrative notes require administrator permission.');
    const entry = { at: new Date(), event: 'state_changed', actor: isAdmin ? `admin:${actor._id}` : 'customer', from,
      to: { fulfillmentState: next.fulfillmentState, paymentState: next.paymentState },
      publicReason: isAdmin ? input.publicReason || '' : input.reason || '',
      ...(isAdmin ? { internalNote: input.internalNote || input.reason || '' } : {}) };
    order.history.push(entry);
    // Update only mutable state. Saving a hydrated document must never rewrite
    // immutable snapshots, including Mixed arrays, during a state transition.
    assertDatabaseWriteAllowed(Order.db, env);
    const updated = await Order.updateOne({ _id: order._id, revision: input.revision }, {
      $set: { fulfillmentState: order.fulfillmentState, paymentState: order.paymentState, restockedAt: order.restockedAt },
      $inc: { revision: 1 }, $push: { history: entry },
    }, { session, runValidators: true });
    if (!updated.matchedCount) throw commerceError(409, 'ORDER_CHANGED', 'Reload the order before changing its state.');
    if (actor?.role === 'admin') await recordAdminAudit(actor, { action: 'order_state_changed', resourceType: 'order', resourceId: order._id, details: { from, to: { fulfillmentState: next.fulfillmentState, paymentState: next.paymentState } } }, { session });
    if (next.paymentState !== from.paymentState) await enqueueOrderEvent(order, next.paymentState === 'paid' ? 'payment_confirmed' : 'payment_rejected', { session, eventVersion: order.revision });
    if (next.paymentState === 'paid' && from.paymentState !== 'paid' && order.paymentMethod === 'instapay') await recordOrderTracking(order, { session });
    if (next.fulfillmentState !== from.fulfillmentState) await enqueueOrderEvent(order, next.fulfillmentState === 'confirmed' ? 'order_confirmed' : next.fulfillmentState, { session, eventVersion: order.revision });
    result = presentOrder(order.toObject(), { admin: actor?.role === 'admin' });
  });
  return result;
}
export async function getOwnedOrder(id, owner, { admin = false } = {}) {
  const order = await Order.findOne({ _id: id, ...(admin ? {} : { owner }) }).lean().maxTimeMS(3000);
  if (!order) throw commerceError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  return order;
}
export async function findOwnedCheckoutSubmission(checkoutKey, owner) {
  // A missing record is NOT proof that a concurrent submission cannot commit.
  // This read never creates an order, resumes checkout or permits a new payload.
  return Order.findOne({ owner, checkoutKey }).lean().maxTimeMS(3000);
}
export async function orderFiles(order) {
  return Upload.find({ _id: { $in: order.uploadIds }, orderId: order._id, state: 'retained' }).select('_id purpose mimeType sizeBytes productId fieldKey').lean().maxTimeMS(3000);
}
