import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';
import { Cart } from '../src/models/Cart.js';
import { Category } from '../src/models/Category.js';
import { Product } from '../src/models/Product.js';
import { User } from '../src/models/User.js';
import { Session } from '../src/models/Session.js';
import { Order } from '../src/models/Order.js';
import { GiftBoxComponentSetting } from '../src/models/GiftBoxComponentSetting.js';
import { makeCsrfToken, newSessionToken, hashSession } from '../src/utils/tokens.js';
import { addCartItem, cartResponse, quoteCart } from '../src/commerce/cart.js';
import { resetCommerceLimitsForTests } from '../src/commerce/routes.js';
import { evaluatePromotions } from '../src/commerce/promotions.js';
import { fingerprint } from '../src/commerce/pricing.js';
import { setGiftBoxCartPoliciesForDisposableTest, quoteGiftBoxCartLine } from '../src/gift-box/cart-pricing.js';
import { startTestDatabase } from './helpers/database.js';
import { giftCartConfiguration, giftCartInput, giftCartPolicy, seedGiftCartSettings } from './helpers/gift-box-cart-fixtures.js';

const ROOT = '/api/v1/commerce';
let database, server, base, admin, product;
const previous = { backend: env.giftBoxBuilderBackendEnabled, checkout: env.checkoutEnabled };
before(async () => {
  database = await startTestDatabase({ models: Object.values(mongoose.models), transactions: true });
  await GiftBoxComponentSetting.createCollection(); await GiftBoxComponentSetting.createIndexes();
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(async () => {
  resetCommerceLimitsForTests();
  for (const Model of Object.values(mongoose.models)) await Model.deleteMany({});
  env.giftBoxBuilderBackendEnabled = true; env.checkoutEnabled = false;
  admin = await User.create({ name: 'Synthetic cart admin', email: 'gift-cart-admin@example.test', passwordHash: 'fixture', role: 'admin' });
  const category = await Category.create({ name: 'Synthetic cart category', slug: 'synthetic-cart-category', active: true });
  product = await Product.create({ name: 'Synthetic chocolate-1', slug: 'synthetic-cart-product', categoryId: category._id,
    externalCatalogId: 'chocolate-1', sku: 'chocolate-1', mainImageKey: 'fixtures/ordinary.webp', galleryKeys: ['fixtures/ordinary.webp'],
    visibility: 'public', status: 'ready', pricePiastres: 12000, priceApproved: true,
    inventory: { mode: 'tracked', quantity: 37, approved: true, available: true } });
  await seedGiftCartSettings(admin._id);
  setGiftBoxCartPoliciesForDisposableTest([giftCartPolicy()]);
});
after(async () => {
  if (database) setGiftBoxCartPoliciesForDisposableTest([]);
  env.giftBoxBuilderBackendEnabled = previous.backend; env.checkoutEnabled = previous.checkout;
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await database?.stop();
});
function client() {
  const cookies = new Map([['tw_csrf', makeCsrfToken(env.sessionSecret)]]);
  return { cookies, async request(path, { method = 'GET', body, headers = {} } = {}) {
    const response = await fetch(`${base}${ROOT}${path}`, { method, headers: { Origin: env.clientOrigin,
      'x-csrf-token': cookies.get('tw_csrf'), Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    for (const header of response.headers.getSetCookie()) { const [pair] = header.split(';'), separator = pair.indexOf('='); cookies.set(pair.slice(0, separator), pair.slice(separator + 1)); }
    return { status: response.status, body: await response.json(), headers: response.headers };
  } };
}
const cart = response => { assert.equal(response.body.ok, true, JSON.stringify(response.body)); return response.body.data.cart; };
async function add(browser, input = giftCartInput()) {
  const response = await browser.request('/cart/items', { method: 'POST', body: input });
  assert.equal(response.status, 201, JSON.stringify(response.body)); return cart(response);
}
async function account(name) {
  const user = await User.create({ name: `Synthetic ${name}`, email: `${name}@gift-cart.example.test`, passwordHash: 'fixture', role: 'customer' });
  const token = newSessionToken(); await Session.create({ userId: user._id, tokenHash: hashSession(token), expiresAt: new Date(Date.now() + 3600000) });
  const browser = client(); browser.cookies.set('tw_session', token); return { user, token, browser };
}

test('historical product rows remain ordinary products and explicit product adds keep their existing price', async () => {
  const owner = `guest:${'1'.repeat(64)}`;
  await Cart.collection.insertOne({ owner, expiresAt: new Date(Date.now() + 60000), items: [{ id: randomUUID(), identity: 'historical-product', productId: product._id,
    quantity: 2, name: product.name, slug: product.slug, personalization: {}, customization: null }], addOperations: [] });
  const historical = await cartResponse(owner);
  assert.equal(historical.cart.subtotalPiastres, 24000); assert.equal(historical.cart.items[0].valid, true);
  const ordinary = await add(client(), { kind: 'product', productId: String(product._id), quantity: 1 });
  assert.equal(ordinary.subtotalPiastres, 12000); assert.equal(ordinary.items[0].productId, String(product._id));
});

test('unknown kinds and strict gift inputs reject browser prices, identity, policy and cross-kind fields', async () => {
  const browser = client();
  for (const input of [{ kind: 'unknown', productId: String(product._id), quantity: 1 },
    { ...giftCartInput(), pricePiastres: 1 }, { ...giftCartInput(), configurationId: 'forged' },
    { ...giftCartInput(), productId: String(product._id) }, { ...giftCartInput(), fulfillmentPolicy: giftCartPolicy() },
    { ...giftCartInput(), operationKey: undefined }, { ...giftCartInput(), quantity: 100 }]) {
    const result = await browser.request('/cart/items', { method: 'POST', body: input });
    assert.equal(result.status, 400, JSON.stringify(result.body));
  }
  const malformed = giftCartInput(); malformed.configuration.placements.pop();
  assert.equal((await browser.request('/cart/items', { method: 'POST', body: malformed })).status, 400);
  assert.equal((await Cart.findOne().lean())?.items.length ?? 0, 0);
});

test('gift configuration persists canonically without authoritative client prices or fabricated Product identity', async () => {
  const input = giftCartInput(), result = await add(client(), input);
  assert.equal(result.items.length, 1); assert.equal(result.items[0].kind, 'gift_box_v2');
  assert.equal(result.items[0].name, 'Build Your Gift Box'); assert.equal(result.items[0].unitPricePiastres, 99000);
  const stored = (await Cart.findOne().lean()).items[0];
  assert.equal(stored.productId, undefined); assert.equal(stored.kind, 'gift_box_v2');
  assert.match(stored.configurationId, /^gift-box-configuration-v1:[a-f0-9]{64}$/);
  assert.equal(stored.configuration.contractVersion, 'gift-box-commerce-v1');
  assert.equal(stored.configuration.selection.giftCard.message, input.configuration.selection.giftCard.message);
  for (const field of ['unitPricePiastres', 'lineTotalPiastres', 'pricePiastres']) assert.equal(Object.hasOwn(stored, field), false);
});

test('equivalent configurations merge after canonical validation while selections, arrangements and messages stay separate', async () => {
  const browser = client(), config = giftCartConfiguration(); await add(browser, giftCartInput(config));
  const equivalent = giftCartConfiguration(); equivalent.selection.items.reverse(); equivalent.placements.reverse();
  let result = await add(browser, giftCartInput(equivalent));
  assert.equal(result.items.length, 1); assert.equal(result.items[0].quantity, 2);
  result = await add(browser, giftCartInput(giftCartConfiguration({ message: 'Different private card' })));
  result = await add(browser, giftCartInput(giftCartConfiguration({ x: .6 })));
  result = await add(browser, giftCartInput(giftCartConfiguration({ chocolate: false })));
  assert.equal(result.items.length, 4);
});

test('cart operation retries recover one line without repeating quantity and conflict on changed immutable input', async () => {
  const browser = client(), input = giftCartInput(); const first = await add(browser, input), repeated = await add(browser, input);
  assert.equal(first.items[0].id, repeated.items[0].id); assert.equal(repeated.items[0].quantity, 1);
  const changed = { ...input, configuration: giftCartConfiguration({ message: 'Conflicting retry' }) };
  const conflict = await browser.request('/cart/items', { method: 'POST', body: changed });
  assert.equal(conflict.status, 409); assert.equal(conflict.body.error.code, 'CART_OPERATION_CONFLICT');
  assert.equal((await Cart.findOne().lean()).addOperations.length, 1);
});

test('concurrent identical gift add operations recover one persisted quantity', async () => {
  const owner = `guest:${'3'.repeat(64)}`, payload = giftCartInput();
  const results = await Promise.allSettled([addCartItem(owner, payload), addCartItem(owner, payload)]);
  for (const result of results) assert.equal(result.status, 'fulfilled', result.reason?.stack);
  const persisted = await Cart.findOne().lean();
  assert.equal(persisted.items.length, 1); assert.equal(persisted.items[0].quantity, 1); assert.equal(persisted.addOperations.length, 1);
  assert.equal((await cartResponse(owner)).cart.items[0].quantity, 1);
});

test('legacy Product operation receipts recover explicit product-kind retries without adding another unit', async () => {
  const owner = `guest:${'2'.repeat(64)}`, operationKey = randomUUID();
  const legacyInput = { operationKey, productId: String(product._id), quantity: 1 };
  const lineId = randomUUID();
  await Cart.collection.insertOne({ owner, expiresAt: new Date(Date.now() + 60000), items: [{ id: lineId, identity: 'legacy-receipt', productId: product._id,
    quantity: 1, name: product.name, slug: product.slug, personalization: {}, customization: null }],
  addOperations: [{ key: operationKey, requestHash: fingerprint(legacyInput) }] });
  let attempts = 0;
  const recovered = await addCartItem(owner, { ...legacyInput, kind: 'product' }, { onAdded: async () => { attempts += 1; } });
  assert.equal(recovered.cart.items.length, 1); assert.equal(recovered.cart.items[0].id, lineId);
  assert.equal(recovered.cart.items[0].quantity, 1); assert.equal(attempts, 0);
});

test('gift quantity updates multiply all component requirements and preserve one coherent configured line', async () => {
  const browser = client(), first = await add(browser); const id = first.items[0].id;
  const updated = cart(await browser.request(`/cart/items/${id}`, { method: 'PATCH', body: { quantity: 2 } }));
  assert.equal(updated.items.length, 1); assert.equal(updated.items[0].quantity, 2); assert.equal(updated.subtotalPiastres, 198000);
  await GiftBoxComponentSetting.updateOne({ componentId: 'gift-card-1' }, { $set: { inventoryQuantity: 2 } });
  const rejected = await browser.request(`/cart/items/${id}`, { method: 'PATCH', body: { quantity: 3 } });
  assert.equal(rejected.status, 409); assert.equal((await Cart.findOne().lean()).items[0].quantity, 2);
});

test('aggregate demand across different gift arrangements prevents overcommitting one builder stock pool', async () => {
  await GiftBoxComponentSetting.updateOne({ componentId: 'rose-red' }, { $set: { inventoryQuantity: 5 } });
  const browser = client(); await add(browser);
  const rejected = await browser.request('/cart/items', { method: 'POST', body: giftCartInput(giftCartConfiguration({ message: 'Second configuration' })) });
  assert.equal(rejected.status, 409); assert.equal(rejected.body.error.code, 'GIFT_BOX_STOCK_EXCEEDED');
  assert.equal((await Cart.findOne().lean()).items.length, 1);
  assert.equal((await GiftBoxComponentSetting.findOne({ componentId: 'rose-red' }).lean()).inventoryQuantity, 5);
});

test('a reduced shared stock pool invalidates every affected gift line while ordinary products remain priced', async () => {
  const browser = client();
  await add(browser, { productId: String(product._id), quantity: 1 });
  await add(browser); await add(browser, giftCartInput(giftCartConfiguration({ message: 'Another configured box' })));
  await GiftBoxComponentSetting.updateOne({ componentId: 'rose-red' }, { $set: { inventoryQuantity: 5 } });
  const result = cart(await browser.request('/cart'));
  const gifts = result.items.filter(item => item.kind === 'gift_box_v2');
  assert.equal(gifts.length, 2);
  for (const gift of gifts) {
    assert.equal(gift.valid, false); assert.equal(gift.unitPricePiastres, null); assert.equal(gift.lineTotalPiastres, null);
    assert.equal(gift.errorCode, 'GIFT_BOX_STOCK_EXCEEDED');
  }
  assert.equal(result.items.find(item => item.productId).valid, true);
  assert.equal(result.subtotalPiastres, 12000);
  assert.equal((await GiftBoxComponentSetting.findOne({ componentId: 'rose-red' }).lean()).inventoryQuantity, 5);
});

test('ordinary and builder chocolate inventories stay independent and cart preparation never consumes either', async () => {
  const ordinaryBefore = await Product.findById(product._id).lean(), builderBefore = await GiftBoxComponentSetting.find().sort('componentId').lean();
  const browser = client(); await add(browser, { productId: String(product._id), quantity: 2 }); await add(browser);
  assert.deepEqual(await Product.findById(product._id).lean(), ordinaryBefore);
  assert.deepEqual(await GiftBoxComponentSetting.find().sort('componentId').lean(), builderBefore);
  await Product.updateOne({ _id: product._id }, { $set: { 'inventory.quantity': 0 } });
  let result = cart(await browser.request('/cart'));
  assert.equal(result.items.find(item => item.kind === 'gift_box_v2').valid, true);
  assert.equal(result.items.find(item => item.productId).valid, false);
  await Product.updateOne({ _id: product._id }, { $set: { 'inventory.quantity': 37 } });
  await GiftBoxComponentSetting.updateOne({ componentId: 'chocolate-1' }, { $set: { inventoryQuantity: 0 } });
  result = cart(await browser.request('/cart'));
  assert.equal(result.items.find(item => item.productId).valid, true);
  assert.equal(result.items.find(item => item.kind === 'gift_box_v2').valid, false);
});

test('Made to Order has no numeric limit and ribbon status-only availability still fails closed', async () => {
  await GiftBoxComponentSetting.updateMany({ componentId: { $ne: 'ribbon-navy' } }, { $set: { inventoryMode: 'made_to_order', inventoryQuantity: 0 } });
  const browser = client(), result = await add(browser, giftCartInput(giftCartConfiguration(), 99));
  assert.equal(result.items[0].quantity, 99); assert.equal(result.subtotalPiastres, 9801000);
  await GiftBoxComponentSetting.updateOne({ componentId: 'ribbon-navy' }, { $set: { available: false } });
  const invalid = cart(await browser.request('/cart')).items[0];
  assert.equal(invalid.valid, false); assert.equal(invalid.unitPricePiastres, null);
});

test('real runtime policy registry remains unapproved and cannot be overridden by browser approval data', async () => {
  setGiftBoxCartPoliciesForDisposableTest([]);
  const browser = client(), result = await browser.request('/cart/items', { method: 'POST', body: giftCartInput() });
  assert.equal(result.status, 409); assert.equal(result.body.error.code, 'GIFT_BOX_FULFILLMENT_UNAPPROVED');
  assert.equal(await Cart.countDocuments(), 0);
});

test('synthetic policies recheck environment and target on every lookup and cannot become a runtime bypass', async () => {
  const savedSettings = await GiftBoxComponentSetting.find().lean();
  const context = { savedSettings, settings: new Map(savedSettings.map(setting => [setting.componentId, setting])) };
  for (const [configuration, key, value] of [[env, 'nodeEnv', 'development'], [env, 'databaseTarget', 'staging'],
    [env, 'mongoUri', 'synthetic-inherited-uri-never-connected'], [process.env, 'MONGODB_URI', 'synthetic-inherited-uri-never-connected'],
    [process.env, 'CATALOG_IMPORT_STAGING_URI', 'synthetic-inherited-uri-never-connected']]) {
    const previous = configuration[key];
    try {
      configuration[key] = value;
      assert.throws(() => setGiftBoxCartPoliciesForDisposableTest([giftCartPolicy()]), { code: 'GIFT_BOX_TEST_POLICIES_ONLY' });
      assert.throws(() => quoteGiftBoxCartLine(giftCartInput(), context, { stored: false }), { code: 'GIFT_BOX_TEST_POLICIES_ONLY' });
    } finally { if (previous === undefined) delete configuration[key]; else configuration[key] = previous; }
  }
  assert.equal(quoteGiftBoxCartLine(giftCartInput(), context, { stored: false }).valid, true);
  assert.equal(await Cart.countDocuments(), 0);
});

test('mixed cart requotes current saved prices once and invalid settings produce removable honest unavailable lines', async () => {
  const browser = client(); await add(browser, { productId: String(product._id), quantity: 2 }); await add(browser);
  assert.equal(cart(await browser.request('/cart')).subtotalPiastres, 123000);
  await GiftBoxComponentSetting.updateOne({ componentId: 'rose-red' }, { $set: { pricePiastres: 4000 }, $inc: { __v: 1 } });
  let result = cart(await browser.request('/cart'));
  assert.equal(result.subtotalPiastres, 126000); assert.equal(result.items.find(item => item.kind === 'gift_box_v2').unitPricePiastres, 102000);
  await GiftBoxComponentSetting.updateOne({ componentId: 'chocolate-1' }, { $set: { enabled: false } });
  result = cart(await browser.request('/cart')); const gift = result.items.find(item => item.kind === 'gift_box_v2');
  assert.equal(gift.valid, false); assert.equal(gift.lineTotalPiastres, null); assert.equal(result.subtotalPiastres, 24000);
  assert.equal(cart(await browser.request(`/cart/items/${gift.id}`, { method: 'DELETE' })).items.length, 1);
  assert.equal(cart(await browser.request('/cart', { method: 'DELETE' })).items.length, 0);
});

test('gift value is excluded from discount thresholds, eligibility and percentage allocations', async () => {
  const browser = client(); await add(browser, { productId: String(product._id), quantity: 1 }); await add(browser);
  const quoted = await quoteCart((await Cart.findOne().lean()).owner);
  const discount = { _id: new mongoose.Types.ObjectId(), name: 'Synthetic ten percent', code: 'TEST', active: true, kind: 'percentage', value: 1000,
    minimumSubtotalPiastres: 0, productIds: [], categoryIds: [], stackWithBundles: true };
  const result = evaluatePromotions(quoted.items, [], discount);
  assert.equal(result.subtotalPiastres, 111000); assert.equal(result.discountPiastres, 1200); assert.equal(result.totalPiastres, 109800);
  assert.throws(() => evaluatePromotions(quoted.items, [], { ...discount, minimumSubtotalPiastres: 20000 }), { code: 'DISCOUNT_MINIMUM' });
  assert.throws(() => evaluatePromotions(quoted.items.filter(item => item.kind === 'gift_box_v2'), [], discount), { code: 'DISCOUNT_INELIGIBLE' });
});

test('verified guest merge keeps different configurations and private messages scoped to the receiving account', async () => {
  const guest = client(), alice = await account('alice'), bob = await account('bob');
  const guestInput = giftCartInput(giftCartConfiguration({ message: 'Guest private message' }));
  await add(guest, guestInput);
  await add(alice.browser, giftCartInput(giftCartConfiguration({ message: 'Account private message' })));
  guest.cookies.set('tw_session', alice.token);
  const merged = await guest.request('/cart/merge', { method: 'POST', body: {} });
  assert.equal(merged.status, 200); assert.equal(cart(merged).items.length, 2);
  assert.equal(cart(await guest.request('/cart')).items.length, 2);
  assert.equal(cart(await bob.browser.request('/cart')).items.length, 0);
  assert.equal(JSON.stringify((await bob.browser.request('/cart')).body).includes('Guest private message'), false);
  assert.equal(cart(await guest.request('/cart/merge', { method: 'POST', body: {} })).items.length, 2);
  const recovered = await add(guest, guestInput);
  assert.equal(recovered.items.length, 2);
  assert.ok(recovered.items.every(item => item.quantity === 1));
});

test('guest merge combines identical configurations only if resulting aggregate tracked demand is valid', async () => {
  const guest = client(), alice = await account('merge-target');
  await add(guest); await add(alice.browser); guest.cookies.set('tw_session', alice.token);
  const merged = await guest.request('/cart/merge', { method: 'POST', body: {} });
  assert.equal(cart(merged).items.length, 1); assert.equal(cart(merged).items[0].quantity, 2);
  const nextGuest = client(); await add(nextGuest, giftCartInput(giftCartConfiguration({ message: 'Cannot fit aggregate stock' })));
  await GiftBoxComponentSetting.updateOne({ componentId: 'rose-red' }, { $set: { inventoryQuantity: 6 } });
  nextGuest.cookies.set('tw_session', alice.token);
  const rejected = await nextGuest.request('/cart/merge', { method: 'POST', body: {} });
  assert.equal(rejected.status, 200); assert.equal(rejected.body.data.skipped, 1);
  assert.equal(cart(rejected).items.length, 1); assert.equal(cart(rejected).items[0].quantity, 2);
});

test('guest merge rejects overlapping operation keys without changing either cart, even for identical payloads', async () => {
  for (const differentPayload of [false, true]) {
    const guest = client(), alice = await account(`overlap-${differentPayload}`), sharedKey = randomUUID();
    const guestInput = giftCartInput(giftCartConfiguration(), 1, sharedKey);
    const accountInput = differentPayload ? giftCartInput(giftCartConfiguration({ message: 'Different retry body' }), 1, sharedKey) : structuredClone(guestInput);
    await add(guest, guestInput); await add(alice.browser, accountInput);
    const before = await Cart.find().sort('owner').lean();
    guest.cookies.set('tw_session', alice.token);
    const rejected = await guest.request('/cart/merge', { method: 'POST', body: {} });
    assert.equal(rejected.status, 409); assert.equal(rejected.body.error.code, 'CART_OPERATION_CONFLICT');
    assert.deepEqual(await Cart.find().sort('owner').lean(), before);
  }
});

test('post-commit tracking callback failure returns persisted success and operation retry never adds twice', async () => {
  const owner = `guest:${'9'.repeat(64)}`, input = giftCartInput(); let attempts = 0;
  const result = await addCartItem(owner, input, { onAdded: async () => { attempts += 1; throw new Error('Synthetic optional tracking outage'); } });
  assert.equal(result.cart.items.length, 1); assert.equal(result.cart.items[0].quantity, 1);
  const recovered = await addCartItem(owner, input, { onAdded: async () => { attempts += 1; throw new Error('Should never repeat'); } });
  assert.equal(recovered.cart.items[0].quantity, 1); assert.equal(attempts, 1);
  assert.equal((await Cart.findOne({ owner }).lean()).items.length, 1);
});

test('stale or malformed saved gift configurations are reported unavailable without exposing another owner', async () => {
  const browser = client(), result = await add(browser), id = result.items[0].id;
  await Cart.collection.updateOne({}, { $set: { 'items.0.configuration.geometryVersion': 'withdrawn-version' } });
  const invalid = cart(await browser.request('/cart')).items[0];
  assert.equal(invalid.id, id); assert.equal(invalid.valid, false); assert.equal(invalid.unitPricePiastres, null);
  assert.equal(cart(await client().request('/cart')).items.length, 0);
  assert.equal(cart(await browser.request(`/cart/items/${id}`, { method: 'DELETE' })).items.length, 0);
});

test('missing saved line IDs and forged configuration identities fail closed while clear remains available', async () => {
  for (const corruption of ['missing-id', 'forged-identity', 'invalid-id']) {
    const browser = client(), result = await add(browser), id = result.items[0].id;
    const update = corruption === 'missing-id' ? { $unset: { 'items.0.id': '' } }
      : { $set: corruption === 'forged-identity' ? { 'items.0.configurationId': `gift-box-configuration-v1:${'0'.repeat(64)}` } : { 'items.0.id': 'not-a-uuid' } };
    await Cart.collection.updateOne({ 'items.id': id }, update);
    const invalid = cart(await browser.request('/cart')).items[0];
    assert.equal(invalid.valid, false); assert.equal(invalid.errorCode, 'GIFT_BOX_CONFIGURATION_STALE');
    assert.equal(invalid.unitPricePiastres, null); assert.equal(invalid.lineTotalPiastres, null);
    assert.equal(cart(await browser.request('/cart', { method: 'DELETE' })).items.length, 0);
  }
});

test('mixed cart is never allowed into checkout even when ordinary checkout is enabled', async () => {
  env.checkoutEnabled = true;
  const browser = client(); await add(browser, { productId: String(product._id), quantity: 1 }); await add(browser);
  const response = await browser.request('/cart'); assert.equal(response.body.data.checkoutEnabled, false);
  const denied = await browser.request('/checkout/quote', { method: 'POST', body: { checkoutKey: randomUUID(), paymentMethod: 'instapay', governorate: 'cairo' } });
  assert.equal(denied.status, 409); assert.equal(denied.body.error.code, 'GIFT_BOX_CHECKOUT_DISABLED');
  assert.equal(await Order.countDocuments(), 0);
  assert.equal((await Product.findById(product._id).lean()).inventory.quantity, 37);
  assert.equal((await GiftBoxComponentSetting.findOne({ componentId: 'rose-red' }).lean()).inventoryQuantity, 20);
});
