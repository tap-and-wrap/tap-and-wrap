import { ALL_METHODS_POLICY } from '../../../shared/order-payment-policy.mjs';
import { checkoutCustomer } from './checkout-customer.js';
import { fenceProductEngravingPrice } from '../product-engraving/service.js';
import { UPFRONT_ENGRAVING_POLICY, isEngravingKind } from '../../../shared/engraving/definitions.mjs';
import { initialPaymentGroups, groupedOrder, groupedPaymentState, overallFulfillment } from './payment-groups.js';
import { engravingSnapshot } from '../engraving/pricing.js';
import { currentConfiguration } from '../engraving/configuration.js';
import { initialEngravingWorkflow } from '../engraving/workflow.js';
import { isEngravingOrder } from '../engraving/payment-policy.js';
import { fenceGiftBoxPersonalization } from '../gift-box/personalization-options.js';
import { pendingShipping, orderAccounting, accountingSummary } from './order-accounting.js';
import { randomInt } from 'node:crypto';
import mongoose from 'mongoose';
import { Order } from '../models/Order.js';
import { Cart } from '../models/Cart.js';
import { presentCheckoutPayment } from './checkout-payment.js';
import { CheckoutIntent } from '../models/CheckoutIntent.js';
import { DiscountRedemption } from '../models/DiscountRedemption.js';
import { Upload } from '../models/Upload.js';
import { env } from '../config/env.js';
import { assertDatabaseWriteAllowed } from '../config/database-safety.js';
import { quoteCart, quoteCartForGiftBoxDisposableCheckout } from './cart.js';
import { fingerprint } from './pricing.js';
import { calculatePromotions, GOVERNORATES, claimDiscountRedemption } from './promotions.js';
import { consumeInventory, restockInventory } from './inventory.js';
import { retainUploads, releaseRetainedUploadQuota } from './uploads.js';
import { enqueueOrderEvent } from './notifications.js';
import { recordAdminAudit } from './audit.js';
import { commerceError, checkedMoney } from './errors.js';
import { recordOrderTracking } from '../tracking/service.js';
import { presentOrder } from './order-presentation.js';
import { giftBoxOrderLine } from '../gift-box/order-snapshot.js';
import { assertGiftBoxCheckoutCapability, createGiftBoxCheckoutCapabilityForDisposableTest,
  readGiftBoxCheckoutPolicyFences, fenceGiftBoxCheckoutPolicies, runGiftBoxCheckoutTestHook } from '../gift-box/checkout-guard.js';
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
export async function checkoutQuote(owner, input, options = {}) { return checkoutQuoteCore(owner, input, options); }
async function checkoutQuoteCore(owner, input, { session, userId } = {}, capability = null) {
  if (capability) assertGiftBoxCheckoutCapability(capability, owner);
  const cart = capability ? await quoteCartForGiftBoxDisposableCheckout(owner, { session, capability }) : await quoteCart(owner, { session, strict: true });
  if (!cart.items.length) throw commerceError(400, 'CART_EMPTY', 'Add an eligible product before checking out.');
  const policyFences = await readGiftBoxCheckoutPolicyFences(cart.items, { session });
  const promotions = await calculatePromotions(cart.items, { code: input.discountCode, session, userId });
  if (!GOVERNORATES.some(area => area.id === input.governorate)) throw commerceError(400, 'INVALID_GOVERNORATE', 'Choose a supported governorate.');
  const shipping = pendingShipping();
  const totals = { subtotalPiastres: promotions.subtotalPiastres, discountPiastres: promotions.discountPiastres,
    shippingPiastres: null, totalPiastres: checkedMoney(promotions.totalPiastres), applied: promotions.applied };
  const digest = fingerprint({ lines: cart.items.map(line => ({ identity: line.identity, quantity: line.quantity, unitPrice: line.unitPricePiastres, customization: line.customizationSnapshot, ...(isEngravingKind(line.kind) ? { kind: line.kind, specification: line.specification, reviewFingerprint: line.reviewFingerprint } : {}),
    ...(line.kind === 'gift_box_v2' ? { kind: line.kind, configuration: line.configuration,
      components: line.giftComponents.map(component => ({ ...component, priceApprovedAt: new Date(component.priceApprovedAt).toISOString() })),
      personalization: line.giftPersonalization, fulfillment: line.giftFulfillment, policyHash: line.giftPolicyHash } : {}) })), totals,
    paymentPolicyVersion: ALL_METHODS_POLICY, engravingPaymentPolicy: cart.items.some(line => isEngravingKind(line.kind)) ? UPFRONT_ENGRAVING_POLICY : null, governorate: input.governorate, paymentMethod: input.paymentMethod, discountCode: input.discountCode?.trim().toUpperCase() || null });
  return { cart, totals, fingerprint: digest, shipping, policyFences };
}
export async function prepareCheckout(owner, input, userId) {
  return prepareCheckoutCore(owner, input, userId);
}
export async function prepareGiftBoxCheckoutForDisposableTest(owner, input, userId) {
  const capability = await createGiftBoxCheckoutCapabilityForDisposableTest(owner);
  return prepareCheckoutCore(owner, input, userId, capability);
}
async function prepareCheckoutCore(owner, input, userId, capability = null) {
  if (capability) assertGiftBoxCheckoutCapability(capability, owner);
  requireCheckout();
  const quote = await checkoutQuoteCore(owner, input, { userId }, capability);
  const existing = await CheckoutIntent.findOne({ owner, checkoutKey: input.checkoutKey }).lean();
  if (existing?.state === 'consumed') throw commerceError(409, 'CHECKOUT_USED', 'This checkout has already been submitted.');
  if (existing?.payment) {
    if (existing.fingerprint !== quote.fingerprint || existing.paymentMethod !== input.paymentMethod || existing.payment.state !== 'prepared' || new Date(existing.payment.expiresAt) <= new Date()) throw commerceError(409, 'CHECKOUT_PAYMENT_REVIEW_REQUIRED', 'Your prepared transfer reference needs reconciliation. Do not transfer again or create another order. Contact the store.');
    return { ...quote.totals, totals: quote.totals, paymentGroups: initialPaymentGroups(quote.cart.items, quote.totals, input.paymentMethod, UPFRONT_ENGRAVING_POLICY), fingerprint: quote.fingerprint, expiresAt: existing.payment.expiresAt, payment: presentCheckoutPayment(existing, { actionable: true }) };
  }
  const expiresAt = new Date(Date.now() + 10 * 60000);
  assertDatabaseWriteAllowed(CheckoutIntent.db, env);
  await CheckoutIntent.updateOne({ owner, checkoutKey: input.checkoutKey, state: 'open', payment: { $exists: false } }, { $set: { fingerprint: quote.fingerprint, quote: quote.totals, paymentMethod: input.paymentMethod, expiresAt },
    $setOnInsert: { owner, checkoutKey: input.checkoutKey, state: 'open' } }, { upsert: true });
  return { ...quote.totals, totals: quote.totals, paymentGroups: initialPaymentGroups(quote.cart.items, quote.totals, input.paymentMethod, UPFRONT_ENGRAVING_POLICY), fingerprint: quote.fingerprint, expiresAt };
}
export async function placeOrder(owner, input, userId, { trackingConsentId = null } = {}) {
  return placeOrderCore(owner, input, userId, { trackingConsentId });
}
export async function placeGiftBoxOrderForDisposableTest(owner, input, userId, { trackingConsentId = null } = {}) {
  const capability = await createGiftBoxCheckoutCapabilityForDisposableTest(owner);
  return placeOrderCore(owner, input, userId, { trackingConsentId }, capability);
}
function snapshotOrderLine(line) {
  if (isEngravingKind(line.kind)) return { kind: line.kind, name: line.name, quantity: 1, unitPricePiastres: line.unitPricePiastres, lineTotalPiastres: line.lineTotalPiastres, engraving: engravingSnapshot(line) };
  if (line.kind === 'gift_box_v2') return giftBoxOrderLine(line);
  if (line.kind !== undefined && line.kind !== 'product') throw commerceError(400, 'CART_LINE_KIND_INVALID', 'Unsupported order line kind.');
  return { kind: 'product', productId: line.productId, name: line.name, slug: line.slug, variantKey: line.variantKey, variantLabel: line.variantLabel,
    sku: line.sku, description: line.description, categoryId: line.categoryId, subcategoryId: line.subcategoryId, mainImageUrl: line.mainImageUrl,
    quantity: line.quantity, unitPricePiastres: line.unitPricePiastres, lineTotalPiastres: line.lineTotalPiastres,
    ...(line.photoPurchase ? { photoPurchase: line.photoPurchase } : {}), personalization: line.personalization, personalizationDefinitions: line.personalizationDefinitions, customization: line.customizationSnapshot, ...(line.productEngravingSnapshot ? { productEngraving: line.productEngravingSnapshot } : {}), uploadIds: line.uploadIds };
}
async function placeOrderCore(owner, input, userId, { trackingConsentId = null } = {}, capability = null) {
  if (capability) assertGiftBoxCheckoutCapability(capability, owner);
  const approvedCustomer = checkoutCustomer.parse(input.customer);
  const normalized = { ...input, customer: { ...approvedCustomer, phone: normalizePhone(approvedCustomer.phone) }, discountCode: input.discountCode?.trim().toUpperCase() || null };
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
        const quote = await checkoutQuoteCore(owner, normalized.customer.governorate ? { ...normalized, governorate: normalized.customer.governorate } : normalized, { session, userId }, capability);
        if (intent.fingerprint !== quote.fingerprint || intent.paymentMethod !== input.paymentMethod) throw commerceError(409, intent.payment ? 'CHECKOUT_PAYMENT_REVIEW_REQUIRED' : 'CHECKOUT_CHANGED', intent.payment ? 'Your payment reference requires reconciliation because checkout changed. Do not transfer again. Contact the store.' : 'Prices or cart contents changed. Review the updated total before submitting again.');
        let checkoutProof;
        if (intent.payment) {
          const payment = intent.payment;
          if (input.paymentMethod !== 'instapay' || payment.state !== 'prepared' || new Date(payment.expiresAt) <= new Date() || payment.amountPiastres !== quote.totals.totalPiastres || !payment.proofId || input.paymentProofId && String(payment.proofId) !== input.paymentProofId) throw commerceError(409, 'CHECKOUT_PAYMENT_REVIEW_REQUIRED', 'This payment reference requires reconciliation. Do not transfer again. Contact the store with your reference.');
          checkoutProof = await Upload.findOne({ _id: payment.proofId, owner, checkoutKey: input.checkoutKey, purpose: 'payment_proof', state: 'retained', orderId: { $exists: false } }).session(session);
          if (!checkoutProof) throw commerceError(409, 'INVALID_PAYMENT_PROOF', 'The payment proof needs review. Do not transfer again.');
        } else if (input.paymentProofId) throw commerceError(400, 'ORDER_FIRST_REQUIRED', 'Prepare an owned payment reference before submitting pre-order proof.');
        const uploadIds = [...new Set(quote.cart.items.flatMap(line => line.uploadIds))];
        const hasEngraving = quote.cart.items.some(line => isEngravingKind(line.kind));
        for (const line of quote.cart.items.filter(line => isEngravingKind(line.kind))) await currentConfiguration(line.specification.typeId, { session, fence: true });
        const hasGifts = quote.cart.items.some(line => line.kind === 'gift_box_v2');
        const personalized = hasEngraving || hasGifts || quote.cart.items.some(line => line.requiresPersonalization || Object.keys(line.personalization || {}).length > 0 || line.customizationSnapshot || line.productEngravingSnapshot);
        await runGiftBoxCheckoutTestHook(capability, owner, 'beforeInventory', { session, quote });
        await fenceProductEngravingPrice(quote.cart.items, session);
        const inventoryClaims = await consumeInventory(quote.cart.items, quote.totals.applied, session);
        await runGiftBoxCheckoutTestHook(capability, owner, 'afterInventory', { session, quote });
        await runGiftBoxCheckoutTestHook(capability, owner, 'beforePolicyFence', { session, quote });
        await fenceGiftBoxCheckoutPolicies(quote.policyFences, session);
        await fenceGiftBoxPersonalization(quote.cart.items, session);
        const order = new Order({ paymentPolicyVersion: ALL_METHODS_POLICY, ...(hasEngraving || quote.cart.items.some(line => line.productEngravingSnapshot || line.photoSelection) ? { cartAddOperations: quote.cart.document.addOperations } : {}), ...(hasEngraving ? { engravingPaymentPolicy: UPFRONT_ENGRAVING_POLICY, engraving: initialEngravingWorkflow(quote.cart.items) } : {}), owner, userId: userId || null, trackingConsentId, checkoutKey: input.checkoutKey, requestHash, orderNumber: generateOrderNumber(), customer: normalized.customer.addressVersion ? { ...normalized.customer, address: [normalized.customer.city, normalized.customer.street, ...(normalized.customer.addressVersion === 'delivery-address-v3' ? ['building', 'floor', 'apartment'].filter(key => normalized.customer[key]).map(key => `${key[0].toUpperCase()}${key.slice(1)}: ${normalized.customer[key]}`) : [normalized.customer.building])].filter(Boolean).join(', ') } : normalized.customer,
          lines: quote.cart.items.map(snapshotOrderLine), totals: quote.totals, inventoryClaims, uploadIds, accountingVersion: hasEngraving || hasGifts ? 2 : 1, ...((hasEngraving || hasGifts) ? { paymentGroups: initialPaymentGroups(quote.cart.items, quote.totals, input.paymentMethod, UPFRONT_ENGRAVING_POLICY), ...(quote.cart.items.some(line => !isEngravingKind(line.kind)) ? { merchandiseFulfillment: 'received' } : {}) } : {}), personalized, allowedPaymentMethods: ['cod', 'instapay'], charges: [...(quote.cart.items.some(line => !isEngravingKind(line.kind)) ? [pendingShipping()] : []), ...(hasEngraving ? [{ ...pendingShipping(), id: 'return_shipping', label: 'Item handoff / return' }] : [])], followUpDueAt: new Date(Date.now() + 12 * 3600000),
          paymentMethod: input.paymentMethod, paymentState: input.paymentMethod === 'cod' ? 'unpaid' : quote.totals.totalPiastres === 0 ? 'paid' : 'awaiting_transfer',
          history: [{ at: new Date(), event: 'order_received', actor: userId ? 'customer' : 'guest' }] });
        for (const discount of quote.totals.applied.filter(value => value.kind === 'discount')) {
          const count = userId ? await DiscountRedemption.countDocuments({ userId, discountId: discount.id, reversedAt: null }).session(session) : 0;
          await claimDiscountRedemption(discount.id, { session, userId, redemptionCount: count });
          assertDatabaseWriteAllowed(DiscountRedemption.db, env);
          await DiscountRedemption.create([{ orderId: order._id, discountId: discount.id, userId: userId || null, amountPiastres: discount.discountPiastres }], { session });
        }
        if (checkoutProof) {
          order.checkoutPayment = { ...intent.payment };
          order.paymentProofId = checkoutProof._id; order.proofReviewRequired = true; order.paymentState = 'awaiting_verification';
          order.uploadIds.push(checkoutProof._id);
          order.proofHistory.push({ uploadId: checkoutProof._id, at: new Date(), state: 'submitted', ...(order.accountingVersion === 2 ? { scope: 'checkout' } : {}) });
          checkoutProof.proofOrderId = order._id; checkoutProof.orderId = order._id; await checkoutProof.save({ session });
          await releaseRetainedUploadQuota(checkoutProof, session);
        }
        order.financialSummary = accountingSummary(order, []);
        assertDatabaseWriteAllowed(Order.db, env); await order.save({ session });
        await retainUploads(uploadIds, owner, order._id, { session });
        assertDatabaseWriteAllowed(CheckoutIntent.db, env);
        if (!(await CheckoutIntent.updateOne({ _id: intent._id, state: 'open' }, { $set: { state: 'consumed', orderId: order._id } }, { session })).matchedCount) throw commerceError(409, 'CHECKOUT_USED', 'This checkout has already been submitted.');
        assertDatabaseWriteAllowed(Cart.db, env); await Cart.deleteOne({ _id: quote.cart.document._id }, { session });
        await enqueueOrderEvent(order, 'order_received', { session, eventVersion: 1 });
        await recordOrderTracking(order, { session });
        await runGiftBoxCheckoutTestHook(capability, owner, 'beforeCommit', { session, quote, order });
        result = presentOrder(order.toObject());
      }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
      await runGiftBoxCheckoutTestHook(capability, owner, 'afterCommit', { order: result });
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
const fulfillmentNext = { received: ['confirmed', 'cancelled'], confirmed: ['preparing', 'cancelled'], preparing: ['out_for_delivery'], out_for_delivery: ['delivered', 'delivery_failed'], delivered: ['returned'], delivery_failed: ['returned'], returned: [], cancelled: [] };
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
  if (!['received', 'cancelled', 'returned', 'delivery_failed'].includes(nextFulfillment) && order.paymentMethod === 'instapay' && nextPayment !== 'paid') throw commerceError(409, 'PAYMENT_VERIFICATION_REQUIRED', 'Verify the full InstaPay payment before fulfillment.');
  return { fulfillmentState: nextFulfillment, paymentState: nextPayment, changed: nextFulfillment !== order.fulfillmentState || nextPayment !== order.paymentState };
}
export async function changeOrderState(id, owner, input, actor) {
  let result;
  assertDatabaseWriteAllowed(Order.db, env);
  await mongoose.connection.transaction(async session => {
    const order = await Order.findOne({ _id: id, ...(actor?.role === 'admin' ? {} : { owner }) }).session(session);
    if (!order) throw commerceError(404, 'ORDER_NOT_FOUND', 'Order not found.');
    if (groupedOrder(order)) {
      if (actor?.role !== 'admin' || input.paymentState || !order.paymentGroups.some(group => group.id === 'merchandise') || !input.fulfillmentState || input.fulfillmentState === 'cancelled') throw commerceError(409, 'GROUP_ACTION_REQUIRED', 'Use merchandise fulfillment, engraving custody or reconciled accounting as appropriate.');
      if (order.revision !== input.revision) throw commerceError(409, 'ORDER_CHANGED', 'Reload the order before saving.');
      const current = order.merchandiseFulfillment || 'received', next = input.fulfillmentState;
      if (!fulfillmentNext[current]?.includes(next)) throw commerceError(409, 'INVALID_ORDER_TRANSITION', 'This merchandise transition is not permitted.');
      const financial = await orderAccounting(order, {session});
      const group = financial.groups.find(group => group.id === 'merchandise');
      if (!['returned','delivery_failed'].includes(next) && group.method === 'instapay' && group.outstandingPiastres > 0) throw commerceError(409, 'PAYMENT_VERIFICATION_REQUIRED', 'Verify the merchandise payment before preparing it. Engraving remains separate.');
      if (['out_for_delivery','delivered'].includes(next) && financial.charges.some(charge => charge.id !== 'return_shipping' && (charge.state !== 'accepted' || charge.collectionMethod === 'instapay' && charge.outstandingPiastres > 0))) throw commerceError(409, 'CHARGE_ACCEPTANCE_REQUIRED', 'Resolve and collect any agreed InstaPay delivery charge before dispatch.');
      if (['returned','delivery_failed'].includes(next) && !(input.publicReason || input.internalNote)?.trim()) throw commerceError(400, 'REASON_REQUIRED', 'Record the actual delivery or return circumstances.');
      const fulfillmentState = overallFulfillment(order, order.engraving, next);
      const future = {...order.toObject(),merchandiseFulfillment:next,fulfillmentState};
      const financialSummary = await orderAccounting(future, {session});
      const paymentState = groupedPaymentState(future, financialSummary);
      const history = {at:new Date(), event:'merchandise_state_changed', actor:`admin:${actor._id}`, publicReason:input.publicReason || '', internalNote:input.internalNote || '', from:{fulfillmentState:current}, to:{fulfillmentState:next}};
      const changed = await Order.updateOne({_id:order._id, revision:input.revision}, {$set:{merchandiseFulfillment:next, fulfillmentState, financialSummary, paymentState}, $inc:{revision:1}, $push:{history}}, {session,runValidators:true});
      if (!changed.matchedCount) throw commerceError(409, 'ORDER_CHANGED', 'Reload the order before saving.');
      order.merchandiseFulfillment = next; order.fulfillmentState = fulfillmentState; order.financialSummary = financialSummary; order.paymentState = paymentState; order.revision++;
      await recordAdminAudit(actor, {action:'order.merchandise_state_changed',resourceType:'order',resourceId:order._id,details:{from:current,to:next}}, {session});
      await enqueueOrderEvent(order, 'order_updated', {session,eventVersion:order.revision});
      result = presentOrder(order.toObject(), {admin:true}); return;
    }
    if (isEngravingOrder(order) && !groupedOrder(order)) throw commerceError(409, 'ENGRAVING_WORKFLOW_REQUIRED', 'Use the dedicated customer-item workflow; order receipt is not physical receipt.');
    if (['returned', 'delivery_failed'].includes(input.fulfillmentState) && !(input.publicReason || input.internalNote || input.reason)?.trim()) throw commerceError(400, 'REASON_REQUIRED', 'Record the delivery/return circumstances before changing status.');
    if (![1, 2].includes(order.accountingVersion) && input.paymentState) throw commerceError(409, 'LEGACY_ACCOUNTING_REVIEW_REQUIRED', 'Reconcile this historical payment into the reviewed ledger procedure before changing its financial state.');
    if ([1, 2].includes(order.accountingVersion)) {
      if (input.paymentState || input.fulfillmentState === 'cancelled') throw commerceError(409, 'ACCOUNTING_ACTION_REQUIRED', 'Use the reconciled payment or cancellation operation.');
      if (['out_for_delivery', 'delivered'].includes(input.fulfillmentState)) { const financial = await orderAccounting(order, { session }); if (financial.unresolvedCharges) throw commerceError(409, 'CHARGE_ACCEPTANCE_REQUIRED', 'Resolve delivery and add-on quotations before dispatch.'); }
    }
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
      $set: { fulfillmentState: order.fulfillmentState, paymentState: order.paymentState, restockedAt: order.restockedAt, ...([1, 2].includes(order.accountingVersion) ? { financialSummary: await orderAccounting(order, { session }) } : {}) },
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
  return Upload.find({ _id: { $in: order.uploadIds }, ...(order.serviceRequestId ? { $or: [{ orderId: order._id }, { requestId: order.serviceRequestId }] } : { orderId: order._id }), state: 'retained' }).select('_id purpose mimeType sizeBytes productId fieldKey').lean().maxTimeMS(3000);
}
