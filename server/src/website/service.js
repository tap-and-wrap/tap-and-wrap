import mongoose from 'mongoose';
import { z } from 'zod';
import { Product } from '../models/Product.js';
import { Category } from '../models/Category.js';
import { User } from '../models/User.js';
import { Order } from '../models/Order.js';
import { NotificationEvent } from '../models/NotificationEvent.js';
import { Review } from '../models/Review.js';
import { SiteContent } from '../models/SiteContent.js';
import BundleRule from '../models/BundleRule.js';
import { publicProductFilter, orderableProductStockFilter } from '../catalog/product-policy.js';
import { publicProductCard, inventoryCanOrder } from '../catalog/public-presentation.js';
import { parseInput } from '../catalog/validation.js';
import { commerceError, checkedMoney } from '../commerce/errors.js';
import { recordAdminAudit } from '../commerce/audit.js';
import { evaluatePromotions } from '../commerce/promotions.js';
import { assertDatabaseWriteAllowed } from '../config/database-safety.js';
import { env } from '../config/env.js';

const TIMEOUT = 3000;
const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const text = (maximum) => z.string().trim().max(maximum);
const optionalEmail = text(254).refine((value) => value === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), 'Provide a valid email address.');
const optionalPhone = text(40).refine((value) => value === '' || /^(?:\+20|0)1[0125]\d{8}$/.test(value), 'Provide an Egyptian mobile number.');
const section = z.object({ title: text(160), body: text(15000), approved: z.boolean().optional() }).strict();
const contact = z.object({
  email: optionalEmail.optional(), phone: optionalPhone.optional(), whatsapp: optionalPhone.optional(), address: text(1000).optional(), body: text(3000).optional(),
  instagram: text(300).refine((value) => {
    if (!value) return true;
    try { const url = new URL(value); return url.protocol === 'https:' && ['instagram.com', 'www.instagram.com'].includes(url.hostname) && !url.username && !url.password && !url.search && !url.hash; } catch { return false; }
  }, 'Provide an HTTPS Instagram profile URL.').optional(), approved: z.boolean().optional(),
}).strict();
export const siteContentSchema = z.object({
  about: section.optional(), contact: contact.optional(), privacyPolicy: section.optional(), refundPolicy: section.optional(), shippingPolicy: section.optional(), termsOfService: section.optional(),
  faq: z.array(z.object({ question: text(250).min(1), answer: text(3000).min(1) }).strict()).max(20).optional(), faqApproved: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'Provide at least one section.');
const reviewFields = {
  productId: objectId.nullable().optional(), authorLabel: text(100).min(1), rating: z.number().int().min(1).max(5), text: text(3000).min(1),
  status: z.enum(['draft', 'published', 'hidden']).optional(), approved: z.boolean().optional(), consentConfirmed: z.boolean().optional(), sourceNote: text(2000).optional(), featured: z.boolean().optional(), displayOrder: z.number().int().min(0).max(100000).optional(),
};
export const createReviewSchema = z.object(reviewFields).strict();
export const updateReviewSchema = createReviewSchema.partial().refine((value) => Object.keys(value).length > 0, 'Provide at least one review field.');
const integerQuery = z.string().regex(/^[1-9]\d{0,3}$/).transform(Number);
export const websiteQuerySchema = z.object({
  page: integerQuery.refine((value) => value <= 200).optional(), limit: integerQuery.refine((value) => value <= 20).optional(),
  q: text(100).min(1).optional(), status: z.enum(['draft', 'published', 'hidden']).optional(), productId: objectId.optional(),
}).strict();
export const customerQuerySchema = websiteQuerySchema.pick({ page: true, limit: true, q: true });
export const publicReviewQuerySchema = websiteQuerySchema.pick({ page: true, limit: true });
export const notificationQuerySchema = websiteQuerySchema.pick({ page: true, limit: true }).extend({ state: z.enum(['queued', 'processing', 'failed', 'sent', 'dead', 'uncertain']).optional() }).strict();
export const websiteModels = [Review, SiteContent];
const pageFor = (query) => ({ page: query.page ?? 1, limit: query.limit ?? 20, skip: ((query.page ?? 1) - 1) * (query.limit ?? 20) });
const paginationFor = (page, total) => ({ page: page.page, limit: page.limit, total, pages: Math.ceil(total / page.limit) });
export const reviewPresentation = (review) => ({ id: String(review._id), authorLabel: review.authorLabel, rating: review.rating, text: review.text, createdAt: review.createdAt });

async function eligibleProductBySlug(slug) {
  const product = await Product.findOne({ ...publicProductFilter(), slug }).select('_id categoryId subcategoryId').lean().maxTimeMS(TIMEOUT);
  if (!product) throw commerceError(404, 'PRODUCT_NOT_FOUND', 'Product not found.');
  const category = await Category.findOne({ _id: product.categoryId, active: true, parentId: null }).select('_id').lean().maxTimeMS(TIMEOUT);
  const child = !product.subcategoryId || await Category.findOne({ _id: product.subcategoryId, active: true, parentId: product.categoryId }).select('_id').lean().maxTimeMS(TIMEOUT);
  if (!category || !child) throw commerceError(404, 'PRODUCT_NOT_FOUND', 'Product not found.');
  return product;
}

async function eligibleReviewProductIds(ids) {
  if (!ids.length) return new Set();
  const products = await Product.find({ ...publicProductFilter(), _id: { $in: ids } }).select('_id categoryId subcategoryId').lean().maxTimeMS(TIMEOUT);
  return new Set((await attachEligibleCategories(products)).map((product) => String(product._id)));
}

async function attachEligibleCategories(products) {
  const ids = [...new Set(products.flatMap((product) => [product.categoryId, product.subcategoryId].filter(Boolean).map(String)))];
  const categories = await Category.find({ _id: { $in: ids }, active: true }).select('_id name slug parentId active').lean().maxTimeMS(TIMEOUT);
  const byId = new Map(categories.map((category) => [String(category._id), category]));
  return products.flatMap((product) => {
    const main = byId.get(String(product.categoryId));
    const child = product.subcategoryId ? byId.get(String(product.subcategoryId)) : null;
    if (!main || main.parentId || (product.subcategoryId && (!child || String(child.parentId) !== String(main._id)))) return [];
    return [{ ...product, categoryId: main, subcategoryId: child }];
  });
}

export async function listPublicReviews(slug, query) {
  const product = await eligibleProductBySlug(slug);
  const page = pageFor(query);
  const filter = { productId: product._id, status: 'published', approved: true, consentConfirmed: true };
  const [reviews, total] = await Promise.all([
    Review.find(filter).select('authorLabel rating text createdAt').sort({ createdAt: -1, _id: -1 }).skip(page.skip).limit(page.limit).lean().maxTimeMS(TIMEOUT),
    Review.countDocuments(filter).maxTimeMS(TIMEOUT),
  ]);
  return { reviews: reviews.map(reviewPresentation), pagination: paginationFor(page, total) };
}

export async function getPublicSiteContent() {
  const record = await SiteContent.findOne({ key: 'website-v1' }).select('-updatedBy -__v').lean().maxTimeMS(TIMEOUT);
  // The bounded overscan permits hiding reviews whose related product was withdrawn.
  const candidates = await Review.find({ status: 'published', approved: true, consentConfirmed: true, featured: true })
    .select('productId authorLabel rating text createdAt').sort({ displayOrder: 1, _id: 1 }).limit(40).lean().maxTimeMS(TIMEOUT);
  const eligibleIds = await eligibleReviewProductIds(candidates.filter((review) => review.productId).map((review) => review.productId));
  const contentSection = (name) => record?.[name]?.approved ? { title: record[name].title, body: record[name].body, updatedAt: record[name].updatedAt } : null;
  const { approved: _approved, updatedAt: _updatedAt, ...contactFields } = record?.contact || {};
  return {
    about: contentSection('about'), contact: record?.contact?.approved ? contactFields : null,
    policies: Object.fromEntries(['privacyPolicy', 'refundPolicy', 'shippingPolicy', 'termsOfService'].map((name) => [name, contentSection(name)])),
    faq: record?.faqApproved ? record.faq.map(({ question, answer }) => ({ question, answer })) : [],
    featuredReviews: candidates.filter((review) => !review.productId || eligibleIds.has(String(review.productId))).slice(0, 8).map(reviewPresentation),
  };
}

export async function getAdminSiteContent() {
  return (await SiteContent.findOne({ key: 'website-v1' }).select('-updatedBy').lean().maxTimeMS(TIMEOUT)) || new SiteContent().toObject();
}

export async function auditedWebsiteMutation(actor, action, resourceType, resourceId, callback) {
  assertDatabaseWriteAllowed(mongoose.connection, env);
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      assertDatabaseWriteAllowed(mongoose.connection, env);
      result = await callback(session);
      await recordAdminAudit(actor, { action, resourceType, resourceId: String(result?._id || resourceId), details: { status: result?.status ?? null, approved: result?.approved ?? null } }, { session });
    });
  } finally { await session.endSession(); }
  return result;
}

export async function updateSiteContent(actor, input) {
  return auditedWebsiteMutation(actor, 'website.content.edit', 'site_content', 'website-v1', async (session) => {
    const record = await SiteContent.findOne({ key: 'website-v1' }).session(session) || new SiteContent();
    for (const name of ['about', 'contact', 'privacyPolicy', 'refundPolicy', 'shippingPolicy', 'termsOfService']) {
      if (!input[name]) continue;
      const previous = record[name]?.toObject() || {};
      const patch = input[name];
      const changed = Object.entries(patch).some(([key, value]) => key !== 'approved' && value !== previous[key]);
      record[name] = { ...previous, ...patch, approved: patch.approved ?? (changed ? false : previous.approved), updatedAt: new Date() };
    }
    if (input.faq !== undefined) {
      const changed = JSON.stringify(input.faq) !== JSON.stringify(record.faq.map(({ question, answer }) => ({ question, answer })));
      record.faq = input.faq;
      if (changed && input.faqApproved === undefined) record.faqApproved = false;
    }
    if (input.faqApproved !== undefined) record.faqApproved = input.faqApproved;
    record.updatedBy = actor._id;
    await record.save({ session });
    return record;
  });
}

export async function listAdminReviews(query) {
  const page = pageFor(query);
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.productId) filter.productId = query.productId;
  if (query.q) filter.$text = { $search: query.q };
  const [reviews, total] = await Promise.all([
    Review.find(filter).select('productId authorLabel rating status approved consentConfirmed featured displayOrder createdAt updatedAt').populate({ path: 'productId', select: 'name slug' })
      .sort({ updatedAt: -1, _id: -1 }).skip(page.skip).limit(page.limit).lean().maxTimeMS(TIMEOUT),
    Review.countDocuments(filter).maxTimeMS(TIMEOUT),
  ]);
  return { reviews, pagination: paginationFor(page, total) };
}

export async function getAdminReview(id) {
  const review = await Review.findById(id).select('-createdBy -updatedBy').lean().maxTimeMS(TIMEOUT);
  if (!review) throw commerceError(404, 'REVIEW_NOT_FOUND', 'Review not found.');
  return review;
}

export async function saveReview(actor, id, input) {
  return auditedWebsiteMutation(actor, id ? 'website.review.edit' : 'website.review.create', 'review', id || 'new', async (session) => {
    if (input.productId && !await Product.exists({ _id: input.productId }).session(session).maxTimeMS(TIMEOUT)) throw commerceError(400, 'INVALID_PRODUCT', 'Choose an existing product.');
    const review = id ? await Review.findById(id).session(session) : new Review({ createdBy: actor._id });
    if (!review) throw commerceError(404, 'REVIEW_NOT_FOUND', 'Review not found.');
    const changed = id && ['productId', 'authorLabel', 'rating', 'text', 'consentConfirmed', 'sourceNote'].some((key) => input[key] !== undefined && String(input[key] ?? '') !== String(review[key] ?? ''));
    if (changed && input.approved === undefined) {
      review.approved = false;
      if (review.status === 'published' && input.status === undefined) review.status = 'draft';
    }
    review.set(input);
    review.updatedBy = actor._id;
    await review.save({ session });
    return review;
  });
}

export async function listCustomers(query) {
  const page = pageFor(query);
  const filter = { role: 'customer' };
  if (query.q?.includes('@')) filter.email = query.q.toLowerCase();
  else if (query.q) filter.name = { $regex: `^${query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` };
  const [customers, total] = await Promise.all([
    User.find(filter).select('_id name email active createdAt').sort({ createdAt: -1, _id: -1 }).skip(page.skip).limit(page.limit).lean().maxTimeMS(TIMEOUT),
    User.countDocuments(filter).maxTimeMS(TIMEOUT),
  ]);
  return { customers, pagination: paginationFor(page, total) };
}

export async function websiteOverview() {
  const [draftProducts, readyProducts, heldProducts, customers, pendingOrders, awaitingPayment, draftReviews] = await Promise.all([
    Product.countDocuments({ status: 'draft' }).maxTimeMS(TIMEOUT), Product.countDocuments({ status: 'ready' }).maxTimeMS(TIMEOUT), Product.countDocuments({ status: 'hold' }).maxTimeMS(TIMEOUT),
    User.countDocuments({ role: 'customer' }).maxTimeMS(TIMEOUT), Order.countDocuments({ fulfillmentState: { $in: ['received', 'confirmed', 'preparing'] } }).maxTimeMS(TIMEOUT),
    Order.countDocuments({ paymentState: 'awaiting_verification' }).maxTimeMS(TIMEOUT), Review.countDocuments({ status: 'draft' }).maxTimeMS(TIMEOUT),
  ]);
  const states = await NotificationEvent.aggregate([{ $match: { state: { $in: ['failed', 'dead', 'uncertain'] } } }, { $group: { _id: '$state', count: { $sum: 1 } } }]).option({ maxTimeMS: TIMEOUT });
  return { products: { draft: draftProducts, ready: readyProducts, hold: heldProducts }, customers, pendingOrders, awaitingPayment, draftReviews, checkoutEnabled: env.checkoutEnabled, notifications: { failed: 0, dead: 0, uncertain: 0, ...Object.fromEntries(states.map((state) => [state._id, state.count])) } };
}

export async function listNotificationDiagnostics(query) {
  const page = pageFor(query);
  const filter = query.state ? { state: query.state } : { state: { $in: ['failed', 'dead', 'uncertain'] } };
  const [events, total] = await Promise.all([
    NotificationEvent.find(filter).select('_id orderId event state attempts nextAttemptAt lastErrorCode sentAt createdAt').sort({ createdAt: -1, _id: -1 }).skip(page.skip).limit(page.limit).lean().maxTimeMS(TIMEOUT),
    NotificationEvent.countDocuments(filter).maxTimeMS(TIMEOUT),
  ]);
  return { events: events.map((event) => ({ ...event, lastErrorCode: /^[A-Z0-9_]{1,80}$/.test(event.lastErrorCode || '') ? event.lastErrorCode : event.lastErrorCode ? 'DELIVERY_FAILED' : null })), pagination: paginationFor(page, total) };
}

export async function websiteAnalytics(now = new Date()) {
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [result] = await Order.aggregate([
    { $match: { createdAt: { $gte: since, $lte: now } } },
    { $project: { paymentState: 1, fulfillmentState: 1, total: '$totals.totalPiastres' } },
    { $group: { _id: null, orders: { $sum: 1 }, paidOrders: { $sum: { $cond: [{ $eq: ['$paymentState', 'paid'] }, 1, 0] } }, deliveredOrders: { $sum: { $cond: [{ $eq: ['$fulfillmentState', 'delivered'] }, 1, 0] } }, cancelledOrders: { $sum: { $cond: [{ $eq: ['$fulfillmentState', 'cancelled'] }, 1, 0] } }, collectedPiastres: { $sum: { $cond: [{ $eq: ['$paymentState', 'paid'] }, '$total', 0] } }, awaitingVerificationPiastres: { $sum: { $cond: [{ $eq: ['$paymentState', 'awaiting_verification'] }, '$total', 0] } } } },
  ]).option({ maxTimeMS: TIMEOUT });
  const { _id: _id, ...summary } = result || { orders: 0, paidOrders: 0, deliveredOrders: 0, cancelledOrders: 0, collectedPiastres: 0, awaitingVerificationPiastres: 0 };
  checkedMoney(summary.collectedPiastres);
  checkedMoney(summary.awaitingVerificationPiastres);
  return { since, until: now, days: 30, ...summary };
}

export async function listPublicBundles(now = new Date()) {
  const bundles = [];
  const batchSize = 20;
  const candidateLimit = 100; // Matches the existing admin active-bundle ceiling.
  let examined = 0;
  let cursor = null;
  while (bundles.length < 8 && examined < candidateLimit) {
    const conditions = [
      { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: null }, { endsAt: { $gt: now } }] },
    ];
    if (cursor) conditions.push({ $or: [{ priority: { $gt: cursor.priority } }, { priority: cursor.priority, _id: { $gt: cursor._id } }] });
    const candidates = await BundleRule.find({ published: true, active: true, $and: conditions })
      .select('name description items discountKind discountValue active maxApplications priority startsAt endsAt').sort({ priority: 1, _id: 1 }).limit(Math.min(batchSize, candidateLimit - examined)).lean().maxTimeMS(TIMEOUT);
    if (!candidates.length) break;
    examined += candidates.length;
    cursor = candidates.at(-1);
    // At most twenty rules × twenty configured item references are read per batch.
    const ids = [...new Set(candidates.flatMap((bundle) => bundle.items.map((item) => String(item.productId))))];
    const products = await Product.find({ $and: [publicProductFilter(), orderableProductStockFilter(), { _id: { $in: ids } }] })
      .select('name slug categoryId subcategoryId mainImageKey pricePiastres compareAtPiastres priceApproved inventory variants personalization.fields.required customization.enabled featured bestSeller').lean().maxTimeMS(TIMEOUT);
    const byId = new Map((await attachEligibleCategories(products)).map((product) => [String(product._id), product]));
    for (const bundle of candidates) {
      const cards = [];
      let eligible = true;
      for (const item of bundle.items) {
        const product = byId.get(String(item.productId));
        const variant = item.variantKey ? product?.variants.find((entry) => entry.key === item.variantKey) : null;
        const inventory = variant?.inventory || product?.inventory;
        if (!product || (item.variantKey && (!variant || !inventoryCanOrder(variant.inventory))) || (!item.variantKey && product.variants.length) || (inventory?.mode === 'tracked' && inventory.quantity < item.quantity)) { eligible = false; break; }
        const card = publicProductCard(product);
        if (variant?.pricePiastres != null) card.pricePiastres = variant.pricePiastres;
        cards.push({ ...card, bundleQuantity: item.quantity, variantKey: item.variantKey ?? null });
      }
      if (!eligible) continue;
      let pricing;
      try {
        pricing = evaluatePromotions(cards.map((card) => ({ productId: card._id, variantKey: card.variantKey, quantity: card.bundleQuantity, unitPricePiastres: card.pricePiastres })), [bundle], null, { now });
      } catch (error) {
        if (['PRICING_INVALID', 'PROMOTION_UNAVAILABLE'].includes(error.code)) continue;
        throw error;
      }
      bundles.push({ id: String(bundle._id), name: bundle.name, description: bundle.description || '', products: cards, discountKind: bundle.discountKind, discountValue: bundle.discountValue,
        bundleSubtotalPiastres: pricing.subtotalPiastres, effectiveDiscountPiastres: pricing.discountPiastres, bundleTotalPiastres: pricing.totalPiastres });
      if (bundles.length === 8) break;
    }
    if (candidates.length < batchSize) break;
  }
  return { bundles };
}

export const validateWebsiteInput = parseInput;
