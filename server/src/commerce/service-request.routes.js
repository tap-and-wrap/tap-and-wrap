import CustomizationTemplate from '../models/CustomizationTemplate.js';
import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { pipeline } from 'node:stream/promises';
import { ServiceRequest } from '../models/ServiceRequest.js';
import { Product } from '../models/Product.js';
import { ComponentOption } from '../models/ComponentOption.js';
import { Order } from '../models/Order.js';
import { Upload } from '../models/Upload.js';
import { serviceRequestInput, requestActionInput } from './request-validation.js';
import { createServiceRequest, actOnServiceRequest, requestStatus, requestWhatsapp } from './service-requests.js';
import { componentEstimate, engravingProductPresentation, activeRequestCategory } from './request-policy.js';
import { orderAccounting } from './order-accounting.js';
import { openPrivateUpload } from './uploads.js';
import { commerceError } from './errors.js';
import { GOVERNORATES } from './promotions.js';
import { env } from '../config/env.js';
import { presentGiftBoxV2Snapshot } from '../gift-box/request-presentation.js';

export const serviceRequestRoutes = Router(), adminServiceRequestRoutes = Router();
adminServiceRequestRoutes.use((req, res, next) => { res.set('Cache-Control', 'private, no-store'); res.set('X-Robots-Tag', 'noindex, nofollow, noarchive'); res.vary('Cookie'); next(); });
const id = z.string().regex(/^[a-f0-9]{24}$/i);
const query = z.object({ page: z.coerce.number().int().min(1).max(200).default(1), search: z.string().trim().max(100).optional() }).strict();
const limiter = rateLimit({ windowMs: 15 * 60000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false });
const reply = (res, data, status = 200) => res.status(status).json({ ok: true, data });
const receipt = record => ({ id: String(record._id), reference: record.reference, service: record.service, state: record.state, createdAt: record.createdAt, followUpDueAt: record.followUpDueAt });
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
serviceRequestRoutes.get('/service-requests/options/:service', async (req, res) => {
  const service = z.enum(['gift_box', 'laser_engraving']).parse(req.params.service), input = query.parse(req.query);
  if (!env.customRequestsEnabled) return reply(res, { intakeEnabled: false, products: [], components: [], page: input.page, hasNext: false });
  const name = input.search ? { name: { $regex: escape(input.search), $options: 'i' } } : {};
  const [products, components, templates] = await Promise.all([
    service === 'laser_engraving' ? Product.find({ ...name, visibility: 'public', status: { $in: ['draft', 'ready', 'hold'] }, 'engravingRequest.enabled': true }).sort({ name: 1, _id: 1 }).skip((input.page - 1) * 20).limit(20).lean().maxTimeMS(3000) : [],
    ComponentOption.find({ ...name, $or: [{ reviewRequired: false }, { ownerManaged: true }], 'requestPolicy.enabled': true, 'requestPolicy.services': service, 'requestPolicy.availability': 'available' }).sort({ name: 1, _id: 1 }).skip((input.page - 1) * 20).limit(20).lean().maxTimeMS(3000),
    CustomizationTemplate.aggregate([
      { $sort: { key: 1, version: -1 } }, { $group: { _id: '$key', latest: { $first: '$$ROOT' } } }, { $replaceRoot: { newRoot: '$latest' } },
      { $match: { kind: service, usage: 'enquiry', status: 'approved', active: true } }, { $sort: { updatedAt: -1, _id: -1 } },
      { $limit: 20 }, { $project: { _id: 1, name: 1, version: 1, fields: 1 } },
    ]).option({ maxTimeMS: 3000 }),
  ]);
  const eligible = async records => (await Promise.all(records.map(async record => { try { await activeRequestCategory(record); return record; } catch (error) { if (error.code === 'REQUEST_REVIEW_REQUIRED') return null; throw error; } }))).filter(Boolean);
  reply(res, { intakeEnabled: true, templates: templates.map(template => ({ id: String(template._id), name: template.name, version: template.version, fields: template.fields })), products: (await eligible(products)).map(engravingProductPresentation), components: (await eligible(components)).map(componentEstimate), page: input.page, hasNext: products.length === 20 || components.length === 20 });
});
serviceRequestRoutes.post('/service-requests', limiter, async (req, res) => reply(res, { request: receipt(await createServiceRequest(req.commerceOwner, serviceRequestInput.parse(req.body))) }, 201));
serviceRequestRoutes.get('/service-requests/submissions/:key', async (req, res) => {
  const record = await ServiceRequest.findOne({ owner: req.commerceOwner, requestKey: z.uuid().parse(req.params.key) }).select('_id reference service state createdAt followUpDueAt').lean().maxTimeMS(3000);
  reply(res, { request: record ? receipt(record) : null });
});
async function detail(record) {
  const order = record.orderId ? await Order.findById(record.orderId).lean().maxTimeMS(3000) : null;
  const accounting = order ? await orderAccounting(order, { admin: true }) : null;
  return { ...receipt(record), governorates: GOVERNORATES, customer: record.customer, details: record.details, giftBoxV2Snapshot: presentGiftBoxV2Snapshot(record.giftBoxV2Snapshot), templateSnapshot: record.templateSnapshot, productSnapshot: record.productSnapshot, components: record.components, estimate: record.estimate, quotations: record.quotations, history: record.history, revision: record.revision,
    status: requestStatus(record, order), whatsapp: requestWhatsapp({ ...record, linkedOrderNumber: order?.orderNumber, linkedPaymentState: order?.paymentState, linkedOutstandingPiastres: accounting?.outstandingPiastres }), order: order ? { id: String(order._id), orderNumber: order.orderNumber, fulfillmentState: order.fulfillmentState, paymentState: order.paymentState, accounting } : null,
    files: await Upload.find({ _id: { $in: record.uploadIds }, requestId: record._id, state: 'retained' }).select('_id mimeType sizeBytes').lean().maxTimeMS(3000) };
}
adminServiceRequestRoutes.get('/service-requests', async (req, res) => {
  const input = query.extend({ state: z.enum(['submitted', 'needs_review', 'quote_prepared', 'quote_shared', 'accepted', 'declined', 'cancelled', 'converted', 'overdue']).optional() }).parse(req.query);
  const filter = input.state === 'converted' ? { orderId: { $ne: null } } : input.state === 'overdue' ? { orderId: null, initialContactAt: null, createdAt: { $lte: new Date(Date.now() - 12 * 3600000) }, state: { $nin: ['cancelled', 'declined'] } } : input.state ? { state: input.state, orderId: null } : {};
  if (input.search) filter.reference = { $regex: escape(input.search), $options: 'i' };
  const [records, count] = await Promise.all([ServiceRequest.find(filter).select('reference service state customer.name customer.phone createdAt followUpDueAt orderId').sort({ createdAt: -1, _id: -1 }).skip((input.page - 1) * 20).limit(20).lean().maxTimeMS(3000), ServiceRequest.countDocuments(filter).maxTimeMS(3000)]);
  const orders = await Order.find({ _id: { $in: records.map(record => record.orderId).filter(Boolean) } }).select('fulfillmentState paymentState').lean().maxTimeMS(3000);
  reply(res, { requests: records.map(record => ({ ...receipt(record), customer: record.customer, status: requestStatus(record, orders.find(order => String(order._id) === String(record.orderId))) })), pagination: { page: input.page, pages: Math.ceil(count / 20), total: count } });
});
adminServiceRequestRoutes.get('/service-requests/:id', async (req, res) => {
  const record = await ServiceRequest.findById(id.parse(req.params.id)).lean().maxTimeMS(3000); if (!record) throw commerceError(404, 'REQUEST_NOT_FOUND', 'Request not found.'); reply(res, { request: await detail(record) });
});
adminServiceRequestRoutes.post('/service-requests/:id/action', async (req, res) => reply(res, { request: await detail(await actOnServiceRequest(id.parse(req.params.id), requestActionInput.parse(req.body), req.user)) }));
adminServiceRequestRoutes.get('/service-requests/:id/files/:uploadId', rateLimit({ windowMs: 60000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false }), async (req, res) => {
  const record = await ServiceRequest.findOne({ _id: id.parse(req.params.id), uploadIds: id.parse(req.params.uploadId) }).select('_id').lean().maxTimeMS(3000);
  if (!record) throw commerceError(404, 'UPLOAD_NOT_FOUND', 'File not found.');
  const controller = new AbortController(); const abort = () => { if (!res.writableFinished) controller.abort(); }; req.once('aborted', abort); res.once('close', abort);
  try {
    const file = await openPrivateUpload(req.params.uploadId, null, { adminUser: req.user, signal: controller.signal });
    res.set({ 'Content-Type': file.mimeType, 'Content-Length': String(file.sizeBytes), 'Content-Disposition': 'inline; filename="private-image"', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });
    await pipeline(file.body, res);
  } catch (error) { if (res.headersSent) res.destroy(); else throw error; }
  finally { req.removeListener('aborted', abort); res.removeListener('close', abort); }
});
