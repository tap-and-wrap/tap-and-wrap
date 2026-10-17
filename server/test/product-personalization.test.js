import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { startTestDatabase } from './helpers/database.js';
import { Product } from '../src/models/Product.js';
import { Category } from '../src/models/Category.js';
import { Upload } from '../src/models/Upload.js';
import { Order } from '../src/models/Order.js';
import { Cart } from '../src/models/Cart.js';
import { env } from '../src/config/env.js';
import { publicProductDetail } from '../src/catalog/public-presentation.js';
import { updateProduct } from '../src/catalog/service.js';
import { createProductSchema } from '../src/catalog/validation.js';
import { addCartItem, mergeGuestCart } from '../src/commerce/cart.js';
import { prepareCheckout, placeOrder } from '../src/commerce/orders.js';
import { presentOrder } from '../src/commerce/order-presentation.js';
import { signUpload, completeUpload } from '../src/commerce/uploads.js';
import { createMemoryStorage, setStorageForTests } from '../src/commerce/storage.js';

const owner = `guest:${'a'.repeat(64)}`, stranger = `guest:${'b'.repeat(64)}`;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWO4NbsXAARVAgOYIL6CAAAAAElFTkSuQmCC', 'base64');
const fields = [
  { key: 'photo', label: 'Your replacement photo', type: 'image', required: true, minFiles: 1, maxFiles: 2, maxBytes: 5 * 1024 * 1024, acceptedMimeTypes: ['image/png'] },
  { key: 'recipient', label: 'Name on your gift', type: 'short_text', required: true, maxLength: 40 },
  { key: 'notes', label: 'Instructions', type: 'long_text', required: false, maxLength: 500 },
  { key: 'style', label: 'Style', type: 'select', required: true, choices: ['Classic', 'Minimal'] },
];
const customer = { name: 'Isolated Customer', email: 'fixture@example.test', phone: '01012345678', governorate: 'cairo', address: '10 Isolated Test Street' };
let database, product, storage;
before(async () => { database = await startTestDatabase({ transactions: true }); });
after(async () => { setStorageForTests(); env.checkoutEnabled = false; await database.stop(); });
beforeEach(async () => {
  for (const model of Object.values(mongoose.models)) await model.deleteMany({});
  env.checkoutEnabled = true; storage = createMemoryStorage(); setStorageForTests(storage);
  const category = await Category.create({ name: 'Isolated Gifts', slug: 'isolated-gifts' });
  product = await Product.create({ name: 'Personal photo gift', slug: 'personal-photo-gift', visibility: 'public', status: 'ready', categoryId: category._id,
    mainImageKey: 'fixture/main.webp', galleryKeys: ['fixture/main.webp'], pricePiastres: 45000, priceApproved: true, reviewRequired: false,
    inventory: { mode: 'tracked', quantity: 8, approved: true, available: true }, personalization: { requiredBeforePurchase: true, fields } });
});
async function image(who = owner, id = product._id, fieldKey = 'photo') {
  const signed = await signUpload(who, { purpose: 'personalization', productId: String(id), fieldKey, mimeType: 'image/png', sizeBytes: PNG.length });
  const upload = await Upload.findById(signed.upload.id).select('+temporaryKey'); storage.put(upload.temporaryKey, PNG);
  await completeUpload(signed.upload.id, who); return signed.upload.id;
}
const item = (photo, extra = {}) => ({ productId: String(product._id), quantity: 1, personalization: { photo: [photo], recipient: 'Alice', style: 'Classic', notes: 'Keep the original crop' }, ...extra });
async function order(who = owner, userId) {
  const checkoutKey = randomUUID(); await prepareCheckout(who, { checkoutKey, governorate: 'cairo', paymentMethod: 'instapay' }, userId);
  return placeOrder(who, { checkoutKey, customer, paymentMethod: 'instapay' }, userId);
}

test('ready requires valid template-free personalization configuration; drafts remain safely editable', async () => {
  const base = product.toObject(); delete base._id; delete base.__v;
  await assert.rejects(Product.create({ ...base, slug: 'invalid-fields', personalization: { requiredBeforePurchase: true, fields: [] } }));
  const draft = await Product.create({ ...base, slug: 'draft-fields', status: 'draft', personalization: { requiredBeforePurchase: true, fields: [] } });
  assert.equal(publicProductDetail(draft.toObject()).orderingAvailable, false);
  const malformed = { ...product.toObject(), personalization: { requiredBeforePurchase: true, fields: [{ key: 'choice', label: 'Choice', type: 'select', choices: [] }] } };
  assert.equal(publicProductDetail(malformed).orderingAvailable, false);
  assert.equal(createProductSchema.safeParse({ name: 'New', slug: 'new', categoryId: String(product.categoryId), personalization: { requiredBeforePurchase: true, fields } }).success, true);
});

test('ordinary products and explicitly disabled personalization use normal cart while legacy fields retain their guards', async () => {
  await Product.updateOne({ _id: product._id }, { $set: { 'personalization.requiredBeforePurchase': false } });
  const added = await addCartItem(owner, { productId: String(product._id), quantity: 1 }); assert.equal(added.cart.items[0].unitPricePiastres, 45000);
  await assert.rejects(image(), /does not support/);
  await Product.collection.updateOne({ _id: product._id }, { $unset: { 'personalization.requiredBeforePurchase': '' } });
  await assert.rejects(addCartItem(stranger, { productId: String(product._id), quantity: 1 }));
});

test('backend rejects missing required photos/text, unsupported choices, foreign files and another product field', async () => {
  await assert.rejects(addCartItem(owner, { productId: String(product._id), quantity: 1 }));
  const foreign = await image(stranger); await assert.rejects(addCartItem(owner, item(foreign)));
  const photo = await image();
  for (const personalization of [{ photo: [photo], recipient: '', style: 'Classic' }, { photo: [photo], recipient: 'Alice', style: 'Fabricated' }, { photo: [], recipient: 'Alice', style: 'Classic' }]) await assert.rejects(addCartItem(owner, item(photo, { personalization })));
  const upload = await Upload.findById(photo); upload.fieldKey = 'different'; await upload.save(); await assert.rejects(addCartItem(owner, item(photo)));
  assert.equal(await Cart.countDocuments(), 0);
});

test('personalization preserves approved variant price and quantity without any template surcharge', async () => {
  const inventory = { mode: 'tracked', quantity: 5, approved: true, available: true };
  await Product.updateOne({ _id: product._id }, { $set: { variants: [{ key: 'large', attributes: [{ name: 'Size', value: 'Large' }], pricePiastres: 50000, priceApproved: true, inventory }] } });
  const photo = await image(); const added = await addCartItem(owner, item(photo, { quantity: 2, variantKey: 'large' }));
  assert.equal(added.cart.items[0].unitPricePiastres, 50000); assert.equal(added.cart.subtotalPiastres, 100000);
  const saved = await order(); assert.equal(saved.totals.totalPiastres, 100000); assert.equal(saved.totals.shippingPiastres, null);
  assert.equal((await Product.findById(product._id)).variants[0].inventory.quantity, 3);
  await assert.rejects(addCartItem(stranger, item(photo, { variantKey: 'large', customization: { templateId: String(new mongoose.Types.ObjectId()), version: 1 } })));
});

test('immutable Add to Cart retries, including concurrent requests, attach one file and increment quantity once', async () => {
  const photo = await image(), input = item(photo, { operationKey: randomUUID(), quantity: 2 });
  await Promise.all([addCartItem(owner, input), addCartItem(owner, input)]);
  const repeated = await addCartItem(owner, input); assert.equal(repeated.cart.quantity, 2); assert.equal(repeated.cart.items.length, 1);
  const cart = await Cart.findOne({ owner }); assert.equal(cart.addOperations.length, 1);
  const upload = await Upload.findById(photo); assert.equal(String(upload.cartId), String(cart._id)); assert.equal(await Upload.countDocuments(), 1);
  await assert.rejects(addCartItem(owner, { ...input, quantity: 3 }), error => error.code === 'CART_OPERATION_CONFLICT');
  assert.equal((await Product.findById(product._id)).inventory.quantity, 8);
});

test('private photos and readable instructions survive guest merge and become retained immutable order snapshots', async () => {
  const photo = await image(); await addCartItem(owner, item(photo));
  const userId = new mongoose.Types.ObjectId(), account = `user:${userId}`;
  const merged = await mergeGuestCart(owner, account); assert.equal(merged.cart.items[0].personalization.recipient, 'Alice');
  assert.equal((await Upload.findById(photo)).owner, account);
  const saved = await order(account, userId), upload = await Upload.findById(photo);
  assert.equal(upload.state, 'retained'); assert.equal(String(upload.orderId), saved.id);
  assert.equal(saved.lines[0].personalizationDefinitions[0].label, 'Your replacement photo');
  await Product.updateOne({ _id: product._id }, { $set: { 'personalization.fields.0.label': 'Changed later' } });
  const dto = presentOrder(await Order.findById(saved.id).lean());
  assert.equal(dto.lines[0].personalizationDefinitions[0].label, 'Your replacement photo'); assert.equal(dto.lines[0].personalization.notes, 'Keep the original crop');
  assert.equal(JSON.stringify(dto).includes('objectKey'), false); assert.equal(JSON.stringify(dto).includes('temporaryKey'), false);
  const invalid = presentOrder({ ...(await Order.findById(saved.id).lean()), lines: [{ personalizationDefinitions: [null, { key: 'photo', label: { private: 'SECRET' }, type: 'image' }] }] });
  assert.deepEqual(invalid.lines[0].personalizationDefinitions, []);
});

test('current fields and stock/price gates are revalidated at checkout, without consuming stock on rejection', async () => {
  const photo = await image(); await addCartItem(owner, item(photo));
  await Product.updateOne({ _id: product._id }, { $push: { 'personalization.fields': { key: 'new_requirement', label: 'New required text', type: 'short_text', required: true, maxLength: 80 } } });
  await assert.rejects(order()); assert.equal(await Order.countDocuments(), 0); assert.equal((await Product.findById(product._id)).inventory.quantity, 8);
  for (const patch of [{ 'inventory.quantity': 0 }, { priceApproved: false }, { visibility: 'withdrawn' }]) {
    await Product.updateOne({ _id: product._id }, { $set: patch }); await assert.rejects(addCartItem(owner, item(photo)));
  }
});

test('admin configuration saves are revision-guarded and preserve aliases, images and independent template flags', async () => {
  const before = product.toObject();
  const actor = { _id: new mongoose.Types.ObjectId(), role: 'admin' };
  const saved = await updateProduct(product._id, { expectedRevision: product.__v, personalization: { requiredBeforePurchase: true, fields: [{ key: 'name', label: 'Printed name', type: 'short_text', maxLength: 50, required: true }] } }, { actor });
  assert.equal(saved.slug, before.slug); assert.deepEqual(saved.galleryKeys, before.galleryKeys); assert.equal(saved.customization.enabled, false);
  await assert.rejects(updateProduct(product._id, { expectedRevision: product.__v, personalization: { requiredBeforePurchase: false, fields: [] } }, { actor }), error => error.status === 409);
});

test('Made by Request personalization allocates no fabricated stock and keeps the fixed merchandise price', async () => {
  await Product.updateOne({ _id: product._id }, { $set: { 'inventory.mode': 'made_to_order', 'inventory.quantity': null } });
  await addCartItem(owner, item(await image())); const saved = await order();
  assert.equal(saved.totals.totalPiastres, 45000); assert.equal(saved.paymentState, 'awaiting_transfer');
  assert.equal((await Product.findById(product._id)).inventory.quantity, null);
});
