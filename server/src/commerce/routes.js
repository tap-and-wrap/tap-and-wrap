import { whatsappQuotation } from './whatsapp-quotation.js';
import { serviceRequestRoutes, adminServiceRequestRoutes } from './service-request.routes.js';
import { operationsRoutes } from './operations.js';
import { accountingInput } from './accounting-validation.js';
import { mutateOrderAccounting, orderAccounting } from './order-accounting.js';
import { Router } from 'express';
import { attachProductPaths } from '../catalog/product-addresses.js';
import { productHref } from '../../../shared/product-paths.mjs';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { pipeline } from 'node:stream/promises';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { csrfProtection } from '../middleware/csrf.js';
import { env } from '../config/env.js';
import { isDatabaseReady } from '../config/db.js';
import { Order } from '../models/Order.js';
import { OrderSettlement } from '../models/OrderSettlement.js';
import { fingerprint } from './pricing.js';
import { commerceOwner, guestOwner, rotateGuestCookie } from './ownership.js';
import { cartResponse, addCartItem, updateCartQuantity, removeCartItem, clearCart, mergeGuestCart } from './cart.js';
import { prepareCheckout, placeOrder, normalizePhone, presentOrder, getOwnedOrder, changeOrderState, orderFiles, findOwnedCheckoutSubmission } from './orders.js';
import { GOVERNORATES, shippingForGovernorate } from './promotions.js';

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
import { cartItemInput, cartQuantity } from './cart-contract.js';

const id = z.string().regex(/^[a-f0-9]{24}$/i);
const uuid = z.string().uuid();
const paymentMethod = z.enum(['cod', 'instapay']);
const discountCode = z.string().trim().max(40).optional();
const customer = z.object({ name: z.string().trim().min(2).max(100), email: z.email().max(254), phone: z.string().min(10).max(25),
  governorate: z.enum(GOVERNORATES.map(value => value.id)), address: z.string().trim().min(10).max(500), notes: z.string().trim().max(1000).optional() }).strict();
const checkoutSchema = z.object({ checkoutKey: uuid, paymentMethod, governorate: customer.shape.governorate, discountCode }).strict();
const orderSchema = z.object({ checkoutKey: uuid, customer, paymentMethod, discountCode, paymentProofId: id.optional() }).strict();
const states = z.object({ revision: z.number().int().nonnegative(), fulfillmentState: z.enum(['received', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned', 'cancelled']).optional(),
  paymentState: z.enum(['unpaid', 'awaiting_transfer', 'awaiting_verification', 'partially_paid', 'paid', 'rejected', 'refunded']).optional(), reason: z.string().trim().max(500).optional(), internalNote: z.string().trim().max(500).optional(), publicReason: z.string().trim().max(500).optional() }).strict();
const pageSchema = z.object({ page: z.coerce.number().int().min(1).max(200).default(1), limit: z.coerce.number().int().positive().transform(value => Math.min(value, 20)).default(20),
  q: z.string().trim().max(100).optional(), fulfillmentState: states.shape.fulfillmentState, paymentState: states.shape.paymentState,
  action: z.enum(['awaiting_transfer', 'proof_review', 'shipping_pending', 'follow_up_overdue', 'cancellation_requested', 'refund_review']).optional(),
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
    Order.find(filter).select('_id orderNumber customer.name customer.governorate totals accountingVersion charges financialSummary followUpDueAt cancellationRequestedAt paymentMethod paymentState fulfillmentState createdAt updatedAt revision').sort({ createdAt: direction, _id: direction }).skip((query.page - 1) * query.limit).limit(query.limit).lean().maxTimeMS(3000),
    Order.countDocuments(filter).maxTimeMS(3000),
  ]);
  return { orders: orders.map(order => presentOrderSummary(order, { admin })), pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) } };
}
function orderFilter(query) {
  const filter = {};
  if (query.q) { if (!/^[1-9][0-9]{5}$/.test(query.q)) throw commerceError(400, 'ORDER_SEARCH_INVALID', 'Search by the exact six-digit order number.'); filter.orderNumber = query.q; }
  if (query.fulfillmentState) filter.fulfillmentState = query.fulfillmentState;
  if (query.paymentState) filter.paymentState = query.paymentState;
  if (query.action === 'awaiting_transfer') filter.paymentState = 'awaiting_transfer';
  if (query.action === 'proof_review') filter.proofReviewRequired = true;
  if (query.action === 'shipping_pending') filter.charges = { $elemMatch: { kind: 'shipping', state: { $in: ['pending', 'offered', 'declined'] } } };
  if (query.action === 'follow_up_overdue') { filter.initialContactAt = null; filter.serviceRequestId = null; filter.createdAt = { $lte: new Date(Date.now() - 12 * 3600000) }; filter.fulfillmentState = { $nin: ['cancelled', 'returned', 'delivered'] }; }
  if (query.action === 'cancellation_requested') { filter.cancellationRequestedAt = { $ne: null }; filter.fulfillmentState = { $nin: ['cancelled', 'returned'] }; }
  if (query.action === 'refund_review') filter['financialSummary.refundReviewRequired'] = true;
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
async function optionalPurchaseReceipt(order, req) {
  try { return await ownedPurchaseReceipt(order, req); }
  catch { return null; }
}
export const commerceRoutes = Router();
commerceRoutes.use(requireCommerceDatabase, shoppingLimit, commerceOwner, csrfProtection);
commerceRoutes.get('/cart', async (req, res) => res.json({ ok: true, data: await cartResponse(req.commerceOwner) }));
commerceRoutes.post('/cart/items', async (req, res) => res.status(201).json({ ok: true, data: await addCartItem(req.commerceOwner, cartItemInput.parse(req.body), {
  onAdded: async (item) => {
    // Builder contents/messages/configuration hashes have no approved public
    // Product tracking identity. Do not construct or dispatch a gift receipt.
    if (item.kind === 'gift_box_v2') return null;
    const parameters = monetaryParameters([item], item.unitPricePiastres * item.quantity);
    const [product] = await attachProductPaths([{ _id: item.productId, slug: item.slug }]);
    const sourcePath = productHref(product);
    const event = await captureAction(req, 'AddToCart', parameters, { sourcePath });
    const customized = item.customized ? await captureAction(req, 'CustomizedAddToCart', parameters, { sourcePath }) : null;
    return [event, customized].filter(Boolean);
  },
}) }));
commerceRoutes.patch('/cart/items/:id', async (req, res) => res.json({ ok: true, data: await updateCartQuantity(req.commerceOwner, uuid.parse(req.params.id), z.object({ quantity: cartQuantity }).strict().parse(req.body).quantity) }));
commerceRoutes.delete('/cart/items/:id', async (req, res) => res.json({ ok: true, data: await removeCartItem(req.commerceOwner, uuid.parse(req.params.id)) }));
commerceRoutes.delete('/cart', async (req, res) => res.json({ ok: true, data: await clearCart(req.commerceOwner) }));
commerceRoutes.post('/cart/merge', requireAuth, async (req, res) => {
  z.object({}).strict().parse(req.body || {});
  const result = await mergeGuestCart(guestOwner(req), `user:${req.user._id}`); rotateGuestCookie(res);
  res.json({ ok: true, data: result });
});
commerceRoutes.get('/checkout/config', async (req, res) => {
  res.json({ ok: true, data: { enabled: env.checkoutEnabled === true, governorates: GOVERNORATES, shippingStatus: 'pending_confirmation', shippingPiastres: null, instaPayNumber: '01060673073' } });
});
commerceRoutes.get('/checkout/submissions/:checkoutKey', submissionStatusLimit, async (req, res) => {
  z.object({}).strict().parse(req.query);
  const order = await findOwnedCheckoutSubmission(uuid.parse(req.params.checkoutKey), req.commerceOwner);
  res.set('Cache-Control', 'private, no-store');
  res.json({ ok: true, data: { order: order ? presentOrder(order) : null, tracking: order ? await optionalPurchaseReceipt(order, req) : null } });
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
  // An unverified/unavailable optional consent defaults to no tracking; it must
  // not prevent recovery of an order that already committed under this key.
  let consent = null;
  try { consent = await currentConsent(req); } catch { /* Fail closed for tracking only. */ }
  const order = await placeOrder(req.commerceOwner, orderSchema.parse(req.body), req.user?._id, { trackingConsentId: consent?._id || null });
  let tracking = null, paymentTracking = null;
  // Everything below order acceptance is optional receipt work. A failed lookup
  // or adapter must not turn an already committed order into a false failure.
  try {
    const record = consent ? await getOwnedOrder(order.id, req.commerceOwner) : null;
    paymentTracking = record && String(record.trackingConsentId) === String(consent._id)
      ? await captureAction(req, 'AddPaymentInfo', { currency: 'EGP', value: record.totals.totalPiastres / 100, payment_method: record.paymentMethod }, { sourcePath: '/checkout', dedupKey: `order:${record._id}` }) : null;
    tracking = record ? await optionalPurchaseReceipt(record, req) : null;
  } catch { /* The order and durable transactional event remain authoritative. */ }
  res.status(201).json({ ok: true, data: { order, tracking, paymentTracking } });
});
commerceRoutes.post('/orders/track', trackingLimit, async (req, res) => {
  const input = z.object({ orderNumber: z.string().regex(/^[1-9][0-9]{5}$/), phone: z.string().min(10).max(25) }).strict().parse(req.body);
  const phone = normalizePhone(input.phone);
  const order = await Order.findOne({ orderNumber: input.orderNumber, 'customer.phone': phone }).select('orderNumber fulfillmentState paymentState charges accountingVersion createdAt updatedAt').lean().maxTimeMS(3000);
  if (!order) throw commerceError(404, 'TRACKING_NOT_FOUND', 'No matching order was found. Check both details.');
  res.json({ ok: true, data: { order: { orderNumber: order.orderNumber, fulfillmentState: order.fulfillmentState, paymentState: order.paymentState, shippingStatus: order.accountingVersion === 1 ? order.charges?.find(charge => charge.kind === 'shipping')?.state : 'legacy', createdAt: order.createdAt, updatedAt: order.updatedAt } } });
});
commerceRoutes.get('/orders', requireAuth, async (req, res) => { const query = pageSchema.parse(req.query); res.json({ ok: true, data: await listOrders({ ...orderFilter(query), userId: req.user._id }, query, false) }); });
commerceRoutes.get('/orders/:id', async (req, res) => {
  const order = await getOwnedOrder(id.parse(req.params.id), req.commerceOwner);
  res.json({ ok: true, data: { order: { ...presentOrder(order), accounting: await orderAccounting(order) }, tracking: await optionalPurchaseReceipt(order, req) } });
});
commerceRoutes.post('/orders/:id/accounting', async (req, res) => { const order = await mutateOrderAccounting(id.parse(req.params.id), req.commerceOwner, accountingInput.parse(req.body), req.user); res.json({ ok: true, data: { order: { ...presentOrder(order), accounting: await orderAccounting(order) } } }); });
commerceRoutes.post('/orders/:id/cancel', async (req, res) => { const input = z.object({ revision: states.shape.revision, reason: states.shape.reason }).strict().parse(req.body); const record = await getOwnedOrder(id.parse(req.params.id), req.commerceOwner); const order = record.accountingVersion === 1 ? presentOrder(await mutateOrderAccounting(record._id, req.commerceOwner, { ...input, action: 'request_cancel' }, req.user)) : await changeOrderState(record._id, req.commerceOwner, { ...input, fulfillmentState: 'cancelled' }, req.user); res.json({ ok: true, data: { order } }); });

commerceRoutes.use(publicConfigurationRoutes);
commerceRoutes.use(serviceRequestRoutes);
commerceRoutes.use('/uploads', uploadsRouter);
export const adminCommerceRoutes = Router();
adminCommerceRoutes.use(requireCommerceDatabase, requireAuth, requireAdmin, csrfProtection);
adminCommerceRoutes.use(operationsRoutes);
adminCommerceRoutes.use(adminServiceRequestRoutes);
adminCommerceRoutes.get('/settlements/lookup', async (req, res) => {
  const input = z.object({ method: paymentMethod, reference: z.string().trim().min(3).max(120).regex(/^[A-Za-z0-9/_-]+$/) }).strict().parse(req.query);
  const entry = await OrderSettlement.findOne({ referenceKey: fingerprint({ method: input.method, reference: input.reference.toUpperCase() }) }).lean().maxTimeMS(3000);
  const order = entry ? await Order.findById(entry.orderId).select('orderNumber').lean().maxTimeMS(3000) : null;
  res.json({ ok: true, data: { settlement: entry ? { id: String(entry._id), orderId: String(entry.orderId), orderNumber: order?.orderNumber || null, direction: entry.direction, amountPiastres: entry.amountPiastres, method: entry.method } : null } });
});
adminCommerceRoutes.post('/orders/:id/accounting', async (req, res) => { const order = await mutateOrderAccounting(id.parse(req.params.id), null, accountingInput.parse(req.body), req.user); res.json({ ok: true, data: { order: { ...presentOrder(order, { admin: true }), accounting: await orderAccounting(order, { admin: true }) } } }); });
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
function adminInventoryClaims(order) {
  return (order.inventoryClaims || []).map(claim => {
    const label = claim.kind === 'product'
      ? order.lines.find(line => String(line.productId) === String(claim.id))?.name || 'Product requiring source review'
      : claim.kind === 'gift_box_component'
        ? order.lines.filter(line => line.kind === 'gift_box_v2').flatMap(line => Array.isArray(line.giftBox?.components) ? line.giftBox.components : []).find(component => component.componentId === claim.id)?.displayName || 'Builder component requiring source review'
        : claim.kind === 'component'
          ? order.lines.flatMap(line => line.customization?.selections || []).find(selection => String(selection.componentId) === String(claim.id))?.componentName || 'Component requiring source review'
          : 'Unknown inventory source requiring review';
    return { sourceId: String(claim.id), label, kind: claim.kind, variantKey: claim.variantKey,
      quantity: claim.quantity, mode: claim.mode, ...(claim.consumedQuantity !== undefined ? { consumedQuantity: claim.consumedQuantity } : {}) };
  });
}
adminCommerceRoutes.get('/orders/:id', async (req, res) => { const order = await getOwnedOrder(id.parse(req.params.id), null, { admin: true }); const accounting = await orderAccounting(order, { admin: true }); res.json({ ok: true, data: { order: { ...presentOrder(order, { admin: true }), accounting, quotation: whatsappQuotation(order, accounting), inventoryClaims: adminInventoryClaims(order), files: await orderFiles(order) } } }); });
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
