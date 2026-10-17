import test from 'node:test';
import assert from 'node:assert/strict';
import { Product } from '../src/models/Product.js';
import { Category } from '../src/models/Category.js';
import { ProductAddress } from '../src/models/ProductAddress.js';
import { env } from '../src/config/env.js';
import { listProducts, getPublicProduct } from '../src/catalog/service.js';

// Real service/query construction with in-memory query doubles. No connection,
// MongoDB fixture, provider, env file or database writes are used by this file.
const main = { _id: '111111111111111111111111', name: 'Fixture', slug: 'fixture', active: true, parentId: null };
const gift = { _id: '222222222222222222222222', name: 'Fixture gift', slug: 'legacy-gift-123', visibility: 'public', status: 'draft', published: false,
  categoryId: main, mainImageKey: 'fixture/gift.webp', priceApproved: false, pricePiastres: 999999, inventory: { quantity: 10, approved: false, mode: 'tracked', available: true }, variants: [] };
function query(value) {
  const chain = { then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) };
  for (const method of ['select', 'populate', 'sort', 'skip', 'limit', 'lean', 'session', 'maxTimeMS', 'option']) chain[method] = () => chain;
  return chain;
}
function fixture(t) {
  const captures = { filters: [], pipelines: [] };
  const previous = { checkout: env.checkoutEnabled, preview: env.catalogBrowsePreviewEnabled, aliases: env.productAliasesEnabled };
  t.after(() => { env.checkoutEnabled = previous.checkout; env.catalogBrowsePreviewEnabled = previous.preview; env.productAliasesEnabled = previous.aliases; });
  env.productAliasesEnabled = true;
  t.mock.method(Category, 'find', () => query([main, { _id: '333333333333333333333333', slug: 'inactive', parentId: null, active: false }]));
  t.mock.method(Product, 'find', filter => { captures.filters.push(filter); return query([gift]); });
  t.mock.method(Product, 'findOne', filter => query(filter.slug ? { _id: gift._id } : gift));
  t.mock.method(Product, 'countDocuments', () => query(1));
  t.mock.method(Product, 'aggregate', pipeline => { captures.pipelines.push(pipeline); return query(pipeline.some(stage => stage.$sort) ? [gift] : []); });
  t.mock.method(Product, 'populate', async rows => rows);
  t.mock.method(ProductAddress, 'find', () => query([{ productId: gift._id, slug: 'permanent-gift' }]));
  t.mock.method(ProductAddress, 'findOne', () => query({ productId: gift._id, slug: gift.slug, canonical: false }));
  return captures;
}

test('checkout and retired preview switches cannot alter public query membership or alias DTOs', async t => {
  const captures = fixture(t);
  for (const checkout of [false, true]) for (const preview of [false, true]) {
    env.checkoutEnabled = checkout; env.catalogBrowsePreviewEnabled = preview;
    const result = await listProducts({ q: 'Fixture', limit: 20 });
    assert.equal(result.products[0].publicPath, '/products/permanent-gift');
    assert.equal(result.products[0].slug, gift.slug);
    assert.equal(result.products[0].pricePiastres, null);
    assert.equal(result.products[0].orderingAvailable, false);
    const detail = await getPublicProduct(gift.slug);
    assert.equal(detail.publicPath, '/products/permanent-gift');
  }
  const listingFilters = captures.filters.filter(filter => JSON.stringify(filter).includes('$text'));
  assert.equal(listingFilters.length, 4);
  for (const filter of listingFilters) {
    assert.deepEqual(filter, listingFilters[0]);
    assert.equal(filter.$and[0].$and[0].visibility, 'public');
    assert.deepEqual(filter.$and[0].$and[1].$or[0].categoryId.$in, [main._id]);
  }
});

test('availability and price filters keep purchase approval distinct from display and hide provisional price ranges', async t => {
  const captures = fixture(t);
  await listProducts({ availability: 'available', minPrice: 1 });
  const filter = captures.filters[0];
  assert.equal(filter.$and[0].$and[0].visibility, 'public');
  const serialized = JSON.stringify(filter);
  assert.match(serialized, /"status":"ready"/); assert.match(serialized, /"inventory.approved":true/);
  assert.match(serialized, /"priceApproved":true/);
  assert.match(JSON.stringify(captures.pipelines.at(-1)), /"priceApproved":true/);
});

test('price sorts retain enquiry records and sort with approved public amounts only', async t => {
  const captures = fixture(t);
  const result = await listProducts({ sort: 'price_asc', limit: 20 });
  assert.equal(result.products.length, 1); assert.equal(result.products[0].pricePiastres, null);
  const pipeline = captures.pipelines.find(pipeline => pipeline.some(stage => stage.$sort));
  assert.equal(pipeline[0].$match.$and[0].$and[0].visibility, 'public');
  assert.equal(pipeline.some(stage => stage.$limit === 20), true);
  assert.match(JSON.stringify(pipeline), /"\$eq":\["\$priceApproved",true\]/);
  assert.equal(pipeline.find(stage => stage.$sort).$sort._hasPrice, -1);
});
