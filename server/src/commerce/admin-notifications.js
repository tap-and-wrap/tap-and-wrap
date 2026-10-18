import { Order } from '../models/Order.js';
import { ServiceRequest } from '../models/ServiceRequest.js';
import { User } from '../models/User.js';

const HOUR = 60 * 60 * 1000;
const MAX_PAGE = 200;

/** These are calculated from existing records; email delivery is not required. */
export function buildInboxPipeline({ page = 1, limit = 20, view = 'all', seenAt = null, now = new Date() } = {}) {
  if (!Number.isSafeInteger(page) || page < 1 || page > MAX_PAGE || !Number.isSafeInteger(limit) || limit < 1 || limit > 20
    || !['all', 'unread', 'orders', 'requests', 'followups'].includes(view)) throw new Error('Invalid notification page or filter.');
  const order = { $project: { kind: { $literal: 'order' }, reference: '$orderNumber', createdAt: 1, updatedAt: 1, initialContactAt: 1,
    state: '$fulfillmentState', paymentState: 1, proofReviewRequired: 1, responseState: 1, service: { $literal: '' } } };
  const request = { $project: { kind: { $literal: 'request' }, reference: 1, createdAt: 1, updatedAt: 1, initialContactAt: 1,
    state: 1, service: 1, responseState: 1, paymentState: { $literal: '' }, proofReviewRequired: { $literal: false } } };
  const active = { $and: [
    { $not: [{ $in: ['$state', ['cancelled', 'declined', 'delivered', 'returned']] }] },
    { $eq: [{ $ifNull: ['$initialContactAt', null] }, null] },
  ] };
  const followupTime = { $add: ['$createdAt', 9 * HOUR] };
  const overdueTime = { $add: ['$createdAt', 12 * HOUR] };
  const restrictedView = view === 'all' ? [] : view === 'unread' ? [{ $match: { unread: true } }]
    : view === 'followups' ? [{ $match: { followup: { $ne: 'none' } } }]
      : [{ $match: { kind: view === 'orders' ? 'order' : 'request' } }];
  return [
    { $match: { serviceRequestId: null } }, order,
    { $unionWith: { coll: ServiceRequest.collection.name, pipeline: [request] } },
    { $set: { reminderAt: followupTime, dueAt: overdueTime, activeContact: active } },
    { $set: { followup: { $cond: [
      { $and: ['$activeContact', { $lte: ['$dueAt', now] }] }, 'overdue',
      { $cond: [{ $and: ['$activeContact', { $lte: ['$reminderAt', now] }] }, 'soon', 'none'] },
    ] } } },
    { $set: { notificationAt: { $max: [
      { $ifNull: ['$updatedAt', '$createdAt'] },
      { $cond: [{ $eq: ['$followup', 'soon'] }, '$reminderAt', '$createdAt'] },
      { $cond: [{ $eq: ['$followup', 'overdue'] }, '$dueAt', '$createdAt'] },
    ] } } },
    { $set: { unread: { $gt: ['$notificationAt', seenAt || new Date(0)] } } },
    { $facet: {
      records: [...restrictedView, { $sort: { notificationAt: -1, _id: -1 } }, { $skip: (page - 1) * limit }, { $limit: limit },
        { $project: { kind: 1, reference: 1, createdAt: 1, notificationAt: 1, unread: 1, followup: 1, state: 1,
          service: 1, paymentState: 1, proofReviewRequired: 1, responseState: 1 } }],
      count: [...restrictedView, { $count: 'total' }],
      unread: [{ $match: { unread: true } }, { $count: 'total' }],
    } },
  ];
}

export function presentInboxRecord(item) {
  const kind = item.kind === 'request' ? 'request' : 'order';
  const reference = String(item.reference || '');
  const followup = item.followup === 'overdue' ? 'overdue' : item.followup === 'soon' ? 'soon' : 'none';
  const name = kind === 'order' ? `Order #${reference}` : `Request ${reference}`;
  const title = followup === 'overdue' ? `Follow-up overdue · ${name}` : followup === 'soon' ? `Follow-up due soon · ${name}`
    : item.proofReviewRequired || item.paymentState === 'awaiting_verification' ? `Payment review · ${name}`
      : kind === 'request' ? (item.service === 'gift_box' ? 'Gift Box request' : item.service === 'laser_engraving' ? 'Engraving request' : 'Custom request') : 'Order update';
  return { id: `${kind}:${String(item._id)}`, kind, reference, title, unread: item.unread === true, followup,
    at: item.notificationAt, href: kind === 'request' ? `/admin/requests/${item._id}` : `/admin/commerce/orders/${item._id}`,
    detail: `${name} · ${String(item.state || '').replaceAll('_', ' ')}` };
}

export async function readAdminInbox({ adminId, page = 1, limit = 20, view = 'all', now = new Date() }) {
  const user = await User.findOne({ _id: adminId, role: 'admin', active: true }).select('adminNotificationSeenAt').lean().maxTimeMS(3000);
  if (!user) return null;
  const [result] = await Order.aggregate(buildInboxPipeline({ page, limit, view, seenAt: user.adminNotificationSeenAt, now })).option({ maxTimeMS: 3000 });
  return { notifications: result.records.map(presentInboxRecord), unreadCount: result.unread[0]?.total || 0,
    pagination: { page, total: result.count[0]?.total || 0, pages: Math.ceil((result.count[0]?.total || 0) / limit) }, serverNow: now };
}
