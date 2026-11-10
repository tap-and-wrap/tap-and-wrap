import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { startTestDatabase } from './helpers/database.js';
import { Product } from '../src/models/Product.js';
import { Category } from '../src/models/Category.js';
import { Upload } from '../src/models/Upload.js';
import { Order } from '../src/models/Order.js';
import { env } from '../src/config/env.js';
import { signUpload, completeUpload, openPrivateUpload } from '../src/commerce/uploads.js';
import { createMemoryStorage, setStorageForTests } from '../src/commerce/storage.js';
import { addCartItem, readCart, cartResponse, mergeGuestCart, removeCartItem } from '../src/commerce/cart.js';
import { quoteCartLine } from '../src/commerce/pricing.js';
import { photoEditFingerprint, photoSelectionInput } from '../src/commerce/product-photos.js';
import { prepareCheckout, placeOrder } from '../src/commerce/orders.js';
import { updateProduct } from '../src/catalog/service.js';
import { publicProductDetail } from '../src/catalog/public-presentation.js';
import { productBusinessState } from '../../shared/product-business-state.mjs';
const owner = `guest:${'a'.repeat(64)}`, stranger = `guest:${'b'.repeat(64)}`, prior = { ...env }, actor = { _id: new mongoose.Types.ObjectId(), role: 'admin' };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWO4NbsXAARVAgOYIL6CAAAAAElFTkSuQmCC', 'base64');
const spaces = [{ key: 'photo_left', label: 'Left photo', instructions: 'First, on the left' }, { key: 'photo_right', label: 'Right photo', instructions: 'Second, on the right' }];
let database, product, storage;
before(async () => { database = await startTestDatabase({ transactions: true }); });
after(async () => { Object.assign(env, prior); setStorageForTests(); await database?.stop(); });
beforeEach(async () => { for (const model of Object.values(mongoose.models)) await model.deleteMany({}); env.checkoutEnabled = true; storage = createMemoryStorage(); setStorageForTests(storage); const category = await Category.create({ name: 'Synthetic', slug: 'synthetic' }); product = await Product.create({ name: 'Synthetic ready-made photo product', slug: 'synthetic-photo-product', categoryId: category._id, visibility: 'public', status: 'ready', mainImageKey: 'fixtures/photos.webp', galleryKeys: ['fixtures/photos.webp'], pricePiastres: 35000, priceApproved: false, inventory: { mode: 'tracked', quantity: 10, approved: true, available: true }, personalization: { requiredBeforePurchase: false, fields: [], photoSpaces: spaces, photoSpacesVersion: 1 } }); });
async function image(key, who = owner) { const signed = await signUpload(who, { purpose: 'personalization', productId: String(product._id), fieldKey: key, mimeType: 'image/png', sizeBytes: png.length }); const upload = await Upload.findById(signed.upload.id).select('+temporaryKey'); storage.put(upload.temporaryKey, png); await completeUpload(upload._id, who); return String(upload._id); }
async function entry(mode = 'photos') { return { kind: 'product', operationKey: randomUUID(), productId: String(product._id), variantKey: null, quantity: 1, personalization: mode === 'photos' ? { photo_left: [await image('photo_left')], photo_right: [await image('photo_right')] } : {}, photoSelection: { contractVersion: 'product-photos-v1', mode, configurationVersion: 1 } }; }
const customer = { name: 'Synthetic Photo Customer', email: 'photo@example.test', phone: '01012345678', governorate: 'cairo', address: 'Disposable test address' };
async function order(value, paymentMethod = 'instapay') { await addCartItem(owner, value); const checkoutKey = randomUUID(); await prepareCheckout(owner, { checkoutKey, paymentMethod, governorate: 'cairo' }); const request = { checkoutKey, paymentMethod, customer }; const dto = await placeOrder(owner, request); return { saved: await Order.findById(dto.id).lean(), request }; }
test('positive price is sufficient without a second price approval; real availability, publication and purchasing setup still govern', async () => {
  assert.equal(productBusinessState(product).orderingAvailable, true); assert.equal((await quoteCartLine(await entry('as_is'), owner)).unitPricePiastres, 35000);
  for (const patch of [{ pricePiastres: null }, { visibility: 'withdrawn' }, { visibility: 'hidden' }, { inventory: { mode: 'tracked', quantity: 10, approved: false, available: true } }, { inventory: { mode: 'tracked', quantity: 0, approved: true, available: true } }, { purchaseSetup: { version: 1, options: 'unresolved' } }]) { const original = product.toObject(); await Product.updateOne({ _id: product._id }, { $set: patch }); await assert.rejects(addCartItem(owner, await entry('as_is'))); await assert.rejects(image('photo_left')); await Product.replaceOne({ _id: product._id }, original); }
});
test('as-is requires no uploads, both choices use the same product price and distinct line identities', async () => {
  await addCartItem(owner, await entry('as_is')); await addCartItem(owner, await entry()); const cart = await cartResponse(owner); assert.equal(cart.cart.items.length, 2); assert.deepEqual(cart.cart.items.map(line => line.unitPricePiastres), [35000,35000]); assert.deepEqual(cart.cart.items.map(line => line.photoPurchase.mode), ['as_is','photos']); assert.equal(cart.mixedCheckout, false); assert.equal((await Product.findById(product._id)).inventory.quantity, 10);
});
test('strict specification and exact role, product, scope and photo count reject unsupported attachment payloads', async () => {
  const value = await entry(); assert.equal(photoSelectionInput.safeParse({ ...value.photoSelection, surcharge: 100 }).success, false);
  await assert.rejects(addCartItem(stranger, value), { code: 'INVALID_UPLOAD_REFERENCES' });
  await assert.rejects(addCartItem(owner, { ...value, personalization: { photo_left: value.personalization.photo_left } }), { code: 'INVALID_PHOTOS' });
  await assert.rejects(addCartItem(owner, { ...value, photoSelection: { ...value.photoSelection, mode: 'as_is' } }), { code: 'INVALID_PERSONALIZATION' });
  await assert.rejects(addCartItem(owner, { ...value, personalization: { photo_left: value.personalization.photo_right, photo_right: value.personalization.photo_left } }), { code: 'INVALID_PHOTOS' });
  const id = value.personalization.photo_left[0], original = await Upload.findById(id).lean();
  for (const patch of [{ expiresAt: new Date(0) }, { productId: new mongoose.Types.ObjectId() }, { purpose: 'artwork' }]) { await Upload.updateOne({ _id: id }, { $set: patch }); await assert.rejects(addCartItem(owner, value)); await Upload.updateOne({ _id: id }, { $set: Object.fromEntries(Object.keys(patch).map(key => [key, original[key]])) }); }
});
test('different photo sets, immutable retries and replacement preserve field ordering without duplicating adds', async () => {
  const first = await entry(); await addCartItem(owner, first); await addCartItem(owner, first); await addCartItem(owner, await entry()); let cart = await readCart(owner); assert.equal(cart.items.length, 2);
  const old = cart.items[0], replacement = { ...first, operationKey: randomUUID(), replaceLineId: old.id, replaceFingerprint: photoEditFingerprint(old), personalization: { ...first.personalization, photo_left: [await image('photo_left')] } };
  await addCartItem(owner, replacement); cart = await readCart(owner); assert.deepEqual(cart.items.find(line => line.id === old.id).personalization.photo_left, replacement.personalization.photo_left);
  await assert.rejects(addCartItem(owner, { ...replacement, operationKey: randomUUID() }), { code: 'ENGRAVING_EDIT_CONFLICT' }); assert.equal((await Upload.findById(first.personalization.photo_left[0])).cartId, undefined);
  await removeCartItem(owner, old.id); assert.equal((await readCart(owner)).items.length, 1);
});
test('slot removal invalidates photo carts, leaves as-is orderable, and accepted snapshots retain original labels and files', async () => {
  const value = await entry(), { saved, request } = await order(value); assert.equal(saved.lines[0].photoPurchase.mode, 'photos'); assert.deepEqual(saved.lines[0].photoPurchase.slots, spaces); assert.equal(saved.accountingVersion, 1); assert.equal(saved.engraving, null); assert.equal(saved.totals.totalPiastres, 35000);
  const update = await updateProduct(product._id, { expectedRevision: (await Product.findById(product._id)).__v, personalization: { fields: [], requiredBeforePurchase: false, photoSpaces: [] } }, { actor }); assert.equal(update.personalization.photoSpacesVersion, 2);
  assert.equal((await placeOrder(owner, request)).id, String(saved._id)); assert.equal((await addCartItem(owner, value)).alreadyOrdered, String(saved._id)); await assert.rejects(addCartItem(owner, { ...value, operationKey: randomUUID() }), { code: 'PHOTO_SPACES_CHANGED' }); await addCartItem(owner, await entry('as_is'));
  assert.equal((await Upload.findById(value.personalization.photo_left[0])).state, 'retained'); assert.equal((await Order.findById(saved._id)).lines[0].photoPurchase.slots[0].label, 'Left photo'); assert.ok(await openPrivateUpload(value.personalization.photo_left[0], owner)); await assert.rejects(openPrivateUpload(value.personalization.photo_left[0], stranger));
});
test('slot versions cannot be forged or revived by remove/re-add, and legacy required fields remain mandatory', async () => {
  let current = await updateProduct(product._id, { expectedRevision: product.__v, personalization: { photoSpaces: [], fields: [] } }, { actor });
  current = await updateProduct(product._id, { expectedRevision: current.revision, personalization: { photoSpaces: spaces, photoSpacesVersion: 999, fields: [] } }, { actor }); assert.equal(current.personalization.photoSpacesVersion, 3);
  await Product.updateOne({ _id: product._id }, { $set: { 'personalization.requiredBeforePurchase': true, 'personalization.fields': [{ key: 'name', label: 'Name', type: 'short_text', required: true, maxLength: 120 }] } });
  const value = await entry('as_is'); await assert.rejects(addCartItem(owner, value), { code: 'REQUIRED_PERSONALIZATION' }); await addCartItem(owner, { ...value, personalization: { name: 'Synthetic Name' } });
});
test('made-to-order and variant prices are server controlled; global launch and personalized financial safeguards remain', async () => {
  product.inventory = { mode: 'made_to_order', approved: true, available: true, quantity: null }; await product.save(); const value = await entry(); env.checkoutEnabled = false; await addCartItem(owner, value); await assert.rejects(prepareCheckout(owner, { checkoutKey: randomUUID(), paymentMethod: 'instapay', governorate: 'cairo' }), { code: 'CHECKOUT_DISABLED' }); env.checkoutEnabled = true;
  const key = randomUUID(); await prepareCheckout(owner, { checkoutKey: key, paymentMethod: 'cod', governorate: 'cairo' }); await assert.rejects(placeOrder(owner, { checkoutKey: key, paymentMethod: 'cod', customer }), { code: 'QUOTATION_REQUIRED' });
  const { saved } = await order(value); assert.equal(saved.inventoryClaims[0].mode, 'made_to_order'); assert.equal((await Product.findById(product._id)).inventory.quantity, null);
});
test('guest merge transfers originals without extending expiry and public DTOs contain configuration, never private references', async () => {
  const value = await entry(); await addCartItem(owner, value); const before = await Upload.findById(value.personalization.photo_left[0]); const account = `user:${new mongoose.Types.ObjectId()}`; await mergeGuestCart(owner, account); assert.equal((await cartResponse(account)).cart.items[0].valid, true); const after = await Upload.findById(before._id).select('+objectKey'); assert.equal(after.owner, account); assert.equal(after.expiresAt.getTime(), before.expiresAt.getTime()); assert.deepEqual(storage.objects.get(after.objectKey).bytes, png);
  const dto = publicProductDetail(product); assert.equal(dto.personalization.photoSpaces.length, 2); assert.equal(JSON.stringify(dto).includes('objectKey'), false);
});

test('legacy ordinary cart lines can adopt photo choices with a loaded edit fingerprint, and variants retain their genuine price and quantity', async () => {
  const { Cart } = await import('../src/models/Cart.js');
  await addCartItem(owner, await entry('as_is')); const original = (await readCart(owner)).items[0];
  await Cart.updateOne({ owner }, { $unset: { 'items.0.photoSelection': '' } }); const legacy = (await readCart(owner)).items[0];
  const photos = await entry(); await addCartItem(owner, { ...photos, replaceLineId: original.id, replaceFingerprint: photoEditFingerprint(legacy) }); assert.equal((await readCart(owner)).items[0].id, original.id);
  await removeCartItem(owner, original.id);
  product.variants = [{ key: 'gold', attributes: [{ name: 'Color', value: 'Gold' }], pricePiastres: 42000, priceApproved: false, inventory: { mode: 'tracked', quantity: 2, approved: true, available: true } }]; await product.save();
  const variant = { ...await entry(), variantKey: 'gold', quantity: 2 }; assert.equal((await quoteCartLine(variant, owner)).lineTotalPiastres, 84000); await assert.rejects(quoteCartLine({ ...variant, quantity: 3 }, owner), { code: 'INSUFFICIENT_STOCK' });
  const { saved } = await order(variant); assert.equal(saved.lines[0].variantKey, 'gold'); assert.equal(saved.lines[0].unitPricePiastres, 42000); assert.equal((await Product.findById(product._id)).variants[0].inventory.quantity, 0);
});
