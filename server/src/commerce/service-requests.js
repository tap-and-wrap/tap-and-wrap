import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import { ServiceRequest } from '../models/ServiceRequest.js';
import { Order } from '../models/Order.js';
import { Product } from '../models/Product.js';
import { ComponentOption } from '../models/ComponentOption.js';
import { env } from '../config/env.js';
import { assertDatabaseWriteAllowed } from '../config/database-safety.js';
import { fingerprint } from './pricing.js';
import { normalizePhone, generateOrderNumber } from './orders.js';
import { checkedMoney, commerceError } from './errors.js';
import { GOVERNORATES } from './promotions.js';
import { requestProduct, requestComponent, requestError, componentEstimate } from './request-policy.js';
import { assertUploadOwner, retainRequestUploads, bindRequestUploadsToOrder } from './uploads.js';
import { accountingSummary, orderAccounting } from './order-accounting.js';
import { recordAdminAudit } from './audit.js';
import { enqueueOrderEvent, enqueueRequestEvent } from './notifications.js';
import { assertRequestIntakeOpen } from './request-intake.js';

const total = values => values.reduce((sum, value) => checkedMoney(sum + value), 0);
export async function createServiceRequest(owner, input) {
  assertUploadOwner(owner);
  const normalized = { ...input, customer: { ...input.customer, phone: normalizePhone(input.customer.phone), email: input.customer.email || null } };
  const hash = fingerprint(normalized);
  const previous = async () => {
    const record = await ServiceRequest.findOne({ owner, requestKey: input.requestKey }).lean().maxTimeMS(3000);
    if (record && record.requestHash !== hash) throw requestError('This request key already belongs to a different submission.');
    return record;
  };
  const existing = await previous(); if (existing) return existing;
  assertRequestIntakeOpen();
  assertDatabaseWriteAllowed(ServiceRequest.db, env);
  const session = await mongoose.startSession(); let result;
  try {
    await session.withTransaction(async () => {
      const old = await ServiceRequest.findOne({ owner, requestKey: input.requestKey }).session(session).lean();
      if (old) { if (old.requestHash !== hash) throw requestError('This request key belongs to another submission.'); result = old; return; }
      assertRequestIntakeOpen();
      if (await ServiceRequest.countDocuments({ owner, orderId: null, state: { $nin: ['cancelled', 'declined'] } }).session(session) >= 20) throw requestError('Contact the owner to review your existing requests before submitting more.');
      const details = { ...input.details }, components = [];
      if (new Set(input.uploadIds).size !== input.uploadIds.length || new Set(input.components.map(item => item.componentId)).size !== input.components.length) throw requestError('Use distinct reference images and component selections.');
      let productSnapshot = null, basePrice = null;
      if (input.service === 'gift_box') {
        if (!details.occasion || !details.contents || details.productId || details.engravingType) throw requestError('Describe the occasion and desired gift contents.');
      } else {
        if (!details.engravingType) throw requestError('Choose the engraving request type.');
        if (details.productId) {
          const product = await requestProduct(details.productId, { session });
          const presentation = product.engravingRequest;
          if (product.variants?.length && !product.variants.some(variant => variant.key === details.variantKey)) throw requestError('Choose the exact product variant.');
          if (!product.variants?.length && details.variantKey) throw requestError('This product has no configured variant.');
          for (const [field, list] of [['font', presentation.fonts], ['placement', presentation.placements], ['material', presentation.materials]]) {
            if (list.length ? !list.includes(details[field]) : Boolean(details[field])) throw requestError(`Choose a currently offered ${field}; unsupported options must be discussed with the owner.`);
          }
          if ((details.engravingText || '').length > presentation.maxTextLength) throw requestError('The engraving text exceeds the product limit.');
          productSnapshot = { id: String(product._id), name: product.name, variantKey: details.variantKey || null };
          const variant = product.variants?.find(value => value.key === details.variantKey);
          basePrice = variant?.pricePiastres != null ? variant.priceApproved && variant.pricePiastres > 0 ? variant.pricePiastres : null : product.priceApproved && product.pricePiastres > 0 ? product.pricePiastres : null;
        } else if (!details.productReference || details.font || details.placement || details.material || details.variantKey) throw requestError('Describe the item for manual review. Fonts, materials and placement are confirmed by the owner.');
        if (details.engravingType === 'text' && !details.engravingText || details.engravingType === 'other' && !details.instructions) throw requestError('Provide the requested engraving text or Other requirements.');
      }
      for (const selection of input.components) {
        const component = await requestComponent(selection.componentId, input.service, { session });
        components.push({ ...componentEstimate(component), quantity: selection.quantity });
      }
      const estimate = { baseUnitPiastres: basePrice, knownSubtotalPiastres: total([basePrice === null ? 0 : basePrice * details.quantity, ...components.map(item => item.unitPricePiastres === null ? 0 : item.unitPricePiastres * item.quantity)]), pendingCount: components.filter(item => item.pricing === 'pending').length + 1, shippingPiastres: null };
      const [record] = await ServiceRequest.create([{ owner, requestKey: input.requestKey, requestHash: hash, reference: `TW-${randomBytes(6).toString('hex').toUpperCase()}`,
        service: input.service, customer: normalized.customer, details, productSnapshot, components, estimate, uploadIds: input.uploadIds,
        followUpDueAt: new Date(Date.now() + 12 * 3600000), history: [{ event: 'submitted', at: new Date(), actor: 'customer' }] }], { session });
      await retainRequestUploads(input.uploadIds, owner, input.requestKey, record._id, { session });
      await enqueueRequestEvent(record, 'request_received', { session }); result = record.toObject();
    });
  } catch (error) { if (error.code === 11000) { const old = await previous(); if (old) return old; } throw error; }
  finally { await session.endSession(); }
  return result;
}

export function requestStatus(record, order) {
  if (!order) return record.state;
  if (['cancelled', 'returned', 'delivery_failed'].includes(order.fulfillmentState)) return order.fulfillmentState === 'cancelled' ? 'cancelled' : 'needs_review';
  if (order.fulfillmentState === 'delivered') return 'completed';
  if (['preparing', 'out_for_delivery'].includes(order.fulfillmentState)) return 'in_preparation';
  return order.paymentState === 'paid' ? 'paid' : 'awaiting_payment';
}
const money = value => `EGP ${(value / 100).toFixed(2)}`;
export function requestWhatsapp(record) {
  const quote = record.quotations?.at(-1); if (!quote) return null;
  const lines = [`Tap & Wrap | ${record.service === 'gift_box' ? 'Build Your Gift Box' : 'Laser Engraving'}`, `Request ${record.reference} | Quotation v${quote.version}`, `Product/custom work: ${money(quote.baseUnitPiastres)} × ${record.details.quantity}`];
  if (record.productSnapshot) lines.push(`Product: ${record.productSnapshot.name}${record.productSnapshot.variantKey ? ` (${record.productSnapshot.variantKey})` : ''}`);
  for (const [field, label] of [['productReference', 'Item reference'], ['occasion', 'Occasion'], ['style', 'Presentation'], ['colors', 'Colors'], ['contents', 'Desired contents'], ['recipient', 'Recipient'], ['message', 'Gift message'], ['engravingType', 'Engraving type'], ['engravingText', 'Engraving text'], ['font', 'Font'], ['placement', 'Placement'], ['material', 'Material'], ['instructions', 'Instructions']]) if (record.details[field]) lines.push(`${label}: ${record.details[field]}`);
  if (quote.discountPiastres) lines.push(`Discount: ${money(quote.discountPiastres)}`);
  for (const charge of quote.charges) lines.push(`${charge.label} × ${charge.quantity}: ${charge.pricing === 'free' ? 'Free' : money(charge.unitPricePiastres * charge.quantity)}`);
  lines.push(`Delivery: ${quote.shippingFree ? 'Free (explicitly confirmed)' : money(quote.shippingPiastres)}`, `Quotation total: ${money(quote.totalPiastres)}`, `Available payment: ${quote.allowedPaymentMethods.map(method => method === 'cod' ? 'Cash on Delivery (owner authorized)' : 'InstaPay').join(' / ')}`);
  lines.push('Please confirm this quotation version and your chosen payment method through WhatsApp. We record acceptance before requesting payment.', 'Do not transfer until the owner confirms your accepted order reference and inventory allocation. Agreed InstaPay payments go to 01060673073. Send the screenshot through WhatsApp; payment is confirmed only after independent account reconciliation.', 'No website account or return visit is required.');
  if (record.linkedOrderNumber) lines.push(`Accepted order reference: #${record.linkedOrderNumber}. Recorded payment status: ${record.linkedPaymentState.replaceAll('_', ' ')}. Recorded outstanding: ${money(record.linkedOutstandingPiastres)}. Never repeat a transfer because a message or screenshot failed.`);
  const text = lines.join('\n'), phone = record.customer.phone.replace(/\D/g, '');
  return { text, url: `https://wa.me/${phone}?text=${encodeURIComponent(text)}`, deliveryConfirmed: false };
}
function prepareQuotation(record, input, actor, now) {
  if (!input.quote || record.quotations.length >= 20) throw requestError('Enter a bounded complete quotation.');
  const quote = structuredClone(input.quote);
  const base = checkedMoney(quote.baseUnitPiastres * record.details.quantity);
  if (quote.discountPiastres > base || (!quote.shippingFree && quote.shippingPiastres <= 0) || quote.shippingFree && quote.shippingPiastres !== 0) throw requestError('Confirm delivery explicitly and keep the discount within the product/work amount.');
  if (quote.allowedPaymentMethods.includes('cod') && !quote.codAuthorized) throw requestError('Explicitly authorize personalized COD before offering it for acceptance.');
  const ids = quote.charges.filter(charge => charge.componentId).map(charge => charge.componentId);
  if (new Set(ids).size !== ids.length || ids.length !== record.components.length || record.components.some(item => !quote.charges.some(charge => charge.componentId === item.componentId && charge.quantity === item.quantity))) throw requestError('Quote every requested component once with its requested quantity.');
  quote.totalPiastres = total([base - quote.discountPiastres, quote.shippingPiastres, ...quote.charges.map(charge => charge.quantity * charge.unitPricePiastres)]);
  if (quote.totalPiastres <= 0) throw requestError('A payable custom quotation requires a confirmed positive total.');
  return { ...quote, version: record.quotations.length + 1, preparedAt: now, preparedBy: String(actor._id), codAuthorizedAt: quote.allowedPaymentMethods.includes('cod') ? now : null };
}
async function allocateSource(Model, id, quantity, service, { session, variantKey, details, product = false } = {}) {
  const record = product ? await requestProduct(id, { session, fence: true }) : await requestComponent(id, service, { session, fence: true });
  if (product) {
    if (Boolean(record.variants?.length) !== Boolean(variantKey)) throw requestError('Product variants changed. Review the exact variant before quoting again.');
    for (const [field, list] of [['font', record.engravingRequest.fonts], ['placement', record.engravingRequest.placements], ['material', record.engravingRequest.materials]]) if (list.length ? !list.includes(details[field]) : Boolean(details[field])) throw requestError('Engraving options changed. Review the request before conversion.');
    if ((details.engravingText || '').length > record.engravingRequest.maxTextLength) throw requestError('The engraving text limit changed. Review the request.');
  }
  const stock = variantKey ? record.variants?.find(variant => variant.key === variantKey)?.inventory : record.inventory;
  if (!record.inventory?.approved || !record.inventory.available || !stock?.approved || !stock.available || !['tracked', 'made_to_order'].includes(stock.mode) || stock.mode === 'tracked' && stock.quantity < quantity) throw requestError('Confirm actual available inventory or Made by Request before creating the order. Imported quantities are not approved stock.');
  const filter = { _id: id, __v: record.__v }, increment = { __v: 1, commerceRevision: 1 };
  if (variantKey) { filter.variants = { $elemMatch: { key: variantKey, 'inventory.mode': stock.mode, 'inventory.approved': true, 'inventory.available': true, ...(stock.mode === 'tracked' ? { 'inventory.quantity': { $gte: quantity } } : {}) } }; if (stock.mode === 'tracked') increment['variants.$.inventory.quantity'] = -quantity; }
  else { filter['inventory.mode'] = stock.mode; filter['inventory.approved'] = true; filter['inventory.available'] = true; if (stock.mode === 'tracked') { filter['inventory.quantity'] = { $gte: quantity }; increment['inventory.quantity'] = -quantity; } }
  if (!(await Model.updateOne(filter, { $inc: increment }, { session })).matchedCount) throw requestError('Inventory changed. Reload and reconcile the quotation before conversion.');
  return { kind: product ? 'product' : 'component', id: String(id), variantKey: variantKey || null, quantity, mode: stock.mode };
}
async function convertRequest(record, quote, session, actor, delivery) {
  if (!env.checkoutEnabled) throw commerceError(503, 'CHECKOUT_DISABLED', 'Order conversion requires the existing authorized commerce launch gates. Requests and quotations remain available.');
  if (!delivery || !GOVERNORATES.some(area => area.id === delivery.governorate)) throw requestError('Record the agreed Egyptian delivery address and governorate from WhatsApp before creating the fulfillment order.');
  const claims = [];
  if (record.productSnapshot) claims.push(await allocateSource(Product, record.productSnapshot.id, record.details.quantity, record.service, { session, product: true, details: record.details, variantKey: record.productSnapshot.variantKey }));
  for (const component of record.components) claims.push(await allocateSource(ComponentOption, component.componentId, component.quantity, record.service, { session }));
  const now = new Date(), charges = [
    { id: 'shipping', kind: 'shipping', label: 'Delivery', amountPiastres: quote.shippingPiastres, pricing: quote.shippingFree ? 'free' : 'quoted', state: 'accepted' },
    ...quote.charges.map((charge, index) => ({ id: `addon_${index + 1}`, kind: 'addon', label: charge.label, amountPiastres: charge.quantity * charge.unitPricePiastres, pricing: charge.pricing === 'free' ? 'free' : 'quoted', state: 'accepted' })),
  ].map(charge => ({ ...charge, collectionMethod: quote.acceptance.method, allowedPaymentMethods: quote.allowedPaymentMethods, createdAt: quote.preparedAt, quotedAt: quote.preparedAt, acceptedAt: quote.acceptance.at, acceptedBy: 'admin', acceptanceChannel: 'whatsapp', quotationVersion: quote.version }));
  const subtotal = quote.baseUnitPiastres * record.details.quantity, merchandise = subtotal - quote.discountPiastres;
  const order = new Order({ owner: record.owner, orderNumber: generateOrderNumber(), checkoutKey: `request:${record._id}:v${quote.version}`, requestHash: fingerprint(quote),
    customer: { ...record.customer, ...delivery }, accountingVersion: 1, orderChannel: 'owner_quotation', personalized: true, allowedPaymentMethods: quote.allowedPaymentMethods,
    quotationAcceptedAt: quote.acceptance.at, codAuthorizedAt: quote.codAuthorizedAt, serviceRequestId: record._id,
    acceptedQuotation: { reference: record.reference, version: quote.version, totalPiastres: quote.totalPiastres },
    lines: [{ productId: record.productSnapshot?.id, name: record.productSnapshot?.name || (record.service === 'gift_box' ? 'Bespoke Gift Box' : 'Owner-reviewed engraving request'), quantity: record.details.quantity, unitPricePiastres: quote.baseUnitPiastres, lineTotalPiastres: subtotal,
      personalization: Object.fromEntries(Object.entries(record.details).filter(([, value]) => typeof value === 'string')), customization: { kind: record.service, selections: quote.charges.map(charge => ({ componentId: charge.componentId, componentName: charge.label, label: charge.label, quantity: charge.quantity, unitAdjustmentPiastres: charge.unitPricePiastres })) }, uploadIds: record.uploadIds }],
    totals: { subtotalPiastres: subtotal, discountPiastres: quote.discountPiastres, shippingPiastres: null, totalPiastres: merchandise, applied: [] },
    inventoryClaims: claims, uploadIds: record.uploadIds, paymentMethod: quote.acceptance.method, paymentState: quote.acceptance.method === 'instapay' ? 'awaiting_transfer' : 'unpaid', charges,
    history: [{ at: now, event: 'order_received', actor: `admin:${actor._id}`, internalNote: `Accepted WhatsApp quotation ${record.reference} v${quote.version}: ${quote.acceptance.note}` }] });
  order.financialSummary = accountingSummary(order, []); await order.save({ session });
  await bindRequestUploadsToOrder(record.uploadIds.map(String), record.owner, record._id, order._id, { session });
  await enqueueOrderEvent(order, 'order_received', { session, eventVersion: 1 });
  return order;
}
export async function actOnServiceRequest(id, input, actor) {
  if (actor?.role !== 'admin' || actor.active === false) throw commerceError(403, 'ADMIN_REQUIRED', 'Administrator action required.');
  assertDatabaseWriteAllowed(ServiceRequest.db, env); const session = await mongoose.startSession(); let result;
  try {
    await session.withTransaction(async () => {
      const record = await ServiceRequest.findById(id).session(session);
      if (!record) throw commerceError(404, 'REQUEST_NOT_FOUND', 'Request not found.');
      const quote = record.quotations.at(-1);
      if (input.action === 'convert' && quote?.orderId) { result = record.toObject(); return; }
      if (record.revision !== input.revision) throw commerceError(409, 'EDIT_CONFLICT', 'This request changed. Your draft is retained; reload before saving.');
      const now = new Date(), quotes = structuredClone(record.toObject().quotations);
      const latest = quotes.at(-1);
      if (record.history.length >= 100) throw requestError('This request needs specialist history review.');
      if (input.action === 'review') { if (record.state !== 'submitted') throw requestError('Only new requests can enter review.'); record.state = 'needs_review'; }
      else if (input.action === 'prepare') {
        if (['cancelled', 'declined'].includes(record.state)) throw requestError('Closed requests cannot receive a new quotation.');
        if (record.orderId) {
          const old = await Order.findById(record.orderId).session(session);
          const financial = old && await orderAccounting(old, { session });
          if (!old || !['cancelled', 'returned'].includes(old.fulfillmentState) || !old.restockedAt || financial?.refundReviewRequired) throw requestError('Cancel/reconcile the existing order, refunds and inventory before preparing a replacement quotation. Financial history cannot be overwritten.');
        }
        quotes.push(prepareQuotation(record, input, actor, now)); record.state = 'quote_prepared'; record.orderId = null;
      } else if (input.action === 'share') {
        if (record.state !== 'quote_prepared' || !latest) throw requestError('Save a quotation before recording actual sharing.');
        latest.sharedAt = now; latest.sharedBy = String(actor._id); record.state = 'quote_shared';
      } else if (input.action === 'accept') {
        if (record.state !== 'quote_shared' || !input.customerConfirmed || !latest.allowedPaymentMethods.includes(input.method)) throw requestError('Record actual WhatsApp acceptance of a shared quotation and an available payment method.');
        const at = input.acceptedAt ? new Date(input.acceptedAt) : now;
        if (at < new Date(latest.sharedAt) || at > now) throw requestError('Acceptance must follow sharing and cannot be in the future.');
        latest.acceptance = { at, recordedAt: now, by: String(actor._id), method: input.method, channel: 'whatsapp', note: input.reason }; record.state = 'accepted';
      } else if (input.action === 'convert') {
        if (record.state !== 'accepted' || !latest?.acceptance) throw requestError('Record customer acceptance before creating a payable order.');
        const order = await convertRequest(record, latest, session, actor, input.delivery); latest.orderId = String(order._id); record.orderId = order._id;
      } else if (['decline', 'cancel'].includes(input.action)) {
        if (record.orderId) throw requestError('Manage cancellation and refunds through the linked order.');
        if (['cancelled', 'declined'].includes(record.state)) throw requestError('This request is already closed.');
        record.state = input.action === 'cancel' ? 'cancelled' : 'declined';
      }
      const history = { event: input.action, at: now, actor: String(actor._id), version: quotes.at(-1)?.version || null, note: input.reason };
      const changed = await ServiceRequest.updateOne({ _id: id, revision: input.revision }, { $set: { state: record.state, quotations: quotes, orderId: record.orderId }, $inc: { revision: 1 }, $push: { history } }, { session, runValidators: true });
      if (!changed.matchedCount) throw requestError('The request changed. Reload before continuing.');
      await recordAdminAudit(actor, { action: `request.${input.action}`, resourceType: 'configuration', resourceId: id, details: { version: quotes.at(-1)?.version || null, revision: record.revision + 1 } }, { session });
      result = { ...record.toObject(), quotations: quotes, revision: record.revision + 1, history: [...record.history, history] };
      const event = input.action === 'share' ? 'request_quotation' : input.action === 'accept' ? 'request_accepted' : ['cancel', 'decline'].includes(input.action) ? 'request_closed' : null;
      if (event) await enqueueRequestEvent(result, event, { session, eventVersion: result.revision });
    });
  } catch (error) {
    if (error.code === 11000 && input.action === 'convert') { const old = await ServiceRequest.findById(id).lean(); if (old?.quotations.at(-1)?.orderId) return old; }
    throw error;
  } finally { await session.endSession(); }
  return result;
}
