import { Order } from '../models/Order.js';
import { OrderSettlement } from '../models/OrderSettlement.js';
import { User } from '../models/User.js';
import { presentOrderSummary } from '../commerce/order-presentation.js';
import { ownerOrderView } from '../commerce/order-list.js';
import { commerceError } from '../commerce/errors.js';

const TIMEOUT = 3000;
export async function ownerDashboard(now = new Date()) {
  const since = new Date(now.getTime() - 30 * 86400000);
  const [actionRequired, paymentReview, customers, newCustomers, recent] = await Promise.all([
    Order.countDocuments(ownerOrderView('requires_action')).maxTimeMS(TIMEOUT),
    Order.countDocuments(ownerOrderView('verification')).maxTimeMS(TIMEOUT),
    User.countDocuments({ role: 'customer' }).maxTimeMS(TIMEOUT),
    User.countDocuments({ role: 'customer', createdAt: { $gte: since, $lte: now } }).maxTimeMS(TIMEOUT),
    Order.find().select('_id orderNumber customer.name customer.governorate paymentMethod paymentState fulfillmentState totals accountingVersion financialSummary createdAt updatedAt revision lines.kind engraving.items.stage engraving.items.inCustody engraving.collectionAuthorized initialContactAt serviceRequestId responseState proofReviewRequired cancellationRequestedAt').sort({ createdAt: -1, _id: -1 }).limit(5).lean().maxTimeMS(TIMEOUT),
  ]);
  return { actionRequired, paymentReview, customers, newCustomers, customerActivitySince: since, until: now, recentOrders: recent.map(order => presentOrderSummary(order, { admin: true })) };
}

/** Actual dated settlements, separately from the cohort of orders placed. */
export async function ownerAnalytics(days = 30, now = new Date()) {
  if (![7, 30, 90].includes(days)) throw commerceError(400, 'INVALID_PERIOD', 'Choose 7, 30 or 90 days.');
  const since = new Date(now.getTime() - days * 86400000);
  const period = { createdAt: { $gte: since, $lte: now } };
  const [orders, settlements] = await Promise.all([
    Order.aggregate([{ $match: period }, { $facet: {
      totals: [{ $group: { _id: null, orders: { $sum: 1 }, paidOrders: { $sum: { $cond: [{ $eq: ['$paymentState', 'paid'] }, 1, 0] } }, legacyPaidPiastres: { $sum: { $cond: [{ $and: [{ $not: [{ $in: ['$accountingVersion', [1, 2]] }] }, { $eq: ['$paymentState', 'paid'] }] }, '$totals.totalPiastres', 0] } } } }],
      statuses: [{ $group: { _id: '$fulfillmentState', count: { $sum: 1 } } }, { $sort: { _id: 1 } }],
      daily: [{ $group: { _id: { $dateToString: { date: '$createdAt', format: '%Y-%m-%d', timezone: 'Africa/Cairo' } }, orders: { $sum: 1 } } }, { $sort: { _id: 1 } }],
      products: [{ $unwind: '$lines' }, { $match: { 'lines.kind': { $nin: ['gift_box_v2', 'engraving_service_v1', 'engraving_service_v2'] } } }, { $group: { _id: { id: '$lines.productId', name: '$lines.name' }, units: { $sum: '$lines.quantity' } } }, { $sort: { units: -1, '_id.id': 1 } }, { $limit: 5 }],
    } }]).option({ maxTimeMS: TIMEOUT }),
    OrderSettlement.aggregate([{ $match: period }, { $facet: {
      totals: [{ $group: { _id: '$direction', amountPiastres: { $sum: '$amountPiastres' } } }],
      daily: [{ $group: { _id: { date: { $dateToString: { date: '$createdAt', format: '%Y-%m-%d', timezone: 'Africa/Cairo' } }, direction: '$direction' }, amountPiastres: { $sum: '$amountPiastres' } } }, { $sort: { '_id.date': 1 } }],
    } }]).option({ maxTimeMS: TIMEOUT }),
  ]);
  const orderData = orders[0] || {}, settlementData = settlements[0] || {};
  const summary = orderData.totals?.[0] || {};
  const collectionsPiastres = settlementData.totals?.find(entry => entry._id === 'collection')?.amountPiastres || 0;
  const refundsPiastres = settlementData.totals?.find(entry => entry._id === 'refund')?.amountPiastres || 0;
  const legacyPaidPiastres = summary.legacyPaidPiastres || 0;
  if (![collectionsPiastres, refundsPiastres, legacyPaidPiastres].every(Number.isSafeInteger)) throw commerceError(503, 'ANALYTICS_UNAVAILABLE', 'The totals could not be calculated safely.');
  const cairoDate = date => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Africa/Cairo' }).format(date);
  const dailyCounts = new Map((orderData.daily || []).map(entry => [entry._id, entry.orders]));
  const daily = [];
  for (let date = new Date(`${cairoDate(since)}T00:00:00Z`); date.toISOString().slice(0, 10) <= cairoDate(now); date = new Date(date.getTime() + 86400000)) {
    const key = date.toISOString().slice(0, 10);
    daily.push({ date: key, orders: dailyCounts.get(key) || 0 });
  }
  return { since, until: now, days, timezone: 'Africa/Cairo', orders: summary.orders || 0, paidOrders: summary.paidOrders || 0,
    collectionsPiastres, refundsPiastres, netCollectionsPiastres: collectionsPiastres - refundsPiastres, legacyPaidPiastres,
    statuses: (orderData.statuses || []).map(entry => ({ state: entry._id, count: entry.count })),
    daily,
    collectionsDaily: (settlementData.daily || []).map(entry => ({ date: entry._id.date, direction: entry._id.direction, amountPiastres: entry.amountPiastres })),
    products: (orderData.products || []).map(entry => ({ productId: entry._id.id ? String(entry._id.id) : null, name: entry._id.name || 'Historical product', units: entry.units })),
  };
}
