import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { once } from 'node:events';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';
import { Product } from '../src/models/Product.js';
import { Category } from '../src/models/Category.js';
import { User } from '../src/models/User.js';
import { Session } from '../src/models/Session.js';
import { newSessionToken, hashSession, makeCsrfToken } from '../src/utils/tokens.js';
import { startTestDatabase } from './helpers/database.js';

describe('catalog API with an isolated MongoDB database', { concurrency: false }, () => {
  let database;
  let server;
  let baseUrl;
  let main;
  let child;
  let adminHeaders;
  let customerHeaders;

  async function sessionHeaders(role) {
    const user = await User.create({ name: `${role} fixture`, email: `${role}@example.test`, passwordHash: 'isolated-test-password-hash', role, active: true });
    const token = newSessionToken();
    await Session.create({ userId: user._id, tokenHash: hashSession(token), expiresAt: new Date(Date.now() + 3600000) });
    const csrf = makeCsrfToken(env.sessionSecret);
    return { Cookie: `tw_session=${token}; tw_csrf=${csrf}`, Origin: env.clientOrigin, 'x-csrf-token': csrf };
  }

  async function request(path, { method = 'GET', headers = {}, body } = {}) {
    const response = await fetch(`${baseUrl}/api/v1${path}`, {
      method,
      headers: { ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = await response.json();
    if (response.ok) {
      assert.equal(payload.ok, true, 'Catalog success responses use the existing API envelope');
      assert.ok(payload.data && typeof payload.data === 'object');
    }
    return { status: response.status, body: payload.data ?? payload };
  }

  function productInput(slugValue, overrides = {}) {
    return {
      name: `Catalog ${slugValue}`, slug: slugValue, description: 'Product fixture',
      categoryId: main._id, subcategoryId: child._id,
      mainImageKey: `products/${slugValue}.webp`, galleryKeys: [`products/${slugValue}.webp`, `products/${slugValue}-detail.webp`],
      pricePiastres: 12000, priceApproved: false,
      inventory: { mode: 'tracked', quantity: 10, approved: false, available: true },
      status: 'draft',
      ...overrides,
    };
  }

  function readyInput(slugValue, overrides = {}) {
    return productInput(slugValue, {
      status: 'ready', priceApproved: true,
      inventory: { mode: 'tracked', quantity: 10, approved: true, available: true },
      ...overrides,
    });
  }

  before(async () => {
    database = await startTestDatabase({ models: [User, Session] });
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (database) await database.stop();
  });

  beforeEach(async () => {
    await Promise.all([Product.deleteMany({}), Category.deleteMany({}), User.deleteMany({}), Session.deleteMany({})]);
    main = await Category.create({ name: 'Main fixture', slug: 'main-fixture', order: 1 });
    child = await Category.create({ name: 'Child fixture', slug: 'child-fixture', parentId: main._id, order: 2 });
    adminHeaders = await sessionHeaders('admin');
    customerHeaders = await sessionHeaders('customer');
  });

  it('requires genuine admin sessions for every admin catalog route', async () => {
    const product = await Product.create(productInput('auth-fixture'));
    const routes = [
      ['/admin/products', 'GET'], ['/admin/products', 'POST'],
      [`/admin/products/${product._id}`, 'GET'], [`/admin/products/${product._id}`, 'PATCH'],
      [`/admin/products/${product._id}/inventory`, 'PATCH'], [`/admin/products/${product._id}/publication`, 'PATCH'],
      ['/admin/categories', 'GET'], ['/admin/categories', 'POST'], [`/admin/categories/${main._id}`, 'PATCH'],
    ];
    for (const [path, method] of routes) {
      const anonymous = await request(path, { method, body: method === 'GET' ? undefined : {} });
      assert.equal(anonymous.status, 401, `${method} ${path} rejects anonymous requests`);
      const customer = await request(path, { method, headers: customerHeaders, body: method === 'GET' ? undefined : {} });
      assert.equal(customer.status, 403, `${method} ${path} rejects customers`);
    }
    assert.equal((await request('/admin/products', { headers: adminHeaders })).status, 200);
  });

  it('requires the existing signed CSRF token and origin for mutations', async () => {
    const noToken = { ...adminHeaders };
    delete noToken['x-csrf-token'];
    assert.equal((await request('/admin/products', { method: 'POST', headers: noToken, body: productInput('csrf-fixture') })).status, 403);
    assert.equal((await request('/admin/products', { method: 'POST', headers: { ...adminHeaders, Origin: 'https://invalid.example.test' }, body: productInput('csrf-fixture') })).status, 403);
    assert.equal(await Product.countDocuments(), 0);
    const valid = await request('/admin/products', { method: 'POST', headers: adminHeaders, body: productInput('csrf-fixture') });
    assert.equal(valid.status, 201);
  });

  it('caps product pages at twenty and keeps list projections lightweight', async () => {
    await Product.create(Array.from({ length: 25 }, (_, index) => readyInput(`page-${String(index).padStart(2, '0')}`, { pricePiastres: 10000 + index })));
    await Product.create(productInput('draft-page-fixture'));
    const first = await request('/public/products?limit=500&sort=price_asc');
    assert.equal(first.status, 200);
    assert.equal(first.body.products.length, 20);
    assert.equal(first.body.pagination.limit, 20);
    assert.equal(first.body.pagination.total, 25);
    assert.equal(first.body.products[0].pricePiastres, 10000);
    for (const product of first.body.products) {
      assert.equal('galleryKeys' in product, false);
      assert.equal('customization' in product, false);
      assert.equal('personalization' in product, false);
      assert.equal('description' in product, false);
      assert.equal('catalogSource' in product, false);
    }
    const second = await request('/public/categories/main-fixture/products?page=2&sort=price_asc');
    assert.equal(second.status, 200);
    assert.equal(second.body.products.length, 5);
    assert.equal(second.body.pagination.total, 25);
    const admin = await request('/admin/products?limit=300', { headers: adminHeaders });
    assert.equal(admin.body.products.length, 20);
    assert.equal(admin.body.pagination.total, 26);
    assert.equal((await request('/public/products?page=201')).status, 400);
    assert.equal((await request('/public/products?limit=-1')).status, 400);
    assert.equal((await request('/public/products?sort=unknown')).status, 400);
    assert.equal((await request('/public/products?q%5B%24ne%5D=x')).status, 400);
  });

  it('hides unapproved and unpublished items while showing approved sold-out products', async () => {
    const ready = await Product.create(readyInput('visible-fixture'));
    await Product.create(productInput('draft-fixture'));
    await Product.create(productInput('hold-fixture', { status: 'hold' }));
    // Deliberately malformed legacy documents are written only to the new isolated test database.
    // Public filters must protect readers even when records bypass Mongoose validation.
    for (const [slugValue, overrides] of [
      ['unapproved-price', { priceApproved: false }],
      ['unapproved-inventory', { inventory: { mode: 'tracked', quantity: 10, approved: false, available: true } }],
      ['unavailable-fixture', { inventory: { mode: 'tracked', quantity: 10, approved: true, available: false } }],
      ['review-fixture', { reviewRequired: true }],
      ['unapproved-variant-price', { variants: [{ key: 'size-small', attributes: [{ name: 'Size', value: 'Small' }], pricePiastres: 12000, priceApproved: false, inventory: { mode: 'tracked', quantity: 10, approved: true, available: true } }] }],
      ['unapproved-variant-inventory', { variants: [{ key: 'size-small', attributes: [{ name: 'Size', value: 'Small' }], pricePiastres: null, priceApproved: false, inventory: { mode: 'tracked', quantity: 10, approved: false, available: true } }] }],
    ]) {
      await Product.collection.insertOne({ ...readyInput(slugValue, overrides), published: true, reviewRequired: false, ...overrides });
    }
    const response = await request('/public/products');
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.products.map((product) => product.slug).sort(), [ready.slug, 'unavailable-fixture'].sort());
    assert.equal(response.body.products.find((product) => product.slug === 'unavailable-fixture').orderingAvailable, false);
    assert.equal((await request('/public/products/unavailable-fixture')).status, 200);
    for (const slugValue of ['draft-fixture', 'hold-fixture', 'unapproved-price', 'unapproved-inventory', 'review-fixture', 'unapproved-variant-price', 'unapproved-variant-inventory']) {
      assert.equal((await request(`/public/products/${slugValue}`)).status, 404, slugValue);
    }
    const detail = await request('/public/products/visible-fixture');
    assert.equal(detail.status, 200);
    assert.deepEqual(detail.body.product.galleryUrls, []);
    assert.equal('galleryKeys' in detail.body.product, false);
    assert.equal('mainImageKey' in detail.body.product, false);
    assert.equal('merchantReviewNotes' in detail.body.product, false);
  });

  it('uses indexed search and category filters with deterministic sorting', async () => {
    await Product.create(readyInput('blue-ceramic', { name: 'Blue Ceramic Mug' }));
    await Product.create(readyInput('red-ceramic', { name: 'Red Ceramic Mug' }));
    const another = await Category.create({ name: 'Other main', slug: 'other-main' });
    await Product.create(readyInput('other-mug', { name: 'Other Ceramic Mug', categoryId: another._id, subcategoryId: null }));
    const response = await request('/public/products?q=Ceramic&category=main-fixture&subcategory=child-fixture&sort=name_asc');
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.products.map((product) => product.name), ['Blue Ceramic Mug', 'Red Ceramic Mug']);
    assert.equal((await request('/public/products?category=other-main&subcategory=child-fixture')).status, 400);
  });

  it('hides inactive ancestor categories and uses approved public product counts', async () => {
    await Product.create(readyInput('count-visible'));
    await Product.create(productInput('count-draft'));
    let response = await request('/public/categories');
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.categories.map((category) => category.productCount), [1, 1]);
    const update = await request(`/admin/categories/${main._id}`, { method: 'PATCH', headers: adminHeaders, body: { active: false } });
    assert.equal(update.status, 200);
    response = await request('/public/categories');
    assert.equal(response.body.categories.length, 0);
    assert.equal((await request('/public/products')).body.products.length, 0);
    assert.equal((await request('/public/products/count-visible')).status, 404);
    assert.equal((await request('/public/categories/child-fixture/products')).status, 404);
  });

  it('refuses publication until price and stock are approved', async () => {
    const product = await Product.create(productInput('approval-fixture'));
    const path = `/admin/products/${product._id}`;
    assert.equal((await request(`${path}/publication`, { method: 'PATCH', headers: adminHeaders, body: { status: 'ready' } })).status, 400);
    assert.equal((await Product.findById(product._id)).status, 'draft');
    const approved = await request(path, { method: 'PATCH', headers: adminHeaders, body: { priceApproved: true, inventory: { approved: true }, status: 'ready' } });
    assert.equal(approved.status, 200);
    assert.equal((await request('/public/products/approval-fixture')).status, 200);
    assert.equal((await request(path, { method: 'PATCH', headers: adminHeaders, body: { pricePiastres: 13000 } })).status, 400);
    assert.equal((await Product.findById(product._id)).pricePiastres, 12000);
    const edited = await request(path, { method: 'PATCH', headers: adminHeaders, body: { pricePiastres: 13000, status: 'draft' } });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.product.priceApproved, false);
    assert.equal((await request('/public/products/approval-fixture')).status, 404);
  });

  it('resets stock approval on changes and keeps Made by Request quantity null', async () => {
    const product = await Product.create(productInput('inventory-fixture', { inventory: { mode: 'tracked', quantity: 10, approved: true, available: true } }));
    const path = `/admin/products/${product._id}/inventory`;
    let response = await request(path, { method: 'PATCH', headers: adminHeaders, body: { quantity: 11 } });
    assert.equal(response.status, 200);
    assert.equal(response.body.product.inventory.approved, false);
    response = await request(path, { method: 'PATCH', headers: adminHeaders, body: { mode: 'made_to_order' } });
    assert.equal(response.status, 200);
    assert.equal(response.body.product.inventory.quantity, null);
    assert.equal(response.body.product.inventory.mode, 'made_to_order');
    assert.equal((await request(path, { method: 'PATCH', headers: adminHeaders, body: { quantity: 4 } })).status, 400);
    response = await request(path, { method: 'PATCH', headers: adminHeaders, body: { mode: 'tracked' } });
    assert.equal(response.status, 200);
    assert.equal(response.body.product.inventory.quantity, 10);
    assert.equal(response.body.product.inventory.approved, false);
  });

  it('rejects mass assignment, unknown references and unsafe category moves', async () => {
    const product = await Product.create(productInput('edit-fixture'));
    assert.equal((await request(`/admin/products/${product._id}`, { method: 'PATCH', headers: adminHeaders, body: { externalCatalogId: 'invented' } })).status, 400);
    assert.equal((await request(`/admin/products/${product._id}`, { method: 'PATCH', headers: adminHeaders, body: { priceApproved: 'true' } })).status, 400);
    assert.equal((await request('/admin/products', { method: 'POST', headers: adminHeaders, body: productInput('bad-category', { categoryId: '000000000000000000000001' }) })).status, 400);
    assert.equal((await request('/admin/categories', { method: 'POST', headers: adminHeaders, body: { name: 'Grandchild', slug: 'grandchild', parentId: child._id } })).status, 400);
    const another = await Category.create({ name: 'Other main', slug: 'other-main' });
    assert.equal((await request(`/admin/categories/${child._id}`, { method: 'PATCH', headers: adminHeaders, body: { parentId: another._id } })).status, 409);
    assert.equal((await request(`/admin/categories/${main._id}`, { method: 'PATCH', headers: adminHeaders, body: { parentId: another._id } })).status, 409);
    assert.equal(String((await Product.findById(product._id)).subcategoryId), String(child._id));
  });
});
