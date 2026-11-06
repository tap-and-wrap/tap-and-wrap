import { giftBoxFixture } from './gift-box-fixtures.js';
import { commerceOrder } from './commerce-fixtures.js';
import { INITIAL_ENGRAVING_TYPES, FONT_REGISTRY, ICON_REGISTRY } from '../../shared/engraving/definitions.mjs';

export const ownerOrders = ['product', 'gift_box', 'engraving', 'mixed'].map((type, index) => ({ ...structuredClone(commerceOrder), id: `71000000000000000000004${index}`, _id: `71000000000000000000004${index}`, orderNumber: `68124${index}`, itemTypes: type === 'mixed' ? ['product', 'gift_box'] : [type], serviceStages: type === 'engraving' ? ['inspection_pending'] : [], paymentState: index === 1 ? 'awaiting_verification' : 'unpaid', actionRequired: type === 'engraving' ? 'Inspect customer item' : 'Contact customer' }));
export async function ownerFixture(page, options = {}) {
  const base = await giftBoxFixture(page, { role: 'admin', ...options });
  const headers = { 'access-control-allow-origin': 'http://127.0.0.1:5191', 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type,x-csrf-token', 'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS' };
  const calls = [];
  const reply = (route, data) => route.fulfill({ headers, json: { ok: true, data } });
  const pagination = { page: 1, pages: 1, total: 4, limit: 20 };
  const period = { since: '2026-10-07T08:00:00Z', until: '2026-11-06T08:00:00Z' };
  await page.route('**/api/v1/admin/website/**', route => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (url.pathname.endsWith('/dashboard')) return reply(route, { ...period, actionRequired: 4, paymentReview: 1, customers: 18, newCustomers: 3, recentOrders: ownerOrders });
    if (url.pathname.endsWith('/owner-analytics')) return reply(route, { ...period, days: Number(url.searchParams.get('days') || 30), orders: 4, paidOrders: 1, collectionsPiastres: 34500, refundsPiastres: 1000, netCollectionsPiastres: 33500, legacyPaidPiastres: 12000, statuses: [{ state: 'received', count: 3 }, { state: 'delivered', count: 1 }], daily: [{ date: '2026-10-09', orders: 1 }, { date: '2026-10-10', orders: 3 }], collectionsDaily: [], products: [{ productId: '710000000000000000000001', name: 'Isolated Commerce Gift', units: 2 }] });
    if (url.pathname.endsWith('/customers')) return reply(route, { customers: [{ _id: 'customer-fixture', name: 'Isolated Customer', email: 'customer@example.test', active: true, createdAt: period.since }], pagination: { ...pagination, total: 1 } });
    if (url.pathname.endsWith('/payment-settings')) return reply(route, { checkoutEnabled: false, customRequestsEnabled: true, methods: [{ key: 'cod', name: 'Cash on Delivery' }, { key: 'instapay', name: 'InstaPay', transferNumber: '01060673073' }] });
    return reply(route, {});
  });
  await page.route('**/api/v1/admin/commerce/orders?**', route => { calls.push(new URL(route.request().url())); return reply(route, { orders: ownerOrders, pagination }); });
  let read = false;
  await page.route('**/api/v1/admin/commerce/notifications**', route => {
    const url = new URL(route.request().url()); calls.push(url);
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (url.pathname.endsWith('read-all')) { read = true; return reply(route, { readAt: period.until }); }
    const pageNumber = Number(url.searchParams.get('page') || 1);
    return reply(route, { unreadCount: read ? 0 : 13, serverNow: period.until, notifications: Array.from({ length: pageNumber === 3 ? 3 : 5 }, (_, index) => { const number = (pageNumber - 1) * 5 + index + 1; return { id: `order:${number}`, title: `Fixture notification ${number}`, detail: `Order #681240 · Customer follow-up`, href: `/admin/orders/${ownerOrders[0].id}`, unread: !read, at: period.until }; }), pagination: { page: pageNumber, pages: 3, total: 13 } });
  });
  await page.route('**/api/v1/admin/commerce/attention?**', route => reply(route, { records: ownerOrders.map((order, index) => ({ id: order.id, kind: 'order', reference: order.orderNumber, customer: order.customer, flags: index === 1 ? ['payment_review'] : ['initial'], href: `/admin/orders/${order.id}` })), pagination, serverNow: period.until }));
  await page.route('**/api/v1/admin/commerce/engraving/types?**', route => reply(route, { available: true, types: INITIAL_ENGRAVING_TYPES.map(type => ({ ...type, status: 'active', version: 2, revision: 2, fontIds: FONT_REGISTRY.map(font => font.id), iconIds: ICON_REGISTRY.map(icon => icon.id), placements: [] })), defaults: [], hasNext: false }));
  return { ...base, calls: base.commerceCalls, giftBoxCalls: base.calls, ownerCalls: calls };
}
