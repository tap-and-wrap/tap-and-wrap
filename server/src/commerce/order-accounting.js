import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { Order } from '../models/Order.js';
import { OrderSettlement } from '../models/OrderSettlement.js';
import { Upload } from '../models/Upload.js';
import { DiscountRedemption } from '../models/DiscountRedemption.js';
import DiscountCode from '../models/DiscountCode.js';
import { env } from '../config/env.js';
import { assertDatabaseWriteAllowed } from '../config/database-safety.js';
import { commerceError, checkedMoney } from './errors.js';
import { fingerprint } from './pricing.js';
import { retainUploads, validateUploadReferences } from './uploads.js';
import { restockInventory } from './inventory.js';
import { recordAdminAudit } from './audit.js';
import { enqueueOrderEvent } from './notifications.js';
import { recordOrderTracking } from '../tracking/service.js';

const fail = message => { throw commerceError(409, 'ACCOUNTING_REVIEW_REQUIRED', message); };
export const pendingShipping = () => ({ id: 'shipping', kind: 'shipping', label: 'Delivery', amountPiastres: null, state: 'pending', collectionMethod: null, createdAt: new Date() });
const sum = values => values.reduce((total, value) => checkedMoney(total + value), 0);
const allocation = (entry, scope) => entry.allocations?.length ? sum(entry.allocations.filter(part => part.scope === scope).map(part => part.amountPiastres)) : entry.scope === scope ? entry.amountPiastres : 0;
export function accountingSummary(order, settlements = []) {
  const collections = settlements.filter(entry => entry.direction === 'collection'), refunds = settlements.filter(entry => entry.direction === 'refund');
  const netFor = scope => sum(collections.map(entry => allocation(entry, scope))) - sum(refunds.map(entry => allocation(entry, scope)));
  const reductionFor = scope => sum(refunds.filter(entry => entry.reducePayable).map(entry => allocation(entry, scope)));
  const charges = order.charges || [];
  const cancelled = ['cancelled', 'returned'].includes(order.fulfillmentState);
  const scopes = [{ id: 'merchandise', amountPiastres: order.totals.totalPiastres }, ...charges.filter(charge => charge.state === 'accepted').map(charge => ({ id: charge.id, amountPiastres: charge.amountPiastres }))];
  scopes.forEach(scope => { scope.amountPiastres = Math.max(0, scope.amountPiastres - reductionFor(scope.id)); });
  return {
    merchandisePiastres: order.totals.totalPiastres,
    merchandisePayablePiastres: scopes[0].amountPiastres,
    merchandiseCollectedPiastres: netFor('merchandise'),
    collectedPiastres: sum(collections.map(entry => entry.amountPiastres)), refundedPiastres: sum(refunds.map(entry => entry.amountPiastres)),
    agreedTotalPiastres: sum(scopes.map(scope => scope.amountPiastres)),
    // Cancellation/return does not automatically promise a full refund. Review liability explicitly.
    outstandingPiastres: cancelled ? 0 : sum(scopes.map(scope => Math.max(0, scope.amountPiastres - netFor(scope.id)))),
    overpaymentPiastres: sum(scopes.map(scope => Math.max(0, netFor(scope.id) - scope.amountPiastres))),
    unresolvedCharges: charges.filter(charge => ['pending', 'offered', 'declined'].includes(charge.state)).length,
    refundReviewRequired: cancelled && sum(collections.map(entry => entry.amountPiastres)) > sum(refunds.map(entry => entry.amountPiastres)),
    charges: charges.map(charge => ({ id: charge.id, kind: charge.kind, label: charge.label, amountPiastres: charge.amountPiastres, pricing: charge.pricing || 'quote_required', state: charge.state, collectionMethod: charge.collectionMethod,
      createdAt: charge.createdAt, quotedAt: charge.quotedAt, acceptedAt: charge.acceptedAt, allowedPaymentMethods: charge.allowedPaymentMethods || [], quotationVersion: charge.quotationVersion || 0, acceptanceChannel: charge.acceptanceChannel || null, acceptedBy: charge.acceptedBy === 'customer' ? 'customer' : charge.acceptedBy ? 'admin-recorded customer confirmation' : null,
      outstandingPiastres: charge.state === 'accepted' ? Math.max(0, charge.amountPiastres - reductionFor(charge.id) - netFor(charge.id)) : null })),
  };
}
export async function orderAccounting(order, { admin = false, session } = {}) {
  if (order.accountingVersion !== 1) return null;
  const entries = await OrderSettlement.find({ orderId: order._id }).session(session || null).sort({ createdAt: 1, _id: 1 }).lean().maxTimeMS(3000);
  return { ...accountingSummary(order, entries), settlements: entries.map(entry => ({ id: String(entry._id), direction: entry.direction, scope: entry.scope, amountPiastres: entry.amountPiastres, method: entry.method, createdAt: entry.createdAt,
    allocations: (entry.allocations || []).map(part => ({ scope: part.scope, amountPiastres: part.amountPiastres })), reducePayable: Boolean(entry.reducePayable),
    ...(admin ? { reference: entry.reference, reason: entry.reason, refundOf: entry.refundOf ? String(entry.refundOf) : null } : {}) })) };
}
// All mutations serialize through the existing order revision inside a transaction.
// Settlement retries additionally have an immutable operation key and global bank-reference fence.
export async function mutateOrderAccounting(id, owner, input, actor) {
  const admin = actor?.role === 'admin';
  if (!admin && !['accept_charge', 'submit_proof', 'request_cancel'].includes(input.action)) throw commerceError(403, 'ADMIN_REQUIRED', 'Administrator action required.');
  let result;
  assertDatabaseWriteAllowed(Order.db, env);
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const order = await Order.findOne({ _id: id, ...(admin ? {} : { owner }) }).session(session);
      if (!order) throw commerceError(404, 'ORDER_NOT_FOUND', 'Order not found.');
      if (order.accountingVersion !== 1) fail('Legacy order requires a separately reviewed reconciliation; original totals remain unchanged.');
      if (order.serviceRequestId && ['quote_charge', 'accept_charge'].includes(input.action)) fail('Custom-service quotations are versioned in Requests. Reconcile the linked order before issuing a replacement quotation.');
      const entries = await OrderSettlement.find({ orderId: id }).session(session).lean();
      if (['collection', 'refund'].includes(input.action)) {
        const repeated = entries.find(entry => entry.operationKey === input.operationKey);
        if (repeated) {
          if (repeated.requestHash !== fingerprint(input)) fail('This operation key belongs to another immutable payment request.');
          result = order.toObject(); return;
        }
      }
      if (input.action === 'request_cancel' && order.cancellationRequestedAt) { result = order.toObject(); return; }
      if (input.action === 'submit_proof' && order.proofHistory.some(entry => String(entry.uploadId) === input.uploadId)) { result = order.toObject(); return; }
      if (order.revision !== input.revision) throw commerceError(409, 'ORDER_CHANGED', 'Reload the order before saving.');
      const charges = order.charges.map(charge => ({ ...charge }));
      const closed = ['cancelled', 'returned', 'delivery_failed'].includes(order.fulfillmentState);
      const now = new Date();
      let event = 'order_updated', publicReason = '', proofIds;
      if (input.action === 'quote_charge') {
        if (closed || ['out_for_delivery', 'delivered'].includes(order.fulfillmentState)) fail('Charges cannot be changed after dispatch or closure.');
        let charge = charges.find(value => value.id === input.chargeId);
        if (!charge) {
          if (input.kind !== 'addon' || charges.length >= 30) fail('Choose an existing delivery charge or a bounded new add-on.');
          charge = { id: randomUUID(), kind: 'addon', label: input.label, createdAt: now }; charges.push(charge);
        }
        const allowed = input.allowedPaymentMethods || [input.collectionMethod];
        if (!allowed.includes(input.collectionMethod)) fail('The proposed collection method must be one of the saved available payment methods.');
        if ((order.personalized || order.orderChannel === 'owner_quotation') && allowed.includes('cod') && !input.codAuthorized) fail('Explicitly authorize personalized/custom COD before offering it for acceptance.');
        if (charge.state === 'accepted') fail('Accepted charges cannot be overwritten. Keep the agreed financial history.');
        charge.allowedPaymentMethods = allowed; charge.quotationVersion = (charge.quotationVersion || 0) + 1;
        if (input.codAuthorized) charge.codAuthorizedAt = now;
        const amount = input.pricing === 'free' ? 0 : input.pricing === 'quoted' ? input.amountPiastres : null;
        if (input.pricing !== 'free' && (!Number.isSafeInteger(amount) || amount <= 0)) {
          Object.assign(charge, { amountPiastres: null, pricing: 'quote_required', state: 'pending', collectionMethod: null });
        } else Object.assign(charge, { amountPiastres: amount, pricing: input.pricing, state: 'offered', collectionMethod: input.collectionMethod, quotedAt: now });
        event = 'charge_quoted';
      } else if (input.action === 'accept_charge') {
        const charge = charges.find(value => value.id === input.chargeId);
        if (closed || !charge || charge.state !== 'offered') fail('This quotation is not awaiting acceptance.');
        if (admin && (!input.customerConfirmed || !input.reason)) fail('Record actual customer confirmation before accepting this charge.');
        const method = input.method || charge.collectionMethod;
        if (!charge.allowedPaymentMethods?.includes(method)) fail('Choose one of the saved quotation payment methods.');
        Object.assign(charge, { acceptedQuotationVersion: charge.quotationVersion, collectionMethod: method, acceptanceChannel: admin ? 'whatsapp' : 'website', acceptanceNote: admin ? input.reason : null, state: input.accepted ? 'accepted' : 'declined', acceptedAt: now, acceptedBy: admin ? 'admin' : 'customer' });
        event = 'charge_accepted';
      } else if (input.action === 'submit_proof') {
        if (order.orderChannel === 'owner_quotation' || order.paymentMethod !== 'instapay' || closed) fail('This order cannot accept an InstaPay proof. Contact the store for reconciliation.');
        if (order.proofHistory.length >= 30) fail('Proof history requires administrator review.');
        const upload = await Upload.findOne({ _id: input.uploadId, owner, purpose: 'payment_proof', proofOrderId: order._id }).session(session).select('_id').lean();
        if (!upload) fail('Proof does not belong to this order and shopping session.');
        await validateUploadReferences([input.uploadId], owner, { purpose: 'payment_proof', session });
        await retainUploads([input.uploadId], owner, order._id, { session });
        proofIds = [...new Set([...order.uploadIds.map(String), input.uploadId])];
        order.paymentProofId = input.uploadId; order.proofReviewRequired = true;
        order.proofHistory.push({ uploadId: input.uploadId, at: now, state: 'submitted' });
        if (!['paid', 'refunded'].includes(order.paymentState)) order.paymentState = 'awaiting_verification';
        event = 'proof_submitted';
      } else if (input.action === 'reject_proof') {
        if (!order.paymentProofId || order.proofHistory.at(-1)?.state !== 'submitted') fail('No current proof awaits review.');
        order.proofHistory.push({ uploadId: order.paymentProofId, at: now, state: 'rejected' });
        order.proofReviewRequired = false;
        const collected = accountingSummary(order, entries).merchandiseCollectedPiastres;
        if (collected < order.totals.totalPiastres) order.paymentState = collected > 0 ? 'partially_paid' : 'rejected'; publicReason = input.publicReason || 'Payment evidence requires attention. Contact the store before making another transfer.'; event = 'payment_rejected';
      } else if (['collection', 'refund'].includes(input.action)) {
        if (!input.reconciled) fail('Confirm the actual receiving/refund account or COD collection before recording money.');
        const charge = charges.find(value => value.id === input.scope);
        const combined = input.action === 'collection' && input.scope === 'all_agreed';
        if (input.action === 'collection' && (combined || input.scope === 'merchandise') && order.orderChannel !== 'owner_quotation' && order.paymentMethod === 'instapay' && !order.paymentProofId && !(closed && input.exceptionConfirmed)) fail('Ordinary website InstaPay orders require their secure order-bound proof before initial verification. Late closed-order funds need explicit exception reconciliation.');
        if (input.action === 'collection' && !combined && input.scope !== 'merchandise' && charge?.state !== 'accepted') fail('Additional money requires an accepted, separately recorded charge.');
        const method = input.scope === 'merchandise' ? order.paymentMethod : charge?.collectionMethod;
        if (input.action === 'collection' && !combined && input.method !== method && !input.exceptionConfirmed) fail('Actual collection differs from the agreement. Explicitly reconcile the exception without rewriting the agreed method.');
        if (input.action === 'collection' && input.method === 'cod' && !['out_for_delivery', 'delivered', 'delivery_failed'].includes(order.fulfillmentState)) fail('Record COD only after dispatch and actual collection.');
        let refundOf;
        let allocations = [{ scope: input.scope, amountPiastres: input.amountPiastres }];
        if (input.action === 'refund') {
          refundOf = entries.find(entry => String(entry._id) === input.refundOf && entry.direction === 'collection');
          allocations = input.allocations || allocations; // Legacy single-scope commands remain valid.
          if (!refundOf || !Array.isArray(allocations) || !allocations.length || allocations.length > 31
            || new Set(allocations.map(part => part.scope)).size !== allocations.length
            || allocations.some(part => typeof part.scope !== 'string' || !part.scope || part.scope.length > 80 || !Number.isSafeInteger(part.amountPiastres) || part.amountPiastres <= 0)
            || sum(allocations.map(part => part.amountPiastres)) !== input.amountPiastres) fail('Refund allocations must be distinct positive amounts that exactly match the actual refund transfer.');
          for (const part of allocations) {
            const returned = sum(entries.filter(entry => String(entry.refundOf) === input.refundOf).map(entry => allocation(entry, part.scope)));
            if (part.amountPiastres > allocation(refundOf, part.scope) - returned) fail('Refund must reference an actual collection allocation and cannot exceed its remaining amount.');
          }
        }
        if (combined) {
          const summary = accountingSummary(order, entries), scopes = [{ scope: 'merchandise', method: order.paymentMethod, due: Math.max(0, summary.merchandisePayablePiastres - summary.merchandiseCollectedPiastres) }, ...summary.charges.filter(value => value.state === 'accepted').map(value => ({ scope: value.id, method: value.collectionMethod, due: value.outstandingPiastres }))];
          let remaining = input.amountPiastres; allocations = [];
          for (const scope of scopes) {
            if (!remaining) break;
            if (scope.method !== input.method && !input.exceptionConfirmed) continue;
            const amountPiastres = Math.min(remaining, scope.due);
            if (amountPiastres) { allocations.push({ scope: scope.scope, amountPiastres }); remaining -= amountPiastres; }
          }
          if (remaining && input.method !== order.paymentMethod && !input.exceptionConfirmed) fail('Unallocated excess uses a different method; explicitly reconcile it as an exception.');
          if (remaining) allocations.push({ scope: 'merchandise', amountPiastres: remaining }); // Explicit overpayment credit remains visible.
          allocations = [...allocations.reduce((parts, part) => {
            parts.set(part.scope, checkedMoney((parts.get(part.scope) || 0) + part.amountPiastres)); return parts;
          }, new Map())].map(([scope, amountPiastres]) => ({ scope, amountPiastres }));
        }
        if (entries.length >= 200) fail('Settlement history requires specialist reconciliation.');
        const reference = input.reference.trim().toUpperCase();
        const [entry] = await OrderSettlement.create([{ orderId: id, operationKey: input.operationKey, requestHash: fingerprint(input), direction: input.action, scope: input.action === 'collection' ? input.scope : allocations.length > 1 ? 'all_allocated' : allocations[0].scope,
          allocations, reducePayable: input.action === 'refund' && input.reducePayable === true,
          amountPiastres: input.amountPiastres, method: input.method, reference, referenceKey: fingerprint({ method: input.method, reference }),
          refundOf: refundOf?._id, recordedBy: actor._id, reason: input.reason }], { session });
        entries.push(entry.toObject());
        const financial = accountingSummary(order, entries), net = financial.merchandiseCollectedPiastres;
        if (order.orderChannel === 'owner_quotation') {
          const remaining = Math.max(0, financial.merchandisePayablePiastres - net) + financial.charges.filter(charge => charge.state === 'accepted').reduce((amount, charge) => amount + charge.outstandingPiastres, 0);
          const received = financial.collectedPiastres - financial.refundedPiastres;
          order.paymentState = input.action === 'refund' && received === 0 ? 'refunded' : remaining === 0 ? 'paid' : received > 0 ? 'partially_paid' : order.paymentState;
        } else order.paymentState = input.action === 'refund' && allocations.some(part => part.scope === 'merchandise') && net === 0 ? 'refunded' : net >= financial.merchandisePayablePiastres ? 'paid' : net > 0 ? 'partially_paid' : order.paymentState;
        if (input.action === 'collection') order.proofReviewRequired = false;
        event = input.action === 'refund' ? 'refund_recorded' : 'payment_confirmed';
      } else if (input.action === 'request_cancel') {
        if (!['received', 'confirmed'].includes(order.fulfillmentState)) fail('Contact the store to review cancellation or return after preparation begins.');
        order.cancellationRequestedAt ||= now; event = 'cancellation_requested';
      } else if (input.action === 'cancel') {
        if (!['received', 'confirmed', 'preparing'].includes(order.fulfillmentState)) fail('Dispatched orders need delivery/return reconciliation.');
        if (order.paymentMethod === 'instapay' && !input.reconciled) fail('Reconcile potentially received transfers before cancellation.');
        if (order.fulfillmentState === 'preparing') {
          if (!input.inspected || input.quantities?.length !== order.inventoryClaims.length) fail('Work has started. Inspect and record the actual resellable units before cancellation.');
          const claims = order.inventoryClaims.map((claim, index) => {
            const quantity = input.quantities[index];
            if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > claim.quantity) fail('Use actual resellable quantities within the allocated stock.');
            return { ...claim, quantity };
          }).filter(claim => claim.quantity > 0);
          const returned = { inventoryClaims: claims, restockedAt: null }; await restockInventory(returned, session); order.restockedAt = returned.restockedAt;
        } else await restockInventory(order, session);
        order.fulfillmentState = 'cancelled'; event = 'cancelled'; publicReason = input.publicReason || 'Order cancelled after review. Contact the store about any refund reconciliation.';
      } else if (input.action === 'inventory_return') {
        if (!['returned', 'delivery_failed'].includes(order.fulfillmentState) || order.restockedAt || !input.inspected || input.quantities?.length !== order.inventoryClaims.length) fail('Inspect returned goods and record every inventory claim before reconciliation.');
        const claims = order.inventoryClaims.map((claim, index) => {
          const quantity = input.quantities[index];
          if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > claim.quantity) fail('Return quantities cannot exceed the original allocated quantities.');
          return { ...claim, quantity };
        }).filter(claim => claim.quantity > 0);
        const returned = { inventoryClaims: claims, restockedAt: null }; await restockInventory(returned, session); order.restockedAt = returned.restockedAt;
        event = 'inventory_reconciled';
      } else if (input.action === 'release_discount') {
        if (!['cancelled', 'returned'].includes(order.fulfillmentState)) fail('Discount reversal needs a cancelled or returned order and explicit policy review.');
        const redemptions = await DiscountRedemption.find({ orderId: id, reversedAt: null }).session(session);
        if (!redemptions.length) fail('No active discount redemption remains to reverse.');
        for (const redemption of redemptions) {
          if (!(await DiscountCode.updateOne({ _id: redemption.discountId, usedCount: { $gte: 1 } }, { $inc: { usedCount: -1, __v: 1 } }, { session })).matchedCount) fail('Discount source changed; reconcile before releasing usage.');
          await DiscountRedemption.updateOne({ _id: redemption._id, reversedAt: null }, { $set: { reversedAt: now } }, { session });
        }
        event = 'discount_reversed';
      } else fail('Unsupported accounting operation.');
      const changedCharge = ['quote_charge', 'accept_charge'].includes(input.action) ? charges.find(charge => charge.id === input.chargeId) || charges.at(-1) : null;
      const history = { at: now, event, actor: admin ? `admin:${actor._id}` : 'customer', publicReason,
        ...(admin ? { internalNote: input.reason || '', actionDetails: { action: input.action, chargeId: changedCharge?.id || input.chargeId,
          amountPiastres: changedCharge ? changedCharge.amountPiastres : input.amountPiastres, quotationVersion: changedCharge?.quotationVersion,
          collectionMethod: changedCharge?.collectionMethod, allowedPaymentMethods: changedCharge?.allowedPaymentMethods,
          pricing: changedCharge?.pricing, accepted: input.accepted, acceptanceChannel: changedCharge?.acceptanceChannel, codAuthorized: input.codAuthorized,
          quantities: input.quantities, allocations: input.allocations, reducePayable: input.reducePayable, exceptionConfirmed: input.exceptionConfirmed } } : {}) };
      order.charges = charges;
      const update = { proofReviewRequired: order.proofReviewRequired, financialSummary: accountingSummary(order, entries), charges, paymentState: order.paymentState, fulfillmentState: order.fulfillmentState, restockedAt: order.restockedAt,
        cancellationRequestedAt: order.cancellationRequestedAt, paymentProofId: order.paymentProofId, proofHistory: order.proofHistory, ...(proofIds ? { uploadIds: proofIds } : {}) };
      if (!(await Order.updateOne({ _id: id, revision: input.revision }, { $set: update, $inc: { revision: 1 }, $push: { history } }, { session, runValidators: true })).matchedCount) fail('Order changed. Reload before saving.');
      Object.assign(order, update); order.history.push(history); order.revision++;
      if (admin) await recordAdminAudit(actor, { action: `order.${input.action}`, resourceType: 'order', resourceId: order._id, details: { revision: order.revision } }, { session });
      await enqueueOrderEvent(order, event, { session, eventVersion: order.revision });
      if (order.paymentState === 'paid' && order.paymentMethod === 'instapay') await recordOrderTracking(order, { session });
      result = order.toObject();
    });
  } catch (error) {
    if (error.code === 11000 && input.operationKey) {
      const existing = await OrderSettlement.findOne({ orderId: id, operationKey: input.operationKey, requestHash: fingerprint(input) }).lean();
      if (existing) return Order.findById(id).lean();
    }
    if (error.code === 11000) throw commerceError(409, 'PAYMENT_REFERENCE_USED', 'This transfer/reference or operation is already recorded. Reconcile the existing entry; do not collect again.');
    throw error;
  } finally { await session.endSession(); }
  return result;
}
