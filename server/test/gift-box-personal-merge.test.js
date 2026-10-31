import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { Cart } from '../src/models/Cart.js';
import { Upload } from '../src/models/Upload.js';
import { UploadQuota } from '../src/models/UploadQuota.js';
import { User } from '../src/models/User.js';
import { GiftBoxComponentSetting } from '../src/models/GiftBoxComponentSetting.js';
import { GiftBoxPersonalizationOption } from '../src/models/GiftBoxPersonalizationOption.js';
import { mergeGuestCart } from '../src/commerce/cart.js';
import { identifyGiftBoxConfiguration } from '../src/gift-box/commerce-contract.js';
import { GIFT_BOX_PERSONALIZATION_INTENT_VERSION } from '../../shared/gift-box/personalization-intent.mjs';
import { setGiftBoxCartPoliciesForDisposableTest } from '../src/gift-box/cart-pricing.js';
import { giftCartConfiguration, giftCartPolicy, seedGiftCartSettings } from './helpers/gift-box-cart-fixtures.js';
import { startTestDatabase } from './helpers/database.js';

const expiresAt = () => new Date(Date.now() + 60 * 60 * 1000);
const guest = `guest:${'a'.repeat(64)}`;
const stranger = `guest:${'b'.repeat(64)}`;
const previous = { backend: env.giftBoxBuilderBackendEnabled, options: env.giftBoxPersonalizationOptionsEnabled };
let database, admin, receiver;

before(async () => {
  database = await startTestDatabase({ models: Object.values(mongoose.models), transactions: true });
  await GiftBoxComponentSetting.createCollection();
  await GiftBoxComponentSetting.createIndexes();
  await GiftBoxPersonalizationOption.createCollection();
  await GiftBoxPersonalizationOption.createIndexes();
});
beforeEach(async () => {
  for (const Model of Object.values(mongoose.models)) await Model.deleteMany({});
  env.giftBoxBuilderBackendEnabled = true;
  env.giftBoxPersonalizationOptionsEnabled = true;
  admin = await User.create({ name: 'Synthetic gift merge admin', email: 'merge-admin@example.test', passwordHash: 'fixture', role: 'admin' });
  receiver = `user:${new mongoose.Types.ObjectId()}`;
  await seedGiftCartSettings(admin._id);
  setGiftBoxCartPoliciesForDisposableTest([giftCartPolicy()]);
  await GiftBoxPersonalizationOption.create({
    optionId: 'standard-print', kind: 'photo_print', displayName: 'Synthetic approved print',
    enabled: true, available: true, boxIds: ['box-2'], pricePiastres: 2500,
    priceApproval: 'paid', priceApprovedBy: admin._id, priceApprovedAt: new Date(),
    createdBy: admin._id, updatedBy: admin._id,
  });
});
after(async () => {
  setGiftBoxCartPoliciesForDisposableTest([]);
  env.giftBoxBuilderBackendEnabled = previous.backend;
  env.giftBoxPersonalizationOptionsEnabled = previous.options;
  await database?.stop();
});

async function putPersonalCart(owner, { photoOwner = owner, photos = 1 } = {}) {
  const id = new mongoose.Types.ObjectId();
  const intent = { version: GIFT_BOX_PERSONALIZATION_INTENT_VERSION,
    photoPrints: photos ? [{ uploadId: String(id), printOptionId: 'standard-print', zone: 'inside', x: 0.3, y: 0.4 }] : [],
    engravings: [] };
  const { configuration, configurationId } = identifyGiftBoxConfiguration({ ...giftCartConfiguration(), personalizationIntent: intent });
  const cart = await Cart.create({ owner, expiresAt: expiresAt(), addOperations: [],
    items: [{ id: randomUUID(), kind: 'gift_box_v2', identity: configurationId, configurationId,
      configuration, name: 'Build Your Gift Box', quantity: 1 }] });
  if (photos) {
    await UploadQuota.create({ owner: photoOwner, activeCount: 1, activeBytes: 1024 });
    await Upload.create({ _id: id, owner: photoOwner, purpose: 'gift_box_photo', state: 'complete',
      fieldKey: 'gift_box_photo', giftBoxId: 'box-2', mimeType: 'image/png', sizeBytes: 1024,
      temporaryKey: `isolated/${id}`, signedExpiresAt: expiresAt(), expiresAt: expiresAt(), cartId: cart._id });
  }
  return { cart, photoId: String(id) };
}

test('guest photo ownership, quota and Cart binding transfer atomically and survive retry', async () => {
  const { cart: source, photoId } = await putPersonalCart(guest);
  const merged = await mergeGuestCart(guest, receiver);
  assert.equal(merged.cart.items.length, 1);
  assert.equal(merged.cart.items[0].giftBox.personalization.photoCount, 1);
  const destination = await Cart.findOne({ owner: receiver });
  const photo = await Upload.findById(photoId);
  assert.equal(photo.owner, receiver);
  assert.equal(String(photo.cartId), String(destination._id));
  assert.equal(await Cart.countDocuments({ _id: source._id }), 0);
  assert.equal((await UploadQuota.findOne({ owner: guest })).activeCount, 0);
  assert.equal((await UploadQuota.findOne({ owner: receiver })).activeCount, 1);
  assert.equal((await mergeGuestCart(guest, receiver)).cart.items.length, 1);
});

test('another owner photo causes rollback without deleting the guest cart', async () => {
  const { cart, photoId } = await putPersonalCart(guest, { photoOwner: stranger });
  await assert.rejects(mergeGuestCart(guest, receiver), error => error.status === 409 && /^GIFT_BOX_UPLOAD_/.test(error.code || ''));
  assert.ok(await Cart.exists({ _id: cart._id }));
  assert.equal((await Upload.findById(photoId)).owner, stranger);
  assert.equal(await Cart.countDocuments({ owner: receiver }), 0);
});

test('receiving account quota failure rolls back all photo and cart changes', async () => {
  const { cart, photoId } = await putPersonalCart(guest);
  await UploadQuota.create({ owner: receiver, activeCount: 20, activeBytes: 20 * 1024 });
  await assert.rejects(mergeGuestCart(guest, receiver), error => error.code === 'UPLOAD_QUOTA_EXCEEDED');
  assert.ok(await Cart.exists({ _id: cart._id }));
  assert.equal((await Upload.findById(photoId)).owner, guest);
  assert.equal((await UploadQuota.findOne({ owner: guest })).activeCount, 1);
  assert.equal((await UploadQuota.findOne({ owner: receiver })).activeCount, 20);
});

test('two different personalized carts merge without stealing or losing existing account photos', async () => {
  const { photoId: guestPhoto } = await putPersonalCart(guest);
  const { photoId: accountPhoto } = await putPersonalCart(receiver);
  const merged = await mergeGuestCart(guest, receiver);
  assert.equal(merged.cart.items.length, 2);
  assert.equal(merged.cart.items.every(item => item.valid), true);
  const destination = await Cart.findOne({ owner: receiver });
  for (const id of [guestPhoto, accountPhoto]) {
    const photo = await Upload.findById(id);
    assert.equal(photo.owner, receiver);
    assert.equal(String(photo.cartId), String(destination._id));
  }
  assert.equal((await UploadQuota.findOne({ owner: receiver })).activeCount, 2);
});
