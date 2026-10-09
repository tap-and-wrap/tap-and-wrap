import assert from 'node:assert/strict';
import { before, after, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';
import { Category } from '../src/models/Category.js';
import { Product } from '../src/models/Product.js';
import { listProducts, listCategories } from '../src/catalog/service.js';
import { categoryQuerySchema, parseInput } from '../src/catalog/validation.js';
import { startTestDatabase } from './helpers/database.js';

let database, root, child, inactive;
before(async () => { database = await startTestDatabase({ models: [Category, Product], transactions: true }); });
after(async () => { await database?.stop(); });
beforeEach(async () => {
  await Product.deleteMany({}); await Category.deleteMany({});
  root = await Category.create({ name: 'Synthetic root', slug: 'synthetic-root' });
  child = await Category.create({ name: 'Synthetic child', slug: 'synthetic-child', parentId: root._id });
  inactive = await Category.create({ name: 'Synthetic inactive', slug: 'synthetic-inactive', active: false });
});
const ready = (index, extra = {}) => ({ name: `Synthetic ${index}`, slug: `synthetic-${index}`, description: 'Disposable catalog measurement fixture.', categoryId: root._id,
  subcategoryId: child._id, mainImageKey: 'fixtures/catalog.webp', galleryKeys: ['fixtures/catalog.webp'], status: 'ready', pricePiastres: 1000 + index, priceApproved: true, inventory: { mode: 'tracked', quantity: 10, approved: true, available: true }, ...extra });

test('one authoritative category graph read preserves approval/hierarchy gates and twenty-item pagination', async context => {
  await Product.insertMany(Array.from({ length: 23 }, (_, index) => ready(index)));
  await Product.create(ready(24, { priceApproved: false, status: 'draft' }));
  await Product.create(ready(25, { categoryId: inactive._id, subcategoryId: null }));
  await Product.create(ready(26, { categoryId: root._id, subcategoryId: new mongoose.Types.ObjectId() }));
  const find = Category.find.bind(Category);
  const observed = context.mock.method(Category, 'find', (...args) => find(...args));
  const result = await listProducts({ page: 2, limit: 100, sort: 'price_asc', includePriceRange: false });
  assert.deepEqual(result.pagination, { page: 2, limit: 20, total: 23, pages: 2 });
  assert.equal(result.products.length, 3);
  assert.deepEqual(result.products.map(product => product.pricePiastres), [1020, 1021, 1022]);
  const eligibilityReads = observed.mock.calls.filter(call => call.arguments[0]?.active === true).length;
  console.log(JSON.stringify({ measurement: 'catalog-category-graph', categoryFindCalls: observed.mock.callCount(), eligibilityReads, approvedCount: result.pagination.total }));
  assert.equal(eligibilityReads, 1, 'Category eligibility must use one fresh graph read, not a global stale cache.');
});

test('explicit lightweight category choices omit unused product aggregates without inventing zero counts', async context => {
  await Product.create(ready(1));
  const aggregate = Product.aggregate.bind(Product);
  const observed = context.mock.method(Product, 'aggregate', (...args) => aggregate(...args));
  const compact = await listCategories({ parent: 'root', includeProductCounts: false });
  assert.equal(compact.categories.length, 1);
  assert.equal(compact.categories[0].slug, root.slug);
  assert.equal(Object.hasOwn(compact.categories[0], 'productCount'), false);
  assert.equal(observed.mock.callCount(), 0);
  const counted = await listCategories({ parent: 'root' });
  assert.equal(counted.categories[0].productCount, 1);
  assert.equal(observed.mock.callCount(), 1);
  assert.deepEqual(compact.pagination, counted.pagination);
});

test('category count optimization flag is explicitly validated and cannot bypass strict query fields', () => {
  assert.equal(parseInput(categoryQuerySchema, { includeProductCounts: 'false' }).includeProductCounts, false);
  assert.equal(parseInput(categoryQuerySchema, { includeProductCounts: 'true' }).includeProductCounts, true);
  for (const input of [{ includeProductCounts: '0' }, { includeProductCounts: 'no' }, { includeProductCounts: 'false', arbitrary: 'true' }]) assert.throws(() => parseInput(categoryQuerySchema, input));
});
