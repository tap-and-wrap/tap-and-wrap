import { isEngravingKind } from '../../../shared/engraving/definitions.mjs';
import { upfrontEngravingPayment } from '../../../shared/engraving/definitions.mjs';
import { groupedOrder, groupedPaymentState, engravingWorkAllowed, overallFulfillment } from '../commerce/payment-groups.js';
import { z } from 'zod';
import mongoose from 'mongoose';
import { Order } from '../models/Order.js';
import { env } from '../config/env.js';
import { assertDatabaseWriteAllowed } from '../config/database-safety.js';
import { recordAdminAudit } from '../commerce/audit.js';
import { enqueueOrderEvent } from '../commerce/notifications.js';
import { fingerprint } from '../commerce/pricing.js';
import { commerceError } from '../commerce/errors.js';
import { accountingSummary } from '../commerce/order-accounting.js';
import { OrderSettlement } from '../models/OrderSettlement.js';
import { isEngravingOrder } from './payment-policy.js';
const note = z.string().trim().max(1000);
export const workflowInput = z.object({ revision: z.number().int().nonnegative(), operationKey: z.uuid(), itemKey: z.uuid().optional(),
  action: z.enum(['receive','inspect','clarify','unsuitable','propose','accept','authorize_payment','accept_cod','start','complete','arrange_return','dispatch_return','return_to_customer']),
  collectionMethod: z.enum(['cod','instapay']).optional(), codAuthorized: z.boolean().optional(),
  condition: note.optional(), accessories: note.optional(), internalNote: note.optional(), publicReason: note.optional(), placementId: z.string().max(80).optional(), placementLabel: z.string().trim().min(1).max(120).optional(), customerConfirmed: z.boolean().optional(), proposalVersion: z.number().int().positive().optional(),
}).strict();
const fail = message => { throw commerceError(409, 'ENGRAVING_WORKFLOW_CONFLICT', message); };
export function initialEngravingWorkflow(lines) {
  return { version: 1, collectionAuthorized: false, operations: [], items: lines.filter(line => isEngravingKind(line.kind)).map(line => ({ itemKey: line.specification.itemKey, stage: 'awaiting_customer_item', inCustody: false, inspectionApproved: false, proposal: null, history: [] })) };
}
export async function engravingAction(id, raw, actor, owner = null) {
  const input = workflowInput.parse(raw), admin = actor?.role === 'admin' && actor.active !== false;
  if (!admin && !['accept','accept_cod'].includes(input.action)) throw commerceError(403, 'ADMIN_REQUIRED', 'Administrator authorization required.');
  let result;
  assertDatabaseWriteAllowed(Order.db, env);
  await mongoose.connection.transaction(async session => {
    const order = await Order.findOne({ _id: id, ...(admin ? {} : { owner }) }).session(session).lean();
    if (!order || !isEngravingOrder(order) || !order.engraving) throw commerceError(404, 'ORDER_NOT_FOUND', 'Engraving order not found.');
    const entries = await OrderSettlement.find({ orderId: order._id }).session(session).lean();
    const workflow = structuredClone(order.engraving), hash = fingerprint(input);
    const previous = workflow.operations.find(operation => operation.key === input.operationKey);
    if (previous) { if (previous.hash !== hash) fail('This operation key belongs to another action.'); result = order; return; }
    if (order.revision !== input.revision) throw commerceError(409, 'ORDER_CHANGED', 'The order changed. Your draft is retained; reload before saving.');
    const custodyAction = ['receive','arrange_return','dispatch_return','return_to_customer'].includes(input.action);
    // Bound clarification/work receipts without preventing documentation of
    // actual possession or return. Custody actions have finite stage transitions.
    if (workflow.operations.length >= 1000 && !custodyAction) fail('This order requires operational review before further actions.');
    const item = workflow.items.find(value => value.itemKey === input.itemKey), line = order.lines.find(value => value.engraving?.specification.itemKey === input.itemKey);
    const closed = ['cancelled','returned','delivery_failed'].includes(order.fulfillmentState);
    const at = new Date();
    let paymentState = order.paymentState, fulfillmentState = order.fulfillmentState;
    if (input.action === 'authorize_payment') {
      if (closed || workflow.collectionAuthorized || workflow.items.some(value => !value.inCustody || !value.inspectionApproved || value.stage !== 'final_design_confirmed' || !value.proposal?.acceptedAt)) fail('Every physical item must be inspected and its final specification accepted before payment authorization.');
      workflow.collectionAuthorized = true; workflow.authorizedAt = at; workflow.authorizedBy = String(actor._id);
      if (groupedOrder(order)) {
        if (upfrontEngravingPayment(order) && input.collectionMethod && input.collectionMethod !== order.paymentMethod) fail('Keep the accepted checkout payment method. A work approval cannot change an accepted financial arrangement.');
        const method = input.collectionMethod || order.paymentGroups.find(group => group.id === 'engraving').method;
        if (method === 'cod' && (!input.codAuthorized || !input.internalNote)) fail('Explicit owner authorization and agreement evidence are required before offering engraving COD.');
        workflow.collectionMethod = method;
        if (method === 'cod') workflow.codCommitment = {ownerAuthorizedAt:at, ownerAuthorizedBy:String(actor._id), offeredAt:at, customerAccepted:input.customerConfirmed === true, ...(input.customerConfirmed ? {acceptedAt:at, channel:'admin_recorded_customer', privateEvidence:input.internalNote} : {})};
      } else paymentState = 'awaiting_transfer';
    } else if (input.action === 'accept_cod') {
      if (!groupedOrder(order) || closed || !workflow.collectionAuthorized || workflow.collectionMethod !== 'cod' || !workflow.codCommitment?.ownerAuthorizedAt || !input.customerConfirmed || admin && !input.internalNote) fail('Accept the current owner-authorized COD arrangement after design approval.');
      if (!workflow.codCommitment.customerAccepted) Object.assign(workflow.codCommitment, {customerAccepted:true, acceptedAt:at, channel:admin ? 'admin_recorded_customer' : 'website', ...(admin ? {privateEvidence:input.internalNote} : {})});
    } else {
      if (!item || !line) fail('Select an item from this order.');
      const returns = ['arrange_return','dispatch_return','return_to_customer'].includes(input.action);
      // A cancelled order cannot stop an already-sent customer item arriving.
      // Record actual receipt, then permit safe return; never reopen paid work.
      if (closed && !returns && input.action !== 'receive') fail('This order is closed. Preserve custody and use the safe return actions.');
      if (input.action === 'receive') {
        if (item.stage !== 'awaiting_customer_item' || !input.condition) fail('Record condition when receiving the physical item.');
        Object.assign(item, { stage: 'item_received', inCustody: true, receivedAt: at, condition: input.condition, accessories: input.accessories || '' });
      } else if (input.action === 'inspect') {
        if (!item.inCustody || !['item_received','needs_clarification'].includes(item.stage)) fail('Receive the item before inspection.');
        item.stage = 'inspection_pending';
      } else if (['clarify','unsuitable'].includes(input.action)) {
        if (workflow.collectionAuthorized || !item.inCustody || !['inspection_pending','needs_clarification','final_design_proposed','final_design_confirmed'].includes(item.stage) || !input.publicReason) fail('Record the inspection outcome before payment authorization.');
        item.stage = input.action === 'clarify' ? 'needs_clarification' : 'unsuitable'; item.inspectionApproved = false; item.proposal = null;
      } else if (input.action === 'propose') {
        if (workflow.collectionAuthorized || !item.inCustody || !['inspection_pending','needs_clarification','final_design_proposed','final_design_confirmed'].includes(item.stage)) fail('Inspect this item before proposing a final placement.');
        const placements = line.engraving.configuration.placements;
        const placement = placements.find(value => value.id === input.placementId && value.status === 'active');
        if (!placement && !(line.engraving.specification.placement.kind === 'help' && input.placementLabel)) fail('Choose a placement from the ordered configuration, or propose a clearly described location for a help request.');
        item.inspectionApproved = true; item.stage = 'final_design_proposed';
        item.proposalSequence = (item.proposalSequence || 0) + 1;
        item.proposal = { version: item.proposalSequence, placementId: placement?.id || null, placementLabel: placement?.label || input.placementLabel, specificationHash: fingerprint(line.engraving), proposedAt: at, publicDetails: input.publicReason || '' };
      } else if (input.action === 'accept') {
        if (workflow.collectionAuthorized || item.stage !== 'final_design_proposed' || input.proposalVersion !== item.proposal.version || !input.customerConfirmed || admin && !input.internalNote) fail('Record actual customer acceptance of the current final specification with private evidence.');
        item.proposal.acceptedAt = at; item.proposal.channel = admin ? 'admin_recorded_customer' : 'website';
        item.proposal.privateEvidence = admin ? input.internalNote : null; item.stage = 'final_design_confirmed';
      } else if (input.action === 'start') {
        if (closed || !workflow.collectionAuthorized || !engravingWorkAllowed(order, accountingSummary(order, entries)) || !item.inCustody || item.stage !== 'final_design_confirmed') fail('Verify payment and final design before engraving.');
        item.stage = 'engraving_in_progress'; fulfillmentState = 'preparing';
      } else if (input.action === 'complete') {
        if (item.stage !== 'engraving_in_progress') fail('Start engraving before recording completion.');
        item.stage = 'engraving_completed';
      } else if (input.action === 'arrange_return') {
        if (!item.inCustody || !input.publicReason || ['return_arranged','return_dispatched','returned_to_customer'].includes(item.stage) || !(['engraving_completed','unsuitable'].includes(item.stage) || closed || item.stage === 'needs_clarification')) fail('Record the actual agreed return arrangement.');
        item.stage = 'return_arranged'; item.returnArrangement = input.publicReason;
      } else if (input.action === 'dispatch_return') {
        if (!item.inCustody || item.stage !== 'return_arranged') fail('Arrange the return before dispatch.');
        if (!closed && (order.charges || []).some(charge => ['pending','offered','declined'].includes(charge.state))) fail('Resolve agreed return charges, including explicit Free where applicable, before dispatch.');
        item.stage = 'return_dispatched'; item.dispatchedAt = at;
      } else if (input.action === 'return_to_customer') {
        if (!item.inCustody || !['return_arranged','return_dispatched'].includes(item.stage) || !input.publicReason) fail('Record the actual return to the customer.');
        if (!closed && (order.charges || []).some(charge => ['pending','offered','declined'].includes(charge.state))) fail('Resolve return charges before handoff.');
        item.stage = 'returned_to_customer'; item.inCustody = false; item.returnedAt = at;
        if (!closed && workflow.items.every(value => value.stage === 'returned_to_customer') && workflow.collectionAuthorized && order.paymentState === 'paid') fulfillmentState = 'delivered';
      }
      item.history.push({ action: input.action, at, publicReason: input.publicReason || '', ...(admin ? { internalNote: input.internalNote || '' } : {}) });
    }
    workflow.operations.push({ key: input.operationKey, hash });
    if (groupedOrder(order)) {
      const updated = {...order, engraving:workflow};
      paymentState = groupedPaymentState(updated, accountingSummary(updated, entries));
      fulfillmentState = overallFulfillment(updated);
    }
    const changed = await Order.updateOne({ _id: order._id, revision: input.revision }, { $set: { engraving: workflow, paymentState, fulfillmentState }, $inc: { revision: 1 }, $push: { history: { event: `engraving_${input.action}`, at, actor: admin ? `admin:${actor._id}` : 'customer', publicReason: input.publicReason || '' } } }, { session, runValidators: true });
    if (!changed.matchedCount) fail('The order changed. Reload before saving.');
    if (admin) await recordAdminAudit(actor, { action: `engraving.${input.action}`, resourceType: 'order', resourceId: String(order._id), details: { revision: input.revision + 1 } }, { session });
    result = { ...order, engraving: workflow, paymentState, fulfillmentState, revision: input.revision + 1 };
    result.financialSummary = accountingSummary(result, entries);
    if (!groupedOrder(order) && input.action === 'authorize_payment' && result.financialSummary.merchandiseCollectedPiastres > 0) result.paymentState = result.financialSummary.merchandiseCollectedPiastres >= order.totals.totalPiastres ? 'paid' : 'partially_paid';
    await Order.updateOne({ _id: order._id, revision: result.revision }, { $set: { financialSummary: result.financialSummary, paymentState: result.paymentState } }, { session });
    await enqueueOrderEvent(result, 'order_updated', { session, eventVersion: result.revision + 1 });
  });
  return result;
}
