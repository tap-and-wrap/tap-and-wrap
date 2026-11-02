import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import mongoose from 'mongoose';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';
import { Cart } from '../src/models/Cart.js';
import { Category } from '../src/models/Category.js';
import { Product } from '../src/models/Product.js';
import { User } from '../src/models/User.js';
import { Order } from '../src/models/Order.js';
import { CheckoutIntent } from '../src/models/CheckoutIntent.js';
import { GiftBoxComponentSetting } from '../src/models/GiftBoxComponentSetting.js';
import { NotificationEvent } from '../src/models/NotificationEvent.js';
import { TrackingConsent } from '../src/models/TrackingConsent.js';
import { MetaEvent } from '../src/models/MetaEvent.js';
import { Upload } from '../src/models/Upload.js';
import DiscountCode from '../src/models/DiscountCode.js';
import { DiscountRedemption } from '../src/models/DiscountRedemption.js';
import { addCartItem } from '../src/commerce/cart.js';
import { prepareCheckout, placeOrder, prepareGiftBoxCheckoutForDisposableTest, placeGiftBoxOrderForDisposableTest, getOwnedOrder } from '../src/commerce/orders.js';
import { setGiftBoxCheckoutPoliciesForDisposableTest, withdrawGiftBoxCheckoutPolicyForDisposableTest, setGiftBoxCheckoutHooksForDisposableTest,
  createGiftBoxCheckoutCapabilityForDisposableTest, assertGiftBoxCheckoutCapability } from '../src/gift-box/checkout-guard.js';
import { mutateOrderAccounting } from '../src/commerce/order-accounting.js';
import { renderEmailTemplate } from '../src/email/templates.js';
import { recordOrderTracking } from '../src/tracking/service.js';
import { signUpload, completeUpload } from '../src/commerce/uploads.js';
import { createMemoryStorage, setStorageForTests } from '../src/commerce/storage.js';
import { makeCsrfToken } from '../src/utils/tokens.js';
import { startTestDatabase } from './helpers/database.js';
import { giftCartConfiguration, giftCartInput, giftCartPolicy, seedGiftCartSettings } from './helpers/gift-box-cart-fixtures.js';

const owner = `guest:${'a'.repeat(64)}`, other = `guest:${'b'.repeat(64)}`;
const customer = { name: 'Synthetic gift customer', email: 'gift-order@example.test', phone: '01012345678', governorate: 'cairo', address: '10 Isolated Test Street, Cairo' };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWO4NbsXAARVAgOYIL6CAAAAAElFTkSuQmCC', 'base64');
const original = { backend: env.giftBoxBuilderBackendEnabled, checkout: env.checkoutEnabled };
const trackingSettings = { META_ENABLED: 'true', META_POLICY_APPROVED: 'true', META_PIXEL_ID: '123456789', META_CONSENT_POLICY_VERSION: 'isolated-gift-checkout-v1', SITE_ORIGIN: 'https://merchant.example.test', META_CAPI_ENABLED: 'false', META_ACCESS_TOKEN: '' };
const originalTracking = Object.fromEntries(Object.keys(trackingSettings).map(key => [key, process.env[key]]));
let database, admin, product;
before(async () => {
  database = await startTestDatabase({ models: Object.values(mongoose.models), transactions: true });
  await GiftBoxComponentSetting.createCollection(); await GiftBoxComponentSetting.createIndexes();
});
beforeEach(async () => {
  for (const Model of Object.values(mongoose.models)) await Model.deleteMany({});
  process.env.META_ENABLED = 'false';
  env.giftBoxBuilderBackendEnabled = true; env.checkoutEnabled = true; setGiftBoxCheckoutHooksForDisposableTest();
  admin = await User.create({ name: 'Synthetic order admin', email: 'gift-admin@example.test', role: 'admin', passwordHash: 'fixture' });
  const category = await Category.create({ name: 'Synthetic order category', slug: 'synthetic-order-category', active: true });
  product = await Product.create({ name: 'Synthetic ordinary chocolate-1', slug: 'synthetic-order-chocolate', categoryId: category._id,
    externalCatalogId: 'chocolate-1', sku: 'chocolate-1', mainImageKey: 'fixtures/ordinary.webp', galleryKeys: ['fixtures/ordinary.webp'],
    visibility: 'public', status: 'ready', pricePiastres: 12000, priceApproved: true,
    inventory: { mode: 'tracked', quantity: 37, approved: true, available: true } });
  await seedGiftCartSettings(admin._id); await setGiftBoxCheckoutPoliciesForDisposableTest([giftCartPolicy()]);
});
after(async () => {
  if (database) { setGiftBoxCheckoutHooksForDisposableTest(); await setGiftBoxCheckoutPoliciesForDisposableTest([]); }
  env.giftBoxBuilderBackendEnabled = original.backend; env.checkoutEnabled = original.checkout; await database?.stop();
  for (const [key, value] of Object.entries(originalTracking)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});
const setting = id => GiftBoxComponentSetting.findOne({ componentId: id }).lean();
async function addGift(who = owner, configuration = giftCartConfiguration(), quantity = 1) { await addCartItem(who, giftCartInput(configuration, quantity)); }
async function review(who = owner, { paymentMethod = 'instapay', discountCode } = {}) {
  const checkoutKey = randomUUID();
  const quote = await prepareGiftBoxCheckoutForDisposableTest(who, { checkoutKey, paymentMethod, governorate: 'cairo', ...(discountCode ? { discountCode } : {}) });
  return { quote, input: { checkoutKey, paymentMethod, customer, ...(discountCode ? { discountCode } : {}) } };
}
async function complete(who = owner, options) { const { quote, input } = await review(who, options); return { quote, input, order: await placeGiftBoxOrderForDisposableTest(who, input) }; }
async function currentCounts() { return { order: await Order.countDocuments(), cart: await Cart.countDocuments(), event: await NotificationEvent.countDocuments(), tracking: await MetaEvent.countDocuments() }; }
async function adminEdit(id, changes) { await GiftBoxComponentSetting.updateOne({ componentId: id }, { $set: changes, $inc: { __v: 1 } }); }
async function accounting(id, input) { const saved = await Order.findById(id).lean(); return mutateOrderAccounting(id, null, { revision: saved.revision, ...input }, admin); }
async function trackingConsent() {
  Object.assign(process.env, trackingSettings);
  return TrackingConsent.create({ tokenHash: 'c'.repeat(64), granted: true, policyVersion: trackingSettings.META_CONSENT_POLICY_VERSION, expiresAt: new Date(Date.now() + 3600000) });
}

test('internal gift order consumes tracked builder quantities once, freezes one coherent line and keeps delivery pending', async () => {
  await addGift(owner, giftCartConfiguration(), 2);
  assert.equal((await setting('rose-red')).inventoryQuantity, 20);
  const { order, quote } = await complete();
  assert.equal(quote.totals.totalPiastres, 198000); assert.equal(quote.totals.shippingPiastres, null);
  const saved = await Order.findById(order.id).lean();
  assert.equal(saved.lines.length, 1); assert.equal(saved.lines[0].kind, 'gift_box_v2'); assert.equal(saved.lines[0].productId, undefined);
  assert.equal(saved.lines[0].quantity, 2); assert.equal(saved.lines[0].lineTotalPiastres, 198000);
  assert.equal(saved.lines[0].giftBox.snapshotVersion, 'gift-box-order-v1');
  assert.equal(saved.lines[0].giftBox.configuration.selection.giftCard.message, 'Private fixture message');
  assert.equal(saved.lines[0].giftBox.configuration.placements.length, 5);
  assert.equal(saved.lines[0].giftBox.fulfillment.policyReference.policyId, 'isolated-cart-policy');
  assert.equal(saved.lines[0].giftBox.components.reduce((sum, item) => sum + item.lineSubtotalPiastres, 0), saved.totals.totalPiastres);
  assert.equal((await setting('rose-red')).inventoryQuantity, 14); assert.equal((await setting('chocolate-1')).inventoryQuantity, 18);
  assert.equal((await Product.findById(product._id)).inventory.quantity, 37);
  assert.equal(saved.personalized, true); assert.deepEqual(saved.allowedPaymentMethods, ['instapay']); assert.equal(saved.paymentState, 'awaiting_transfer');
  assert.equal(saved.charges[0].amountPiastres, null); assert.equal(saved.charges[0].state, 'pending');
  assert.equal((await CheckoutIntent.findOne().lean()).state, 'consumed'); assert.equal(await Cart.countDocuments(), 0);
  for (const component of saved.lines[0].giftBox.components) { assert.equal(component.settingsRevision, 0); assert.equal(component.priceApprovedBy, String(admin._id)); assert.ok(component.priceApprovedAt); }
  for (const id of ['box-2', 'rose-red', 'plush-1', 'chocolate-1', 'ribbon-navy', 'gift-card-1']) assert.equal((await setting(id)).__v, 1);
});

test('mixed orders and multiple configurations aggregate one builder pool while ordinary chocolate stock stays independent', async () => {
  await addCartItem(owner, { productId: String(product._id), quantity: 2 });
  await addGift(owner, giftCartConfiguration({ roses: 3 }));
  await addGift(owner, giftCartConfiguration({ roses: 4, message: 'Second configuration' }), 2);
  const { order } = await complete(); const saved = await Order.findById(order.id).lean();
  assert.equal(saved.lines.length, 3); assert.equal(saved.lines.filter(line => line.kind === 'gift_box_v2').length, 2);
  assert.equal(saved.totals.subtotalPiastres, 327000); assert.equal(saved.totals.totalPiastres, 327000);
  assert.equal((await setting('rose-red')).inventoryQuantity, 9); assert.equal((await setting('chocolate-1')).inventoryQuantity, 17);
  assert.equal((await Product.findById(product._id)).inventory.quantity, 35);
  const roseClaims = saved.inventoryClaims.filter(claim => claim.kind === 'gift_box_component' && claim.id === 'rose-red');
  assert.equal(roseClaims.length, 1); assert.equal(roseClaims[0].quantity, 11);
});

test('Made to Order and ribbon availability are fenced without inventing numeric inventory', async () => {
  await adminEdit('rose-red', { inventoryMode: 'made_to_order', inventoryQuantity: null });
  await addGift(owner, giftCartConfiguration({ roses: 10 }), 2);
  const { order } = await complete(); const saved = await Order.findById(order.id).lean();
  assert.equal((await setting('rose-red')).inventoryQuantity, null); assert.equal((await setting('ribbon-navy')).inventoryQuantity, null);
  const rose = saved.inventoryClaims.find(claim => claim.id === 'rose-red');
  const ribbon = saved.inventoryClaims.find(claim => claim.id === 'ribbon-navy');
  assert.equal(rose.mode, 'made_to_order'); assert.equal(rose.quantity, 20); assert.equal(rose.consumedQuantity, 0);
  assert.equal(ribbon.mode, 'status_only'); assert.equal(ribbon.consumedQuantity, 0);
});

test('aggregate reduced stock, unavailable Made to Order and out-of-stock ribbon block before order creation', async () => {
  for (const [id, values] of [['rose-red', { inventoryQuantity: 5 }], ['plush-1', { inventoryMode: 'made_to_order', inventoryQuantity: null, available: false }], ['ribbon-navy', { available: false }]]) {
    await addGift(owner, giftCartConfiguration());
    if (id === 'rose-red') await addGift(owner, giftCartConfiguration({ message: 'Different arrangement' }));
    const { input } = await review(); await adminEdit(id, values);
    await assert.rejects(placeGiftBoxOrderForDisposableTest(owner, input)); assert.equal(await Order.countDocuments(), 0);
    assert.equal((await Product.findById(product._id)).inventory.quantity, 37); await Cart.deleteMany({}); await CheckoutIntent.deleteMany({});
    await adminEdit(id, { available: true, inventoryMode: id.startsWith('ribbon') ? 'status_only' : 'tracked', inventoryQuantity: id.startsWith('ribbon') ? null : 20 });
  }
});

test('two customers racing for the final builder component create one order and one deduction', async () => {
  await adminEdit('chocolate-1', { inventoryQuantity: 1 });
  await addGift(owner); await addGift(other);
  const first = await review(owner), second = await review(other);
  const results = await Promise.allSettled([placeGiftBoxOrderForDisposableTest(owner, first.input), placeGiftBoxOrderForDisposableTest(other, second.input)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  assert.equal(await Order.countDocuments(), 1); assert.equal((await setting('chocolate-1')).inventoryQuantity, 0);
  assert.equal((await setting('rose-red')).inventoryQuantity, 17); assert.equal(await Cart.countDocuments(), 1);
});

test('changed policy rules require renewed review even when policy ID, version and merchandise totals stay the same', async () => {
  await addGift(); const { input } = await review();
  const changedPolicy = giftCartPolicy(); changedPolicy.limits.maxUnits -= 1;
  await setGiftBoxCheckoutPoliciesForDisposableTest([changedPolicy]);
  await assert.rejects(placeGiftBoxOrderForDisposableTest(owner, input), { code: 'CHECKOUT_CHANGED' });
  assert.equal(await Order.countDocuments(), 0); assert.equal(await Cart.countDocuments(), 1);
  assert.equal((await setting('rose-red')).inventoryQuantity, 20);
  assert.equal((await CheckoutIntent.findOne().lean()).state, 'open');
});

for (const [label, changes] of [['price', { pricePiastres: 11000 }], ['availability', { available: false }], ['inventory mode', { inventoryMode: 'made_to_order', inventoryQuantity: null }]]) {
  test(`concurrent admin ${label} change is detected atomically and rolls builder deductions back`, async () => {
    await addGift(); const { input } = await review(); let changed = false;
    setGiftBoxCheckoutHooksForDisposableTest({ beforeInventory: async () => { if (!changed) { changed = true; await adminEdit('chocolate-1', changes); } } });
    await assert.rejects(placeGiftBoxOrderForDisposableTest(owner, input));
    assert.equal(await Order.countDocuments(), 0); assert.equal(await Cart.countDocuments(), 1);
    assert.equal((await setting('rose-red')).inventoryQuantity, 20); assert.equal((await setting('box-2')).inventoryQuantity, 20);
    assert.equal((await CheckoutIntent.findOne().lean()).state, 'open');
  });
}

test('policy withdrawal during the transaction blocks commit and restores every stock write', async () => {
  await addGift(); const { input } = await review(); let withdrawn = false;
  setGiftBoxCheckoutHooksForDisposableTest({ beforePolicyFence: async () => { if (!withdrawn) { withdrawn = true; await withdrawGiftBoxCheckoutPolicyForDisposableTest('box-2'); } } });
  await assert.rejects(placeGiftBoxOrderForDisposableTest(owner, input), error => ['GIFT_BOX_FULFILLMENT_WITHDRAWN', 'CHECKOUT_CHANGED'].includes(error.code));
  assert.equal(await Order.countDocuments(), 0); assert.equal((await setting('chocolate-1')).inventoryQuantity, 20); assert.equal((await setting('rose-red')).inventoryQuantity, 20);
  assert.equal(await Cart.countDocuments(), 1); assert.equal(await NotificationEvent.countDocuments(), 0);
});

test('a late transaction failure rolls back product and builder inventory, cart, intent, discount and outbox together', async () => {
  await addCartItem(owner, { productId: String(product._id), quantity: 1 }); await addGift();
  const discount = await DiscountCode.create({ code: 'SYNTHETIC', name: 'Isolated product-only discount', active: true, kind: 'percentage', value: 5000, minimumSubtotalPiastres: 0, usageLimit: 10, usedCount: 0 });
  const { input } = await review(owner, { discountCode: discount.code });
  const consent = await trackingConsent();
  setGiftBoxCheckoutHooksForDisposableTest({ beforeCommit: async () => { throw new Error('Synthetic late transaction failure'); } });
  await assert.rejects(placeGiftBoxOrderForDisposableTest(owner, input, null, { trackingConsentId: consent._id }), /Synthetic late transaction failure/);
  assert.deepEqual(await currentCounts(), { order: 0, cart: 1, event: 0, tracking: 0 });
  assert.equal((await Product.findById(product._id)).inventory.quantity, 37); assert.equal((await setting('rose-red')).inventoryQuantity, 20);
  assert.equal((await DiscountCode.findById(discount._id)).usedCount, 0); assert.equal(await DiscountRedemption.countDocuments(), 0);
  assert.equal((await CheckoutIntent.findOne().lean()).state, 'open');
});

test('lost response recovers the original committed gift before changed stock, prices and policies are reevaluated', async () => {
  await addGift(); const { input } = await review();
  setGiftBoxCheckoutHooksForDisposableTest({ afterCommit: async () => { throw new Error('Synthetic lost checkout response'); } });
  await assert.rejects(placeGiftBoxOrderForDisposableTest(owner, input), /Synthetic lost checkout response/);
  const originalOrder = await Order.findOne().lean(); assert.ok(originalOrder);
  await adminEdit('rose-red', { available: false, pricePiastres: 12000 }); await withdrawGiftBoxCheckoutPolicyForDisposableTest('box-2');
  const recovered = await placeGiftBoxOrderForDisposableTest(owner, input);
  assert.equal(recovered.id, String(originalOrder._id)); assert.equal(await Order.countDocuments(), 1);
  assert.equal((await setting('chocolate-1')).inventoryQuantity, 19); assert.equal((await setting('rose-red')).inventoryQuantity, 17);
  assert.equal(await NotificationEvent.countDocuments({ event: 'order_received' }), 1);
  await assert.rejects(placeGiftBoxOrderForDisposableTest(owner, { ...input, customer: { ...customer, name: 'Changed immutable retry' } }), { code: 'IDEMPOTENCY_CONFLICT' });
  await assert.rejects(getOwnedOrder(originalOrder._id, other), { code: 'ORDER_NOT_FOUND' });
});

test('concurrent identical checkout retries recover one gift order, one consumed intent and one stock deduction', async () => {
  await addGift(); const { input } = await review();
  const attempts = await Promise.allSettled([placeGiftBoxOrderForDisposableTest(owner, input), placeGiftBoxOrderForDisposableTest(owner, input)]);
  for (const attempt of attempts) assert.equal(attempt.status, 'fulfilled', attempt.reason?.stack);
  assert.equal(attempts[0].value.id, attempts[1].value.id); assert.equal(await Order.countDocuments(), 1);
  assert.equal((await setting('rose-red')).inventoryQuantity, 17); assert.equal((await setting('chocolate-1')).inventoryQuantity, 19);
  assert.equal(await CheckoutIntent.countDocuments({ state: 'consumed' }), 1); assert.equal(await NotificationEvent.countDocuments({ event: 'order_received' }), 1);
});

test('changed component prices invalidate an old checkout review even when the complete gift total is unchanged', async () => {
  await addGift(); const { quote, input } = await review();
  await adminEdit('box-2', { pricePiastres: 21000 }); await adminEdit('chocolate-1', { pricePiastres: 9000 });
  await assert.rejects(placeGiftBoxOrderForDisposableTest(owner, input), { code: 'CHECKOUT_CHANGED' });
  assert.equal(await Order.countDocuments(), 0); assert.equal((await setting('rose-red')).inventoryQuantity, 20);
  const refreshed = await review(); assert.equal(refreshed.quote.totalPiastres, quote.totalPiastres);
  const order = await placeGiftBoxOrderForDisposableTest(owner, refreshed.input);
  const saved = await Order.findById(order.id).lean();
  assert.equal(saved.lines[0].giftBox.components.find(item => item.componentId === 'box-2').unitPricePiastres, 21000);
  assert.equal(saved.lines[0].giftBox.components.find(item => item.componentId === 'chocolate-1').unitPricePiastres, 9000);
});

test('mixed product discount is applied exactly once and gift merchandise never qualifies or receives the discount', async () => {
  await addCartItem(owner, { productId: String(product._id), quantity: 2 }); await addGift();
  const discount = await DiscountCode.create({ code: 'PRODUCT50', name: 'Synthetic product percentage', active: true, kind: 'percentage', value: 5000, minimumSubtotalPiastres: 0, usageLimit: 10, usedCount: 0 });
  const { order } = await complete(owner, { discountCode: discount.code }); const saved = await Order.findById(order.id).lean();
  assert.equal(saved.totals.subtotalPiastres, 123000); assert.equal(saved.totals.discountPiastres, 12000); assert.equal(saved.totals.totalPiastres, 111000);
  assert.equal(saved.lines.find(line => line.kind === 'gift_box_v2').lineTotalPiastres, 99000);
  assert.equal((await DiscountCode.findById(discount._id)).usedCount, 1); assert.equal((await DiscountRedemption.findOne().lean()).amountPiastres, 12000);
});

test('order-time snapshot remains unchanged after names, prices, quantities and policy are edited', async () => {
  await addGift(); const { order } = await complete(); const before = (await Order.findById(order.id).lean()).lines;
  await adminEdit('chocolate-1', { displayName: 'Edited later', pricePiastres: 12300, inventoryQuantity: 50 }); await withdrawGiftBoxCheckoutPolicyForDisposableTest('box-2');
  const persisted = await Order.findById(order.id); persisted.lines[0].giftBox.components[0].displayName = 'Attempted snapshot mutation'; persisted.markModified('lines');
  await assert.rejects(persisted.save(), error => error.name === 'ValidationError' && error.errors.lines?.message.includes('immutable'));
  const after = (await Order.findById(order.id).lean()).lines; assert.deepEqual(after, before);
});

test('customer notification contains escaped immutable gift selection without message, coordinates or configuration identity', async () => {
  const message = 'PRIVATE CARD <script>alert(1)</script>'; await addGift(owner, giftCartConfiguration({ message }));
  await adminEdit('chocolate-1', { displayName: 'Chocolate <img src=x onerror=alert(1)>' }); await complete();
  const event = await NotificationEvent.findOne({ event: 'order_received' }).lean();
  assert.equal(event.snapshot.items.length, 1); assert.equal(event.snapshot.items[0].kind, 'gift_box_v2');
  const snapshot = JSON.stringify(event.snapshot); assert.equal(snapshot.includes(message), false); assert.equal(snapshot.includes('configurationId'), false); assert.equal(snapshot.includes('placements'), false);
  const rendered = renderEmailTemplate(event, { clientOrigin: 'https://shop.example.test' });
  assert.match(rendered.text, /Build Your Gift Box x 1/); assert.match(rendered.text, /Synthetic rose-red x 3/);
  assert.match(rendered.html, /Chocolate &lt;img/); assert.equal(rendered.html.includes('<img src=x'), false); assert.equal(rendered.html.includes(message), false);
  assert.match(rendered.text, /Delivery is separate/);
});

test('personalized payment and order-first proof restrictions also apply to configured gifts', async () => {
  await addGift(); const cod = await review(owner, { paymentMethod: 'cod' });
  await assert.rejects(placeGiftBoxOrderForDisposableTest(owner, cod.input), { code: 'GIFT_BOX_PAYMENT_METHOD_UNAVAILABLE' });
  const { input } = await review(); await assert.rejects(placeGiftBoxOrderForDisposableTest(owner, { ...input, paymentProofId: new mongoose.Types.ObjectId().toString() }), { code: 'ORDER_FIRST_REQUIRED' });
  assert.equal(await Order.countDocuments(), 0); assert.equal((await setting('rose-red')).inventoryQuantity, 20);
});

test('runtime checkout always rejects gift-only and mixed carts even with synthetic approval and global checkout enabled', async () => {
  await addGift();
  for (const mixed of [false, true]) {
    if (mixed) await addCartItem(owner, { productId: String(product._id), quantity: 1 });
    await assert.rejects(prepareCheckout(owner, { checkoutKey: randomUUID(), paymentMethod: 'instapay', governorate: 'cairo' }), { code: 'GIFT_BOX_CHECKOUT_DISABLED' });
    const { input } = await review(); await assert.rejects(placeOrder(owner, input), { code: 'GIFT_BOX_CHECKOUT_DISABLED' });
  }
  assert.equal(await Order.countDocuments(), 0); assert.equal((await setting('rose-red')).inventoryQuantity, 20);
  env.checkoutEnabled = false;
  await assert.rejects(prepareGiftBoxCheckoutForDisposableTest(owner, { checkoutKey: randomUUID(), paymentMethod: 'instapay', governorate: 'cairo' }), { code: 'CHECKOUT_DISABLED' });
});

test('ordinary product-only runtime checkout retains the existing guarded commerce behavior', async () => {
  await addCartItem(owner, { productId: String(product._id), quantity: 1 }); const checkoutKey = randomUUID();
  await prepareCheckout(owner, { checkoutKey, paymentMethod: 'cod', governorate: 'cairo' });
  const order = await placeOrder(owner, { checkoutKey, paymentMethod: 'cod', customer });
  assert.equal(order.totals.totalPiastres, 12000); assert.equal((await Product.findById(product._id)).inventory.quantity, 36);
  assert.equal((await setting('chocolate-1')).inventoryQuantity, 20); assert.equal((await setting('rose-red')).inventoryQuantity, 20);
});

test('gift transaction records a private-free submitted event and qualified Purchase keeps one durable identity', async () => {
  const consent = await trackingConsent(); await addGift(); const { input } = await review();
  const result = await placeGiftBoxOrderForDisposableTest(owner, input, null, { trackingConsentId: consent._id });
  const saved = await Order.findById(result.id).lean(); const submitted = await MetaEvent.findOne({ name: 'OrderSubmitted' }).lean();
  assert.deepEqual(submitted.parameters, { currency: 'EGP', value: 990, payment_method: 'instapay' });
  assert.equal(await MetaEvent.countDocuments({ name: 'Purchase' }), 0);
  // Isolate event qualification from the separately tested payment ledger.
  const paidSnapshot = { ...saved, paymentState: 'paid' };
  const purchase = await recordOrderTracking(paidSnapshot); const repeated = await recordOrderTracking(paidSnapshot);
  assert.equal(purchase.id, repeated.id); assert.equal(await MetaEvent.countDocuments({ name: 'Purchase' }), 1);
  assert.equal(JSON.stringify(purchase.parameters).includes('Private fixture message'), false);
  const recovered = await placeGiftBoxOrderForDisposableTest(owner, input, null, { trackingConsentId: consent._id });
  assert.equal(recovered.id, result.id); assert.equal(await MetaEvent.countDocuments({ name: 'OrderSubmitted' }), 1);
});

test('reviewed early cancellation restores consumed tracked builder inventory once without numeric ribbon or Made-to-Order stock', async () => {
  await adminEdit('rose-red', { inventoryMode: 'made_to_order', inventoryQuantity: null });
  await addGift(); const { order } = await complete();
  await assert.rejects(accounting(order.id, { action: 'cancel', reconciled: false, reason: 'Unreconciled transfer' }));
  await accounting(order.id, { action: 'cancel', reconciled: true, reason: 'Reviewed actual transfers and unprepared cancellation' });
  assert.equal((await setting('chocolate-1')).inventoryQuantity, 20); assert.equal((await setting('box-2')).inventoryQuantity, 20);
  assert.equal((await setting('rose-red')).inventoryQuantity, null); assert.equal((await setting('ribbon-navy')).inventoryQuantity, null);
  const saved = await Order.findById(order.id).lean(); assert.ok(saved.restockedAt); assert.equal(saved.fulfillmentState, 'cancelled');
  await assert.rejects(accounting(order.id, { action: 'cancel', reconciled: true, reason: 'Duplicate restoration' }));
  assert.equal((await setting('chocolate-1')).inventoryQuantity, 20); assert.equal((await Product.findById(product._id)).inventory.quantity, 37);
});

test('prepared personalized gifts require inspection and restore only explicitly resellable component quantities', async () => {
  await addGift(); const { order } = await complete();
  // The accounting test starts from a prepared-order fixture; normal payment
  // and fulfillment transitions remain covered by the commerce regressions.
  await Order.collection.updateOne({ _id: new mongoose.Types.ObjectId(order.id) }, { $set: { fulfillmentState: 'preparing' } });
  await assert.rejects(accounting(order.id, { action: 'cancel', reconciled: true, reason: 'Prepared gift requires physical review' }));
  const saved = await Order.findById(order.id).lean();
  const quantities = saved.inventoryClaims.map(claim => claim.id === 'rose-red' ? 1 : 0);
  await accounting(order.id, { action: 'cancel', reconciled: true, inspected: true, quantities, reason: 'Inspected: only one rose resellable; personalized contents unusable' });
  assert.equal((await setting('rose-red')).inventoryQuantity, 18); assert.equal((await setting('chocolate-1')).inventoryQuantity, 19);
  assert.equal((await setting('box-2')).inventoryQuantity, 19); assert.equal((await setting('ribbon-navy')).inventoryQuantity, null);
});

test('inspected partial return rejects incompatible inventory mode and restores the correct consumed builder units once', async () => {
  await addGift(owner, giftCartConfiguration(), 2); const { order } = await complete();
  await Order.collection.updateOne({ _id: new mongoose.Types.ObjectId(order.id) }, { $set: { fulfillmentState: 'returned' } });
  const saved = await Order.findById(order.id).lean();
  const quantities = saved.inventoryClaims.map(claim => claim.id === 'rose-red' ? 2 : claim.id === 'chocolate-1' ? 1 : 0);
  await assert.rejects(accounting(order.id, { action: 'inventory_return', quantities, inspected: false, reason: 'No inspection' }));
  await adminEdit('chocolate-1', { inventoryMode: 'made_to_order', inventoryQuantity: null });
  await assert.rejects(accounting(order.id, { action: 'inventory_return', quantities, inspected: true, reason: 'Changed source requires explicit review' }), { code: 'RESTOCK_REVIEW_REQUIRED' });
  assert.equal((await setting('rose-red')).inventoryQuantity, 14); assert.equal((await Order.findById(order.id).lean()).restockedAt, null);
  await adminEdit('chocolate-1', { inventoryMode: 'tracked', inventoryQuantity: 18 });
  await accounting(order.id, { action: 'inventory_return', quantities, inspected: true, reason: 'Reviewed source and inspected only two roses and one retail chocolate resellable' });
  assert.equal((await setting('rose-red')).inventoryQuantity, 16); assert.equal((await setting('chocolate-1')).inventoryQuantity, 19);
  await assert.rejects(accounting(order.id, { action: 'inventory_return', quantities, inspected: true, reason: 'Duplicate returned units' }));
  assert.equal((await setting('rose-red')).inventoryQuantity, 16); assert.equal((await setting('chocolate-1')).inventoryQuantity, 19);
});

test('configured InstaPay orders retain order-bound private proof ownership and never become paid merely from proof submission', async () => {
  const storage = createMemoryStorage(); setStorageForTests(storage);
  try {
    await assert.rejects(signUpload(owner, { purpose: 'payment_proof', checkoutKey: randomUUID(), mimeType: 'image/png', sizeBytes: PNG.length }));
    await addGift(); const { order } = await complete();
    await assert.rejects(signUpload(other, { purpose: 'payment_proof', orderId: order.id, mimeType: 'image/png', sizeBytes: PNG.length }));
    const signed = await signUpload(owner, { purpose: 'payment_proof', orderId: order.id, mimeType: 'image/png', sizeBytes: PNG.length });
    const upload = await Upload.findById(signed.upload.id).select('+temporaryKey'); storage.put(upload.temporaryKey, PNG);
    await completeUpload(signed.upload.id, owner);
    const command = { revision: 0, action: 'submit_proof', uploadId: signed.upload.id };
    await assert.rejects(mutateOrderAccounting(order.id, other, command));
    await mutateOrderAccounting(order.id, owner, command);
    const saved = await Order.findById(order.id).lean(); assert.equal(saved.paymentState, 'awaiting_verification'); assert.equal(saved.proofReviewRequired, true);
    assert.equal(String(saved.paymentProofId), signed.upload.id); assert.equal(await MetaEvent.countDocuments({ name: 'Purchase' }), 0);
    assert.equal((await setting('rose-red')).inventoryQuantity, 17); assert.equal((await setting('chocolate-1')).inventoryQuantity, 19);
  } finally { setStorageForTests(); }
});

test('internal checkout capability is owner-bound, unforgeable and rejected outside the exact disposable test target', async () => {
  const capability = await createGiftBoxCheckoutCapabilityForDisposableTest(owner);
  assert.doesNotThrow(() => assertGiftBoxCheckoutCapability(capability, owner));
  assert.throws(() => assertGiftBoxCheckoutCapability({}, owner), { code: 'GIFT_BOX_CHECKOUT_DISABLED' });
  assert.throws(() => assertGiftBoxCheckoutCapability(capability, other), { code: 'GIFT_BOX_CHECKOUT_DISABLED' });
  const previousNodeEnv = env.nodeEnv, previousMongoUri = env.mongoUri;
  try {
    env.nodeEnv = 'production'; await assert.rejects(createGiftBoxCheckoutCapabilityForDisposableTest(owner), { code: 'GIFT_BOX_INTERNAL_CHECKOUT_TEST_ONLY' });
    env.nodeEnv = previousNodeEnv; env.mongoUri = 'mongodb://127.0.0.1/tapandwrap_dev';
    await assert.rejects(createGiftBoxCheckoutCapabilityForDisposableTest(owner), { code: 'GIFT_BOX_INTERNAL_CHECKOUT_TEST_ONLY' });
  } finally { env.nodeEnv = previousNodeEnv; env.mongoUri = previousMongoUri; }
  assert.equal(await Order.countDocuments(), 0); assert.equal((await setting('rose-red')).inventoryQuantity, 20);
});

test('real HTTP checkout rejects gift lines and unknown bypass fields despite synthetic policies and an internal reviewed intent', async () => {
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/v1/commerce`, csrf = makeCsrfToken(env.sessionSecret), cookies = new Map([['tw_csrf', csrf]]);
  async function request(path, body) {
    const response = await fetch(base + path, { method: 'POST', headers: { Origin: env.clientOrigin, 'x-csrf-token': csrf,
      Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    for (const value of response.headers.getSetCookie()) { const [pair] = value.split(';'), separator = pair.indexOf('='); cookies.set(pair.slice(0, separator), pair.slice(separator + 1)); }
    return { status: response.status, body: await response.json() };
  }
  try {
    const added = await request('/cart/items', giftCartInput()); assert.equal(added.status, 201, JSON.stringify(added.body));
    const cart = await Cart.findOne().lean(), { input } = await review(cart.owner);
    const quoteInput = { checkoutKey: input.checkoutKey, governorate: 'cairo', paymentMethod: 'instapay' };
    for (const injected of [{ allowGiftBoxCheckout: true }, { capability: {} }, { fulfillmentPolicy: giftCartPolicy() }]) {
      assert.equal((await request('/checkout/quote', { ...quoteInput, ...injected })).status, 400);
      assert.equal((await request('/orders', { ...input, ...injected })).status, 400);
    }
    for (const path of ['/checkout/quote', '/orders']) {
      const denied = await request(path, path === '/orders' ? input : quoteInput);
      assert.equal(denied.status, 409, JSON.stringify(denied.body)); assert.equal(denied.body.error.code, 'GIFT_BOX_CHECKOUT_DISABLED');
    }
    assert.equal(await Order.countDocuments(), 0); assert.equal((await setting('rose-red')).inventoryQuantity, 20); assert.equal((await setting('chocolate-1')).inventoryQuantity, 20);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
