import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { startTestDatabase } from './helpers/database.js';
import { seedGiftCartSettings } from './helpers/gift-box-cart-fixtures.js';
import { GiftBoxComponentSetting } from '../src/models/GiftBoxComponentSetting.js';
import { Product } from '../src/models/Product.js';
import { ComponentOption } from '../src/models/ComponentOption.js';
import { Category } from '../src/models/Category.js';
import { aggregateClaims, consumeInventory, restockInventory } from '../src/commerce/inventory.js';

let database, category, product, legacy;
const actor = new mongoose.Types.ObjectId();
before(async () => { database = await startTestDatabase({ transactions: true }); });
after(async () => { await database?.stop(); });
beforeEach(async () => {
  for (const Model of Object.values(mongoose.models)) await Model.deleteMany({});
  category = await Category.create({ name: 'Synthetic inventory', slug: 'synthetic-gift-inventory' });
  product = await Product.create({ name: 'Synthetic chocolate', sku: 'SYNTHETIC-SAME', slug: `synthetic-${randomUUID()}`,
    categoryId: category._id, mainImageKey: 'fixtures/same.webp', galleryKeys: ['fixtures/same.webp'], visibility: 'public', status: 'ready',
    pricePiastres: 10000, priceApproved: true, inventory: { mode: 'tracked', quantity: 10, approved: true, available: true } });
  legacy = await ComponentOption.create({ name: 'Synthetic chocolate', sku: 'SYNTHETIC-SAME', slug: 'synthetic-legacy-component',
    categoryId: category._id, catalogRole: 'Customization Option', mainImageKey: 'fixtures/same.webp', galleryKeys: ['fixtures/same.webp'],
    pricePiastres: 10000, priceApproved: true, enabledForCustomization: true, configurationApproved: true,
    inventory: { mode: 'tracked', quantity: 10, approved: true, available: true }, reviewRequired: false });
  await seedGiftCartSettings(actor);
});

async function giftClaim(id = 'rose-red', quantity = 1) {
  const setting = await GiftBoxComponentSetting.findOne({ componentId: id }).lean();
  return { kind: 'gift_box_component', id, mode: setting.inventoryMode, quantity, expectedRevision: setting.__v,
    unitPricePiastres: setting.pricePiastres, priceApproval: setting.priceApproval,
    priceApprovedBy: String(setting.priceApprovedBy), priceApprovedAt: setting.priceApprovedAt, displayName: setting.displayName };
}
const line = (...claims) => ({ inventoryClaims: claims });
const consume = (...lines) => mongoose.connection.transaction(session => consumeInventory(lines, [], session));
const stock = async id => (await GiftBoxComponentSetting.findOne({ componentId: id }).lean()).inventoryQuantity;

test('aggregated builder claims multiply completed-box demand and preserve approval evidence', async () => {
  const first = await giftClaim('rose-red', 3 * 2), second = await giftClaim('rose-red', 4 * 3);
  const aggregated = aggregateClaims([line(first), line(second)]);
  assert.equal(aggregated.length, 1);
  assert.deepEqual(aggregated[0], { ...first, variantKey: null, quantity: 18 });
  const consumed = await consume(line(first), line(second));
  assert.equal(consumed[0].quantity, 18); assert.equal(consumed[0].consumedQuantity, 18);
  assert.equal(await stock('rose-red'), 2);
  assert.equal((await GiftBoxComponentSetting.findOne({ componentId: 'rose-red' })).__v, first.expectedRevision + 1);
});

test('ordinary, legacy and builder chocolate pools remain independent even with matching presentation', async () => {
  await GiftBoxComponentSetting.updateOne({ componentId: 'chocolate-1' }, { $set: { displayName: product.name } });
  await consume(line(await giftClaim('chocolate-1', 3)));
  assert.equal(await stock('chocolate-1'), 17);
  assert.equal((await Product.findById(product._id)).inventory.quantity, 10);
  assert.equal((await ComponentOption.findById(legacy._id)).inventory.quantity, 10);
  await consume(line({ kind: 'product', id: String(product._id), quantity: 2, mode: 'tracked' }),
    line({ kind: 'component', id: String(legacy._id), quantity: 4, mode: 'tracked' }));
  assert.equal(await stock('chocolate-1'), 17);
  assert.equal((await Product.findById(product._id)).inventory.quantity, 8);
  assert.equal((await ComponentOption.findById(legacy._id)).inventory.quantity, 6);
});

test('unknown inventory kinds and conflicting source modes fail before writes', async () => {
  const good = await giftClaim();
  for (const kind of ['gift', 'Product', '__proto__', null]) {
    assert.throws(() => aggregateClaims([line(good, { ...good, kind })]), { code: 'INVALID_INVENTORY_SOURCE' });
  }
  assert.throws(() => aggregateClaims([line(good), line({ ...good, mode: 'made_to_order' })]), { code: 'INVENTORY_CHANGED' });
  assert.equal(await stock('rose-red'), 20);
});

test('builder aggregate rejects mismatched pricing, approval and settings revisions', async () => {
  const claim = await giftClaim();
  for (const change of [{ expectedRevision: claim.expectedRevision + 1 }, { unitPricePiastres: 4000 },
    { priceApprovedBy: String(new mongoose.Types.ObjectId()) }, { priceApprovedAt: new Date('2026-10-29T08:00:00Z') },
    { displayName: 'Changed saved name' }]) {
    assert.throws(() => aggregateClaims([line(claim), line({ ...claim, ...change })]), { code: 'INVENTORY_CHANGED' });
  }
});

test('invalid builder sources, modes, approval metadata and quantities fail closed', async () => {
  const claim = await giftClaim();
  for (const change of [{ id: String(product._id) }, { id: 'unknown-rose' }, { mode: 'status_only' },
    { id: 'ribbon-navy' }, { variantKey: 'invented' }, { expectedRevision: -1 }, { unitPricePiastres: 0 },
    { priceApproval: 'pending' }, { priceApprovedBy: 'client-approved' }, { priceApprovedAt: null },
    { priceApprovedAt: 'invalid' }, { unitPricePiastres: Number.MAX_SAFE_INTEGER + 1 }]) {
    assert.throws(() => aggregateClaims([line({ ...claim, ...change })]), { code: 'INVALID_INVENTORY_SOURCE' });
  }
  for (const quantity of [0, -1, .1, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => aggregateClaims([line({ ...claim, quantity })]), { code: 'INVALID_QUANTITY' });
  }
  assert.throws(() => aggregateClaims([line({ ...claim, quantity: Number.MAX_SAFE_INTEGER }), line(claim)]), { code: 'INVALID_QUANTITY' });
});

test('made-to-order and ribbon claims fence revisions without numeric deduction', async () => {
  await GiftBoxComponentSetting.updateOne({ componentId: 'plush-1' }, { $set: { inventoryMode: 'made_to_order', inventoryQuantity: 0 } });
  const plush = await giftClaim('plush-1', 99), ribbon = await giftClaim('ribbon-navy', 99);
  const consumed = await consume(line(plush, ribbon));
  assert.deepEqual(consumed.map(claim => claim.consumedQuantity), [0, 0]);
  assert.equal(await stock('plush-1'), 0); assert.equal(await stock('ribbon-navy'), null);
  assert.equal((await GiftBoxComponentSetting.findOne({ componentId: 'plush-1' })).__v, plush.expectedRevision + 1);
  assert.equal((await GiftBoxComponentSetting.findOne({ componentId: 'ribbon-navy' })).__v, ribbon.expectedRevision + 1);
  const returned = { inventoryClaims: consumed, restockedAt: null };
  await mongoose.connection.transaction(session => restockInventory(returned, session));
  assert.equal(await stock('plush-1'), 0); assert.equal(await stock('ribbon-navy'), null);
});

test('explicitly approved complimentary zero-price builder inventory remains consumable', async () => {
  await GiftBoxComponentSetting.updateOne({ componentId: 'gift-card-1' }, { $set: { pricePiastres: 0, priceApproval: 'complimentary' } });
  await consume(line(await giftClaim('gift-card-1', 2)));
  assert.equal(await stock('gift-card-1'), 18);
});

test('insufficient aggregate demand rolls back every builder component', async () => {
  await assert.rejects(consume(line(await giftClaim('box-2', 1), await giftClaim('rose-red', 21))), { code: 'GIFT_BOX_INVENTORY_CHANGED' });
  assert.equal(await stock('box-2'), 20); assert.equal(await stock('rose-red'), 20);
  assert.equal((await GiftBoxComponentSetting.findOne({ componentId: 'box-2' })).__v, 0);
});

test('stale component pricing, approval, availability, mode and revision cannot be consumed', async () => {
  const changes = [
    { enabled: false }, { available: false }, { inventoryMode: 'made_to_order' }, { pricePiastres: 3100 },
    { priceApproval: 'pending' }, { priceApprovedBy: new mongoose.Types.ObjectId() },
    { priceApprovedAt: new Date('2026-10-29T08:00:00Z') }, { __v: 1 },
  ];
  const original = (await GiftBoxComponentSetting.findOne({ componentId: 'rose-red' }).lean());
  const claim = await giftClaim();
  for (const change of changes) {
    await GiftBoxComponentSetting.updateOne({ componentId: 'rose-red' }, { $set: change });
    await assert.rejects(consume(line(claim)), { code: 'GIFT_BOX_INVENTORY_CHANGED' });
    assert.equal(await stock('rose-red'), 20);
    const restored = Object.fromEntries(Object.keys(change).map(key => [key, original[key]]));
    await GiftBoxComponentSetting.updateOne({ componentId: 'rose-red' }, { $set: restored });
  }
});

test('made-to-order availability and ribbon numeric corruption fail closed', async () => {
  await GiftBoxComponentSetting.updateOne({ componentId: 'plush-1' }, { $set: { inventoryMode: 'made_to_order', inventoryQuantity: 0 } });
  const plush = await giftClaim('plush-1');
  await GiftBoxComponentSetting.updateOne({ componentId: 'plush-1' }, { $set: { available: false } });
  await assert.rejects(consume(line(plush)), { code: 'GIFT_BOX_INVENTORY_CHANGED' });
  const ribbon = await giftClaim('ribbon-navy');
  await GiftBoxComponentSetting.updateOne({ componentId: 'ribbon-navy' }, { $set: { inventoryQuantity: 1 } });
  await assert.rejects(consume(line(ribbon)), { code: 'GIFT_BOX_INVENTORY_CHANGED' });
});

test('competing transactions cannot buy the final builder component twice', async () => {
  await GiftBoxComponentSetting.updateOne({ componentId: 'rose-red' }, { $set: { inventoryQuantity: 1 } });
  const claim = await giftClaim();
  const attempts = await Promise.allSettled([consume(line(claim)), consume(line(claim))]);
  assert.equal(attempts.filter(value => value.status === 'fulfilled').length, 1);
  assert.equal(attempts.filter(value => value.status === 'rejected').length, 1);
  assert.equal(await stock('rose-red'), 0);
});

test('all builder mode revision fences reject stale merchant saves', async () => {
  await GiftBoxComponentSetting.updateOne({ componentId: 'plush-1' }, { $set: { inventoryMode: 'made_to_order' } });
  for (const id of ['rose-red', 'plush-1', 'ribbon-navy']) {
    const stale = await GiftBoxComponentSetting.findOne({ componentId: id });
    await consume(line(await giftClaim(id)));
    stale.displayName = 'Stale merchant draft';
    await assert.rejects(stale.save(), error => error.name === 'VersionError');
    assert.notEqual((await GiftBoxComponentSetting.findOne({ componentId: id })).displayName, 'Stale merchant draft');
  }
});

test('an admin edit after the transaction snapshot conflicts instead of consuming old approval', async () => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const before = await GiftBoxComponentSetting.findOne({ componentId: 'rose-red' }).session(session).lean();
    const claim = await giftClaim();
    assert.equal(claim.expectedRevision, before.__v);
    await GiftBoxComponentSetting.updateOne({ componentId: 'rose-red' }, { $set: { available: false }, $inc: { __v: 1 } });
    await assert.rejects(consumeInventory([line(claim)], [], session), error => error.code === 112 || error.hasErrorLabel?.('TransientTransactionError'));
    await session.abortTransaction();
    assert.equal(await stock('rose-red'), 20);
    assert.equal((await GiftBoxComponentSetting.findOne({ componentId: 'rose-red' })).available, false);
  } finally { await session.endSession(); }
});

test('a later transaction failure rolls back builder, ordinary and legacy stock together', async () => {
  const gift = await giftClaim('chocolate-1', 3);
  await assert.rejects(mongoose.connection.transaction(async session => {
    await consumeInventory([line(gift, { kind: 'product', id: String(product._id), quantity: 2, mode: 'tracked' },
      { kind: 'component', id: String(legacy._id), quantity: 4, mode: 'tracked' })], [], session);
    throw new Error('Synthetic failure after all stock writes');
  }), /Synthetic failure/);
  assert.equal(await stock('chocolate-1'), 20);
  assert.equal((await Product.findById(product._id)).inventory.quantity, 10);
  assert.equal((await ComponentOption.findById(legacy._id)).inventory.quantity, 10);
});

test('inventory writes require an active transaction before any mutation', async () => {
  const claim = await giftClaim();
  await assert.rejects(consumeInventory([line(claim)], [], null), { code: 'TRANSACTION_REQUIRED' });
  await assert.rejects(restockInventory({ inventoryClaims: [{ ...claim, consumedQuantity: 1 }], restockedAt: null }, null), { code: 'TRANSACTION_REQUIRED' });
  assert.equal(await stock('rose-red'), 20);
});

test('inspected partial restoration uses consumed builder evidence and only restores once', async () => {
  const claims = await consume(line(await giftClaim('rose-red', 7), await giftClaim('ribbon-navy')));
  const returned = { inventoryClaims: claims.map(claim => ({ ...claim, quantity: claim.mode === 'tracked' ? 2 : 0 })), restockedAt: null };
  await mongoose.connection.transaction(session => restockInventory(returned, session));
  assert.equal(await stock('rose-red'), 15); assert.equal(await stock('ribbon-navy'), null); assert.ok(returned.restockedAt);
  await mongoose.connection.transaction(session => restockInventory(returned, session));
  assert.equal(await stock('rose-red'), 15);
});

test('restoration rejects unknown sources, missing consumption and excessive return quantities', async () => {
  const [claim] = await consume(line(await giftClaim('rose-red', 3)));
  for (const change of [{ kind: 'invented' }, { id: 'unknown-component' }, { consumedQuantity: undefined },
    { consumedQuantity: 0 }, { quantity: 4 }, { consumedQuantity: -1 }]) {
    const returned = { inventoryClaims: [{ ...claim, ...change }], restockedAt: null };
    await assert.rejects(mongoose.connection.transaction(session => restockInventory(returned, session)), { code: 'INVALID_INVENTORY_SOURCE' });
    assert.equal(await stock('rose-red'), 17); assert.equal(returned.restockedAt, null);
  }
});

test('changed or missing tracked builder sources require review instead of creating stock', async () => {
  const claims = await consume(line(await giftClaim('rose-red', 3)));
  const returned = { inventoryClaims: claims, restockedAt: null };
  await GiftBoxComponentSetting.updateOne({ componentId: 'rose-red' }, { $set: { inventoryMode: 'made_to_order' } });
  await assert.rejects(mongoose.connection.transaction(session => restockInventory(returned, session)), { code: 'RESTOCK_REVIEW_REQUIRED' });
  assert.equal(await stock('rose-red'), 17); assert.equal(returned.restockedAt, null);
  await GiftBoxComponentSetting.deleteOne({ componentId: 'rose-red' });
  await assert.rejects(mongoose.connection.transaction(session => restockInventory(returned, session)), { code: 'RESTOCK_REVIEW_REQUIRED' });
  assert.equal(await GiftBoxComponentSetting.countDocuments({ componentId: 'rose-red' }), 0);
});

test('restoration fails atomically when a later builder source mode changed', async () => {
  const claims = await consume(line(await giftClaim('box-2', 2), await giftClaim('rose-red', 3)));
  await GiftBoxComponentSetting.updateOne({ componentId: 'rose-red' }, { $set: { inventoryMode: 'made_to_order' } });
  const returned = { inventoryClaims: claims, restockedAt: null };
  await assert.rejects(mongoose.connection.transaction(session => restockInventory(returned, session)), { code: 'RESTOCK_REVIEW_REQUIRED' });
  assert.equal(await stock('box-2'), 18); assert.equal(await stock('rose-red'), 17); assert.equal(returned.restockedAt, null);
});

test('restoration refuses integer overflow rather than corrupting tracked stock', async () => {
  const claims = await consume(line(await giftClaim('rose-red')));
  await GiftBoxComponentSetting.updateOne({ componentId: 'rose-red' }, { $set: { inventoryQuantity: Number.MAX_SAFE_INTEGER } });
  const returned = { inventoryClaims: claims, restockedAt: null };
  await assert.rejects(mongoose.connection.transaction(session => restockInventory(returned, session)), { code: 'RESTOCK_REVIEW_REQUIRED' });
  assert.equal(await stock('rose-red'), Number.MAX_SAFE_INTEGER); assert.equal(returned.restockedAt, null);
});
