import { NotificationEvent } from '../models/NotificationEvent.js';
import { Order } from '../models/Order.js';
import { ServiceRequest } from '../models/ServiceRequest.js';
import { ownerSettings } from './owner-settings.js';
import { env } from '../config/env.js';
import { assertDatabaseWriteAllowed } from '../config/database-safety.js';
export { ownerSettings } from './owner-settings.js';

export const HOUR = 3600000;
export function contactTiming(record, now = new Date()) {
  const submitted = new Date(record.createdAt), due = new Date(submitted.getTime() + 12 * HOUR);
  const closed = ['cancelled', 'delivered', 'returned'].includes(record.fulfillmentState) || ['cancelled', 'declined'].includes(record.state);
  const contacted = Boolean(record.initialContactAt);
  return { submittedAt: submitted, reminderAt: new Date(submitted.getTime() + 9 * HOUR), dueAt: due, contactedAt: record.initialContactAt || null,
    overdue: !contacted && !closed && now >= due, remainingMs: Math.max(0, due - now), closed };
}
const actionEvents = new Set(['proof_submitted', 'request_accepted', 'charge_accepted', 'payment_rejected', 'cancellation_requested', 'delivery_failed', 'returned']);
export async function enqueueOwnerEvents(record, source, event, { session, eventVersion = 1 } = {}) {
  const config = ownerSettings(); if (!config.enabled) return;
  // A converted bespoke order keeps the original request's contact obligation.
  const isNew = event === 'order_received' || event === 'request_received';
  if (isNew && source === 'order' && record.serviceRequestId) return;
  const paymentException = event === 'payment_confirmed' && (record.paymentState !== 'paid' || record.financialSummary?.overpaymentPiastres > 0 || record.financialSummary?.refundReviewRequired);
  if (!isNew && !actionEvents.has(event) && !paymentException) return;
  assertDatabaseWriteAllowed(NotificationEvent.db, env);
  const created = new Date(record.createdAt || Date.now());
  const snapshot = { source, reference: source === 'order' ? record.orderNumber : record.reference, service: record.service || record.lines?.[0]?.customization?.kind || 'regular_order', phone: record.customer?.phone,
    submittedAt: created.toISOString(), dueAt: new Date(created.getTime() + 12 * HOUR).toISOString(), action: paymentException ? 'payment_exception' : event, items: (record.lines || []).slice(0, 3).map(line => ({ name: String(line.name || '').slice(0, 160), quantity: line.quantity })),
    ...(Number.isSafeInteger(record.totals?.totalPiastres) ? { merchandisePiastres: record.totals.totalPiastres } : {}) };
  // The three-hour warning lives in the admin bell. No scheduled reminder email.
  const events = isNew ? [['owner_new', created]] : [['owner_action', new Date()]];
  for (const [type, at] of events) {
    const eventKey = `owner:${source}:${record._id}:${isNew ? type : `${event}:${eventVersion}`}`;
    await NotificationEvent.updateOne({ eventKey }, { $setOnInsert: { eventKey, [source === 'order' ? 'orderId' : 'requestId']: record._id,
      event: type, audience: 'owner', recipient: config.recipient, snapshot, state: 'queued', attempts: 0, nextAttemptAt: at } }, { upsert: true, session });
  }
}
export async function ownerEventEligible(event, now) {
  if (event.audience !== 'owner') return true;
  const config = ownerSettings();
  if (!config.enabled || event.recipient !== config.recipient) return false;
  // Never send legacy queued reminder emails from earlier deployments.
  if (event.event === 'owner_contact_reminder') return false;
  if (event.event !== 'owner_new') return true;
  const Model = event.requestId ? ServiceRequest : Order;
  const record = await Model.findById(event.requestId || event.orderId).select('createdAt initialContactAt fulfillmentState state orderId').lean().maxTimeMS(3000);
  if (!record) return false;
  if (record.orderId) {
    const order = await Order.findById(record.orderId).select('fulfillmentState').lean().maxTimeMS(3000);
    if (!order || ['cancelled', 'delivered', 'returned'].includes(order.fulfillmentState)) return false;
  }
  const timing = contactTiming(record, now);
  return !timing.closed && now < timing.dueAt && (event.event !== 'owner_contact_reminder' || !timing.contactedAt && now >= timing.reminderAt);
}
