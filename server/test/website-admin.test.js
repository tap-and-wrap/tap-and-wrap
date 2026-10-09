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
  return Product.create({ name: `Isolated ${slug}`, slug, categoryId: main._id, subcategoryId: child._id, mainImageKey: `fixtures/${slug}.webp`, galleryKeys: [`fixtures/${slug}.webp`], pricePiastres: 10000, priceApproved: true, inventory: { mode: 'tracked', quantity: 10, approved: true, available: true }, status: 'ready', reviewRequired: false, ...overrides });
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

test('website administration rejects anonymous/customer access and invalid CSRF without writes', async () => {
  for (const path of ['overview', 'customers', 'content', 'reviews', 'analytics', 'payment-settings']) {
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

test('empty public content contains no policies, testimonials or invented contact information', async () => {
  const result = await request('/public/site-content', { headers: {} });
  assert.equal(result.status, 200);
  assert.equal(result.data.about, null);
  assert.equal(result.data.contact, null);
  assert.deepEqual(result.data.faq, []);
  assert.deepEqual(result.data.featuredReviews, []);
  assert.ok(Object.values(result.data.policies).every((policy) => policy === null));
  assert.match(result.headers.get('cache-control'), /public/);
});

test('owner-approved content becomes public and editing text requires renewed approval', async () => {
  const saved = await request('/admin/website/content', { method: 'PATCH', body: { about: { title: 'Isolated About', body: 'Reviewed isolated about text.', approved: true }, privacyPolicy: { title: 'Isolated Privacy', body: 'Owner-provided test policy.', approved: false }, faq: [{ question: 'Isolated question?', answer: 'Isolated answer.' }], faqApproved: true } });
  assert.equal(saved.status, 200, JSON.stringify(saved.error));
  assert.match(saved.headers.get('cache-control'), /no-store/);
  assert.match(saved.headers.get('x-robots-tag'), /noindex/);
  const visible = (await request('/public/site-content')).data;
  assert.equal(visible.about.title, 'Isolated About');
  assert.equal(visible.policies.privacyPolicy, null);
  assert.equal(visible.faq.length, 1);
  assert.equal(visible.about.approved, undefined);
  const changed = await request('/admin/website/content', { method: 'PATCH', body: { about: { title: 'Isolated About', body: 'Unreviewed change.' } } });
  assert.equal(changed.status, 200);
  assert.equal(changed.data.content.about.approved, false);
  assert.equal((await request('/public/site-content')).data.about, null);
  assert.equal(await AdminAudit.countDocuments({ action: 'website.content.edit' }), 2);
});

test('contact values are validated and cannot expose unsafe links or publish empty information', async () => {
  assert.equal((await request('/admin/website/content', { method: 'PATCH', body: { contact: { instagram: 'javascript:alert(1)', approved: true } } })).status, 400);
  assert.equal((await request('/admin/website/content', { method: 'PATCH', body: { contact: { approved: true } } })).status, 400);
  const saved = await request('/admin/website/content', { method: 'PATCH', body: { contact: { email: 'owner@example.test', phone: '01012345678', instagram: 'https://www.instagram.com/isolatedfixture/', approved: true } } });
  assert.equal(saved.status, 200, JSON.stringify(saved.error));
  assert.equal((await request('/public/site-content')).data.contact.email, 'owner@example.test');
  assert.equal(await SiteContent.countDocuments(), 1);
});

test('review publication requires explicit approval, quote permission and private provenance', async () => {
  const invalid = await request('/admin/website/reviews', { method: 'POST', body: reviewInput({ approved: false }) });
  assert.equal(invalid.status, 400);
  assert.equal(await Review.countDocuments(), 0);
  const created = await request('/admin/website/reviews', { method: 'POST', body: reviewInput({ featured: true }) });
  assert.equal(created.status, 201, JSON.stringify(created.error));
  const publicReview = (await request('/public/site-content')).data.featuredReviews[0];
  assert.equal(publicReview.rating, 4);
  assert.equal(publicReview.text, reviewInput().text);
  assert.equal(publicReview.sourceNote, undefined);
  assert.equal(publicReview.createdBy, undefined);
  assert.equal(await AdminAudit.countDocuments({ action: 'website.review.create' }), 1);
});

test('editing review text clears approval and hiding an authentic review removes public visibility', async () => {
  const record = await review({ featured: true });
  const changed = await request(`/admin/website/reviews/${record._id}`, { method: 'PATCH', body: { text: 'Unreviewed revised fixture.' } });
  assert.equal(changed.status, 200);
  assert.equal(changed.data.review.approved, false);
  assert.equal(changed.data.review.status, 'draft');
  assert.deepEqual((await request('/public/site-content')).data.featuredReviews, []);
  const approved = await request(`/admin/website/reviews/${record._id}`, { method: 'PATCH', body: { approved: true, status: 'published' } });
  assert.equal(approved.status, 200);
  assert.equal((await request('/public/site-content')).data.featuredReviews.length, 1);
  assert.equal((await request(`/admin/website/reviews/${record._id}`, { method: 'PATCH', body: { status: 'hidden' } })).status, 200);
  assert.deepEqual((await request('/public/site-content')).data.featuredReviews, []);
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

test('published bundles require explicit publication and all approved products/stock without exposing image keys', async () => {
  const first = await product('bundle-first');
  const second = await product('bundle-second');
  const bundle = await BundleRule.create({ name: 'Isolated published bundle', description: 'Isolated owner description.', active: true, published: true, items: [{ productId: first._id, quantity: 1 }, { productId: second._id, quantity: 2 }], discountKind: 'fixed', discountValue: 500 });
  await BundleRule.create({ name: 'Unpublished fixture', active: true, items: [{ productId: first._id, quantity: 1 }, { productId: second._id, quantity: 1 }], discountKind: 'fixed', discountValue: 500 });
  const result = await request('/public/bundles', { headers: {} });
  assert.equal(result.data.bundles.length, 1);
  assert.equal(result.data.bundles[0].id, String(bundle._id));
  assert.equal(result.data.bundles[0].products[1].bundleQuantity, 2);
  assert.equal(result.data.bundles[0].products[0].mainImageKey, undefined);
  second.status = 'draft'; second.priceApproved = false; await second.save();
  assert.deepEqual((await request('/public/bundles')).data.bundles, []);
});

test('bundles with insufficient or unavailable variant stock, expired schedules or inactive categories remain hidden', async () => {
  const first = await product('bundle-variant', { variants: [{ key: 'small', attributes: [{ name: 'Size', value: 'Small' }], pricePiastres: 12000, priceApproved: true, inventory: { mode: 'tracked', quantity: 1, approved: true, available: true } }] });
  const second = await product('bundle-other');
  const bundle = await BundleRule.create({ name: 'Isolated variant bundle', active: true, published: true, items: [{ productId: first._id, variantKey: 'small', quantity: 2 }, { productId: second._id, quantity: 1 }], discountKind: 'percentage', discountValue: 1000 });
  assert.deepEqual((await request('/public/bundles')).data.bundles, []);
  first.variants[0].inventory.quantity = 3; await first.save();
  assert.equal((await request('/public/bundles')).data.bundles[0].products[0].pricePiastres, 12000);
  bundle.endsAt = new Date(Date.now() - 1000); await bundle.save();
  assert.deepEqual((await request('/public/bundles')).data.bundles, []);
  bundle.endsAt = null; await bundle.save();
  child.active = false; await child.save();
  assert.deepEqual((await request('/public/bundles')).data.bundles, []);
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

test('existing protected bundle mutations persist separate homepage publication and return lightweight list records', async () => {
  const first = await product('api-bundle-first');
  const second = await product('api-bundle-second');
  const created = await request('/admin/commerce/bundles', { method: 'POST', body: { name: 'Isolated API bundle', description: 'Owner-approved isolated bundle fixture.', active: true, published: true, items: [{ productId: String(first._id), quantity: 1 }, { productId: String(second._id), quantity: 1 }], discountKind: 'fixed', discountValue: 500 } });
  assert.equal(created.status, 201, JSON.stringify(created.error));
  assert.equal(created.data.bundle.published, true);
  assert.equal(created.data.bundle.description, 'Owner-approved isolated bundle fixture.');
  const listed = await request('/admin/commerce/bundles');
  assert.equal(listed.data.bundles[0].published, true);
  assert.equal(listed.data.bundles[0].items, undefined);
  const id = created.data.bundle._id;
  const changed = await request(`/admin/commerce/bundles/${id}`, { method: 'PATCH', body: { published: false } });
  assert.equal(changed.status, 200);
  assert.equal(changed.data.bundle.active, true);
  assert.equal(changed.data.bundle.description, created.data.bundle.description);
  assert.deepEqual((await request('/public/bundles')).data.bundles, []);
  assert.equal((await request(`/admin/commerce/bundles/${id}`)).data.bundle.items.length, 2);
});

test('eligible ninth published bundle remains discoverable after eight earlier selections become unavailable', async () => {
  const withdrawn = await product('withdrawn-bundle-member', { inventory: { mode: 'tracked', quantity: 0, approved: true, available: false } });
  const first = await product('ninth-first');
  const second = await product('ninth-second');
  await BundleRule.insertMany(Array.from({ length: 8 }, (_, priority) => ({ name: `Isolated unavailable ${priority}`, published: true, active: true, priority, items: [{ productId: withdrawn._id, quantity: 1 }, { productId: first._id, quantity: 1 }], discountKind: 'fixed', discountValue: 500 })));
  const available = await BundleRule.create({ name: 'Isolated ninth available', published: true, active: true, priority: 8, items: [{ productId: first._id, quantity: 1 }, { productId: second._id, quantity: 1 }], discountKind: 'fixed', discountValue: 500 });
  const result = await request('/public/bundles');
  assert.equal(result.data.bundles.length, 1);
  assert.equal(result.data.bundles[0].id, String(available._id));
  assert.equal(result.data.bundles[0].effectiveDiscountPiastres, 500);
});

test('bundle discovery crosses keyset batches, caps eligible output at eight and uses central clamped pricing', async () => {
  const withdrawn = await product('keyset-withdrawn', { inventory: { mode: 'tracked', quantity: 0, approved: true, available: false } });
  const first = await product('keyset-first');
  const second = await product('keyset-second', { pricePiastres: 5000 });
  await BundleRule.insertMany(Array.from({ length: 20 }, (_, index) => ({ name: `Isolated unavailable keyset ${index}`, published: true, active: true, priority: 0, items: [{ productId: withdrawn._id, quantity: 1 }, { productId: first._id, quantity: 1 }], discountKind: 'fixed', discountValue: 500 })));
  const eligible = await BundleRule.insertMany(Array.from({ length: 9 }, (_, index) => ({ name: `Isolated available keyset ${index}`, published: true, active: true, priority: 0, items: [{ productId: first._id, quantity: 1 }, { productId: second._id, quantity: 1 }], discountKind: 'fixed', discountValue: 1000000 })));
  const result = await request('/public/bundles');
  assert.equal(result.data.bundles.length, 8);
  assert.equal(result.data.bundles[0].id, String(eligible[0]._id));
  assert.equal(result.data.bundles[7].id, String(eligible[7]._id));
  assert.equal(result.data.bundles[0].bundleSubtotalPiastres, 15000);
  assert.equal(result.data.bundles[0].effectiveDiscountPiastres, 15000);
  assert.equal(result.data.bundles[0].bundleTotalPiastres, 0);
});

test('public bundle lookup refuses to scan past the configured one-hundred-active-rule ceiling', async () => {
  const withdrawn = await product('bounded-withdrawn', { inventory: { mode: 'tracked', quantity: 0, approved: true, available: false } });
  const first = await product('bounded-first');
  const second = await product('bounded-second');
  // Direct disposable fixtures exercise corrupted/legacy data; admin APIs forbid this state.
  await BundleRule.insertMany(Array.from({ length: 100 }, (_, priority) => ({ name: `Isolated bound ${priority}`, published: true, active: true, priority, items: [{ productId: withdrawn._id, quantity: 1 }, { productId: first._id, quantity: 1 }], discountKind: 'fixed', discountValue: 500 })));
  await BundleRule.create({ name: 'Isolated over-limit fixture', published: true, active: true, priority: 100, items: [{ productId: first._id, quantity: 1 }, { productId: second._id, quantity: 1 }], discountKind: 'fixed', discountValue: 500 });
  assert.deepEqual((await request('/public/bundles')).data.bundles, []);
});

test('site-content revisions protect the first write and retain newer content after stale saves', async () => {
  const path = '/admin/website/content';
  const loaded = (await request(path)).data.content;
  assert.equal(loaded.revision, 0);
  assert.equal(loaded.__v, undefined);
  assert.equal((await request(path, { method: 'PATCH', body: { about: { title: 'Missing revision', body: 'Not saved' } }, autoRevision: false })).status, 400);
  const saved = await request(path, { method: 'PATCH', body: { expectedRevision: loaded.revision, about: { title: 'Newest content', body: 'Newest saved fixture' } } });
  assert.equal(saved.status, 200, JSON.stringify(saved.error));
  assert.equal(saved.data.content.revision, 1);
  const stale = await request(path, { method: 'PATCH', body: { expectedRevision: loaded.revision, about: { title: 'Stale content', body: 'Must not overwrite' } } });
  assert.equal(stale.status, 409);
  assert.equal(stale.error.code, 'EDIT_CONFLICT');
  assert.equal((await request(path)).data.content.about.title, 'Newest content');
  assert.equal(await AdminAudit.countDocuments({ action: 'website.content.edit' }), 1);
});

test('review revisions reject stale forms and preserve source notes and publication decisions', async () => {
  const record = await review();
  const path = `/admin/website/reviews/${record._id}`;
  const loaded = (await request(path)).data.review;
  assert.equal(loaded.revision, 0);
  assert.equal((await request(path, { method: 'PATCH', body: { status: 'hidden' }, autoRevision: false })).status, 400);
  const saved = await request(path, { method: 'PATCH', body: { expectedRevision: loaded.revision, status: 'hidden' } });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.review.revision, 1);
  const stale = await request(path, { method: 'PATCH', body: { expectedRevision: loaded.revision, status: 'published', text: 'Stale quotation', sourceNote: 'Stale provenance' } });
  assert.equal(stale.status, 409);
  const preserved = (await request(path)).data.review;
  assert.equal(preserved.status, 'hidden');
  assert.equal(preserved.text, record.text);
  assert.equal(preserved.sourceNote, record.sourceNote);
  assert.equal(await AdminAudit.countDocuments({ action: 'website.review.edit' }), 1);
});

test('concurrent first content writes and review edits each produce one winner without partial audits', async () => {
  const contentResults = await Promise.all(['Content A', 'Content B'].map((title) => request('/admin/website/content', { method: 'PATCH', body: { expectedRevision: 0, about: { title, body: 'Concurrent synthetic content' } } })));
  assert.deepEqual(contentResults.map((result) => result.status).sort(), [200, 409]);
  assert.equal(contentResults.find((result) => result.status === 409).error.code, 'EDIT_CONFLICT');
  const record = await review({ status: 'draft', approved: false });
  const reviewResults = await Promise.all(['Quotation A', 'Quotation B'].map((text) => request(`/admin/website/reviews/${record._id}`, { method: 'PATCH', body: { expectedRevision: 0, text } })));
  assert.deepEqual(reviewResults.map((result) => result.status).sort(), [200, 409]);
  assert.equal(reviewResults.find((result) => result.status === 409).error.code, 'EDIT_CONFLICT');
  assert.equal((await Review.findById(record._id)).__v, 1);
  assert.equal(await AdminAudit.countDocuments(), 2);
});
