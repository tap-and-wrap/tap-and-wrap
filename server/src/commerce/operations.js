import mongoose from 'mongoose';
import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { Order } from '../models/Order.js';
import { ServiceRequest } from '../models/ServiceRequest.js';
import { NotificationEvent } from '../models/NotificationEvent.js';
import { CommerceJobRun } from '../models/CommerceJobRun.js';
import { env } from '../config/env.js';
import { assertDatabaseWriteAllowed } from '../config/database-safety.js';
import { emailReadiness, emailSettings } from '../email/settings.js';
import { contactTiming, ownerSettings } from './owner-notifications.js';
import { commerceError } from './errors.js';
import { recordAdminAudit } from './audit.js';
import { whatsappQuotation } from './whatsapp-quotation.js';
import { requestWhatsapp } from './service-requests.js';
import { orderAccounting } from './order-accounting.js';

const objectId = z.string().regex(/^[a-f0-9]{24}$/i);
const kinds = z.enum(['order', 'request']);
const query = z.object({ page: z.coerce.number().int().min(1).max(200).default(1), view: z.enum(['all', 'initial', 'overdue', 'shipping', 'quote_preparation', 'quote_sharing', 'acceptance', 'payment_review', 'payment_pending', 'response']).default('all') }).strict();
const contactInput = z.object({ revision: z.number().int().nonnegative(), operationKey: z.uuid(), action: z.enum(['contact', 'quote_shared', 'requires_action', 'waiting_customer', 'clear']), note: z.string().trim().min(2).max(500) }).strict();
const modelFor = kind => kind === 'order' ? Order : ServiceRequest;
const closedOrders = ['cancelled', 'delivered', 'returned'];
const condition = (test, label) => ({ $cond: [test, [label], []] });
export async function attentionQueue(input, now = new Date()) {
  const normalized = { $project: { kind: { $literal: 'order' }, reference: '$orderNumber', createdAt: 1, initialContactAt: 1, lastQuotationSharedAt: 1, responseState: 1, revision: 1, customer: { name: '$customer.name', phone: '$customer.phone' }, paymentState: 1, fulfillmentState: 1, charges: 1, proofReviewRequired: 1, cancellationRequestedAt: 1, financialSummary: 1, state: { $literal: '' }, orderId: '$_id' } };
  const pipeline = [
    { $match: { serviceRequestId: null, fulfillmentState: { $nin: closedOrders } } }, normalized,
    { $unionWith: { coll: ServiceRequest.collection.name, pipeline: [
      { $match: { state: { $nin: ['cancelled', 'declined'] } } },
      { $lookup: { from: Order.collection.name, localField: 'orderId', foreignField: '_id', as: 'linked' } },
      { $set: { linked: { $arrayElemAt: ['$linked', 0] } } },
      { $match: { 'linked.fulfillmentState': { $nin: closedOrders } } },
      { $project: { kind: { $literal: 'request' }, reference: 1, createdAt: 1, initialContactAt: 1, responseState: 1, revision: 1, customer: { name: '$customer.name', phone: '$customer.phone' }, state: 1, orderId: 1, paymentState: '$linked.paymentState', fulfillmentState: '$linked.fulfillmentState', charges: '$linked.charges', proofReviewRequired: '$linked.proofReviewRequired', cancellationRequestedAt: '$linked.cancellationRequestedAt', financialSummary: '$linked.financialSummary' } },
    ] } },
    { $set: { offeredQuotes: { $filter: { input: { $ifNull: ['$charges', []] }, as: 'charge', cond: { $eq: ['$$charge.state', 'offered'] } } } } },
    { $set: { flags: { $concatArrays: [
      condition({ $not: [{ $ifNull: ['$initialContactAt', false] }] }, 'initial'),
      condition({ $and: [{ $not: [{ $ifNull: ['$initialContactAt', false] }] }, { $lte: ['$createdAt', new Date(now - 12 * 3600000)] }] }, 'overdue'),
      condition({ $gt: [{ $size: { $filter: { input: { $ifNull: ['$charges', []] }, as: 'charge', cond: { $and: [{ $eq: ['$$charge.kind', 'shipping'] }, { $ne: ['$$charge.state', 'accepted'] }] } } } }, 0] }, 'shipping'),
      condition({ $and: [{ $eq: ['$kind', 'request'] }, { $in: ['$state', ['submitted', 'needs_review']] }, { $not: [{ $ifNull: ['$orderId', false] }] }] }, 'quote_preparation'),
      condition({ $or: [{ $eq: ['$state', 'quote_prepared'] }, { $and: [{ $eq: ['$kind', 'order'] }, { $gt: [{ $size: '$offeredQuotes' }, 0] }, { $gt: [{ $max: '$offeredQuotes.quotedAt' }, { $ifNull: ['$lastQuotationSharedAt', new Date(0)] }] }] }] }, 'quote_sharing'), condition({ $or: [{ $eq: ['$state', 'quote_shared'] }, { $gt: [{ $size: '$offeredQuotes' }, 0] }] }, 'acceptance'),
      condition({ $or: [{ $eq: ['$paymentState', 'awaiting_verification'] }, { $eq: ['$proofReviewRequired', true] }, { $eq: ['$paymentState', 'rejected'] }, { $eq: ['$financialSummary.refundReviewRequired', true] }] }, 'payment_review'),
      condition({ $in: ['$paymentState', ['awaiting_transfer', 'partially_paid', 'unpaid']] }, 'payment_pending'),
      condition({ $or: [{ $eq: ['$responseState', 'requires_action'] }, { $gt: ['$cancellationRequestedAt', null] }] }, 'response'),
    ] } } },
    ...(input.view === 'all' ? [] : [{ $match: { flags: input.view } }]),
    { $sort: { createdAt: 1, _id: 1 } },
    { $facet: { records: [{ $skip: (input.page - 1) * 20 }, { $limit: 20 }, { $unset: ['charges', 'offeredQuotes', 'financialSummary'] }], count: [{ $count: 'total' }] } },
  ];
  const [result] = await Order.aggregate(pipeline).option({ maxTimeMS: 3000 });
  const total = result.count[0]?.total || 0;
  return { records: result.records.map(record => ({ ...record, id: String(record._id), timing: contactTiming(record, now), href: record.kind === 'request' ? `/admin/requests/${record._id}` : `/admin/commerce/orders/${record._id}` })), pagination: { page: input.page, total, pages: Math.ceil(total / 20) }, serverNow: now };
}
export async function recordContact(kind, id, input, actor, now = new Date()) {
  if (actor?.role !== 'admin' || actor.active === false) throw commerceError(403, 'ADMIN_REQUIRED', 'Administrator action required.');
  assertDatabaseWriteAllowed(Order.db, env);
  const Model = modelFor(kind), session = await mongoose.startSession();
  try { await session.withTransaction(async () => {
    const record = await Model.findById(id).session(session);
    if (!record) throw commerceError(404, 'NOT_FOUND', 'Record not found.');
    if (kind === 'order' && record.serviceRequestId) throw commerceError(409, 'SOURCE_REQUEST_REQUIRED', 'Record contact on the original custom request.');
    if (record.contactHistory?.some(entry => entry.operationKey === input.operationKey)) return;
    if (record.revision !== input.revision) throw commerceError(409, 'EDIT_CONFLICT', 'This record changed. Your note is retained; reload before saving.');
    if ((record.contactHistory?.length || 0) >= 100) throw commerceError(409, 'HISTORY_REVIEW_REQUIRED', 'Contact history needs review.');
    if (input.action === 'quote_shared' && (kind !== 'order' || !record.charges.some(charge => charge.state === 'offered'))) throw commerceError(409, 'QUOTE_REQUIRED', 'Save an offered charge before recording sharing. Use the request quotation workflow for bespoke requests.');
    const entry = { at: now, actor: String(actor._id), action: input.action, note: input.note, operationKey: input.operationKey };
    const values = { responseState: ['contact', 'quote_shared'].includes(input.action) ? 'waiting_customer' : input.action, ...(input.action === 'quote_shared' ? { lastQuotationSharedAt: now } : {}), ...(input.action === 'contact' && !record.initialContactAt ? { initialContactAt: now } : {}) };
    if (!(await Model.updateOne({ _id: id, revision: input.revision }, { $set: values, $push: { contactHistory: entry }, $inc: { revision: 1 } }, { session })).matchedCount) throw commerceError(409, 'EDIT_CONFLICT', 'Reload the changed record before saving.');
    if (input.action === 'contact') await NotificationEvent.updateMany({ [kind === 'order' ? 'orderId' : 'requestId']: id, event: 'owner_contact_reminder', state: { $in: ['queued', 'failed', 'processing'] }, dispatchStartedAt: { $exists: false } }, { $set: { state: 'suppressed', lastErrorCode: 'INITIAL_CONTACT_RECORDED' }, $unset: { leaseToken: 1, leaseUntil: 1 } }, { session });
    await recordAdminAudit(actor, { action: `communication.${input.action}`, resourceType: kind === 'order' ? 'order' : 'configuration', resourceId: id, details: { revision: input.revision + 1 } }, { session });
  }); } finally { await session.endSession(); }
}
export async function operationMessages(kind, record) {
  const reference = kind === 'order' ? `Order #${record.orderNumber}` : `Request ${record.reference}`;
  const phone = String(record.customer?.phone || '').replace(/\D/g, '').replace(/^0(?=1)/, '20');
  const linked = kind === 'request' && record.orderId ? await Order.findById(record.orderId).lean().maxTimeMS(3000) : null;
  const quote = kind === 'order' ? whatsappQuotation(record, await orderAccounting(record)) : requestWhatsapp(record);
  const paymentQuote = linked ? whatsappQuotation(linked, await orderAccounting(linked)) : quote;
  const accepted = kind === 'order' || Boolean(record.quotations?.at(-1)?.orderId);
  const payable = linked || record;
  const transferAvailable = payable.paymentMethod === 'instapay' || payable.charges?.some(charge => charge.state === 'accepted' && charge.collectionMethod === 'instapay');
  const settled = payable.paymentState === 'paid' && !(payable.financialSummary?.outstandingPiastres > 0);
  const messages = {
    initial: `Tap & Wrap | ${reference}\nThank you for your ${kind === 'order' ? 'order' : 'request'}. We are reviewing your details and will confirm delivery and any quotation with you. No pending charge is free or payable until confirmed and accepted.`,
    shipping: quote?.text || `${reference}\nDelivery: Pending Confirmation. We will confirm the fee separately for your acceptance.`,
    quotation: quote?.text || `${reference}\nYour quotation is being reviewed. No payment is requested yet.`,
    payment: accepted ? `${paymentQuote?.text || reference}\nUse only the agreed payment method and accepted amounts. ${transferAvailable ? `InstaPay: 01060673073. ${kind === 'order' && record.orderChannel !== 'owner_quotation' ? 'For website InstaPay, upload proof on your secure order page.' : 'Send the screenshot through WhatsApp.'} We independently reconcile actual funds; a screenshot alone does not confirm payment.` : 'Cash on Delivery remains unpaid until actual collection is recorded.'}` : `${reference}\nPlease wait for a saved quotation, your acceptance and a confirmed order reference before transferring.`,
    follow_up: `${reference}\nPlease let us know if you have already transferred or need assistance. Do not repeat a transfer because a screenshot or message failed. We check the receiving account before confirming payment.`,
    coordination: `Tap & Wrap | ${reference}\n${payable.fulfillmentState ? `Recorded fulfillment status: ${payable.fulfillmentState.replaceAll('_', ' ')}.` : 'We are coordinating your request.'} Please confirm a convenient time and your agreed delivery details.`,
  };
  if (settled) messages.payment = `Tap & Wrap | ${reference}\nYour recorded known balance is settled. Do not repeat a transfer. Any charges still pending confirmation must be separately confirmed and accepted before they become payable.`;
  return Object.entries(messages).map(([key, text]) => ({ key, text, url: /^201[0125][0-9]{8}$/.test(phone) ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}` : null }));
}
export const operationsRoutes = Router();
operationsRoutes.use((req, res, next) => { res.set({ 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' }); next(); });
operationsRoutes.get('/attention', async (req, res) => res.json({ ok: true, data: await attentionQueue(query.parse(req.query)) }));
operationsRoutes.get('/attention/:kind/:id', async (req, res) => {
  const kind = kinds.parse(req.params.kind), record = await modelFor(kind).findById(objectId.parse(req.params.id)).lean().maxTimeMS(3000);
  if (!record) throw commerceError(404, 'NOT_FOUND', 'Record not found.');
  res.json({ ok: true, data: { id: String(record._id), revision: record.revision, canRecordQuotationShared: kind === 'order' && record.charges.some(charge => charge.state === 'offered'), timing: contactTiming(record), contactHistory: record.contactHistory || [], messages: await operationMessages(kind, record) } });
});
operationsRoutes.post('/attention/:kind/:id/contact', rateLimit({ windowMs: 60000, limit: 30 }), async (req, res) => { await recordContact(kinds.parse(req.params.kind), objectId.parse(req.params.id), contactInput.parse(req.body), req.user); res.json({ ok: true, data: { recorded: true } }); });
operationsRoutes.get('/operations', async (req, res) => {
  const config = emailSettings(), owner = ownerSettings();
  const [counts, historicalHeld, lastRun, runs, events] = await Promise.all([
    NotificationEvent.aggregate([{ $group: { _id: '$state', count: { $sum: 1 } } }]).option({ maxTimeMS: 3000 }),
    NotificationEvent.countDocuments({ state: { $in: ['queued', 'failed'] }, ...(config.deliveryNotBefore ? { createdAt: { $lt: config.deliveryNotBefore } } : {}) }).maxTimeMS(3000),
    CommerceJobRun.findOne().sort({ startedAt: -1 }).select('state startedAt finishedAt').lean().maxTimeMS(3000),
    CommerceJobRun.find({ state: { $in: ['partial', 'interrupted', 'stopped'] } }).sort({ startedAt: -1 }).limit(10).select('state startedAt finishedAt').lean().maxTimeMS(3000),
    NotificationEvent.find({ state: { $in: ['failed', 'dead', 'uncertain'] } }).sort({ createdAt: -1 }).limit(20).select('event audience state attempts createdAt nextAttemptAt orderId requestId snapshot.reference snapshot.orderNumber snapshot.requestReference').lean().maxTimeMS(3000),
  ]);
  const safeEvents = events.map(({ snapshot, ...event }) => { const reference = snapshot?.reference || snapshot?.orderNumber || snapshot?.requestReference; return { ...event, reference: /^(?:[1-9][0-9]{5}|TW-[A-F0-9]{12})$/.test(reference || '') ? reference : null, href: event.requestId ? `/admin/requests/${event.requestId}` : event.orderId ? `/admin/commerce/orders/${event.orderId}` : null }; });
  res.json({ ok: true, data: { readiness: { ...emailReadiness(), ownerAlertsConfigured: owner.enabled, storageEnabled: process.env.STORAGE_ENABLED === 'true' }, counts: Object.fromEntries(counts.map(row => [row._id, row.count])), historicalHeld, lastRun, failedRuns: runs, events: safeEvents, serverNow: new Date() } });
});
operationsRoutes.post('/operations/notifications/:id/review', async (req, res) => {
  const input = z.object({ disposition: z.enum(['confirmed_delivered', 'closed_no_resend']), note: z.string().trim().min(5).max(500), confirmed: z.literal(true) }).strict().parse(req.body);
  const session = await mongoose.startSession(); assertDatabaseWriteAllowed(NotificationEvent.db, env);
  try { await session.withTransaction(async () => {
    const record = await NotificationEvent.findOne({ _id: objectId.parse(req.params.id), state: { $in: ['uncertain', 'dead'] } }).session(session);
    if (!record) throw commerceError(409, 'REVIEW_CHANGED', 'This delivery already changed. Reload diagnostics.');
    await NotificationEvent.updateOne({ _id: record._id, state: record.state }, { $set: { state: input.disposition === 'confirmed_delivered' ? 'sent' : 'suppressed', lastErrorCode: 'OPERATOR_REVIEWED' }, $unset: { sealedActionToken: 1, leaseUntil: 1, leaseToken: 1 } }, { session });
    await recordAdminAudit(req.user, { action: `notification.${input.disposition}`, resourceType: 'configuration', resourceId: record._id, details: {} }, { session });
    // Evidence stays private in the notification record, never in generic logs/audits.
    await NotificationEvent.updateOne({ _id: record._id }, { $set: { review: { at: new Date(), by: String(req.user._id), note: input.note, disposition: input.disposition } } }, { session });
  }); } finally { await session.endSession(); }
  res.json({ ok: true, data: { reviewed: true, resent: false } });
});
