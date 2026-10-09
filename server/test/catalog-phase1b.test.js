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

// All names, prices and approvals below belong solely to this disposable test database.
describe('Phase 1B catalog API contracts', { concurrency: false }, () => {
  let database;
  let server;
  let baseUrl;
  let main;
  let child;
  let adminHeaders;
  const originalMediaBase = process.env.CATALOG_MEDIA_BASE_URL;

  async function request(path, { method = 'GET', headers = {}, body } = {}) {
    const response = await fetch(`${baseUrl}/api/v1${path}`, {
      method, headers: { ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = await response.json();
    return { status: response.status, body: payload.data ?? payload };
  }

  function ready(slug, overrides = {}) {
    return {
      name: `Fixture ${slug}`, slug, description: 'Isolated fixture description',
      categoryId: main._id, subcategoryId: child._id,
      mainImageKey: `fixtures/${slug}.webp`, galleryKeys: [`fixtures/${slug}.webp`, `fixtures/${slug}-detail.webp`],
      pricePiastres: 1000, priceApproved: true, reviewRequired: false, status: 'ready',
      inventory: { mode: 'tracked', quantity: 10, approved: true, available: true },
      ...overrides,
    };
  }

  before(async () => {
    database = await startTestDatabase({ models: [User, Session], transactions: true });
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (originalMediaBase === undefined) delete process.env.CATALOG_MEDIA_BASE_URL;
    else process.env.CATALOG_MEDIA_BASE_URL = originalMediaBase;
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (database) await database.stop();
  });

  beforeEach(async () => {
    delete process.env.CATALOG_MEDIA_BASE_URL;
    await Promise.all([Product.deleteMany({}), Category.deleteMany({}), User.deleteMany({}), Session.deleteMany({})]);
    main = await Category.create({ name: 'Phase 1B fixture category', slug: 'phase1b-fixture', featured: true });
    child = await Category.create({ name: 'Fixture child', slug: 'phase1b-child', parentId: main._id });
    const user = await User.create({ name: 'Admin fixture', email: 'phase1b-admin@example.test', passwordHash: 'isolated-password-hash', role: 'admin', active: true });
    const token = newSessionToken();
    const csrf = makeCsrfToken(env.sessionSecret);
    await Session.create({ userId: user._id, tokenHash: hashSession(token), expiresAt: new Date(Date.now() + 3600000) });
    adminHeaders = { Cookie: `tw_session=${token}; tw_csrf=${csrf}`, Origin: env.clientOrigin, 'x-csrf-token': csrf };
  });

  it('filters on the server with exact counts and price bounds that ignore active price limits', async () => {
    await Product.create([
      ready('mug-low', { name: 'Fixture Ceramic Mug Low', pricePiastres: 500 }),
      ready('mug-middle', { name: 'Fixture Ceramic Mug Middle', pricePiastres: 1500 }),
      ready('mug-high', { name: 'Fixture Ceramic Mug High', pricePiastres: 2500 }),
      ready('mug-out', { name: 'Fixture Ceramic Mug Out', pricePiastres: 1500, inventory: { mode: 'tracked', quantity: 0, approved: true, available: true } }),
      ready('description-only', { name: 'Fixture unrelated name', description: 'Ceramic appears only in this description' }),
      ready('draft-cheap', { name: 'Fixture Ceramic Draft', pricePiastres: 1, priceApproved: false, status: 'draft' }),
    ]);
    const response = await request('/public/products?q=Ceramic&category=phase1b-fixture&subcategory=phase1b-child&availability=available&minPrice=1000&maxPrice=2000&sort=price_asc');
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.products.map((product) => product.slug), ['mug-middle']);
    assert.equal(response.body.pagination.total, 1);
    assert.deepEqual(response.body.priceRange, { min: 500, max: 2500 });
    assert.equal(response.body.products[0].category.slug, main.slug);
    assert.equal(response.body.products[0].subcategory.slug, child.slug);
    const soldOut = await request('/public/products?q=Ceramic&availability=sold_out');
    assert.deepEqual(soldOut.body.products.map((product) => product.slug), ['mug-out']);
    assert.equal(soldOut.body.products[0].orderingAvailable, false);
  });

  it('supports all seven deterministic sorting modes using explicit merchandising fields', async () => {
    await Product.create([
      ready('sort-alpha', { name: 'Fixture Alpha', pricePiastres: 2000, createdAt: new Date('2025-01-01'), featured: true, featuredOrder: 2 }),
      ready('sort-beta', { name: 'Fixture Beta', pricePiastres: 1000, createdAt: new Date('2025-01-02'), bestSeller: true, bestSellerOrder: 1 }),
      ready('sort-gamma', { name: 'Fixture Gamma', pricePiastres: 3000, createdAt: new Date('2025-01-03'), featured: true, featuredOrder: 1 }),
    ]);
    const expected = {
      featured: ['sort-gamma', 'sort-alpha', 'sort-beta'],
      best_sellers: ['sort-beta', 'sort-gamma', 'sort-alpha'],
      newest: ['sort-gamma', 'sort-beta', 'sort-alpha'],
      price_asc: ['sort-beta', 'sort-alpha', 'sort-gamma'],
      price_desc: ['sort-gamma', 'sort-alpha', 'sort-beta'],
      name_asc: ['sort-alpha', 'sort-beta', 'sort-gamma'],
      name_desc: ['sort-gamma', 'sort-beta', 'sort-alpha'],
    };
    for (const [sort, slugs] of Object.entries(expected)) {
      const response = await request(`/public/products?sort=${sort}`);
      assert.equal(response.status, 200, sort);
      assert.deepEqual(response.body.products.map((product) => product.slug), slugs, sort);
    }
    const selected = await request('/public/products?featured=true&sort=featured');
    assert.deepEqual(selected.body.products.map((product) => product.slug), ['sort-gamma', 'sort-alpha']);
  });

  it('skips unused range aggregation while retaining filtered counts, category scope and pagination', async (context) => {
    await Product.create(Array.from({ length: 23 }, (_, index) => ready(`no-range-${index}`, { pricePiastres: 1000 + index })));
    await Product.create(ready('no-range-draft', { status: 'draft', priceApproved: false }));
    const aggregate = context.mock.method(Product, 'aggregate', () => { throw new Error('Unused range aggregate was executed'); });
    const response = await request(`/public/products?includePriceRange=false&category=${main.slug}&subcategory=${child.slug}&availability=available&minPrice=1000&maxPrice=1022&page=2&limit=100&sort=price_asc`);
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.pagination, { page: 2, limit: 20, total: 23, pages: 2 });
    assert.equal(response.body.products.length, 3);
    assert.equal('priceRange' in response.body, false);
    assert.equal(aggregate.mock.callCount(), 0);
    const admin = await request('/admin/products?includePriceRange=false', { headers: adminHeaders });
    assert.equal(admin.status, 200);
    assert.equal('priceRange' in admin.body, false);
    assert.equal(aggregate.mock.callCount(), 0);
  });

  it('strictly validates the optional range flag without relaxing price or query validation', async () => {
    for (const suffix of ['includePriceRange=0', 'includePriceRange=off', 'includePriceRange=false&minPrice=-1', 'includePriceRange=false&unknown=true']) {
      const response = await request(`/public/products?${suffix}`);
      assert.equal(response.status, 400, suffix);
    }
    const reversed = await request('/public/products?includePriceRange=false&minPrice=200&maxPrice=100');
    assert.equal(reversed.status, 400);
  });

  it('caps the selected best-seller homepage feed at eight approved available products', async () => {
    await Product.create(Array.from({ length: 11 }, (_, index) => ready(`best-${String(index).padStart(2, '0')}`, { bestSeller: true, bestSellerOrder: index })));
    await Product.create(ready('not-selected'));
    await Product.create(ready('best-draft', { bestSeller: true, status: 'draft', priceApproved: false }));
    await Product.create(ready('best-out', { bestSeller: true, bestSellerOrder: 0, inventory: { mode: 'tracked', quantity: 0, approved: true, available: true } }));
    const response = await request('/public/products?bestSeller=true&availability=available&sort=best_sellers&limit=100');
    assert.equal(response.status, 200);
    assert.equal(response.body.products.length, 8);
    assert.equal(response.body.pagination.limit, 8);
    assert.equal(response.body.pagination.total, 11);
    assert.deepEqual(response.body.products.map((product) => product.slug), Array.from({ length: 8 }, (_, index) => `best-${String(index).padStart(2, '0')}`));
  });

  it('maps image references only through an explicit public HTTPS base and removes private keys', async () => {
    process.env.CATALOG_MEDIA_BASE_URL = 'https://media.example.test/catalog';
    await Product.create(ready('media-fixture'));
    main.imageKey = 'fixtures/category.webp';
    await main.save();
    const list = await request('/public/products');
    assert.equal(list.body.products[0].mainImageUrl, 'https://media.example.test/catalog/fixtures/media-fixture.webp');
    assert.equal('mainImageKey' in list.body.products[0], false);
    const detail = await request('/public/products/media-fixture');
    assert.deepEqual(detail.body.product.galleryUrls, ['https://media.example.test/catalog/fixtures/media-fixture.webp', 'https://media.example.test/catalog/fixtures/media-fixture-detail.webp']);
    assert.equal('galleryKeys' in detail.body.product, false);
    const categories = await request('/public/categories?parent=root&featured=true');
    assert.equal(categories.body.categories[0].imageUrl, 'https://media.example.test/catalog/fixtures/category.webp');
    assert.equal('imageKey' in categories.body.categories[0], false);
  });

  it('returns exact active category details with safe parent breadcrumbs and hides inactive relationships', async () => {
    await Product.create([ready('category-active'), ready('category-draft', { status: 'draft', priceApproved: false })]);
    const root = await request(`/public/categories/${main.slug}`);
    assert.equal(root.status, 200);
    assert.equal(root.body.category.parent, null);
    assert.equal(root.body.category.productCount, 1);
    assert.equal('imageKey' in root.body.category, false);
    const detail = await request(`/public/categories/${child.slug}`);
    assert.equal(detail.status, 200);
    assert.deepEqual(detail.body.category.parent, { _id: String(main._id), name: main.name, slug: main.slug });
    assert.equal(detail.body.category.productCount, 1);
    main.active = false;
    await main.save();
    assert.equal((await request(`/public/categories/${main.slug}`)).status, 404);
    assert.equal((await request(`/public/categories/${child.slug}`)).status, 404);
    main.active = true;
    await main.save();
    child.active = false;
    await child.save();
    assert.equal((await request(`/public/categories/${child.slug}`)).status, 404);
  });

  it('returns configured product options independently of customization and up to four approved recommendations', async () => {
    await Product.create(ready('options-fixture', {
      variants: [
        { key: 'blue-small', attributes: [{ name: 'Color', value: 'Blue' }, { name: 'Size', value: 'Small' }], inventory: { mode: 'tracked', quantity: 0, approved: true, available: true } },
        { key: 'blue-large', attributes: [{ name: 'Color', value: 'Blue' }, { name: 'Size', value: 'Large' }], inventory: { mode: 'made_to_order', quantity: null, approved: true, available: true }, pricePiastres: 1200, priceApproved: true },
      ],
      personalization: { fields: [{ key: 'message', type: 'short_text', label: 'Fixture message', required: true, maxLength: 80 }] },
    }));
    await Product.create(Array.from({ length: 6 }, (_, index) => ready(`related-${index}`)));
    await Product.create(ready('related-hidden', { status: 'draft', priceApproved: false }));
    const response = await request('/public/products/options-fixture');
    assert.equal(response.status, 200);
    const product = response.body.product;
    assert.equal(product.requiresOptions, true);
    assert.equal(product.orderingAvailable, true);
    assert.equal(product.variants[0].orderingAvailable, false);
    assert.equal(product.variants[0].pricePiastres, 1000);
    assert.equal(product.variants[1].pricePiastres, 1200);
    assert.equal(product.variants[1].inventory.quantity, null);
    assert.equal(product.personalization.fields[0].required, true);
    assert.equal(product.customization.serviceEntryEligible, false);
    assert.equal(product.relatedProducts.length, 4);
    assert.ok(product.relatedProducts.every((entry) => entry.slug !== product.slug && entry.slug !== 'related-hidden'));
    assert.equal('priceApproved' in product.variants[1], false);
  });

  it('preserves omitted option configurations and exposes protected explicit merchandising controls', async () => {
    const product = await Product.create(ready('merchant-fixture', {
      personalization: { fields: [{ key: 'message', type: 'short_text', label: 'Fixture message', required: true, maxLength: 80 }] },
      customization: { enabled: false, templateId: main._id, serviceKind: 'generic', serviceEntryEligible: false },
    }));
    const update = await request(`/admin/products/${product._id}`, {
      method: 'PATCH', headers: adminHeaders,
      body: { expectedRevision: product.__v, name: 'Fixture renamed', featured: true, featuredOrder: 2, bestSeller: true, bestSellerOrder: 1 },
    });
    assert.equal(update.status, 200);
    assert.equal(update.body.product.featured, true);
    assert.equal(update.body.product.bestSeller, true);
    assert.equal(update.body.product.personalization.fields[0].key, 'message');
    assert.equal(update.body.product.customization.serviceKind, 'generic');
    assert.equal(update.body.product.priceApproved, true);
    assert.equal((await request(`/admin/products/${product._id}`, { method: 'PATCH', headers: adminHeaders, body: { bestSellerOrder: -1 } })).status, 400);
    assert.equal((await request(`/admin/products/${product._id}`, { method: 'PATCH', body: { featured: true } })).status, 401);
  });

  it('rejects invalid price bounds rather than weakening server-side filters', async () => {
    for (const query of ['minPrice=-1', 'maxPrice=1.5', 'minPrice=', 'minPrice=9007199254740992', 'minPrice=2000&maxPrice=1000']) {
      assert.equal((await request(`/public/products?${query}`)).status, 400, query);
    }
  });
});
