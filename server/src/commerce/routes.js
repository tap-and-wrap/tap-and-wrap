import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { pipeline } from 'node:stream/promises';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { csrfProtection } from '../middleware/csrf.js';
import { env } from '../config/env.js';
import { isDatabaseReady } from '../config/db.js';
import { Order } from '../models/Order.js';
import { commerceOwner, guestOwner, rotateGuestCookie } from './ownership.js';
import { cartResponse, addCartItem, updateCartQuantity, removeCartItem, clearCart, mergeGuestCart } from './cart.js';
import { prepareCheckout, placeOrder, normalizePhone, presentOrder, getOwnedOrder, changeOrderState, orderFiles, findOwnedCheckoutSubmission } from './orders.js';
import { GOVERNORATES, shippingForGovernorate } from './promotions.js';
import ShippingConfig from '../models/ShippingConfig.js';
import { openPrivateUpload } from './uploads.js';
import { commerceError } from './errors.js';
import { publicConfigurationRoutes } from './configuration.routes.js';
import uploadsRouter from './uploads.routes.js';
import { captureAction, currentConsent, monetaryParameters, ownedPurchaseReceipt } from '../tracking/service.js';
import { presentOrderSummary } from './order-presentation.js';
import { CommerceJobRun } from '../models/CommerceJobRun.js';
import { NotificationEvent } from '../models/NotificationEvent.js';
import { MetaEvent } from '../models/MetaEvent.js';
import { Upload } from '../models/Upload.js';

const id = z.string().regex(/^[a-f0-9]{24}$/i);
const uuid = z.string().uuid();
const fields = z.record(z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/), z.union([z.string().max(10000).refine(value => Array.from(value).length <= 5000, 'Text supports at most 5000 characters.'), z.array(id).max(10)])).refine(value => Object.keys(value).length <= 30);
const customization = z.object({ templateId: id, version: z.number().int().min(1).max(1000000),
  selections: z.array(z.object({ groupKey: z.string().max(64), optionKey: z.string().max(64), quantity: z.number().int().min(1).max(20) }).strict()).max(100).optional(), fields: fields.optional() }).strict();
const cartItem = z.object({ productId: id, variantKey: z.string().max(80).nullable().optional(), quantity: z.number().int().min(1).max(99), personalization: fields.optional(), customization: customization.nullable().optional() }).strict();
const paymentMethod = z.enum(['cod', 'instapay']);
const discountCode = z.string().trim().max(40).optional();
const customer = z.object({ name: z.string().trim().min(2).max(100), email: z.email().max(254), phone: z.string().min(10).max(25),
  governorate: z.enum(GOVERNORATES.map(value => value.id)), address: z.string().trim().min(10).max(500), notes: z.string().trim().max(1000).optional() }).strict();
const checkoutSchema = z.object({ checkoutKey: uuid, paymentMethod, governorate: customer.shape.governorate, discountCode }).strict();
const orderSchema = z.object({ checkoutKey: uuid, customer, paymentMethod, discountCode, paymentProofId: id.optional() }).strict();
const states = z.object({ revision: z.number().int().nonnegative(), fulfillmentState: z.enum(['received', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled']).optional(),
  paymentState: z.enum(['unpaid', 'awaiting_verification', 'paid', 'rejected']).optional(), reason: z.string().trim().max(500).optional(), internalNote: z.string().trim().max(500).optional(), publicReason: z.string().trim().max(500).optional() }).strict();
const pageSchema = z.object({ page: z.coerce.number().int().min(1).max(200).default(1), limit: z.coerce.number().int().positive().transform(value => Math.min(value, 20)).default(20),
  q: z.string().trim().max(100).optional(), fulfillmentState: states.shape.fulfillmentState, paymentState: states.shape.paymentState,
  sort: z.enum(['newest', 'oldest']).default('newest') }).strict();
const shoppingLimit = rateLimit({ windowMs: 60000, limit: 90, standardHeaders: 'draft-8', legacyHeaders: false });
const checkoutLimit = rateLimit({ windowMs: 15 * 60000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false });
const trackingLimit = rateLimit({ windowMs: 15 * 60000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false });
const submissionStatusLimit = rateLimit({ windowMs: 5 * 60000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false });
// Isolated suites reset counters between independent simulated clients. Runtime
// rate limits remain unchanged, including inside rate-limit acceptance tests.
export function resetCommerceLimitsForTests() {
  if (process.env.NODE_ENV !== 'test') throw new Error('Rate-limit reset is restricted to isolated tests.');
  for (const limiter of [shoppingLimit, checkoutLimit, trackingLimit, submissionStatusLimit]) limiter.resetKey('127.0.0.1');
}
export function requireCommerceDatabase(req, res, next) {
  if (!isDatabaseReady()) throw commerceError(503, 'COMMERCE_UNAVAILABLE', 'Commerce database is unavailable.');
  next();
}
async function listOrders(filter, query, admin) {
  const direction = query.sort === 'oldest' ? 1 : -1;
  const [orders, total] = await Promise.all([
    Order.find(filter).select('_id orderNumber customer.name customer.governorate totals paymentMethod paymentState fulfillmentState createdAt updatedAt revision').sort({ createdAt: direction, _id: direction }).skip((query.page - 1) * query.limit).limit(query.limit).lean().maxTimeMS(3000),
    Order.countDocuments(filter).maxTimeMS(3000),
  ]);
  return { orders: orders.map(order => presentOrderSummary(order, { admin })), pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) } };
}
function orderFilter(query) {
  const filter = {};
  if (query.q) { if (!/^[1-9][0-9]{5}$/.test(query.q)) throw commerceError(400, 'ORDER_SEARCH_INVALID', 'Search by the exact six-digit order number.'); filter.orderNumber = query.q; }
  if (query.fulfillmentState) filter.fulfillmentState = query.fulfillmentState;
  if (query.paymentState) filter.paymentState = query.paymentState;
  return filter;
}
async function streamUpload(req, res, uploadId, owner, adminUser) {
  const controller = new AbortController();
  const abort = () => { if (!res.writableFinished) controller.abort(); };
  req.once('aborted', abort); res.once('close', abort);
  try {
    const upload = await openPrivateUpload(uploadId, owner, { adminUser, signal: controller.signal });
    res.set('Cache-Control', 'private, no-store'); res.set('X-Content-Type-Options', 'nosniff');
    res.set('Content-Security-Policy', "default-src 'none'; sandbox");
    res.type(upload.mimeType || upload.contentType); res.set('Content-Disposition', 'inline');
    if (upload.sizeBytes) res.set('Content-Length', String(upload.sizeBytes));
    const body = upload.body || upload.stream;
    if (!body?.pipe) throw commerceError(503, 'PRIVATE_FILE_UNAVAILABLE', 'Private file content is unavailable.');
    await pipeline(body, res, { signal: controller.signal });
  } catch (error) { if (res.headersSent) res.destroy(); else throw error; }
  finally { req.removeListener('aborted', abort); res.removeListener('close', abort); }
}
export const commerceRoutes = Router();
commerceRoutes.use(requireCommerceDatabase, shoppingLimit, commerceOwner, csrfProtection);
commerceRoutes.get('/cart', async (req, res) => res.json({ ok: true, data: await cartResponse(req.commerceOwner) }));
commerceRoutes.post('/cart/items', async (req, res) => res.status(201).json({ ok: true, data: await addCartItem(req.commerceOwner, cartItem.parse(req.body), {
  onAdded: async (item) => {
    const parameters = monetaryParameters([item], item.unitPricePiastres * item.quantity);
    const event = await captureAction(req, 'AddToCart', parameters, { sourcePath: `/products/${item.slug}` });
    const customized = item.customized ? await captureAction(req, 'CustomizedAddToCart', parameters, { sourcePath: `/products/${item.slug}` }) : null;
    return [event, customized].filter(Boolean);
  },
}) }));
commerceRoutes.patch('/cart/items/:id', async (req, res) => res.json({ ok: true, data: await updateCartQuantity(req.commerceOwner, uuid.parse(req.params.id), z.object({ quantity: cartItem.shape.quantity }).strict().parse(req.body).quantity) }));
commerceRoutes.delete('/cart/items/:id', async (req, res) => res.json({ ok: true, data: await removeCartItem(req.commerceOwner, uuid.parse(req.params.id)) }));
commerceRoutes.delete('/cart', async (req, res) => res.json({ ok: true, data: await clearCart(req.commerceOwner) }));
commerceRoutes.post('/cart/merge', requireAuth, async (req, res) => {
  z.object({}).strict().parse(req.body || {});
  const result = await mergeGuestCart(guestOwner(req), `user:${req.user._id}`); rotateGuestCookie(res);
  res.json({ ok: true, data: result });
});
commerceRoutes.get('/checkout/config', async (req, res) => {
  const configuration = await ShippingConfig.findOne({ key: 'egypt-v1' }).select('cairoGizaPiastres otherGovernoratesPiastres approved').lean().maxTimeMS(3000);
  const cairo = shippingForGovernorate('cairo', configuration), other = shippingForGovernorate('alexandria', configuration);
  res.json({ ok: true, data: { enabled: env.checkoutEnabled === true, governorates: GOVERNORATES.map(value => ({ ...value, shippingPiastres: ['cairo', 'giza'].includes(value.id) ? cairo.shippingPiastres : other.shippingPiastres })), instaPayNumber: '01060673073' } });
});
commerceRoutes.get('/checkout/submissions/:checkoutKey', submissionStatusLimit, async (req, res) => {
  z.object({}).strict().parse(req.query);
  const order = await findOwnedCheckoutSubmission(uuid.parse(req.params.checkoutKey), req.commerceOwner);
  res.set('Cache-Control', 'private, no-store');
  res.json({ ok: true, data: { order: order ? presentOrder(order) : null, tracking: order ? await ownedPurchaseReceipt(order, req) : null } });
});
commerceRoutes.post('/checkout/quote', checkoutLimit, async (req, res) => {
  const input = checkoutSchema.parse(req.body), result = await prepareCheckout(req.commerceOwner, input, req.user?._id);
  const parameters = { currency: 'EGP', value: result.totalPiastres / 100, payment_method: input.paymentMethod };
  const tracking = await Promise.all([
    captureAction(req, 'InitiateCheckout', parameters, { sourcePath: '/checkout', dedupKey: input.checkoutKey }),
  ]);
  res.json({ ok: true, data: { ...result, tracking: tracking.filter(Boolean) } });
});
commerceRoutes.post('/orders', checkoutLimit, async (req, res) => {
  const consent = await currentConsent(req);
  const order = await placeOrder(req.commerceOwner, orderSchema.parse(req.body), req.user?._id, { trackingConsentId: consent?._id || null });
    const record = consent ? await getOwnedOrder(order.id, req.commerceOwner) : null;
    const paymentTracking = record && String(record.trackingConsentId) === String(consent._id)
      ? await captureAction(req, 'AddPaymentInfo', { currency: 'EGP', value: record.totals.totalPiastres / 100, payment_method: record.paymentMethod }, { sourcePath: '/checkout', dedupKey: `order:${record._id}` }) : null;
    res.status(201).json({ ok: true, data: { order, tracking: record ? await ownedPurchaseReceipt(record, req) : null, paymentTracking } });
});
commerceRoutes.post('/orders/track', trackingLimit, async (req, res) => {
  const input = z.object({ orderNumber: z.string().regex(/^[1-9][0-9]{5}$/), phone: z.string().min(10).max(25) }).strict().parse(req.body);
  const phone = normalizePhone(input.phone);
  const order = await Order.findOne({ orderNumber: input.orderNumber, 'customer.phone': phone }).select('orderNumber fulfillmentState paymentState createdAt updatedAt').lean().maxTimeMS(3000);
  if (!order) throw commerceError(404, 'TRACKING_NOT_FOUND', 'No matching order was found. Check both details.');
  res.json({ ok: true, data: { order: { orderNumber: order.orderNumber, fulfillmentState: order.fulfillmentState, paymentState: order.paymentState, createdAt: order.createdAt, updatedAt: order.updatedAt } } });
});
commerceRoutes.get('/orders', requireAuth, async (req, res) => { const query = pageSchema.parse(req.query); res.json({ ok: true, data: await listOrders({ ...orderFilter(query), userId: req.user._id }, query, false) }); });
commerceRoutes.get('/orders/:id', async (req, res) => {
  const order = await getOwnedOrder(id.parse(req.params.id), req.commerceOwner);
  res.json({ ok: true, data: { order: presentOrder(order), tracking: await ownedPurchaseReceipt(order, req) } });
});
commerceRoutes.post('/orders/:id/cancel', async (req, res) => { const input = z.object({ revision: states.shape.revision, reason: states.shape.reason }).strict().parse(req.body); res.json({ ok: true, data: { order: await changeOrderState(id.parse(req.params.id), req.commerceOwner, { ...input, fulfillmentState: 'cancelled' }, req.user) } }); });

commerceRoutes.use(publicConfigurationRoutes);
commerceRoutes.use('/uploads', uploadsRouter);
export const adminCommerceRoutes = Router();
adminCommerceRoutes.use(requireCommerceDatabase, requireAuth, requireAdmin, csrfProtection);
adminCommerceRoutes.get('/jobs', async (req, res) => {
  const query = z.object({ page: z.coerce.number().int().min(1).max(200).default(1), limit: z.coerce.number().int().min(1).max(20).default(20) }).strict().parse(req.query);
  const [runs, total, notificationDead, notificationUncertain, trackingDead, cleanupReview] = await Promise.all([
    CommerceJobRun.find().select('runId state startedAt finishedAt leaseUntil stages').sort({ startedAt: -1, _id: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean().maxTimeMS(3000),
    CommerceJobRun.countDocuments().maxTimeMS(3000), NotificationEvent.countDocuments({ state: 'dead' }).maxTimeMS(3000),
    NotificationEvent.countDocuments({ state: 'uncertain' }).maxTimeMS(3000), MetaEvent.countDocuments({ state: 'dead' }).maxTimeMS(3000),
    Upload.countDocuments({ cleanupReviewRequired: true }).maxTimeMS(3000),
  ]);
  res.set('Cache-Control', 'private, no-store');
  res.json({ ok: true, data: { runs, pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) }, attention: { notificationDead, notificationUncertain, trackingDead, cleanupReview } } });
});
adminCommerceRoutes.get('/orders', async (req, res) => { const query = pageSchema.parse(req.query); res.json({ ok: true, data: await listOrders(orderFilter(query), query, true) }); });
adminCommerceRoutes.get('/orders/:id', async (req, res) => { const order = await getOwnedOrder(id.parse(req.params.id), null, { admin: true }); res.json({ ok: true, data: { order: { ...presentOrder(order, { admin: true }), files: await orderFiles(order) } } }); });
adminCommerceRoutes.patch('/orders/:id/state', async (req, res) => res.json({ ok: true, data: { order: await changeOrderState(id.parse(req.params.id), null, states.parse(req.body), req.user) } }));
adminCommerceRoutes.get('/orders/:id/proof', async (req, res) => {
  const order = await getOwnedOrder(id.parse(req.params.id), null, { admin: true });
  if (!order.paymentProofId) throw commerceError(404, 'PROOF_NOT_FOUND', 'No payment proof is attached.');
  await streamUpload(req, res, order.paymentProofId, null, req.user);
});
adminCommerceRoutes.get('/orders/:id/files/:uploadId', async (req, res) => {
  const order = await getOwnedOrder(id.parse(req.params.id), null, { admin: true }); const uploadId = id.parse(req.params.uploadId);
  if (!order.uploadIds.some(value => String(value) === uploadId)) throw commerceError(404, 'UPLOAD_NOT_FOUND', 'Upload not found.');
  await streamUpload(req, res, uploadId, null, req.user);
});
