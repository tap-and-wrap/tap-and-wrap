import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import mongoose from 'mongoose';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { Session } from '../src/models/Session.js';
import { Product } from '../src/models/Product.js';
import { Category } from '../src/models/Category.js';
import { ComponentOption } from '../src/models/ComponentOption.js';
import CustomizationTemplate from '../src/models/CustomizationTemplate.js';
import { newSessionToken, hashSession, makeCsrfToken } from '../src/utils/tokens.js';
import { startTestDatabase } from './helpers/database.js';
import { loadEligibleProduct } from '../src/commerce/pricing.js';
import { addCartItem } from '../src/commerce/cart.js';
import { prepareCheckout, placeOrder } from '../src/commerce/orders.js';
import { ownerInventory } from '../src/catalog/owner-workflow.js';
import { componentEstimate, requestComponent } from '../src/commerce/request-policy.js';
import { createServiceRequest } from '../src/commerce/service-requests.js';
import { randomUUID } from 'node:crypto';
import { Upload } from '../src/models/Upload.js';
import { Order } from '../src/models/Order.js';
import { evaluateCustomization } from '../src/commerce/customization.js';
let db, server, base, headers, root, actor;
before(async () => {
  db = await startTestDatabase({ models: Object.values(mongoose.models), transactions: true });
  actor = await User.create({ name: 'Synthetic owner', email: 'owner@example.test', passwordHash: 'isolated-fixture', role: 'admin', active: true });
  const token = newSessionToken(), csrf = makeCsrfToken(env.sessionSecret);
  await Session.create({ userId: actor._id, tokenHash: hashSession(token), expiresAt: new Date(Date.now() + 3600000) });
  headers = { Cookie: `tw_session=${token}; tw_csrf=${csrf}`, Origin: env.clientOrigin, 'x-csrf-token': csrf, 'Content-Type': 'application/json' };
  root = await Category.create({ name: 'Synthetic gifts', slug: 'synthetic-gifts', active: true });
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}/api/v1`;
});
after(async () => { server?.closeAllConnections(); if (server) await new Promise(resolve => server.close(resolve)); await db?.stop(); });
async function request(path, body, method = 'POST') {
  const r = await fetch(base + path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const json = await r.json(); return { status: r.status, ...json };
}
async function inherited(slug, extra = {}) {
  return Product.create({ name: 'Inherited gift', slug, categoryId: root._id, visibility: 'public', status: 'hold', reviewRequired: true,
    merchantReviewNotes: 'Original import review information', mainImageKey: 'fixture/gift.webp', galleryKeys: ['fixture/gift.webp'],
    inventory: { mode: 'tracked', quantity: 10, approved: false, available: true }, ...extra });
}
test('ordinary business saves preserve imported quantity/notes/status; real count unlocks ordering without manual approvals', async () => {
  const product = await inherited('business-gift');
  const path = `/admin/products/${product._id}`;
  let r = await request(path, { expectedRevision: 0, ownerWorkflow: true, optionStructure: 'single', pricePiastres: 45000 }, 'PATCH');
  assert.equal(r.status, 200, JSON.stringify(r.error));
  let saved = await Product.findById(product._id).lean();
  assert.equal(saved.inventory.quantity, 10); assert.equal(saved.inventory.approved, false); assert.equal(saved.priceApproved, true);
  assert.equal(saved.status, 'hold'); assert.equal(saved.reviewRequired, true); assert.equal(saved.merchantReviewNotes, product.merchantReviewNotes);
  await assert.rejects(loadEligibleProduct(product._id), { code: 'PRODUCT_UNAVAILABLE' });
  r = await request(path, { expectedRevision: 1, ownerWorkflow: true, inventory: { mode: 'tracked', quantity: 2, available: true } }, 'PATCH');
  assert.equal(r.status, 200, JSON.stringify(r.error));
  saved = await loadEligibleProduct(product._id); assert.equal(saved.inventory.approved, true);
  const detail = await request('/public/products/business-gift', undefined, 'GET'); assert.equal(detail.data.product.orderingAvailable, true);
  const listing = await request('/admin/products', undefined, 'GET');
  const summary = listing.data.products.find(row => row._id === String(product._id));
  assert.equal(summary.orderingAvailable, true); assert.equal(summary.status, 'hold'); assert.equal(summary.reviewRequired, true);
  assert.equal(summary.hasVariants, false); assert.equal(summary.variants, undefined);
  await assert.rejects(loadEligibleProduct((await inherited('unknown-price'))._id), { code: 'PRODUCT_UNAVAILABLE' });
  assert.equal((await request(path, { expectedRevision: 1, ownerWorkflow: true, pricePiastres: 1 }, 'PATCH')).status, 409);
  // Real server cart path uses purchaseSetup in batched pricing, not just the detail DTO.
  const owner = `guest:${'b'.repeat(64)}`;
  await addCartItem(owner, { productId: String(product._id), quantity: 1 });
  assert.equal((await Product.findById(product._id).lean()).inventory.quantity, 2);
  const oldCheckout = env.checkoutEnabled; env.checkoutEnabled = true;
  try {
    const checkoutKey = randomUUID();
    await prepareCheckout(owner, { checkoutKey, paymentMethod: 'cod', governorate: 'cairo' });
    const order = await placeOrder(owner, { checkoutKey, paymentMethod: 'cod', customer: { name: 'Synthetic customer', phone: '01012345678', governorate: 'cairo', address: 'Synthetic delivery address 123' } });
    assert.ok(order); assert.equal((await Product.findById(product._id).lean()).inventory.quantity, 1);
  } finally { env.checkoutEnabled = oldCheckout; }
});
test('zero stock, incomplete options/personalization and unknown prices stay enquiry-only; Made by Request is explicit', async () => {
  const p = await inherited('option-gift');
  const patch = body => request(`/admin/products/${p._id}`, { ownerWorkflow: true, ...body }, 'PATCH');
  assert.equal((await patch({ expectedRevision: 0, optionStructure: 'unresolved', pricePiastres: 10000, inventory: { quantity: 0, mode: 'tracked', available: true } })).status, 200);
  await assert.rejects(loadEligibleProduct(p._id));
  assert.equal((await patch({ expectedRevision: 1, optionStructure: 'single', inventory: { mode: 'made_to_order', quantity: null, available: true } })).status, 200);
  assert.equal((await loadEligibleProduct(p._id)).inventory.quantity, null);
  assert.equal(ownerInventory({ mode: 'tracked', quantity: 10, approved: false }, { available: true }).approved, false);
  assert.equal(ownerInventory({ mode: 'tracked', quantity: 3, approved: true, available: true }, { available: false }).approved, true);
  assert.throws(() => ownerInventory(undefined, { mode: 'tracked', approved: true }));
  assert.throws(() => ownerInventory({ mode: 'tracked', quantity: 10, approved: false }, { quantity: null }));
  assert.equal((await patch({ expectedRevision: 2, pricePiastres: 0 })).status, 200);
  await assert.rejects(loadEligibleProduct(p._id));
});
test('variant counts own availability and checkout; the unconfirmed parent ten is never approved, exposed or deducted', async () => {
  const product = await inherited('owner-variants');
  const result = await request(`/admin/products/${product._id}`, { expectedRevision: 0, ownerWorkflow: true, optionStructure: 'variants', pricePiastres: 15000,
    variants: [...[0, 2].map((quantity, index) => ({ key: `size-${index}`, attributes: [{ name: 'Size', value: String(index) }], pricePiastres: index ? 18000 : 16000, inventory: { mode: 'tracked', quantity, available: true } })),
      { key: 'not-offered', attributes: [{ name: 'Size', value: 'Not confirmed' }], pricePiastres: null, inventory: { mode: 'tracked', quantity: 10, approved: false, available: false } }] }, 'PATCH');
  assert.equal(result.status, 200, JSON.stringify(result.error));
  const detail = (await request('/public/products/owner-variants', undefined, 'GET')).data.product;
  assert.equal(detail.orderingAvailable, true); assert.equal(detail.inventory.quantity, null);
  assert.deepEqual(detail.variants.map(variant => variant.orderingAvailable), [false, true, false]); assert.equal(detail.variants[2].inventory.quantity, null);
  const owner = `guest:${'1'.repeat(64)}`;
  await assert.rejects(addCartItem(owner, { productId: String(product._id), variantKey: 'size-0', quantity: 1 }));
  await assert.rejects(addCartItem(owner, { productId: String(product._id), variantKey: 'not-offered', quantity: 1 }));
  await addCartItem(owner, { productId: String(product._id), variantKey: 'size-1', quantity: 1 });
  const previous = env.checkoutEnabled; env.checkoutEnabled = true;
  try {
    const checkoutKey = randomUUID(); await prepareCheckout(owner, { checkoutKey, paymentMethod: 'instapay', governorate: 'cairo' });
    await placeOrder(owner, { checkoutKey, paymentMethod: 'instapay', customer: { name: 'Synthetic customer', phone: '01012345678', governorate: 'cairo', address: 'Synthetic delivery address 123' } });
    const order = await Order.findOne({ owner, checkoutKey }).lean(); assert.equal(order.paymentState, 'awaiting_transfer'); assert.equal(order.totals.totalPiastres, 18000); assert.equal(order.totals.shippingPiastres, null);
    const saved = await Product.findById(product._id).lean(); assert.equal(saved.inventory.quantity, 10); assert.equal(saved.inventory.approved, false); assert.equal(saved.variants[1].inventory.quantity, 1);
  } finally { env.checkoutEnabled = previous; }
});
test('Hold components become requestable by service and availability; pending is never Free and inherited stock stays unconfirmed', async () => {
  const component = await ComponentOption.create({ name: 'Inherited packaging', slug: 'inherited-packaging', categoryId: root._id, catalogRole: 'Gift Packaging', status: 'hold', reviewRequired: true, inventory: { mode: 'tracked', quantity: 10, approved: false, available: true } });
  let r = await request(`/admin/commerce/components/${component._id}`, { expectedRevision: 0, ownerWorkflow: true, requestPolicy: { enabled: false, services: ['gift_box'], availability: 'available', pricing: 'fixed', unitPricePiastres: 0 } }, 'PATCH');
  assert.equal(r.status, 200, JSON.stringify(r.error));
  const saved = await requestComponent(component._id, 'gift_box');
  assert.equal(saved.reviewRequired, true); assert.equal(saved.inventory.quantity, 10); assert.equal(saved.inventory.approved, false);
  assert.equal(componentEstimate(saved).pricing, 'pending'); assert.equal(componentEstimate(saved).unitPricePiastres, null); assert.equal(saved.configurationApproved, false);
  await assert.rejects(requestComponent(component._id, 'laser_engraving'));
  r = await request(`/admin/commerce/components/${component._id}`, { expectedRevision: 1, ownerWorkflow: true, requestPolicy: { enabled: false, services: ['gift_box'], availability: 'available', pricing: 'free', unitPricePiastres: null } }, 'PATCH');
  assert.equal(r.status, 200, JSON.stringify(r.error)); assert.equal(componentEstimate(await requestComponent(component._id, 'gift_box')).pricing, 'free');
});
test('template save is automatic, enquiry engraving needs no invented fonts, edits create immutable versions, priced configuration remains strict', async () => {
  let r = await request('/admin/commerce/templates', { ownerWorkflow: true, name: 'Owner enquiry', kind: 'laser_engraving', usage: 'enquiry', groups: [], fields: [] });
  assert.equal(r.status, 201, JSON.stringify(r.error)); const first = r.data.template;
  assert.equal(first.status, 'approved'); assert.equal(first.active, true);
  assert.throws(() => evaluateCustomization(first, [], { templateId: first._id, version: 1, selections: {}, fields: {} }), { code: 'CUSTOMIZATION_UNAVAILABLE' });
  r = await request(`/admin/commerce/templates/${first._id}`, { ownerWorkflow: true, expectedRevision: first.revision, name: 'Updated enquiry' }, 'PATCH');
  assert.equal(r.status, 200, JSON.stringify(r.error)); assert.equal(r.data.revisionCreated, true); assert.equal(r.data.template.version, 2); assert.equal(r.data.template.key, first.key); assert.equal(r.data.template.status, 'approved');
  assert.equal((await CustomizationTemplate.findById(first._id).lean()).name, 'Owner enquiry');
  r = await request('/admin/commerce/templates', { ownerWorkflow: true, name: 'Incomplete automatic engraving', kind: 'laser_engraving', usage: 'priced' });
  assert.equal(r.status, 400);
});
test('saved enquiry questions are usable, validated and snapshotted; later edits cannot change a submitted request', async () => {
  const template = await CustomizationTemplate.create({ key: 'synthetic_questions', name: 'Gift questions', kind: 'gift_box', usage: 'enquiry', active: true, status: 'approved', fields: [{ key: 'recipient', label: 'Who is the gift for?', type: 'text', required: true, maxChars: 100 }] });
  const previous = env.customRequestsEnabled; env.customRequestsEnabled = true;
  try {
    const input = { requestKey: randomUUID(), service: 'gift_box', customer: { name: 'Synthetic customer', phone: '01012345678' }, details: { occasion: 'Birthday', contents: 'Thoughtful gift', quantity: 1 }, template: { id: String(template._id), version: 1, fields: {} }, components: [], uploadIds: [] };
    const owner = `guest:${'d'.repeat(64)}`;
    await assert.rejects(createServiceRequest(owner, input));
    input.template.fields.recipient = 'My friend';
    const record = await createServiceRequest(owner, input);
    assert.equal(record.templateSnapshot.values.recipient, 'My friend');
    const r = await requestApiTemplate(template);
    assert.equal(r.status, 200, JSON.stringify(r.error));
    assert.equal(record.templateSnapshot.name, 'Gift questions');
    const response = await request('/commerce/service-requests/options/gift_box', undefined, 'GET');
    assert.ok(response.data.templates.length > 0);
    assert.ok(!response.data.templates.some(value => value.id === String(template._id)));
    const current = r.data.template;
    const disabled = await request(`/admin/commerce/templates/${current._id}`, { ownerWorkflow: true, expectedRevision: current.revision, key: current.key, name: current.name, kind: current.kind, usage: current.usage, groups: current.groups, fields: current.fields, active: false }, 'PATCH');
    assert.equal(disabled.status, 200, JSON.stringify(disabled.error)); assert.equal(disabled.data.template.version, 2); assert.equal(disabled.data.template.active, false);
    assert.equal((await request('/commerce/service-requests/options/gift_box', undefined, 'GET')).data.templates.some(value => value.id === current._id || value.id === String(template._id)), false);
    await assert.rejects(createServiceRequest(owner, { ...input, requestKey: randomUUID() }));
    assert.equal(String((await createServiceRequest(owner, input))._id), String(record._id));
  } finally { env.customRequestsEnabled = previous; }
});
async function requestApiTemplate(template) { return request(`/admin/commerce/templates/${template._id}`, { ownerWorkflow: true, expectedRevision: 1, name: 'New questions' }, 'PATCH'); }
test('template images must belong to the same guest and request, satisfy field limits and retain exactly once', async () => {
  const previous = env.customRequestsEnabled; env.customRequestsEnabled = true;
  try {
    const owner = `guest:${'e'.repeat(64)}`, key = randomUUID();
    const template = await CustomizationTemplate.create({ key: 'synthetic_photos', name: 'Reference question', kind: 'gift_box', usage: 'enquiry', status: 'approved', active: true, fields: [{ key: 'reference', label: 'Reference image', type: 'image', required: true, minFiles: 1, maxFiles: 1, maxBytes: 1000, acceptedMimeTypes: ['image/png'] }] });
    const upload = await Upload.create({ owner, purpose: 'service_reference', requestKey: key, state: 'complete', mimeType: 'image/png', sizeBytes: 100, temporaryKey: 'synthetic/temp', objectKey: 'synthetic/private', signedExpiresAt: new Date(Date.now() + 60000), expiresAt: new Date(Date.now() + 60000), width: 1, height: 1 });
    const input = { requestKey: key, service: 'gift_box', customer: { name: 'Synthetic customer', phone: '01012345678' }, details: { occasion: 'Birthday', contents: 'Owner quote', quantity: 1 }, components: [], uploadIds: [String(upload._id)], template: { id: String(template._id), version: 1, fields: { reference: [String(upload._id)] } } };
    await assert.rejects(createServiceRequest(`guest:${'f'.repeat(64)}`, input));
    await assert.rejects(createServiceRequest(owner, { ...input, requestKey: randomUUID() }));
    await assert.rejects(createServiceRequest(owner, { ...input, template: { ...input.template, fields: { reference: [] } } }));
    const record = await createServiceRequest(owner, input), retry = await createServiceRequest(owner, input);
    assert.equal(String(record._id), String(retry._id));
    assert.equal(String((await Upload.findById(upload._id).lean()).requestId), String(record._id));
    assert.equal((await Upload.findById(upload._id).lean()).state, 'retained');
    assert.deepEqual(record.templateSnapshot.values.reference, [String(upload._id)]);
  } finally { env.customRequestsEnabled = previous; }
});
test('both accountless services accept text-only requests with zero templates; gates, owner isolation and retries remain independent', async () => {
  await CustomizationTemplate.deleteMany({});
  const previous = env.customRequestsEnabled; env.customRequestsEnabled = true;
  try {
    for (const service of ['gift_box', 'laser_engraving']) {
      const input = { requestKey: randomUUID(), service, customer: { name: 'Synthetic customer', phone: '01012345678' }, details: service === 'gift_box' ? { occasion: 'Birthday', contents: 'Discuss a thoughtful gift', quantity: 1 } : { productReference: 'My item for suitability review', engravingType: 'text', engravingText: 'Initials', quantity: 1 }, components: [], uploadIds: [] };
      const owner = `guest:${'c'.repeat(64)}`;
      const first = await createServiceRequest(owner, input), retry = await createServiceRequest(owner, input);
      assert.equal(String(first._id), String(retry._id)); assert.match(first.reference, /^TW-/); assert.equal(first.estimate.shippingPiastres, null);
      assert.equal(first.followUpDueAt.getTime() - first.createdAt.getTime() > 11.99 * 3600000, true);
      env.customRequestsEnabled = false;
      assert.equal(String((await createServiceRequest(owner, input))._id), String(first._id));
      await assert.rejects(createServiceRequest(owner, { ...input, requestKey: randomUUID() }), { code: 'REQUEST_INTAKE_CLOSED' });
      env.customRequestsEnabled = true;
    }
  } finally { env.customRequestsEnabled = previous; }
});
