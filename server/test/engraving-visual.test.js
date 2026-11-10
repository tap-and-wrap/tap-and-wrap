import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { startTestDatabase } from './helpers/database.js';
import { env } from '../src/config/env.js';
import { EngravingServiceConfiguration as Config } from '../src/models/EngravingServiceConfiguration.js';
import { publishConfiguration } from '../src/engraving/configuration.js';
import { engravingQuote, quoteEngravingLine } from '../src/engraving/pricing.js';
import { engravingAction } from '../src/engraving/workflow.js';
import { visualSpecificationInput, visualEngravingCartInput, specificationInput, validEngravingLine } from '../src/engraving/contracts.js';
import { INITIAL_ENGRAVING_TYPES, FONT_REGISTRY, ICON_REGISTRY, engravingUploadIds, engravingCollectionAllowed } from '../../shared/engraving/definitions.mjs';
import { addCartItem, readCart, cartResponse, removeCartItem, mergeGuestCart, updateCartQuantity } from '../src/commerce/cart.js';
import { prepareCheckout, placeOrder } from '../src/commerce/orders.js';
import { mutateOrderAccounting, orderAccounting } from '../src/commerce/order-accounting.js';
import { signUpload, completeUpload } from '../src/commerce/uploads.js';
import { commerceOwnerContext } from '../src/commerce/ownership.js';
import { createMemoryStorage, setStorageForTests } from '../src/commerce/storage.js';
import { Upload } from '../src/models/Upload.js';
import { Order } from '../src/models/Order.js';
import { Product } from '../src/models/Product.js';
import { Category } from '../src/models/Category.js';
import { presentOrder } from '../src/commerce/order-presentation.js';
import { fingerprint } from '../src/commerce/pricing.js';
import { NotificationEvent } from '../src/models/NotificationEvent.js';
import { OrderSettlement } from '../src/models/OrderSettlement.js';
const owner = `guest:${'a'.repeat(64)}`, outsider = `guest:${'b'.repeat(64)}`, admin = { _id: new mongoose.Types.ObjectId(), role: 'admin', active: true };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWO4NbsXAARVAgOYIL6CAAAAAElFTkSuQmCC', 'base64');
let database, storage, config; const previous = { ...env };
before(async () => { database = await startTestDatabase({ transactions: true }); await Config.createCollection(); await Config.createIndexes(); });
after(async () => { Object.assign(env, previous); setStorageForTests(); await database?.stop(); });
beforeEach(async () => {
  for (const Model of Object.values(mongoose.models)) await Model.deleteMany({});
  Object.assign(env, { engravingEnabled: true, engravingConfigurationEnabled: true, checkoutEnabled: true });
  storage = createMemoryStorage(); setStorageForTests(storage);
  config = await publishConfiguration({ ...INITIAL_ENGRAVING_TYPES[0], pricePiastres: 13750, status: 'active', assetsApproved: true, fontIds: FONT_REGISTRY.map(font => font.id), iconIds: [ICON_REGISTRY[0].id], placements: [{ id: 'front', label: 'Front', status: 'active', displayOrder: 0 }] }, 0, admin);
});
async function image(itemKey, role, who = owner) {
  const signed = await signUpload(who, { purpose: 'engraving_service', ownerContext: commerceOwnerContext(who), engravingItemKey: itemKey, fieldKey: role, mimeType: 'image/png', sizeBytes: png.length });
  const record = await Upload.findById(signed.upload.id).select('+temporaryKey'); storage.put(record.temporaryKey, png); await completeUpload(record._id, who); return String(record._id);
}
async function entry({ items = 0, artwork = true } = {}) {
  const itemKey = randomUUID(), surface = await image(itemKey, 'surface_photo'), itemPhotos = [];
  for (let n = 0; n < items; n++) itemPhotos.push(await image(itemKey, 'item_photo'));
  const layers = [{ id: 'text-layer', type: 'text', text: 'ذكرى جميلة', fontId: FONT_REGISTRY[0].id, color: 'grey', x: .4, y: .4, width: .35, aspectRatio: 3 }];
  if (artwork) layers.push({ id: 'image-layer', type: 'image', assetId: await image(itemKey, 'personal_artwork'), x: .6, y: .7, width: .3, aspectRatio: 1 });
  const specification = { contractVersion: 'engraving-spec-v2', itemKey, typeId: 'perfume', configurationVersion: config.version, description: '', placement: { kind: 'help' }, surfacePhotoUploadId: surface, itemPhotoUploadIds: itemPhotos, design: { version: 'visual-engraving-v1', surface: { assetId: surface, aspectRatio: 1 }, layers }, specialRequests: '' };
  return { kind: 'engraving_service_v2', operationKey: randomUUID(), quantity: 1, specification, reviewFingerprint: (await engravingQuote(specification, owner)).reviewFingerprint };
}
const customer = { name: 'Synthetic Customer', email: 'stage-c@example.test', phone: '01012345678', governorate: 'cairo', address: 'Disposable local test address' };
async function orderFor(value) {
  await addCartItem(owner, value); const checkoutKey = randomUUID(); await prepareCheckout(owner, { checkoutKey, paymentMethod: 'instapay', governorate: 'cairo' });
  const request = { checkoutKey, paymentMethod: 'instapay', customer }, dto = await placeOrder(owner, request);
  return { order: await Order.findById(dto.id).lean(), request };
}
async function act(order, action, extras = {}, actor = admin) {
  const latest = await Order.findById(order._id).lean();
  return engravingAction(String(order._id), { revision: latest.revision, operationKey: randomUUID(), itemKey: latest.engraving.items[0].itemKey, action, ...extras }, actor, owner);
}
test('v2 requires a surface, keeps three optional overall photos and never enters strict v1', async () => {
  const value = await entry({ items: 3 }); assert.equal(visualEngravingCartInput.safeParse(value).success, true);
  assert.equal(specificationInput.safeParse(value.specification).success, false);
  assert.equal(engravingUploadIds(value.specification).length, 5);
  const mutators = [s => delete s.surfacePhotoUploadId, s => s.itemPhotoUploadIds.push(s.surfacePhotoUploadId), s => s.design.layers[1].assetId = s.surfacePhotoUploadId, s => s.design.layers[0].x = -1, s => s.design.layers[0].fontId = 'invented-font', s => s.design.layers[0].fontId = 'engraving-rochester-v1', s => s.design.layers[0].url = 'https://private.invalid', s => s.pricePiastres = 1, s => s.design.layers.push(...Array.from({ length: 12 }, () => ({ ...s.design.layers[0], id: randomUUID() })))];
  for (const mutate of mutators) { const spec = structuredClone(value.specification); mutate(spec); assert.equal(visualSpecificationInput.safeParse(spec).success, false); }
});
test('v2 verifies exact owner, item, purpose, role and expiry without extending retention', async () => {
  const value = await entry(); await assert.rejects(addCartItem(outsider, value), { code: 'INVALID_UPLOAD_REFERENCES' });
  const id = value.specification.surfacePhotoUploadId, original = await Upload.findById(id).lean();
  for (const patch of [{ fieldKey: 'item_photo' }, { engravingItemKey: randomUUID() }, { purpose: 'artwork' }, { expiresAt: new Date(0) }]) {
    await Upload.updateOne({ _id: id }, { $set: patch }); await assert.rejects(addCartItem(owner, value));
    await Upload.updateOne({ _id: id }, { $set: Object.fromEntries(Object.keys(patch).map(key => [key, original[key]])) });
  }
  await addCartItem(owner, value); assert.equal((await Upload.findById(id)).expiresAt.getTime(), original.expiresAt.getTime());
});
test('v2 price and font approval come from the current configuration, never a client surcharge', async () => {
  const value = await entry(); assert.equal((await engravingQuote(value.specification, owner)).unitPricePiastres, 13750);
  const { version, revision, ...configuration } = config; void version;
  await publishConfiguration({ ...configuration, pricePiastres: 16900 }, revision, admin);
  await assert.rejects(addCartItem(owner, value), { code: 'ENGRAVING_REVIEW_REQUIRED' }); assert.equal((await readCart(owner))?.items.length || 0, 0);
});
test('v2 immutable add retries, replacement conflicts, fixed quantity and removal are atomic', async () => {
  const value = await entry(); await addCartItem(owner, value); await addCartItem(owner, value);
  const stored = (await readCart(owner)).items[0]; assert.equal((await readCart(owner)).items.length, 1);
  await assert.rejects(addCartItem(owner, { ...value, specification: { ...value.specification, description: 'changed request' } }), { code: 'CART_OPERATION_CONFLICT' });
  await assert.rejects(updateCartQuantity(owner, stored.id, 2), { code: 'ENGRAVING_QUANTITY_FIXED' });
  const edited = { ...value, operationKey: randomUUID(), replaceLineId: stored.id, replaceFingerprint: fingerprint({ specification: stored.specification, reviewFingerprint: stored.reviewFingerprint }), specification: structuredClone(value.specification) };
  edited.specification.design.layers[0].x = .6; await addCartItem(owner, edited);
  assert.equal((await readCart(owner)).items[0].specification.design.layers[0].x, .6);
  await assert.rejects(addCartItem(owner, { ...edited, operationKey: randomUUID() }), { code: 'ENGRAVING_EDIT_CONFLICT' });
  await removeCartItem(owner, stored.id); assert.equal((await readCart(owner)).items.length, 0);
});
test('v2 guest merge transfers every original and rebinds the price fingerprint', async () => {
  const value = await entry({ items: 3 }); await addCartItem(owner, value); const account = `user:${new mongoose.Types.ObjectId()}`;
  await mergeGuestCart(owner, account); assert.equal((await cartResponse(account)).cart.items[0].kind, 'engraving_service_v2');
  for (const id of engravingUploadIds(value.specification)) assert.equal((await Upload.findById(id)).owner, account);
  assert.equal((await cartResponse(outsider)).cart.items.length, 0);
});
test('v2 order retains originals and exact layered geometry; retry cannot recreate an ordered item', async () => {
  const value = await entry({ items: 2 }), { order, request } = await orderFor(value);
  assert.equal(validEngravingLine(order.lines[0]), true); assert.equal(order.lines[0].engraving.snapshotVersion, 'engraving-order-v2');
  assert.deepEqual(order.lines[0].engraving.specification.design, value.specification.design);
  assert.equal(order.paymentState, 'unpaid'); assert.equal((await orderAccounting(order)).amountDueNowPiastres, 0); assert.deepEqual(order.inventoryClaims, []);
  for (const id of engravingUploadIds(value.specification)) { const upload = await Upload.findById(id); assert.equal(upload.state, 'retained'); assert.equal(String(upload.orderId), String(order._id)); }
  assert.equal((await placeOrder(owner, request)).id, String(order._id)); assert.equal((await addCartItem(owner, value)).alreadyOrdered, String(order._id)); assert.equal((await readCart(owner)).items.length, 0);
  const dto = presentOrder(order); assert.ok(dto.lines[0].engraving.layers.length); assert.equal(dto.paymentInstructions, null);
  for (const id of engravingUploadIds(value.specification)) assert.equal(JSON.stringify(dto).includes(id), false);
  assert.equal((await NotificationEvent.findOne({ orderId: order._id, event: 'order_received' })).snapshot.engravingReviewPending, true);
  assert.equal(engravingCollectionAllowed({ ...order, engraving: null }), false);
});
test('v2 cannot bypass inspection, current acceptance, payment authorization or actual payment', async () => {
  const { order } = await orderFor(await entry());
  for (const action of ['start', 'authorize_payment']) await assert.rejects(act(order, action), { code: 'ENGRAVING_WORKFLOW_CONFLICT' });
  await assert.rejects(signUpload(owner, { purpose: 'payment_proof', paymentScope: 'engraving', orderId: String(order._id), mimeType: 'image/png', sizeBytes: png.length }), { code: 'PAYMENT_NOT_AUTHORIZED' });
  await act(order, 'receive', { condition: 'Synthetic intact item' }); await act(order, 'inspect'); await act(order, 'propose', { placementId: 'front' });
  await assert.rejects(act(order, 'accept', { proposalVersion: 2, customerConfirmed: true }, null), { code: 'ENGRAVING_WORKFLOW_CONFLICT' });
  await act(order, 'accept', { proposalVersion: 1, customerConfirmed: true }, null);
  const authorized = await act(order, 'authorize_payment', { collectionMethod: 'instapay' }); assert.equal(presentOrder(authorized).paymentInstructionsByGroup[0].scope, 'engraving');
  await assert.rejects(act(order, 'start'), { code: 'ENGRAVING_WORKFLOW_CONFLICT' });
});
test('mixed product + v2 accounting keeps merchandise funds separate and safe return custody intact', async () => {
  const category = await Category.create({ name: 'Synthetic category', slug: 'visual-fixture', active: true });
  const product = await Product.create({ name: 'Synthetic product', slug: 'visual-fixture-product', categoryId: category._id, mainImageKey: 'fixtures/item.webp', galleryKeys: ['fixtures/item.webp'], visibility: 'public', status: 'ready', pricePiastres: 25000, priceApproved: true, inventory: { mode: 'tracked', quantity: 3, approved: true, available: true } });
  await addCartItem(owner, { kind: 'product', productId: String(product._id), quantity: 1 });
  const { order } = await orderFor(await entry());
  assert.equal(order.paymentGroups.find(group => group.id === 'engraving').amountPiastres, 13750);
  assert.equal(order.paymentGroups.find(group => group.id === 'merchandise').amountPiastres, 25000);
  assert.deepEqual(presentOrder(order).paymentInstructionsByGroup.map(value => value.scope), ['merchandise']);
  await act(order, 'receive', { condition: 'Intact customer-owned item' });
  const latest = await Order.findById(order._id); await mutateOrderAccounting(String(order._id), null, { revision: latest.revision, action: 'cancel', reconciled: true, reason: 'Synthetic cancellation before work' }, admin);
  assert.equal((await Product.findById(product._id)).inventory.quantity, 3);
  await act(order, 'arrange_return', { publicReason: 'Actual local fixture collection arrangement' }); await act(order, 'return_to_customer', { publicReason: 'Returned unengraved' });
  assert.equal((await Order.findById(order._id)).engraving.items[0].inCustody, false);
});

test('one physical item cannot become a second line by changing its specification version', async () => {
  const value = await entry(); await addCartItem(owner, value);
  await assert.rejects(quoteEngravingLine({ ...value, kind: 'engraving_service_v1' }, owner), { code: 'ENGRAVING_REVIEW_REQUIRED' });
  const specification = { contractVersion: 'engraving-spec-v1', itemKey: value.specification.itemKey, typeId: 'perfume', configurationVersion: config.version, description: '', placement: { kind: 'help' }, content: { mode: 'icons', iconId: ICON_REGISTRY[0].id }, requestedAppearance: 'black', specialRequests: '', itemPhotoUploadId: await image(value.specification.itemKey, 'item_photo') };
  const legacy = { kind: 'engraving_service_v1', quantity: 1, operationKey: randomUUID(), specification, reviewFingerprint: (await engravingQuote(specification, owner)).reviewFingerprint };
  await assert.rejects(addCartItem(owner, legacy), { code: 'ENGRAVING_ITEM_EXISTS' });
  assert.equal((await readCart(owner)).items.length, 1);
});

test('v2 verified InstaPay, completion, return and source-bound refund use the existing ledger', async () => {
  const { order } = await orderFor(await entry());
  await act(order, 'receive', { condition: 'Synthetic intact item' }); await act(order, 'inspect'); await act(order, 'propose', { placementId: 'front' }); await act(order, 'accept', { proposalVersion: 1, customerConfirmed: true }, null); await act(order, 'authorize_payment', { collectionMethod: 'instapay' });
  const signed = await signUpload(owner, { purpose: 'payment_proof', orderId: String(order._id), paymentScope: 'engraving', mimeType: 'image/png', sizeBytes: png.length });
  const upload = await Upload.findById(signed.upload.id).select('+temporaryKey'); storage.put(upload.temporaryKey, png); await completeUpload(upload._id, owner);
  async function account(input, actor = admin) { const current = await Order.findById(order._id); return mutateOrderAccounting(String(order._id), owner, { revision: current.revision, ...input }, actor); }
  await account({ action: 'submit_proof', scope: 'engraving', uploadId: String(upload._id) }, null);
  const collection = { revision: (await Order.findById(order._id)).revision, action: 'collection', scope: 'engraving', operationKey: randomUUID(), amountPiastres: 13750, method: 'instapay', reference: 'SYNTHETIC-V2-TRANSFER', reconciled: true, reason: 'Reconciled disposable test funds' };
  await account(collection); await account(collection); assert.equal(await OrderSettlement.countDocuments(), 1);
  await act(order, 'start'); await act(order, 'complete');
  await account({ action: 'quote_charge', chargeId: 'return_shipping', pricing: 'free', collectionMethod: 'cod', codAuthorized: true });
  await account({ action: 'accept_charge', chargeId: 'return_shipping', accepted: true, customerConfirmed: true, reason: 'Synthetic agreed collection' });
  await act(order, 'arrange_return', { publicReason: 'Synthetic actual collection arrangement' }); await act(order, 'return_to_customer', { publicReason: 'Returned to disposable customer' });
  const completed = await Order.findById(order._id).lean(); assert.equal(completed.paymentState, 'paid'); assert.equal(completed.fulfillmentState, 'delivered');
  const source = await OrderSettlement.findOne({ reference: collection.reference });
  const refund = { revision: (await Order.findById(order._id)).revision, action: 'refund', operationKey: randomUUID(), amountPiastres: 2500, allocations: [{ scope: 'engraving', amountPiastres: 2500 }], method: 'instapay', reference: 'SYNTHETIC-V2-REFUND', refundOf: String(source._id), reconciled: true, reason: 'Actual fixture remedy', reducePayable: true };
  await account(refund); await account(refund); assert.equal((await orderAccounting(await Order.findById(order._id).lean())).refundedPiastres, 2500);
});
