import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import mongoose from 'mongoose';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { Session } from '../src/models/Session.js';
import { Product } from '../src/models/Product.js';
import { Category } from '../src/models/Category.js';
import { Order } from '../src/models/Order.js';
import { Review } from '../src/models/Review.js';
import { SiteContent } from '../src/models/SiteContent.js';
import { AdminAudit } from '../src/models/AdminAudit.js';
import { NotificationEvent } from '../src/models/NotificationEvent.js';
import BundleRule from '../src/models/BundleRule.js';
import { newSessionToken, hashSession, makeCsrfToken } from '../src/utils/tokens.js';
import { startTestDatabase } from './helpers/database.js';
import { websiteModels, websiteAnalytics } from '../src/website/service.js';
import { ownerAnalytics, ownerDashboard } from '../src/website/owner-dashboard.js';
import { OrderSettlement } from '../src/models/OrderSettlement.js';

let database, server, base, admin, customer, main, child;
const models = [...new Set([...websiteModels, ...Object.values(mongoose.models)])];
async function account(role, suffix = '') {
  const user = await User.create({ name: `${role} fixture${suffix}`, email: `${role}${suffix}@example.test`, passwordHash: 'isolated-test-password-hash', role });
  const token = newSessionToken();
  await Session.create({ userId: user._id, tokenHash: hashSession(token), expiresAt: new Date(Date.now() + 3600000) });
  const csrf = makeCsrfToken(env.sessionSecret);
  return { user, headers: { Cookie: `tw_session=${token}; tw_csrf=${csrf}`, Origin: env.clientOrigin, 'x-csrf-token': csrf } };
}
async function request(path, { method = 'GET', body, headers = admin?.headers || {}, autoRevision = true } = {}) {
  if (autoRevision && method === 'PATCH' && body && body.expectedRevision === undefined) {
    const match = path.match(/\/admin\/(?:website\/reviews|commerce\/bundles)\/([a-f\d]{24})$/i);
    const record = path === '/admin/website/content' ? await SiteContent.findOne({ key: 'website-v1' }).select('__v').lean()
      : match ? await (path.includes('/reviews/') ? Review : BundleRule).findById(match[1]).select('__v').lean() : null;
    if (match || path === '/admin/website/content') body = { ...body, expectedRevision: record?.__v ?? 0 };
  }
  const response = await fetch(`${base}/api/v1${path}`, { method, headers: { ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const payload = await response.json();
  return { status: response.status, data: payload.data, error: payload.error, headers: response.headers };
}
async function product(slug, overrides = {}) {
  return Product.create({ name: `Isolated ${slug}`, slug, categoryId: main._id, subcategoryId: child._id, mainImageKey: `fixtures/${slug}.webp`, galleryKeys: [`fixtures/${slug}.webp`], pricePiastres: 10000, priceApproved: true, inventory: { mode: 'tracked', quantity: 10, approved: true, available: true }, visibility: 'public', status: 'ready', reviewRequired: false, ...overrides });
}
const reviewInput = (overrides = {}) => ({ authorLabel: 'Isolated quoted reviewer', rating: 4, text: 'This is an isolated review fixture, never merchant content.', sourceNote: 'Isolated provenance fixture.', approved: true, consentConfirmed: true, status: 'published', ...overrides });
async function review(overrides = {}) { return Review.create({ ...reviewInput(overrides), createdBy: admin.user._id, updatedBy: admin.user._id }); }

before(async () => {
  database = await startTestDatabase({ models, transactions: true });
  admin = await account('admin');
  customer = await account('customer');
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(async () => {
  await Promise.all(models.filter((model) => ![User, Session].includes(model)).map((model) => model.deleteMany({})));
  await User.deleteMany({ _id: { $nin: [admin.user._id, customer.user._id] } });
  main = await Category.create({ name: 'Isolated main', slug: 'isolated-main', active: true });
  child = await Category.create({ name: 'Isolated child', slug: 'isolated-child', parentId: main._id, active: true });
});
after(async () => { if (server) await new Promise((resolve) => server.close(resolve)); await database?.stop(); });

test('overview reports real storefront listing and purchase eligibility, not inherited import status', async () => {
  await product('unpriced-draft', { status: 'draft', pricePiastres: null, priceApproved: false, inventory: { mode: 'tracked', quantity: 0, approved: false, available: true } });
  await product('review-hold', { status: 'hold', reviewRequired: true, reviewReasons: ['Isolated source grouping needs review'], pricePiastres: null, priceApproved: false, inventory: { mode: 'tracked', quantity: 0, approved: false, available: true } });
  await product('normal-purchase');
  await product('owner-configured-draft', { status: 'draft', purchaseSetup: { version: 1, options: 'single' } });
  await product('stock-unavailable', { inventory: { mode: 'tracked', quantity: 0, approved: true, available: false } });
  await product('unresolved-options', { status: 'draft', purchaseSetup: { version: 1, options: 'unresolved' } });
  await product('hidden-product', { visibility: 'hidden' });
  const inactive = await Category.create({ name: 'Isolated inactive child', slug: 'isolated-inactive-child', parentId: main._id, active: false });
  await product('inactive-category-product', { subcategoryId: inactive._id });

  const result = await request('/admin/website/overview');
  assert.equal(result.status, 200);
  assert.deepEqual(result.data.products, { listed: 6, enquiries: 4, purchasable: 2, reviewRequired: 1 });
  assert.equal(result.data.checkoutEnabled, env.checkoutEnabled);
  assert.equal(result.data.products.draft, undefined);
  assert.equal(await Product.countDocuments({ status: 'draft' }), 3);
  assert.equal(await Product.countDocuments({ status: 'hold' }), 1);
  assert.equal((await Product.findOne({ slug: 'unpriced-draft' }).lean()).pricePiastres, null);
  assert.equal(await AdminAudit.countDocuments(), 0);
});

test('website administration rejects anonymous/customer access and invalid CSRF without writes', async () => {
  for (const path of ['overview', 'dashboard', 'owner-analytics', 'customers', 'content', 'reviews', 'analytics', 'payment-settings']) {
    assert.equal((await request(`/admin/website/${path}`, { headers: {} })).status, 401);
    assert.equal((await request(`/admin/website/${path}`, { headers: customer.headers })).status, 403);
  }
  const headers = { ...admin.headers }; delete headers['x-csrf-token'];
  assert.equal((await request('/admin/website/reviews', { method: 'POST', body: reviewInput(), headers })).status, 403);
  assert.equal((await request('/admin/website/content', { method: 'PATCH', body: { about: { title: 'Blocked', body: 'Blocked', approved: true } }, headers })).status, 403);
  assert.equal(await Review.countDocuments(), 0);
  assert.equal(await SiteContent.countDocuments(), 0);
  assert.equal(await AdminAudit.countDocuments(), 0);
});

test('fixed public information is available without a SiteContent document', async () => {
  const result = await request('/public/site-content', { headers: {} });
  assert.equal(result.status, 200);
  assert.equal(result.data.about.title, 'About Us');
  assert.equal(result.data.contact.email, 'tap.wrap22@gmail.com');
  assert.ok(result.data.faq.length > 0);
  assert.deepEqual(result.data.featuredReviews, []);
  assert.match(result.data.policies.shippingPolicy.body, /Pending Confirmation/);
  assert.equal(await SiteContent.countDocuments(), 0);
});

test('fixed pages and FAQs reject all legacy writes and ignore historical approvals', async () => {
  const historic = await SiteContent.create({ key: 'website-v1', about: { title: 'Legacy override', body: 'Not source content', approved: true }, faq: [{ question: 'Free shipping?', answer: 'Always free' }], faqApproved: true });
  const before = JSON.parse(JSON.stringify(historic.toObject()));
  for (const method of ['PATCH', 'PUT', 'POST', 'DELETE']) {
    const result = await request('/admin/website/content', { method, body: { expectedRevision: 0, about: { title: 'Changed', body: 'Wrong' }, faqApproved: true } });
    assert.equal(result.status, 403);
    assert.equal(result.error.code, 'FIXED_CONTENT_READ_ONLY');
    assert.match(result.headers.get('cache-control'), /no-store/);
  }
  const visible = (await request('/public/site-content')).data;
  assert.equal(visible.about.title, 'About Us');
  assert.equal(visible.faq.some(item => item.answer === 'Always free'), false);
  assert.deepEqual(JSON.parse(JSON.stringify((await SiteContent.findById(historic._id)).toObject())), before);
  assert.equal(await AdminAudit.countDocuments(), 0);
});

test('retired review writes reject approved and unapproved input without changing historical records', async () => {
  const record = await review({ featured: true });
  const before = await Review.findById(record._id).lean();
  for (const method of ['POST','PUT','DELETE']) assert.equal((await request('/admin/website/reviews', { method, body: reviewInput() })).status, 410);
  for (const method of ['PATCH','PUT','DELETE']) assert.equal((await request('/admin/website/reviews/' + record._id, { method, body: { expectedRevision: 0, text: 'Retired write', status: 'hidden' } })).status, 410);
  assert.deepEqual(await Review.findById(record._id).lean(), before);
  assert.equal(await Review.countDocuments(), 1);
  assert.equal(await AdminAudit.countDocuments(), 0);
  assert.equal((await request('/admin/website/reviews/' + record._id)).data.review.sourceNote, before.sourceNote);
});

test('historical text-only testimonials remain readable without invented author or rating', async () => {
  const record = await review({ authorLabel: null, rating: null, featured: true });
  const featured = (await request('/public/site-content')).data.featuredReviews;
  assert.equal(featured.length, 1); assert.equal(featured[0].authorLabel, null); assert.equal(featured[0].rating, null);
  assert.equal(featured[0].sourceNote, undefined);
  assert.equal((await request('/admin/website/reviews/' + record._id, { method: 'PATCH', body: { rating: 4.5 } })).status, 410);
});

test('retired review editing cannot republish, hide or alter an authentic historical quotation', async () => {
  const record = await review({ featured: true });
  const before = await Review.findById(record._id).lean();
  for (const body of [{ text: 'Replacement' }, { approved: true, status: 'published' }, { status: 'hidden' }]) assert.equal((await request('/admin/website/reviews/' + record._id, { method: 'PATCH', body })).status, 410);
  assert.deepEqual(await Review.findById(record._id).lean(), before);
  assert.equal((await request('/public/site-content')).data.featuredReviews[0].text, record.text);
});

test('public product reviews require approved public products and active category relationships', async () => {
  const published = await product('reviewed-product');
  const draft = await product('draft-product', { status: 'draft', priceApproved: false });
  await review({ productId: published._id, featured: true });
  await review({ productId: draft._id, featured: true });
  await review({ productId: published._id, status: 'draft', approved: false });
  const result = await request('/public/products/reviewed-product/reviews', { headers: {} });
  assert.equal(result.status, 200);
  assert.equal(result.data.reviews.length, 1);
  assert.equal(result.data.reviews[0].sourceNote, undefined);
  assert.equal((await request('/public/products/draft-product/reviews', { headers: {} })).status, 404);
  assert.equal((await request('/public/site-content')).data.featuredReviews.length, 1);
  child.active = false; await child.save();
  assert.equal((await request('/public/products/reviewed-product/reviews')).status, 404);
  assert.deepEqual((await request('/public/site-content')).data.featuredReviews, []);
});

test('review lists paginate at twenty and omit full text/source notes until an explicit detail request', async () => {
  const published = await product('paginated-reviews');
  await Review.insertMany(Array.from({ length: 23 }, (_, index) => ({ ...reviewInput({ productId: published._id, authorLabel: `Isolated reviewer ${index}` }), createdBy: admin.user._id, updatedBy: admin.user._id })));
  const first = await request('/admin/website/reviews?page=1&limit=20');
  assert.equal(first.data.reviews.length, 20);
  assert.equal(first.data.pagination.total, 23);
  assert.equal(first.data.reviews[0].text, undefined);
  assert.equal(first.data.reviews[0].sourceNote, undefined);
  assert.equal((await request('/admin/website/reviews?page=2&limit=20')).data.reviews.length, 3);
  assert.equal((await request('/admin/website/reviews?limit=21')).status, 400);
  assert.equal((await request('/public/products/paginated-reviews/reviews?page=2&limit=20')).data.reviews.length, 3);
  assert.equal((await request('/public/products/paginated-reviews/reviews?limit=21')).status, 400);
  assert.equal((await request(`/admin/website/reviews/${first.data.reviews[0]._id}`)).data.review.sourceNote, reviewInput().sourceNote);
});

test('customer list is paginated, excludes administrators and never returns secrets or private order data', async () => {
  await User.insertMany(Array.from({ length: 22 }, (_, index) => ({ name: `Fixture Customer ${index}`, email: `fixture${index}@example.test`, passwordHash: 'never-return-this-fixture', role: 'customer' })));
  const first = await request('/admin/website/customers?limit=20&page=1');
  assert.equal(first.data.customers.length, 20);
  assert.equal(first.data.pagination.total, 23);
  assert.equal((await request('/admin/website/customers?limit=20&page=2')).data.customers.length, 3);
  assert.equal((await request('/admin/website/customers?limit=100')).status, 400);
  assert.equal(first.data.customers[0].passwordHash, undefined);
  assert.equal(first.data.customers[0].role, undefined);
  assert.equal((await request('/admin/website/customers?q=fixture21%40example.test')).data.customers[0].email, 'fixture21@example.test');
  assert.equal((await request('/admin/website/customers?q=Fixture%20Customer%202')).data.pagination.total, 3);
  assert.equal((await request('/admin/website/customers?q=.*')).data.pagination.total, 0);
});

test('public bundle presentation stays empty while historical rules remain untouched', async () => {
  const first = await product('historical-bundle-first'), second = await product('historical-bundle-second');
  const record = await BundleRule.create({ name: 'Historical bundle', active: true, published: true, items: [{ productId: first._id, quantity: 1 }, { productId: second._id, quantity: 1 }], discountKind: 'fixed', discountValue: 500 });
  const before = await BundleRule.findById(record._id).lean();
  assert.deepEqual((await request('/public/bundles')).data.bundles, []);
  for (const method of ['POST','PATCH','PUT','DELETE']) assert.equal((await request('/admin/commerce/bundles' + (method === 'POST' ? '' : '/' + record._id), { method, body: { active: false, expectedRevision: 0 } })).status, 410);
  assert.deepEqual(await BundleRule.findById(record._id).lean(), before);
  assert.equal(await AdminAudit.countDocuments(), 0);
});



test('analytics uses a bounded thirty-day window and separates collected amounts from unverified transfers', async () => {
  const now = new Date('2026-10-09T12:00:00Z');
  // Minimal raw records exist only inside this disposable fixture database.
  await Order.collection.insertMany([
    { orderNumber: '100001', owner: 'isolated-a', checkoutKey: 'a', createdAt: new Date('2026-10-08T12:00:00Z'), paymentState: 'paid', fulfillmentState: 'delivered', totals: { totalPiastres: 15000 } },
    { orderNumber: '100002', owner: 'isolated-b', checkoutKey: 'b', createdAt: new Date('2026-10-08T12:00:00Z'), paymentState: 'awaiting_verification', fulfillmentState: 'received', totals: { totalPiastres: 25000 } },
    { orderNumber: '100003', owner: 'isolated-c', checkoutKey: 'c', createdAt: new Date('2026-08-01T12:00:00Z'), paymentState: 'paid', fulfillmentState: 'delivered', totals: { totalPiastres: 99999 } },
  ]);
  const result = await websiteAnalytics(now);
  assert.equal(result.orders, 2);
  assert.equal(result.paidOrders, 1);
  assert.equal(result.deliveredOrders, 1);
  assert.equal(result.collectedPiastres, 15000);
  assert.equal(result.awaitingVerificationPiastres, 25000);
  assert.equal(result.customer, undefined);
});

test('payment settings are read-only and cannot enable checkout or automatically accept InstaPay proofs', async () => {
  const result = await request('/admin/website/payment-settings');
  assert.equal(result.status, 200);
  assert.equal(result.data.checkoutEnabled, false);
  assert.equal(result.data.editable, false);
  assert.equal(result.data.methods.find((method) => method.key === 'instapay').transferNumber, '01060673073');
  assert.match(result.data.methods.find((method) => method.key === 'instapay').verification, /manual/);
  assert.equal((await request('/admin/website/payment-settings', { method: 'PATCH', body: { checkoutEnabled: true } })).status, 404);
  assert.equal(env.checkoutEnabled, false);
});

test('email diagnostics are bounded and exclude recipients, tokens, snapshots and provider identifiers', async () => {
  await NotificationEvent.insertMany(Array.from({ length: 23 }, (_, index) => ({ eventKey: `isolated-diagnostic-${index}`, orderId: new mongoose.Types.ObjectId(), event: 'order_received', recipient: 'never-expose@example.test', snapshot: { privateMessage: 'never expose this' }, providerMessageId: 'private-provider-id', state: index % 2 ? 'uncertain' : 'failed', lastErrorCode: index % 2 ? 'SMTP_ACCEPTANCE_UNCERTAIN' : 'unsafe diagnostic with private address', nextAttemptAt: new Date() })));
  const first = await request('/admin/website/notifications?page=1&limit=20');
  assert.equal(first.data.events.length, 20);
  assert.equal(first.data.pagination.total, 23);
  assert.equal((await request('/admin/website/notifications?page=2&limit=20')).data.events.length, 3);
  assert.equal((await request('/admin/website/notifications?limit=21')).status, 400);
  const safe = JSON.stringify(first.data.events);
  for (const value of ['never-expose', 'privateMessage', 'private-provider-id', 'recipient', 'sealedActionToken']) assert.ok(!safe.includes(value));
  assert.ok(first.data.events.some((event) => event.lastErrorCode === 'DELIVERY_FAILED'));
  assert.equal((await request('/admin/website/notifications', { headers: customer.headers })).status, 403);
  assert.equal((await request('/admin/website/notifications', { method: 'POST', body: { send: true } })).status, 404);
  const overview = (await request('/admin/website/overview')).data;
  assert.equal(overview.notifications.failed, 12);
  assert.equal(overview.notifications.uncertain, 11);
  assert.equal(overview.notifications.dead, 0);
});









test('admin content directory is read-only and contains no legacy document details', async () => {
  const loaded = (await request('/admin/website/content')).data.content;
  assert.equal(loaded.editable, false);
  assert.equal(loaded.managedBy, 'source');
  assert.equal(loaded.about.title, 'About Us');
  assert.equal(loaded._id, undefined);
});



test('concurrent fixed-content and retired review writes never change historical documents', async () => {
  const contentResults = await Promise.all(['Content A', 'Content B'].map((title) => request('/admin/website/content', { method: 'PATCH', body: { expectedRevision: 0, about: { title, body: 'Concurrent synthetic content' } } })));
  assert.deepEqual(contentResults.map((result) => result.status), [403, 403]);
  assert.ok(contentResults.every(result => result.error.code === 'FIXED_CONTENT_READ_ONLY'));
  const record = await review({ status: 'draft', approved: false });
  const reviewResults = await Promise.all(['Quotation A', 'Quotation B'].map((text) => request(`/admin/website/reviews/${record._id}`, { method: 'PATCH', body: { expectedRevision: 0, text } })));
  assert.deepEqual(reviewResults.map((result) => result.status).sort(), [410, 410]);

  assert.equal((await Review.findById(record._id)).__v, 0);
  assert.equal(await AdminAudit.countDocuments(), 0);
});


test('owner analytics uses settlement dates, excludes unpaid engraving and separates legacy paid snapshots', async () => {
  const now = new Date('2026-11-06T08:00:00Z');
  const oldId = new mongoose.Types.ObjectId(), engravingId = new mongoose.Types.ObjectId();
  await Order.collection.insertMany([
    { _id: oldId, orderNumber: '100010', owner: 'old-fixture', checkoutKey: 'old', accountingVersion: 1, paymentState: 'paid', fulfillmentState: 'delivered', totals: { totalPiastres: 50000 }, createdAt: new Date('2026-09-01T00:00:00Z'), lines: [{ kind: 'product', name: 'Historical product', quantity: 1 }] },
    { _id: engravingId, orderNumber: '100011', owner: 'service-fixture', checkoutKey: 'service', accountingVersion: 1, paymentState: 'unpaid', fulfillmentState: 'received', totals: { totalPiastres: 10000 }, createdAt: new Date('2026-11-05T23:00:00Z'), lines: [{ kind: 'engraving_service_v1', name: 'Fixture engraving', quantity: 1 }], engraving: { collectionAuthorized: false, items: [{ stage: 'inspection_pending' }] }, customer: { name: 'Fixture customer', email: 'private@example.test', notes: 'private note' } },
    { orderNumber: '100012', owner: 'legacy-fixture', checkoutKey: 'legacy', paymentState: 'paid', fulfillmentState: 'delivered', totals: { totalPiastres: 7000 }, createdAt: new Date('2026-10-20T00:00:00Z') },
  ]);
  await OrderSettlement.create([
    { orderId: oldId, direction: 'collection', amountPiastres: 10000, createdAt: new Date('2026-11-04T00:00:00Z') },
    { orderId: oldId, direction: 'refund', amountPiastres: 1500, createdAt: new Date('2026-11-05T00:00:00Z') },
    { orderId: oldId, direction: 'collection', amountPiastres: 99999, createdAt: new Date('2026-09-02T00:00:00Z') },
  ].map((entry, index) => ({ ...entry, operationKey: 'fixture-operation-' + index, requestHash: 'fixture-request-' + index, referenceKey: 'fixture-reference-' + index, reference: 'fixture-' + index, method: 'cod', scope: 'merchandise', recordedBy: admin.user._id, reason: 'Isolated recorded settlement' })));
  const result = await ownerAnalytics(30, now);
  assert.equal(result.orders, 2); assert.equal(result.collectionsPiastres, 10000); assert.equal(result.refundsPiastres, 1500);
  assert.equal(result.netCollectionsPiastres, 8500); assert.equal(result.legacyPaidPiastres, 7000);
  assert.equal(result.daily.find(day => day.date === '2026-11-06').orders, 1, 'Cairo date rolls over independently of UTC');
  assert.equal(result.products.some(item => item.name === 'Fixture engraving'), false);
  assert.equal(JSON.stringify(result).includes('private@example.test'), false);
  await assert.rejects(ownerAnalytics(999, now), { code: 'INVALID_PERIOD' });
  const dashboard = await ownerDashboard(now);
  const service = dashboard.recentOrders.find(order => order.id === String(engravingId));
  assert.deepEqual(service.itemTypes, ['engraving']); assert.deepEqual(service.serviceStages, ['inspection_pending']);
  assert.equal(service.actionRequired, 'Inspect customer item'); assert.equal(service.customer.email, undefined);
  assert.equal(service.lines, undefined); assert.equal(service.engraving, undefined);
});

test('unified admin order views are bounded, service-aware and leave payment authorization untouched', async () => {
  const id = new mongoose.Types.ObjectId();
  await Order.collection.insertOne({ _id: id, owner: 'list-fixture', checkoutKey: 'list', orderNumber: '100013', paymentState: 'unpaid', fulfillmentState: 'received', createdAt: new Date(), totals: { totalPiastres: 10000 }, lines: [{ kind: 'engraving_service_v1' }], engraving: { collectionAuthorized: false, items: [{ stage: 'inspection_pending' }] }, customer: { name: 'Fixture service customer', notes: 'Not for the list' } });
  const response = await request('/admin/commerce/orders?view=requires_action&type=engraving&limit=20');
  assert.equal(response.status, 200); assert.equal(response.data.orders.length, 1);
  assert.equal(response.data.orders[0].actionRequired, 'Inspect customer item');
  assert.equal((await request('/admin/commerce/orders?view=completed')).data.orders.length, 0);
  assert.equal((await request('/admin/commerce/orders?view=unpaid')).data.orders.length, 1);
  assert.equal((await request('/admin/commerce/orders?type=mixed')).data.orders.length, 0);
  assert.equal((await request('/admin/commerce/orders?view=invalid')).status, 400);
  assert.equal((await request('/admin/website/owner-analytics?days=500')).status, 400);
  assert.equal((await request('/admin/website/owner-analytics?days=7&owner=injected')).status, 400);
  assert.equal((await Order.findById(id).lean()).engraving.collectionAuthorized, false);
  assert.equal(await OrderSettlement.countDocuments(), 0);
  await Order.updateOne({ _id: id }, { $set: { fulfillmentState: 'cancelled', 'engraving.items': [{ stage: 'inspection_pending', inCustody: true }] } });
  const cancelled = await request('/admin/commerce/orders?view=requires_action&type=engraving');
  assert.equal(cancelled.data.orders.length, 1, 'Cancellation cannot hide a customer item still in store custody');
  assert.equal(cancelled.data.orders[0].actionRequired, 'Return customer item');
  assert.equal((await ownerDashboard()).actionRequired, 1);
});
