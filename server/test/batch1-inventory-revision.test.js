import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';
import { Product } from '../src/models/Product.js';
import { ComponentOption } from '../src/models/ComponentOption.js';
import { Category } from '../src/models/Category.js';
import { User } from '../src/models/User.js';
import { Session } from '../src/models/Session.js';
import { Order } from '../src/models/Order.js';
import { DiscountRedemption } from '../src/models/DiscountRedemption.js';
import CustomizationTemplate from '../src/models/CustomizationTemplate.js';
import DiscountCode from '../src/models/DiscountCode.js';
import { makeCsrfToken, newSessionToken, hashSession } from '../src/utils/tokens.js';
import { startTestDatabase } from './helpers/database.js';
import { resetCommerceLimitsForTests } from '../src/commerce/routes.js';

let database, server, base, main, admin, customer;
const originalCheckout = env.checkoutEnabled;
const customerDetails = { name: 'Synthetic inventory customer', email: 'customer@inventory.example.test', phone: '01012345678', governorate: 'cairo', address: '10 Synthetic Inventory Street' };
before(async () => {
  database = await startTestDatabase({ models: Object.values(mongoose.models), transactions: true });
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});
after(async () => {
  env.checkoutEnabled = originalCheckout;
  if (server) await new Promise(resolve => server.close(resolve));
  await database?.stop();
});
beforeEach(async () => {
  resetCommerceLimitsForTests();
  for (const Model of Object.values(mongoose.models)) await Model.deleteMany({});
  // This isolated process and freshly generated loopback database are the only
  // checkout fixtures. No environment or application launch flag is changed.
  env.checkoutEnabled = true;
  main = await Category.create({ name: 'Synthetic inventory category', slug: 'synthetic-inventory-category', active: true });
  admin = await account('admin'); customer = await account('customer');
});
async function account(role) {
  const user = await User.create({ name: `Synthetic ${role}`, email: `${role}@inventory.example.test`, passwordHash: 'isolated-test-password-hash', role, active: true });
  const token = newSessionToken(), csrf = makeCsrfToken(env.sessionSecret);
  await Session.create({ userId: user._id, tokenHash: hashSession(token), expiresAt: new Date(Date.now() + 3600000) });
  return { Cookie: `tw_session=${token}; tw_csrf=${csrf}`, Origin: env.clientOrigin, 'x-csrf-token': csrf };
}
async function request(path, { method = 'GET', body, headers = admin } = {}) {
  const response = await fetch(`${base}${path}`, { method, headers: { ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const payload = await response.json();
  return { status: response.status, data: payload.data, error: payload.error };
}
function success(response, expected = 200) { assert.equal(response.status, expected, JSON.stringify(response.error)); return response.data; }
function conflict(response) { assert.equal(response.status, 409, JSON.stringify(response)); assert.equal(response.error.code, 'EDIT_CONFLICT'); }
function inventory(mode = 'tracked', quantity = 10) { return { mode, quantity: mode === 'tracked' ? quantity : null, approved: true, available: true }; }
async function makeProduct(overrides = {}) {
  const slug = `synthetic-inventory-${randomUUID()}`;
  return Product.create({ name: 'Synthetic approved inventory product', slug, description: 'Disposable inventory fixture.', categoryId: main._id,
    mainImageKey: `fixtures/${slug}.webp`, galleryKeys: [`fixtures/${slug}.webp`], pricePiastres: 10000, priceApproved: true,
    inventory: inventory(), status: 'ready', ...overrides });
}
async function checkout(product, { quantity = 2, variantKey, customization, discountCode } = {}) {
  success(await request('/commerce/cart/items', { method: 'POST', headers: customer, body: { productId: String(product._id), quantity,
    ...(variantKey ? { variantKey } : {}), ...(customization ? { customization } : {}) } }), 201);
  const checkoutKey = randomUUID();
  success(await request('/commerce/checkout/quote', { method: 'POST', headers: customer, body: { checkoutKey, paymentMethod: 'cod', governorate: 'cairo', ...(discountCode ? { discountCode } : {}) } }));
  const body = { checkoutKey, paymentMethod: 'cod', customer: customerDetails, ...(discountCode ? { discountCode } : {}) };
  return { body, submit: () => request('/commerce/orders', { method: 'POST', headers: customer, body }) };
}
function barrier() {
  let enter, release;
  return { entered: new Promise(resolve => { enter = resolve; }), wait: new Promise(resolve => { release = resolve; }), enter, release };
}

for (const [kind, mode] of [['product', 'tracked'], ['variant', 'tracked'], ['component', 'tracked'], ['product', 'made_to_order'], ['variant', 'made_to_order'], ['component', 'made_to_order']]) {
  test(`${kind} ${mode} checkout invalidates old admin inventory forms; retries and restoration remain safe`, async () => {
    let component, template;
    if (kind === 'component') {
      component = await ComponentOption.create({ name: 'Synthetic approved component', slug: 'synthetic-approved-component', catalogRole: 'Customization Option', categoryId: main._id,
        mainImageKey: 'fixtures/component.webp', galleryKeys: ['fixtures/component.webp'], pricePiastres: 200, priceApproved: true, inventory: inventory(mode),
        enabledForCustomization: true, configurationApproved: true, reviewRequired: false });
      template = await CustomizationTemplate.create({ key: 'inventory-fixture', name: 'Synthetic inventory template', kind: 'generic', status: 'approved', active: true,
        groups: [{ key: 'extras', label: 'Synthetic extras', minChoices: 1, maxChoices: 1, options: [{ key: 'component', label: 'Synthetic component', componentId: component._id }] }] });
    }
    const product = await makeProduct({
      ...(kind === 'product' ? { inventory: inventory(mode) } : {}),
      ...(kind === 'variant' ? { variants: [{ key: 'red', attributes: [{ name: 'Color', value: 'Red' }], inventory: inventory(mode, 6) }] } : {}),
      ...(template ? { customization: { enabled: true, templateId: template._id, serviceKind: 'generic' } } : {}),
    });
    const path = kind === 'component' ? `/admin/commerce/components/${component._id}` : `/admin/products/${product._id}`;
    const key = kind === 'component' ? 'component' : 'product';
    const loaded = success(await request(path))[key];
    const intent = await checkout(product, { ...(kind === 'variant' ? { variantKey: 'red' } : {}), ...(template ? { customization: {
      templateId: String(template._id), version: 1, selections: [{ groupKey: 'extras', optionKey: 'component', quantity: 1 }], fields: {},
    } } : {}) });
    const order = success(await intent.submit(), 201).order;
    const consumed = success(await request(path))[key];
    assert.equal(consumed.revision, loaded.revision + 1);
    const Model = kind === 'component' ? ComponentOption : Product;
    const id = component?._id || product._id;
    assert.equal((await Model.findById(id)).commerceRevision, 1);
    const stock = value => kind === 'variant' ? value.variants[0].inventory.quantity : value.inventory.quantity;
    assert.equal(stock(consumed), mode === 'made_to_order' ? null : kind === 'variant' ? 4 : 8);
    const oldPatch = kind === 'variant' ? { variants: loaded.variants } : { inventory: loaded.inventory };
    conflict(await request(path, { method: 'PATCH', body: { expectedRevision: loaded.revision, ...oldPatch } }));
    assert.equal(stock(success(await request(path))[key]), stock(consumed));
    // A product configuration form is subject to the same record revision.
    if (kind !== 'component') conflict(await request(`/admin/commerce/products/${product._id}/configuration`, { method: 'PATCH', body: { expectedRevision: loaded.revision, personalization: { fields: [] } } }));
    assert.equal(success(await intent.submit(), 201).order.id, order.id);
    assert.equal((await Model.findById(id)).__v, consumed.revision, 'Duplicate submission does not consume or advance inventory again.');
    assert.equal(await Order.countDocuments(), 1);
    const cancelled = success(await request(`/commerce/orders/${order.id}/cancel`, { method: 'POST', headers: customer, body: { revision: order.revision, reason: 'Synthetic cancellation' } })).order;
    const restored = success(await request(path))[key];
    assert.equal(stock(restored), mode === 'made_to_order' ? null : kind === 'variant' ? 6 : 10);
    assert.equal(restored.revision, consumed.revision + (mode === 'tracked' ? 1 : 0));
    if (mode === 'tracked') {
      const staleRestoration = kind === 'variant' ? { variants: consumed.variants } : { inventory: consumed.inventory };
      conflict(await request(path, { method: 'PATCH', body: { expectedRevision: consumed.revision, ...staleRestoration } }));
    }
    success(await request(`/commerce/orders/${order.id}/cancel`, { method: 'POST', headers: customer, body: { revision: cancelled.revision, reason: 'Synthetic repeated cancellation' } }));
    assert.equal((await Model.findById(id)).__v, restored.revision, 'Cancellation retry does not restock or advance revisions again.');
    const edited = success(await request(path, { method: 'PATCH', body: { expectedRevision: restored.revision, name: 'Fresh authorized admin edit' } }))[key];
    assert.equal(edited.revision, restored.revision + 1);
    assert.equal(stock(edited), stock(restored));
  });
}

test('discount redemption invalidates stale admin forms without exposing editable counters or duplicating retry claims', async () => {
  const product = await makeProduct();
  const discount = await DiscountCode.create({ code: 'INVENTORY', name: 'Synthetic discount', kind: 'fixed', value: 100, active: true, usageLimit: 1 });
  const path = `/admin/commerce/discounts/${discount._id}`;
  const loaded = success(await request(path)).discount;
  const intent = await checkout(product, { discountCode: discount.code });
  const order = success(await intent.submit(), 201).order;
  const used = success(await request(path)).discount;
  assert.equal(used.usedCount, 1); assert.equal(used.revision, loaded.revision + 1);
  conflict(await request(path, { method: 'PATCH', body: { expectedRevision: loaded.revision, usageLimit: 2 } }));
  assert.equal((await request(path, { method: 'PATCH', body: { expectedRevision: used.revision, usedCount: 0 } })).status, 400);
  assert.equal(success(await intent.submit(), 201).order.id, order.id);
  assert.equal((await DiscountCode.findById(discount._id)).usedCount, 1);
  assert.equal((await DiscountCode.findById(discount._id)).__v, used.revision);
  assert.equal(await DiscountRedemption.countDocuments(), 1);
  success(await request('/commerce/cart/items', { method: 'POST', headers: customer, body: { productId: String(product._id), quantity: 1 } }), 201);
  assert.equal((await request('/commerce/checkout/quote', { method: 'POST', headers: customer, body: { checkoutKey: randomUUID(), paymentMethod: 'cod', governorate: 'cairo', discountCode: discount.code } })).status, 409);
  const edited = success(await request(path, { method: 'PATCH', body: { expectedRevision: used.revision, usageLimit: 2 } })).discount;
  assert.equal(edited.usedCount, 1); assert.equal(edited.revision, used.revision + 1);
});

for (const winner of ['checkout', 'admin']) {
  test(`concurrent inventory editing preserves both stock and revisions when ${winner} wins the write fence`, async () => {
    const product = await makeProduct(), intent = await checkout(product);
    const gate = barrier(), original = Product.updateOne;
    let paused = false;
    Product.updateOne = async function (filter, update, options) {
      if (!paused && options?.session && update.$inc?.commerceRevision && update.$inc?.['inventory.quantity'] < 0) {
        paused = true;
        if (winner === 'checkout') { const result = await original.call(this, filter, update, options); gate.enter(); await gate.wait; return result; }
        gate.enter(); await gate.wait;
      }
      return original.call(this, filter, update, options);
    };
    try {
      const submitting = intent.submit(); await gate.entered;
      const editing = request(`/admin/products/${product._id}`, { method: 'PATCH', body: { expectedRevision: 0, inventory: inventory('tracked', 20) } });
      if (winner === 'admin') success(await editing);
      gate.release();
      success(await submitting, 201);
      if (winner === 'checkout') conflict(await editing);
      const current = await Product.findById(product._id);
      assert.equal(current.inventory.quantity, winner === 'checkout' ? 8 : 18);
      assert.equal(current.__v, winner === 'checkout' ? 1 : 2);
      assert.equal(current.commerceRevision, 1);
      assert.equal(await Order.countDocuments(), 1);
    } finally { gate.release(); Product.updateOne = original; }
  });
}

for (const winner of ['checkout', 'admin']) {
  test(`concurrent discount editing and order creation remain atomic when ${winner} wins`, async () => {
    const product = await makeProduct();
    const discount = await DiscountCode.create({ code: 'CONCURRENT', name: 'Synthetic concurrent discount', kind: 'fixed', value: 100, active: true, usageLimit: 2 });
    const intent = await checkout(product, { discountCode: discount.code });
    const gate = barrier(), original = DiscountCode.findOneAndUpdate;
    let paused = false;
    DiscountCode.findOneAndUpdate = function (filter, update, options) {
      const query = original.call(this, filter, update, options);
      const execute = query.exec;
      // Preserve the real Query contract: pricing chains lean/maxTimeMS before
      // execution. Only the isolated execution boundary is paused.
      query.exec = async function (...args) {
        if (!paused && options?.session && update.$inc?.usedCount) {
          paused = true;
          if (winner === 'checkout') { const result = await execute.apply(this, args); gate.enter(); await gate.wait; return result; }
          gate.enter(); await gate.wait;
        }
        return execute.apply(this, args);
      };
      return query;
    };
    try {
      const submitting = intent.submit(); await gate.entered;
      const editing = request(`/admin/commerce/discounts/${discount._id}`, { method: 'PATCH', body: { expectedRevision: 0, active: false } });
      if (winner === 'admin') success(await editing);
      gate.release();
      const placed = await submitting;
      if (winner === 'checkout') { success(placed, 201); conflict(await editing); }
      else { assert.equal(placed.status, 409); assert.equal(placed.error.code, 'DISCOUNT_UNAVAILABLE'); }
      const current = await DiscountCode.findById(discount._id);
      assert.equal(current.usedCount, winner === 'checkout' ? 1 : 0);
      assert.equal(current.__v, 1);
      assert.equal(current.active, winner === 'checkout');
      assert.equal((await Product.findById(product._id)).inventory.quantity, winner === 'checkout' ? 8 : 10);
      assert.equal((await Product.findById(product._id)).__v, winner === 'checkout' ? 1 : 0, 'Failed checkout rolls back the stock and admin revision together.');
      assert.equal(await Order.countDocuments(), winner === 'checkout' ? 1 : 0);
      assert.equal(await DiscountRedemption.countDocuments(), winner === 'checkout' ? 1 : 0);
    } finally { gate.release(); DiscountCode.findOneAndUpdate = original; }
  });
}
